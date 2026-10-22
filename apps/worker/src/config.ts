export interface WorkerConfig {
  databaseUrl: string;
  workerId: string;
  pollMs: number;
  paused: boolean;
  concurrency: number;
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

  return {
    databaseUrl,
    workerId: env.WORKER_ID ?? `worker-${process.pid}`,
    pollMs: positiveInt(env.WORKER_POLL_MS, 2_000),
    paused: env.WORKER_PAUSED === '1' || env.WORKER_PAUSED === 'true',
    concurrency: positiveInt(env.WORKER_CONCURRENCY, 1),
  };
}
