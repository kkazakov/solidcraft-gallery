import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { renderPlan } from '@gallery/render';
import { resolveCliPath } from '../src/render.js';

const maybe = process.platform === 'win32' ? describe.skip : describe;

maybe('per-job CLI resolution', () => {
  let root: string;
  let current: string;
  let first: string;
  let second: string;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'gallery-cli-resolve-'));
    await mkdir(join(root, 'versions', '1.0.0'), { recursive: true });
    await mkdir(join(root, 'versions', '2.0.0'), { recursive: true });
    first = join(root, 'versions', '1.0.0', 'solidcraft-cli');
    second = join(root, 'versions', '2.0.0', 'solidcraft-cli');
    await writeFile(first, '#!/bin/sh\necho "solidcraft-cli 1.0.0"\n');
    await writeFile(second, '#!/bin/sh\necho "solidcraft-cli 2.0.0"\n');
    current = join(root, 'current');
    await symlink(join('versions', '1.0.0'), current);
  });

  afterAll(async () => {
    if (root) await rm(root, { recursive: true, force: true });
  });

  it('resolves current to the versioned binary', async () => {
    await expect(resolveCliPath(join(current, 'solidcraft-cli'))).resolves.toBe(first);
  });

  it('keeps the resolved path after the symlink moves', async () => {
    const cli = join(current, 'solidcraft-cli');
    const resolved = await resolveCliPath(cli);
    const plan = renderPlan({
      cli: resolved,
      designPath: '/work/design.solidcraft',
      outDir: '/work/out',
      timeoutSeconds: 10,
    });

    await rm(current);
    await symlink(join('versions', '2.0.0'), current);

    for (const step of plan) {
      expect(step.command.args).toContain(first);
      expect(step.command.args).not.toContain(cli);
    }
    await expect(resolveCliPath(cli)).resolves.toBe(second);
  });

  it('falls back to the original path when it cannot be resolved', async () => {
    const missing = join(root, 'missing', 'solidcraft-cli');
    await expect(resolveCliPath(missing)).resolves.toBe(missing);
  });
});
