import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createDatabase, type Database } from './client.js';

export const DEFAULT_MIGRATIONS_DIR = fileURLToPath(new URL('../migrations/', import.meta.url));

export async function migrationFiles(dir = DEFAULT_MIGRATIONS_DIR): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

/**
 * Apply every migration that has not run yet, one transaction per file.
 * Forward-only: there are no down migrations; restore a backup instead.
 */
export async function runMigrations(db: Database, dir = DEFAULT_MIGRATIONS_DIR): Promise<string[]> {
  await db`
    create table if not exists schema_migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    )
  `;

  const applied: string[] = [];
  for (const name of await migrationFiles(dir)) {
    const seen = await db<{ name: string }[]>`select name from schema_migrations where name = ${name}`;
    if (seen.length > 0) continue;

    const sqlText = await readFile(join(dir, name), 'utf8');
    await db.begin(async (tx) => {
      await tx.unsafe(sqlText);
      await tx`insert into schema_migrations (name) values (${name})`;
    });
    applied.push(name);
  }
  return applied;
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }

  const db = createDatabase(url, { max: 1 });
  try {
    const applied = await runMigrations(db);
    if (applied.length === 0) console.log('database is up to date');
    else console.log(`applied ${applied.length} migration(s): ${applied.join(', ')}`);
  } finally {
    await db.end({ timeout: 5 });
  }
}

const invokedDirectly = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
