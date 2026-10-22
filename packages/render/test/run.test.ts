import { describe, expect, it } from 'vitest';
import { directRenderPlan } from '../src/direct.js';
import { runCommand, runPlan } from '../src/run.js';

const node = process.execPath;

describe('runCommand', () => {
  it('captures stdout and a zero exit', async () => {
    const result = await runCommand({ command: node, args: ['-e', 'process.stdout.write("ok")'] });
    expect(result.code).toBe(0);
    expect(result.stdout).toBe('ok');
    expect(result.timedOut).toBe(false);
  });

  it('reports a non-zero exit without throwing', async () => {
    const result = await runCommand({ command: node, args: ['-e', 'process.exit(3)'] });
    expect(result.code).toBe(3);
  });

  it('kills a command that exceeds its timeout', async () => {
    const result = await runCommand({ command: node, args: ['-e', 'setTimeout(() => {}, 5000)'] }, { timeoutMs: 100 });
    expect(result.timedOut).toBe(true);
  });

  it('rejects a missing binary', async () => {
    await expect(runCommand({ command: '/nonexistent/binary', args: [] })).rejects.toThrow();
  });
});

describe('runPlan', () => {
  it('runs every step and stops at the first failure', async () => {
    const ok = await runPlan([
      { name: 'a', command: { command: node, args: ['-e', 'process.exit(0)'] } },
      { name: 'b', command: { command: node, args: ['-e', 'process.exit(0)'] } },
    ]);
    expect(ok.ok).toBe(true);
    expect(ok.steps.map((step) => step.name)).toEqual(['a', 'b']);

    const failed = await runPlan([
      { name: 'a', command: { command: node, args: ['-e', 'process.exit(4)'] } },
      { name: 'b', command: { command: node, args: ['-e', 'process.exit(0)'] } },
    ]);
    expect(failed.ok).toBe(false);
    expect(failed.failed?.name).toBe('a');
    expect(failed.steps).toHaveLength(1);
  });
});

describe('directRenderPlan', () => {
  it('builds the documented CLI sequence', () => {
    const plan = directRenderPlan({
      cli: '/opt/solidcraft-cli',
      designPath: '/tmp/design.solidcraft',
      outDir: '/tmp/out',
    });
    expect(plan.map((step) => step.name)).toEqual(['iso', 'top', 'front', 'metrics', 'step', 'stl']);
    expect(plan[0]!.command).toEqual({
      command: '/opt/solidcraft-cli',
      args: [
        'snapshot',
        '/tmp/design.solidcraft',
        '--out',
        '/tmp/out/iso.png',
        '--width',
        '1200',
        '--height',
        '900',
        '--view',
        'iso',
        '--no-grid',
        '--no-axes',
      ],
    });
  });
});
