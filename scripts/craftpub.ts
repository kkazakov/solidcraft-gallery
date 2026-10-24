#!/usr/bin/env -S tsx
/**
 * craftpub — author-side helper for repositories that contain .solidcraft files.
 *
 *   craftpub lean <file> [--out <file>]   remove cache/* (write a lean copy)
 *   craftpub validate <file> [--json]     structural validation, no evaluation
 *   craftpub inspect <file> [--json]      print what the site will index
 *
 * Geometry evaluation and rendering are deliberately not here: they belong to
 * the installed solidcraft-cli in the worker sandbox.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { formatBytes, AppError } from '@gallery/core';
import { isLean, leanDesign, readDesign } from '@gallery/design';

const HELP = `craftpub — SolidCraft Gallery author helper

Usage:
  craftpub lean <file.solidcraft> [--out <file>]
  craftpub validate <file.solidcraft> [--json]
  craftpub inspect <file.solidcraft> [--json]
  craftpub --help | --version

lean writes <name>.lean.solidcraft next to the input unless --out is given.
Exit codes: 0 success, 1 invalid input, 2 usage error.`;

function defaultLeanPath(input: string): string {
  const name = basename(input);
  const stem = name.endsWith('.solidcraft') ? name.slice(0, -'.solidcraft'.length) : name;
  return join(dirname(input), `${stem}.lean.solidcraft`);
}

async function readInput(path: string): Promise<Uint8Array> {
  try {
    return new Uint8Array(await readFile(path));
  } catch {
    throw new AppError('not_found', `cannot read ${path}`);
  }
}

async function lean(input: string, out: string | undefined): Promise<void> {
  const bytes = await readInput(input);
  const before = readDesign(bytes);
  const leanBytes = leanDesign(bytes);
  const target = out ?? defaultLeanPath(input);
  await writeFile(target, leanBytes);

  const saved = bytes.byteLength - leanBytes.byteLength;
  const percent = bytes.byteLength === 0 ? 0 : Math.round((saved / bytes.byteLength) * 100);
  console.log(
    `${target}: ${formatBytes(bytes.byteLength)} -> ${formatBytes(leanBytes.byteLength)} ` +
      `(${percent}% smaller, cache ${before.hasCache ? 'removed' : 'absent'})`,
  );
}

async function describe(input: string, json: boolean): Promise<void> {
  const bytes = await readInput(input);
  const read = readDesign(bytes);
  const summary = {
    ok: true,
    kind: read.kind,
    bytes: bytes.byteLength,
    entries: read.entries.length,
    has_cache: read.hasCache,
    lean: isLean(bytes),
    document_name:
      typeof read.document === 'object' && read.document !== null && 'name' in read.document
        ? String((read.document as { name: unknown }).name)
        : null,
  };

  if (json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  console.log(`kind:      ${summary.kind}`);
  console.log(`size:      ${formatBytes(summary.bytes)}`);
  console.log(`entries:   ${summary.entries}`);
  console.log(`cache:     ${summary.has_cache ? 'present (not lean)' : 'absent (lean)'}`);
  console.log(`document:  ${summary.document_name ?? '(unnamed)'}`);
}

async function main(): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({
      allowPositionals: true,
      options: {
        out: { type: 'string', short: 'o' },
        json: { type: 'boolean', default: false },
        help: { type: 'boolean', default: false },
        version: { type: 'boolean', default: false },
      },
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    console.error(HELP);
    return 2;
  }

  const { values, positionals } = parsed;
  if (values.help || positionals.length === 0) {
    console.log(HELP);
    return 0;
  }
  if (values.version) {
    console.log('craftpub 0.0.0');
    return 0;
  }

  const [command, file] = positionals;
  if (!command || !file) {
    console.error(HELP);
    return 2;
  }

  try {
    switch (command) {
      case 'lean':
        await lean(file, values.out);
        return 0;
      case 'validate':
      case 'inspect':
        await describe(file, Boolean(values.json));
        return 0;
      default:
        console.error(`unknown command: ${command}`);
        console.error(HELP);
        return 2;
    }
  } catch (error) {
    if (error instanceof AppError) {
      if (values.json) console.error(JSON.stringify({ ok: false, code: error.code, message: error.message }));
      else console.error(`${error.code}: ${error.message}`);
      return 1;
    }
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

process.exitCode = await main();
