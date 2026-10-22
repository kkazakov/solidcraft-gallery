import { createHash } from 'node:crypto';
import { access, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';

export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export interface Stored {
  key: string;
  sha256: string;
  bytes: number;
}

/** Content-addressed key: `sha256/<ab>/<hash>/<name>`. */
export function artifactKey(sha256: string, name: string): string {
  if (!/^[0-9a-f]{64}$/.test(sha256)) throw new Error('invalid sha256');
  if (!/^[a-zA-Z0-9._-]+$/.test(name)) throw new Error('invalid artifact name');
  return `sha256/${sha256.slice(0, 2)}/${sha256}/${name}`;
}

/**
 * Local artifact store. Writes are atomic (temp file + rename) and idempotent
 * because the key contains the content hash. The media route reads through the
 * same path validation.
 */
export class LocalStorage {
  private readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  abs(key: string): string {
    if (
      key.length === 0 ||
      key.startsWith('/') ||
      key.includes('\\') ||
      key.includes('\0') ||
      key.split('/').some((part) => part === '..' || part === '')
    ) {
      throw new Error('unsafe storage key');
    }
    const path = resolve(this.root, key);
    if (!path.startsWith(`${this.root}${sep}`)) throw new Error('storage key escapes the root');
    return path;
  }

  async put(key: string, bytes: Uint8Array): Promise<Stored> {
    const path = this.abs(key);
    const sha256 = sha256Hex(bytes);
    await mkdir(dirname(path), { recursive: true });
    try {
      await access(path);
      return { key, sha256, bytes: bytes.byteLength };
    } catch {
      // Not present yet.
    }
    const temp = `${path}.tmp-${process.pid}-${Date.now()}`;
    await writeFile(temp, bytes);
    await rename(temp, path);
    return { key, sha256, bytes: bytes.byteLength };
  }

  async get(key: string): Promise<Uint8Array> {
    return new Uint8Array(await readFile(this.abs(key)));
  }

  async has(key: string): Promise<boolean> {
    try {
      await access(this.abs(key));
      return true;
    } catch {
      return false;
    }
  }

  pathFor(key: string): string {
    return this.abs(key);
  }
}

export function storageFromEnv(): LocalStorage {
  const root = process.env.ARTIFACT_DIR ?? join(process.env.DATA_DIR ?? './data', 'artifacts');
  return new LocalStorage(root);
}
