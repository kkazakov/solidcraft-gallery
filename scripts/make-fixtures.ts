#!/usr/bin/env -S tsx
/**
 * Generate the structural fixtures used by tests and local development.
 *
 * These are NOT real SolidCraft documents: the document body is minimal and
 * the CLI would refuse to evaluate it. They exercise the container/JSON
 * surface (read, lean, reject) until real designs from the app are added under
 * fixtures/real/.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { strToU8, zipSync } from 'fflate';

const dir = fileURLToPath(new URL('../fixtures/', import.meta.url));
const container = (format: string) => strToU8(JSON.stringify({ format }));
const document = (name: string) => strToU8(JSON.stringify({ name, features: [], parameters: [], version: 'fixture' }));

async function main(): Promise<void> {
  await mkdir(join(dir, 'real'), { recursive: true });

  const withCache = zipSync({
    'container.json': container('solidcraft-container/1'),
    'document.json': document('Box with cache'),
    'blobs/aaa.step': strToU8('ISO-10303-21;\nEND-ISO-10303-21;'),
    'cache/model.json': strToU8('{"model":1}'),
    'cache/bodies.bin': strToU8('not a real body cache'),
    'cache/thumbnail.png': strToU8('not a real png'),
  });
  await writeFile(join(dir, 'box.cached.solidcraft'), withCache);

  const lean = zipSync({
    'container.json': container('solidcraft-container/1'),
    'document.json': document('Box'),
    'blobs/aaa.step': strToU8('ISO-10303-21;\nEND-ISO-10303-21;'),
  });
  await writeFile(join(dir, 'box.lean.solidcraft'), lean);

  await writeFile(join(dir, 'plain.solidcraft'), strToU8(JSON.stringify({ name: 'Plain', features: [] })));

  // A ZIP that starts correctly but is truncated: readers must refuse it.
  await writeFile(join(dir, 'corrupt.solidcraft'), withCache.slice(0, Math.floor(withCache.length / 2)));

  const manifest = {
    note: 'Synthetic structural fixtures. Replace/add real designs under real/ as they become available.',
    files: [
      { name: 'box.cached.solidcraft', kind: 'container', has_cache: true, lean: false },
      { name: 'box.lean.solidcraft', kind: 'container', has_cache: false, lean: true },
      { name: 'plain.solidcraft', kind: 'json', has_cache: false, lean: true },
      { name: 'corrupt.solidcraft', kind: 'container', valid: false },
    ],
  };
  await writeFile(join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`fixtures written to ${dir}`);
}

await main();
