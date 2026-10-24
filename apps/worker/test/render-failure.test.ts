import { describe, expect, it } from 'vitest';
import type { RunResult } from '@gallery/render';
import { describeRenderFailure } from '../src/render-failure.js';

function run(partial: Partial<RunResult> = {}): RunResult {
  return { code: 1, signal: null, stdout: '', stderr: '', timedOut: false, ...partial };
}

const NSJAIL = [
  '[I][2026-10-24T07:32:07+0000] Mode: STANDALONE_ONCE',
  '[I][2026-10-24T07:32:07+0000] Mount: /work/out',
].join('\n');

describe('describeRenderFailure', () => {
  it('recognises a design saved by a newer SolidCraft', () => {
    const failure = describeRenderFailure(
      'iso',
      run({
        stderr: `${NSJAIL}\nerror: /work/design.solidcraft: this design was saved by a newer SolidCraft (file format 34; this version reads formats up to 30): update SolidCraft to open it\n`,
      }),
    );

    expect(failure.code).toBe('renderer_outdated');
    expect(failure.detail).toContain('format 34');
    expect(failure.detail).toContain('up to 30');
    expect(failure.detail).toContain('design is fine');
    expect(failure.detail).toContain('updates its renderer');
    expect(failure.detail).not.toContain('/work');
  });

  it('keeps a generic CLI error and strips the sandbox path', () => {
    const failure = describeRenderFailure(
      'iso',
      run({ stderr: `${NSJAIL}\nerror: /work/design.solidcraft: feature 15 references a missing body\n` }),
    );

    expect(failure.code).toBe('render_failed');
    expect(failure.detail).toBe('renderer stopped at iso (exit 1): feature 15 references a missing body');
    expect(failure.detail).not.toContain('/work');
  });

  it('reports a timeout without pretending the CLI returned an exit code', () => {
    const failure = describeRenderFailure('front', run({ code: null, timedOut: true }));

    expect(failure.code).toBe('render_timeout');
    expect(failure.detail).toBe('renderer timed out at front');
  });

  it('falls back when the CLI printed no error line', () => {
    const failure = describeRenderFailure('metrics', run({ stderr: NSJAIL }));

    expect(failure.code).toBe('render_failed');
    expect(failure.detail).toBe('renderer stopped at metrics (exit 1)');
  });

  it('redacts other host paths from the message', () => {
    const failure = describeRenderFailure(
      'iso',
      run({ stderr: 'error: cannot read /tmp/gallery-render-42a4d255-x1/design.solidcraft\n' }),
    );

    expect(failure.detail).toBe('renderer stopped at iso (exit 1): cannot read a file');
  });
});
