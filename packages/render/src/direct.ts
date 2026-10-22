import { join } from 'node:path';
import type { Command } from './sandbox.js';

export type DirectStepName = 'iso' | 'top' | 'front' | 'metrics' | 'step' | 'stl';

export interface DirectStep {
  name: DirectStepName;
  command: Command;
}

export interface DirectPlanInput {
  cli: string;
  designPath: string;
  outDir: string;
}

/**
 * The unsandboxed equivalent of `renderPlan`, for local development and tests.
 * The worker refuses to use it in production unless explicitly allowed; the
 * production path is nsjail.
 */
export function directRenderPlan(input: DirectPlanInput): DirectStep[] {
  if (!input.cli.startsWith('/')) throw new Error('cli must be an absolute path');
  const out = (name: string) => join(input.outDir, name);
  const steps: DirectStep[] = [];

  for (const view of ['iso', 'top', 'front'] as const) {
    steps.push({
      name: view,
      command: {
        command: input.cli,
        args: [
          'snapshot',
          input.designPath,
          '--out',
          out(`${view}.png`),
          '--width',
          '1200',
          '--height',
          '900',
          '--view',
          view,
          '--no-grid',
          '--no-axes',
        ],
      },
    });
  }

  steps.push({
    name: 'metrics',
    command: { command: input.cli, args: ['eval', input.designPath, '--json-out', out('metrics.json')] },
  });

  steps.push({
    name: 'step',
    command: { command: input.cli, args: ['run', '--in', input.designPath, '--out', out('model.step')] },
  });

  steps.push({
    name: 'stl',
    command: { command: input.cli, args: ['run', '--in', input.designPath, '--out', out('model.stl')] },
  });

  return steps;
}
