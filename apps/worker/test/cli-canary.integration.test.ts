import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runCanary } from '../src/cli-canary.js';

const cli = process.env.SOLIDCRAFT_CLI;
const nsjail = process.env.NSJAIL ?? '/usr/local/bin/nsjail';
const fixture = fileURLToPath(new URL('../../../fixtures/real/box.lean.solidcraft', import.meta.url));
const maybe = cli && existsSync(nsjail) ? describe : describe.skip;

maybe('CLI canary (real nsjail)', () => {
  let outDir: string;

  beforeAll(async () => {
    outDir = await mkdtemp(join(tmpdir(), 'gallery-cli-canary-'));
  });

  afterAll(async () => {
    if (outDir) await rm(outDir, { recursive: true, force: true });
  });

  it('renders the trusted fixture with the candidate CLI', async () => {
    const result = await runCanary({ cli: cli!, design: fixture, outDir, timeoutSeconds: 30 });
    expect(result.artifacts).toBe(3);
  }, 120_000);
});
