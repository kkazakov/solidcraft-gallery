import type { Database } from './client.js';

export type JobStatus = 'queued' | 'running' | 'done' | 'failed' | 'dead';

export interface Job {
  id: string;
  kind: string;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
}

export interface EnqueueOptions {
  priority?: number;
  runAt?: Date;
  maxAttempts?: number;
}

/** Exponential backoff, capped at 15 minutes. Attempts is the count already made. */
export function retryDelaySeconds(attempts: number): number {
  const safe = Math.max(1, Math.min(attempts, 10));
  return Math.min(900, 30 * 2 ** (safe - 1));
}

/**
 * Claim one queued job atomically. `FOR UPDATE SKIP LOCKED` makes this safe
 * with any number of workers. The returned id is a string because PostgreSQL
 * bigint exceeds JavaScript's safe integer range.
 */
export async function claimJob(db: Database, workerId: string): Promise<Job | null> {
  const rows = await db<Job[]>`
    with picked as (
      select id
      from jobs
      where status = 'queued' and run_at <= now()
      order by priority, run_at
      for update skip locked
      limit 1
    )
    update jobs j
    set status = 'running',
        locked_by = ${workerId},
        locked_at = now(),
        attempts = j.attempts + 1
    from picked
    where j.id = picked.id
    returning j.id::text as id, j.kind, j.payload, j.attempts, j.max_attempts
  `;
  return rows[0] ?? null;
}

export async function completeJob(db: Database, id: string): Promise<void> {
  await db`
    update jobs
    set status = 'done', finished_at = now(), locked_by = null, locked_at = null
    where id = ${id}::bigint
  `;
}

/**
 * Return a failed job to the queue with backoff, or mark it dead when attempts
 * are exhausted. The caller decides how many attempts have been made.
 */
export async function failJob(
  db: Database,
  id: string,
  error: string,
  attempts: number,
  maxAttempts = 3,
): Promise<JobStatus> {
  const exhausted = attempts >= maxAttempts;
  const status: JobStatus = exhausted ? 'dead' : 'queued';
  const delay = retryDelaySeconds(attempts);
  const message = error.slice(0, 2000);

  await db`
    update jobs
    set status = ${status},
        last_error = ${message},
        run_at = now() + make_interval(secs => ${delay}),
        locked_by = null,
        locked_at = null,
        finished_at = case when ${status} = 'dead' then now() else null end
    where id = ${id}::bigint
  `;
  return status;
}

export async function enqueueJob(
  db: Database,
  kind: string,
  payload: Record<string, unknown> = {},
  options: EnqueueOptions = {},
): Promise<string> {
  const rows = await db<{ id: string }[]>`
    insert into jobs (kind, payload, priority, run_at, max_attempts)
    values (
      ${kind},
      ${db.json(payload as never)},
      ${options.priority ?? 100},
      ${options.runAt ?? new Date()},
      ${options.maxAttempts ?? 3}
    )
    returning id::text as id
  `;
  return rows[0]!.id;
}

/** Requeue jobs whose worker died while holding a lease. */
export async function recoverStaleJobs(db: Database, leaseSeconds = 600): Promise<number> {
  const rows = await db<{ id: string }[]>`
    update jobs
    set status = 'queued', locked_by = null, locked_at = null
    where status = 'running'
      and locked_at < now() - make_interval(secs => ${leaseSeconds})
    returning id::text as id
  `;
  return rows.length;
}

/**
 * Move a failed version back to `pending` and enqueue its render in one
 * transaction. The conditional update is the claim: a second click finds the
 * version already pending and does not create a duplicate job.
 */
export async function requeueVersion(db: Database, versionId: string): Promise<boolean> {
  return db.begin(async (tx) => {
    const rows = await tx<{ id: string }[]>`
      update versions
      set status = 'pending', error_code = null, error_detail = null
      where id = ${versionId} and status = 'failed'
      returning id
    `;
    if (!rows[0]) return false;

    await tx`
      insert into jobs (kind, payload, priority, run_at, max_attempts)
      values ('version.render', ${tx.json({ versionId })}, 10, now(), 3)
    `;
    return true;
  });
}
