import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  it('requires a postgres URL', () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL/);
    expect(() => loadConfig({ DATABASE_URL: 'mysql://x' })).toThrow(/postgres/);
  });

  it('applies defaults', () => {
    const config = loadConfig({ DATABASE_URL: 'postgres://localhost/gallery' });
    expect(config.pollMs).toBe(2000);
    expect(config.paused).toBe(false);
    expect(config.concurrency).toBe(1);
    expect(config.sandboxMode).toBe('nsjail');
    expect(config.artifactDir).toContain('data');
  });

  it('reads overrides and treats bad numbers as defaults', () => {
    const config = loadConfig({
      DATABASE_URL: 'postgres://localhost/gallery',
      WORKER_POLL_MS: 'nope',
      WORKER_CONCURRENCY: '3',
      WORKER_PAUSED: 'true',
      WORKER_ID: 'w1',
    });
    expect(config.pollMs).toBe(2000);
    expect(config.concurrency).toBe(3);
    expect(config.paused).toBe(true);
    expect(config.workerId).toBe('w1');
  });
});
