import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from '../src/client.js';
import { claimJob, completeJob, enqueueJob, failJob, recoverStaleJobs } from '../src/jobs.js';

const url = process.env.DATABASE_URL;
const maybe = url ? describe : describe.skip;

maybe('job queue (integration)', () => {
  let db: Database;
  const kind = `test.${process.pid}.${Date.now()}`;

  beforeAll(() => {
    db = createDatabase(url!, { max: 2 });
  });

  afterAll(async () => {
    await db`delete from jobs where kind = ${kind}`;
    await db.end({ timeout: 5 });
  });

  it('claims a queued job atomically and completes it', async () => {
    const id = await enqueueJob(db, kind, { hello: 'world' }, { priority: 1 });
    const job = await claimJob(db, 'test-worker');
    expect(job).not.toBeNull();
    expect(job!.id).toBe(id);
    expect(job!.kind).toBe(kind);
    expect(job!.payload).toEqual({ hello: 'world' });
    expect(job!.attempts).toBe(1);

    await completeJob(db, job!.id);
    const rows = await db<{ status: string }[]>`select status from jobs where id = ${id}::bigint`;
    expect(rows[0]!.status).toBe('done');
  });

  it('marks a job dead when attempts are exhausted', async () => {
    const id = await enqueueJob(db, kind, {}, { priority: 1, maxAttempts: 1 });
    const job = await claimJob(db, 'test-worker');
    expect(job!.id).toBe(id);

    const status = await failJob(db, job!.id, 'boom', job!.attempts, job!.max_attempts);
    expect(status).toBe('dead');
    const rows = await db<{ status: string; last_error: string }[]>`
      select status, last_error from jobs where id = ${id}::bigint
    `;
    expect(rows[0]!.status).toBe('dead');
    expect(rows[0]!.last_error).toBe('boom');
  });

  it('requeues a job whose lease expired', async () => {
    const id = await enqueueJob(db, kind, {}, { priority: 1 });
    await claimJob(db, 'test-worker');
    await db`update jobs set locked_at = now() - interval '1 hour' where id = ${id}::bigint`;

    const recovered = await recoverStaleJobs(db, 600);
    expect(recovered).toBeGreaterThanOrEqual(1);
    const rows = await db<{ status: string }[]>`select status from jobs where id = ${id}::bigint`;
    expect(rows[0]!.status).toBe('queued');
  });
});
