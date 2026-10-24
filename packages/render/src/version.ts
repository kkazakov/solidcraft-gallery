import { runCommand, type RunOptions } from './run.js';

/**
 * Extract the version from `solidcraft-cli --version`. The CLI prints
 * `solidcraft-cli <major>.<minor>.<patch>`; tolerate a leading path or extra
 * diagnostic text, but never guess a version that is not there.
 */
export function parseCliVersion(output: string): string | null {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    if (!/solidcraft-cli/i.test(line)) continue;
    const match = /(\d+\.\d+\.\d+)/.exec(line);
    if (match) return match[1]!;
  }

  const fallback = /\b(\d+\.\d+\.\d+)\b/.exec(output);
  return fallback ? fallback[1]! : null;
}

/**
 * Probe an installed CLI without a design. This is only used by the updater
 * and deployment checks; render jobs still go through nsjail.
 */
export async function readCliVersion(cli: string, options: RunOptions = {}): Promise<string> {
  const result = await runCommand(
    { command: cli, args: ['--version'] },
    { timeoutMs: 15_000, maxOutputBytes: 64 * 1024, ...options },
  );
  if (result.timedOut) throw new Error(`${cli} --version timed out`);
  if (result.code !== 0) {
    const detail = `${result.stderr}\n${result.stdout}`.trim().slice(0, 300);
    throw new Error(`${cli} --version failed (exit ${result.code})${detail ? `: ${detail}` : ''}`);
  }

  const version = parseCliVersion(`${result.stdout}\n${result.stderr}`);
  if (!version) throw new Error(`${cli} --version did not report a version`);
  return version;
}

/**
 * Ask the CLI for its command table. A binary that starts but cannot describe
 * its commands is not safe to install into the worker.
 */
export async function readCliCommands(cli: string, options: RunOptions = {}): Promise<number> {
  const result = await runCommand(
    { command: cli, args: ['commands'] },
    { timeoutMs: 30_000, maxOutputBytes: 2 * 1024 * 1024, ...options },
  );
  if (result.timedOut) throw new Error(`${cli} commands timed out`);
  if (result.code !== 0) {
    const detail = `${result.stderr}\n${result.stdout}`.trim().slice(0, 300);
    throw new Error(`${cli} commands failed (exit ${result.code})${detail ? `: ${detail}` : ''}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    throw new Error(`${cli} commands did not return JSON`);
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error(`${cli} commands returned no commands`);
  }
  return parsed.length;
}
