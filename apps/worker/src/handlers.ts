import type { Database } from '@gallery/db';
import type { Job } from '@gallery/db';
import type { LocalStorage } from '@gallery/storage';
import type { WorkerConfig } from './config.js';
import type { Logger } from './logger.js';
import { renderVersion } from './render.js';

export interface HandlerContext {
  db: Database;
  log: Logger;
  storage: LocalStorage;
  config: WorkerConfig;
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
    case 'version.render': {
      const versionId = job.payload.versionId;
      if (typeof versionId !== 'string' || versionId.length === 0) {
        throw new Error('version.render requires a versionId');
      }
      const result = await renderVersion(versionId, ctx);
      if (!result.ok) ctx.log.warn('version failed to render', { version_id: versionId, error_code: result.errorCode });
      return;
    }
    case 'repo.sync':
    case 'version.ingest':
      throw new Error(`${job.kind} is not implemented until the ingest milestone`);
    default:
      throw new Error(`unknown job kind: ${job.kind}`);
  }
}
