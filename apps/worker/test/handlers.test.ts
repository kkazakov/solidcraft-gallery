import { describe, expect, it, vi } from 'vitest';
import type { Job } from '@gallery/db';
import { handleJob } from '../src/handlers.js';
import { createLogger } from '../src/logger.js';

const ctx = {
  db: {} as never,
  log: createLogger({ test: true }),
  storage: {} as never,
  config: {} as never,
};

function job(kind: string): Job {
  return { id: '1', kind, payload: {}, attempts: 1, max_attempts: 3 };
}

describe('handleJob', () => {
  it('handles ping', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await expect(handleJob(job('ping'), ctx)).resolves.toBeUndefined();
    log.mockRestore();
  });

  it('refuses version.render without an id', async () => {
    await expect(handleJob(job('version.render'), ctx)).rejects.toThrow(/requires a versionId/);
  });

  it('fails loudly for ingest jobs that are not implemented yet', async () => {
    await expect(handleJob(job('repo.sync'), ctx)).rejects.toThrow(/not implemented/);
  });

  it('fails loudly for unknown jobs', async () => {
    await expect(handleJob(job('nonsense'), ctx)).rejects.toThrow(/unknown job kind/);
  });
});
