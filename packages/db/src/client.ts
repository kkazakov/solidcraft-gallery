import postgres from 'postgres';

export type Database = ReturnType<typeof postgres>;

export interface DatabaseOptions {
  max?: number;
  idleTimeoutSeconds?: number;
  connectTimeoutSeconds?: number;
  onNotice?: (notice: unknown) => void;
}

/**
 * One connection pool per process. Callers pass DATABASE_URL explicitly;
 * importing this module never reads the environment on its own.
 */
export function createDatabase(url: string, options: DatabaseOptions = {}): Database {
  if (!url) throw new Error('DATABASE_URL is required');
  return postgres(url, {
    max: options.max ?? 10,
    idle_timeout: options.idleTimeoutSeconds ?? 20,
    connect_timeout: options.connectTimeoutSeconds ?? 10,
    onnotice: options.onNotice ?? (() => {}),
  });
}

let shared: Database | undefined;

export function getDatabase(): Database {
  if (!shared) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    shared = createDatabase(url);
  }
  return shared;
}

export async function closeDatabase(): Promise<void> {
  if (shared) {
    await shared.end({ timeout: 5 });
    shared = undefined;
  }
}
