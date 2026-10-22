import { strFromU8, unzipSync, zipSync } from 'fflate';
import { AppError, LIMITS, detectDesignKind, type DesignKind } from '@gallery/core';

export interface DesignRead {
  kind: DesignKind;
  bytes: Uint8Array;
  /** Entry names for a container; empty for JSON. */
  entries: string[];
  /** `container.json`, when present. */
  container: unknown;
  /** Parsed `document.json` (container) or the JSON document itself. */
  document: unknown;
  hasCache: boolean;
}

const REQUIRED = ['container.json', 'document.json'] as const;
const CONTAINER_FORMAT = 'solidcraft-container/1';

function decodeJson(bytes: Uint8Array, what: string): unknown {
  try {
    return JSON.parse(strFromU8(bytes));
  } catch {
    throw new AppError('unprocessable_design', `${what} is not valid JSON`);
  }
}

function assertSafeName(name: string): void {
  if (name.startsWith('/') || name.includes('..') || name.includes('\\') || name.includes('\0')) {
    throw new AppError('unprocessable_design', 'the container has an unsafe entry name');
  }
}

/**
 * Read and structurally validate a .solidcraft, without evaluating geometry.
 * The CLI is still the authority on whether the document rebuilds; this only
 * proves the container is well formed enough to hand to a sandbox.
 */
export function readDesign(bytes: Uint8Array): DesignRead {
  if (bytes.byteLength > LIMITS.designBytes) {
    throw new AppError('payload_too_large', `design is larger than ${LIMITS.designBytes / (1024 * 1024)} MB`, {
      limit_bytes: LIMITS.designBytes,
    });
  }

  const kind = detectDesignKind(bytes);
  if (kind === 'unknown') {
    throw new AppError('unsupported_media_type', 'not a SolidCraft design (expected a ZIP container or JSON)');
  }

  if (kind === 'json') {
    const document = decodeJson(bytes, 'the design');
    if (typeof document !== 'object' || document === null || Array.isArray(document)) {
      throw new AppError('unprocessable_design', 'the design JSON must be an object');
    }
    return { kind, bytes, entries: [], container: null, document, hasCache: false };
  }

  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new AppError('unprocessable_design', 'the design container is not a readable ZIP');
  }

  const entries = Object.keys(files);
  if (entries.length === 0) throw new AppError('unprocessable_design', 'the design container is empty');
  if (entries.length > LIMITS.containerEntries) {
    throw new AppError('unprocessable_design', 'the design container has too many entries', {
      limit: LIMITS.containerEntries,
    });
  }

  for (const name of entries) assertSafeName(name);
  for (const required of REQUIRED) {
    if (!(required in files)) throw new AppError('unprocessable_design', `the container is missing ${required}`);
  }

  const container = decodeJson(files['container.json']!, 'container.json');
  if (
    typeof container !== 'object' ||
    container === null ||
    (container as { format?: unknown }).format !== CONTAINER_FORMAT
  ) {
    throw new AppError('unprocessable_design', `container.json must declare ${CONTAINER_FORMAT}`);
  }

  const document = decodeJson(files['document.json']!, 'document.json');
  if (typeof document !== 'object' || document === null || Array.isArray(document)) {
    throw new AppError('unprocessable_design', 'document.json must be an object');
  }

  return {
    kind,
    bytes,
    entries,
    container,
    document,
    hasCache: entries.some((name) => name.startsWith('cache/')),
  };
}

/**
 * Remove `cache/*` from a container. JSON designs have no cache. If there is
 * nothing to remove the original bytes are returned, so a no-op does not
 * rewrite history.
 */
export function leanDesign(bytes: Uint8Array): Uint8Array {
  const read = readDesign(bytes);
  if (read.kind === 'json' || !read.hasCache) return bytes;

  const files = unzipSync(bytes);
  const kept: Record<string, Uint8Array> = {};
  for (const name of read.entries) {
    if (name.startsWith('cache/')) continue;
    kept[name] = files[name]!;
  }

  // Stable order: metadata first, then the rest alphabetically. Readers do not
  // care, but a stable archive is a smaller git delta.
  const ordered: Record<string, Uint8Array> = {};
  for (const name of ['container.json', 'document.json']) {
    if (kept[name]) ordered[name] = kept[name]!;
  }
  for (const name of Object.keys(kept).sort()) {
    if (!(name in ordered)) ordered[name] = kept[name]!;
  }

  const lean = zipSync(ordered, { level: 6 });
  // Prove the result is still readable before returning it.
  readDesign(lean);
  return lean;
}

/** Whether the committed bytes are already lean. */
export function isLean(bytes: Uint8Array): boolean {
  return !readDesign(bytes).hasCache;
}
