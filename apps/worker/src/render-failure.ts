import type { RunResult } from '@gallery/render';

export type RenderFailureCode = 'render_timeout' | 'render_failed' | 'renderer_outdated';

export interface RenderFailureInfo {
  code: RenderFailureCode;
  detail: string;
}

const FORMAT_SKEW = /saved by a newer SolidCraft \(file format (\d+); this version reads formats up to (\d+)\)/i;

/**
 * The CLI writes `error: <path>: <message>` to stderr, after a wall of nsjail
 * diagnostics. Keep the message, drop the sandbox path, and cap it before it
 * reaches the owner-facing version row.
 */
function cliErrorLine(result: RunResult): string {
  const line = `${result.stderr}\n${result.stdout}`
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .reverse()
    .find((entry) => /^error:\s+/i.test(entry));

  if (!line) return '';

  return line
    .replace(/^error:\s+/i, '')
    .replace(/^\/[^\s:]+:\s+/, '')
    .replace(/\/(?:work|tmp|var|app|home)\/[^\s,;)]*/g, 'a file')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
}

/**
 * Turn the CLI's exit into a code and a message the dashboard can show.
 * Format skew gets its own code: retrying the same binary cannot fix it.
 */
export function describeRenderFailure(step: string, result: RunResult): RenderFailureInfo {
  if (result.timedOut) {
    return { code: 'render_timeout', detail: `renderer timed out at ${step}` };
  }

  const message = cliErrorLine(result);
  const skew = FORMAT_SKEW.exec(message);
  if (skew) {
    const [, format, supported] = skew;
    return {
      code: 'renderer_outdated',
      detail:
        `This design uses SolidCraft file format ${format}, but the gallery renderer reads formats ` +
        `up to ${supported}. The design is fine; update the gallery's solidcraft-cli.`,
    };
  }

  const exit = result.code === null ? 'no exit code' : `exit ${result.code}`;
  return {
    code: 'render_failed',
    detail: message ? `renderer stopped at ${step} (${exit}): ${message}` : `renderer stopped at ${step} (${exit})`,
  };
}
