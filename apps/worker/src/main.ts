import { setTimeout as sleep } from 'node:timers/promises';
import { claimJob, completeJob, createDatabase, failJob, recoverStaleJobs } from '@gallery/db';
import { loadConfig } from './config.js';
import { handleJob } from './handlers.js';
import { createLogger } from './logger.js';

const config = loadConfig();
const log = createLogger({ worker_id: config.workerId });
const db = createDatabase(config.databaseUrl, { max: 4 });
let running = true;
let stopping = false;

function stop(): void {
  if (stopping) return;
  stopping = true;
  log.info('shutdown requested');
  running = false;
}

process.on('SIGINT', stop);
process.on('SIGTERM', stop);

async function loop(slot: number): Promise<void> {
  log.info('worker slot started', { slot, concurrency: config.concurrency });
  while (running) {
    if (config.paused) {
      await sleep(5_000);
      continue;
    }

    let job;
    try {
      job = await claimJob(db, config.workerId);
    } catch (error) {
      log.error('could not claim a job', { error: error instanceof Error ? error.message : String(error) });
      await sleep(Math.max(config.pollMs, 5_000));
      continue;
    }

    if (!job) {
      await sleep(config.pollMs);
      continue;
    }

    const started = Date.now();
    try {
      await handleJob(job, { db, log });
      await completeJob(db, job.id);
      log.info('job done', { job_id: job.id, kind: job.kind, duration_ms: Date.now() - started });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = await failJob(db, job.id, message, job.attempts, job.max_attempts);
      log.error('job failed', {
        job_id: job.id,
        kind: job.kind,
        status,
        error: message,
        duration_ms: Date.now() - started,
      });
    }
  }
}

async function main(): Promise<void> {
  await recoverStaleJobs(db);
  log.info('worker starting', { concurrency: config.concurrency, paused: config.paused });
  await Promise.all(Array.from({ length: config.concurrency }, (_, index) => loop(index)));
  await db.end({ timeout: 10 });
  log.info('worker stopped');
}

main().catch((error: unknown) => {
  log.error('worker crashed', { error: error instanceof Error ? error.message : String(error) });
  process.exitCode = 1;
});
