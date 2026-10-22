import type { Database } from '@gallery/db';
import type { Job } from '@gallery/db';
import type { Logger } from './logger.js';

export interface HandlerContext {
  db: Database;
  log: Logger;
}

/**
 * Job dispatch. Only `ping` is implemented in M0; the pipeline jobs arrive with
 * the ingest milestone. An unknown kind fails loudly rather than silently
 * marking a job done.
 */
export async function handleJob(job: Job, ctx: HandlerContext): Promise<void> {
  switch (job.kind) {
    case 'ping':
      ctx.log.info('pong', { job_id: job.id, payload: job.payload });
      return;
    case 'repo.sync':
    case 'version.ingest':
    case 'version.render':
      throw new Error(`${job.kind} is not implemented until the ingest milestone`);
    default:
      throw new Error(`unknown job kind: ${job.kind}`);
  }
}
