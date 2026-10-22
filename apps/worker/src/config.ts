import { join, resolve } from 'node:path';

export type SandboxMode = 'direct' | 'nsjail';

export interface WorkerConfig {
  databaseUrl: string;
  workerId: string;
  pollMs: number;
  paused: boolean;
  concurrency: number;
  dataDir: string;
  artifactDir: string;
  repoDir: string;
  cli: string;
  cliVersion: string;
  sandboxMode: SandboxMode;
  allowUnsandboxed: boolean;
  timeoutSeconds: number;
}

type Env = Record<string, string | undefined>;

function positiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function loadConfig(env: Env = process.env): WorkerConfig {
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  if (!/^postgres(ql)?:\/\//.test(databaseUrl)) throw new Error('DATABASE_URL must be a postgres URL');

  const dataDir = resolve(env.DATA_DIR ?? 'data');
  const sandboxMode: SandboxMode = env.SANDBOX_MODE === 'direct' ? 'direct' : 'nsjail';

  return {
    databaseUrl,
    workerId: env.WORKER_ID ?? `worker-${process.pid}`,
    pollMs: positiveInt(env.WORKER_POLL_MS, 2_000),
    paused: env.WORKER_PAUSED === '1' || env.WORKER_PAUSED === 'true',
    concurrency: positiveInt(env.WORKER_CONCURRENCY, 1),
    dataDir,
    artifactDir: env.ARTIFACT_DIR ?? join(dataDir, 'artifacts'),
    repoDir: env.REPO_DIR ?? join(dataDir, 'repos'),
    cli: env.SOLIDCRAFT_CLI ?? '/usr/local/bin/solidcraft-cli',
    cliVersion: env.SOLIDCRAFT_CLI_VERSION ?? 'unknown',
    sandboxMode,
    allowUnsandboxed: env.ALLOW_UNSANDBOXED_RENDER === '1',
    timeoutSeconds: positiveInt(env.RENDER_TIMEOUT_SECONDS, 60),
  };
}
