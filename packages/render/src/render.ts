import { designInSandbox, outInSandbox, sandboxCommand, type Command } from './sandbox.js';

export type View = 'iso' | 'top' | 'front';

export interface RenderPlanInput {
  cli: string;
  designPath: string;
  outDir: string;
  timeoutSeconds: number;
}

export interface RenderStep {
  name: 'iso' | 'top' | 'front' | 'metrics' | 'step' | 'stl';
  command: Command;
}

const VIEWS: { view: View; file: string }[] = [
  { view: 'iso', file: 'iso.png' },
  { view: 'top', file: 'top.png' },
  { view: 'front', file: 'front.png' },
];

/**
 * The deterministic sequence of CLI calls for one version. Rendering is
 * intentionally all-or-nothing per step: a missing STL export is a warning,
 * not a failed version.
 */
export function renderPlan(input: RenderPlanInput): RenderStep[] {
  const design = designInSandbox();
  const steps: RenderStep[] = VIEWS.map(({ view, file }) => ({
    name: view,
    command: sandboxCommand({
      ...input,
      args: [
        'snapshot',
        design,
        '--out',
        outInSandbox(file),
        '--width',
        '1200',
        '--height',
        '900',
        '--view',
        view,
        '--no-grid',
        '--no-axes',
      ],
    }),
  }));

  steps.push({
    name: 'metrics',
    command: sandboxCommand({
      ...input,
      args: ['eval', design, '--json-out', outInSandbox('metrics.json')],
    }),
  });

  for (const [name, file] of [
    ['step', 'model.step'],
    ['stl', 'model.stl'],
  ] as const) {
    steps.push({
      name,
      command: sandboxCommand({
        ...input,
        args: ['run', '--in', design, '--out', outInSandbox(file)],
      }),
    });
  }

  return steps;
}
