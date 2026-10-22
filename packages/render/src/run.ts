import { spawn } from 'node:child_process';
import type { Command } from './sandbox.js';

export interface RunOptions {
  timeoutMs?: number;
  cwd?: string;
  env?: Record<string, string | undefined>;
  maxOutputBytes?: number;
}

export interface RunResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_OUTPUT = 1024 * 1024;

function childEnv(extra: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin',
    HOME: process.env.HOME ?? '/tmp',
    TMPDIR: process.env.TMPDIR ?? '/tmp',
    LANG: 'C.UTF-8',
    ...extra,
  };
}

/**
 * Spawn one command with no shell. The child gets a minimal environment and a
 * hard wall-clock limit; on timeout the whole process group is killed.
 */
export function runCommand(command: Command, options: RunOptions = {}): Promise<RunResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxOutput = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT;

  return new Promise((resolve, reject) => {
    const child = spawn(command.command, command.args, {
      cwd: options.cwd,
      env: childEnv(options.env),
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;

    const append = (current: string, chunk: Buffer): string => {
      if (current.length >= maxOutput) return current;
      return (current + chunk.toString('utf8')).slice(0, maxOutput);
    };

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout = append(stdout, chunk);
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr = append(stderr, chunk);
    });

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, 'SIGKILL');
        else child.kill('SIGKILL');
      } catch {
        child.kill('SIGKILL');
      }
    }, timeoutMs);
    timer.unref();

    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });

    child.on('close', (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, signal, stdout, stderr, timedOut });
    });
  });
}

export interface PlanStepResult {
  name: string;
  result: RunResult;
}

export interface PlanResult {
  ok: boolean;
  steps: PlanStepResult[];
  failed?: PlanStepResult;
}

/** Run steps in order, stopping at the first non-zero exit or timeout. */
export async function runPlan(
  steps: { name: string; command: Command }[],
  options: RunOptions = {},
): Promise<PlanResult> {
  const results: PlanStepResult[] = [];
  for (const step of steps) {
    const result = await runCommand(step.command, options);
    const entry = { name: step.name, result };
    results.push(entry);
    if (result.code !== 0 || result.timedOut) {
      return { ok: false, steps: results, failed: entry };
    }
  }
  return { ok: true, steps: results };
}
