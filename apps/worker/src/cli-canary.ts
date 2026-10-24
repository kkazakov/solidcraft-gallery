import { chmod, mkdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { renderPlan, runCommand, runPlan } from '@gallery/render';

export interface CanaryInput {
  cli: string;
  design: string;
  outDir: string;
  timeoutSeconds?: number;
}

function isPng(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  );
}

/**
 * Render a trusted fixture with a candidate CLI. This runs inside a separate
 * throwaway container with no network and the same worker image as production;
 * it never touches the live worker or its database.
 */
export async function runCanary(input: CanaryInput): Promise<{ artifacts: number }> {
  const timeoutSeconds = input.timeoutSeconds ?? 30;
  const cli = resolve(input.cli);
  const design = resolve(input.design);
  const outDir = resolve(input.outDir);
  await mkdir(outDir, { recursive: true });
  await chmod(outDir, 0o777);

  const plan = renderPlan({ cli, designPath: design, outDir, timeoutSeconds });
  const required = plan.slice(0, 4);
  const derivatives = plan.slice(4);

  const result = await runPlan(required, { timeoutMs: timeoutSeconds * 1000 });
  if (!result.ok) {
    const failed = result.failed;
    const detail = failed ? `${failed.result.stderr}\n${failed.result.stdout}`.trim().slice(0, 500) : 'no step result';
    throw new Error(`canary render failed at ${failed?.name ?? 'unknown'}${detail ? `: ${detail}` : ''}`);
  }

  for (const step of derivatives) {
    const derivative = await runCommand(step.command, { timeoutMs: timeoutSeconds * 1000 });
    if (derivative.code !== 0 || derivative.timedOut) {
      console.warn(JSON.stringify({ level: 'warn', message: 'canary derivative failed', step: step.name }));
    }
  }

  for (const file of ['iso.png', 'top.png', 'front.png']) {
    const bytes = new Uint8Array(await readFile(join(outDir, file)));
    if (!isPng(bytes)) throw new Error(`canary produced an invalid ${file}`);
  }

  const metrics = JSON.parse(await readFile(join(outDir, 'metrics.json'), 'utf8')) as { bodies?: unknown };
  if (!Array.isArray(metrics.bodies) || metrics.bodies.length === 0) {
    throw new Error('canary produced no body metrics');
  }

  return { artifacts: 3 };
}

function usage(): string {
  return `solidcraft-cli canary

Usage:
  cli-canary --cli <path> --design <file.solidcraft> --out <dir> [--timeout <seconds>]
`;
}

async function main(argv: string[]): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: false,
      options: {
        cli: { type: 'string' },
        design: { type: 'string' },
        out: { type: 'string' },
        timeout: { type: 'string' },
        help: { type: 'boolean', default: false },
      },
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    return 2;
  }

  const { values } = parsed;
  if (values.help) {
    console.log(usage());
    return 0;
  }
  if (!values.cli || !values.design || !values.out) {
    console.error(usage());
    return 2;
  }

  const timeoutSeconds = values.timeout ? Number.parseInt(values.timeout, 10) : 30;
  if (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 1 || timeoutSeconds > 120) {
    console.error('timeout must be an integer between 1 and 120 seconds');
    return 2;
  }

  const result = await runCanary({
    cli: values.cli,
    design: values.design,
    outDir: values.out,
    timeoutSeconds,
  });
  console.log(JSON.stringify({ ok: true, ...result }));
  return 0;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error: unknown) => {
      console.error(
        JSON.stringify({ level: 'error', message: error instanceof Error ? error.message : String(error) }),
      );
      process.exitCode = 1;
    });
}
