import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { chmod, mkdir, mkdtemp, readFile, readlink, rm, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readCliVersion } from '@gallery/render';
import { compareSemver, normalizeTag, parseSemver, run, selectAsset } from '../src/cli-update.js';

interface FakeRelease {
  version: string;
  name: string;
  archive: Buffer;
  sha256: string;
}

type DigestMode = 'correct' | 'wrong' | 'none';
type ChecksumMode = 'correct' | 'wrong' | 'none';

const maybe = process.platform === 'win32' ? describe.skip : describe;

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function buildRelease(root: string, version: string): Promise<FakeRelease> {
  const top = `solidcraft-${version}-linux-x86_64`;
  const packageRoot = join(root, `package-${version}`);
  const bin = join(packageRoot, top, 'bin');
  await mkdir(bin, { recursive: true });
  await writeFile(
    join(bin, 'solidcraft-cli'),
    [
      '#!/bin/sh',
      'case "$1" in',
      `  --version) echo "solidcraft-cli ${version}" ;;`,
      '  commands) echo \'[{"id":"snapshot"},{"id":"eval"}]\' ;;',
      '  *) echo "unexpected argument: $1" >&2; exit 2 ;;',
      'esac',
      '',
    ].join('\n'),
  );
  await chmod(join(bin, 'solidcraft-cli'), 0o755);

  const archivePath = join(root, `${top}.tar.gz`);
  execFileSync('tar', ['-czf', archivePath, '-C', packageRoot, top]);
  const archive = await readFile(archivePath);
  return { version, name: `${top}.tar.gz`, archive, sha256: sha256(archive) };
}

async function linkTarget(path: string): Promise<string | null> {
  try {
    return await readlink(path);
  } catch {
    return null;
  }
}

maybe('CLI updater', () => {
  let root: string;
  let cliDir: string;
  let server: Server;
  let base = '';
  let releases: Map<string, FakeRelease>;
  let currentVersion = '9.9.9';
  let digestMode: DigestMode = 'correct';
  let checksumMode: ChecksumMode = 'correct';

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'gallery-cli-updater-'));
    releases = new Map();
    for (const version of ['9.9.8', '9.9.9', '9.9.10']) {
      releases.set(version, await buildRelease(root, version));
    }

    server = createServer((request, response) => {
      const url = new URL(request.url ?? '/', 'http://localhost');
      if (url.pathname.endsWith('/releases/latest')) {
        const release = releases.get(currentVersion)!;
        const etag = `"${currentVersion}-${digestMode}-${checksumMode}"`;
        if (request.headers['if-none-match'] === etag) {
          response.writeHead(304, { etag });
          response.end();
          return;
        }

        const assets: Record<string, unknown>[] = [
          {
            name: release.name,
            browser_download_url: `${base}/assets/${encodeURIComponent(release.name)}`,
            size: release.archive.byteLength,
            ...(digestMode === 'none'
              ? {}
              : { digest: `sha256:${digestMode === 'correct' ? release.sha256 : '0'.repeat(64)}` }),
          },
        ];
        if (checksumMode !== 'none') {
          assets.push({
            name: 'SHA256SUMS.txt',
            browser_download_url: `${base}/assets/SHA256SUMS.txt`,
            size: 100,
          });
        }

        response.writeHead(200, { 'content-type': 'application/json', etag });
        response.end(
          JSON.stringify({
            tag_name: `v${release.version}`,
            html_url: `${base}/release/${release.version}`,
            draft: false,
            prerelease: false,
            assets,
          }),
        );
        return;
      }

      if (url.pathname.startsWith('/assets/')) {
        const name = decodeURIComponent(url.pathname.slice('/assets/'.length));
        const release = [...releases.values()].find((candidate) => candidate.name === name);
        if (release) {
          response.writeHead(200, { 'content-type': 'application/gzip' });
          response.end(release.archive);
          return;
        }
        if (name === 'SHA256SUMS.txt') {
          const current = releases.get(currentVersion)!;
          const digest = checksumMode === 'correct' ? current.sha256 : '0'.repeat(64);
          response.writeHead(200, { 'content-type': 'text/plain' });
          response.end(`${digest}  ${current.name}\n`);
          return;
        }
      }

      response.writeHead(404);
      response.end();
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (root) await rm(root, { recursive: true, force: true });
  });

  beforeEach(async () => {
    cliDir = await mkdtemp(join(root, 'cli-'));
    currentVersion = '9.9.9';
    digestMode = 'correct';
    checksumMode = 'correct';
  });

  function env(overrides: Record<string, string> = {}): Record<string, string> {
    return {
      SOLIDCRAFT_CLI_DIR: cliDir,
      SOLIDCRAFT_RELEASE_API: base,
      SOLIDCRAFT_RELEASE_REPO: 'tangency-labs/solidcraft',
      SOLIDCRAFT_CLI_KEEP_VERSIONS: '2',
      SOLIDCRAFT_CLI_PRUNE_MIN_AGE_HOURS: '0',
      DEPLOY_ENV: 'prod',
      SOLIDCRAFT_CLI_AUTO_UPDATE: '1',
      ...overrides,
    };
  }

  it('stages, commits and reports the installed version', async () => {
    await expect(run(['--stage'], env())).resolves.toBe(10);
    expect(await linkTarget(join(cliDir, 'next'))).toContain('9.9.9-');

    await expect(run(['--commit'], env())).resolves.toBe(0);
    await expect(readCliVersion(join(cliDir, 'current', 'solidcraft-cli'))).resolves.toBe('9.9.9');
    expect(await linkTarget(join(cliDir, 'next'))).toBeNull();
    expect(await linkTarget(join(cliDir, 'previous'))).toBeNull();
  });

  it('does not downgrade to an older release', async () => {
    await expect(run(['--stage'], env())).resolves.toBe(10);
    await expect(run(['--commit'], env())).resolves.toBe(0);

    currentVersion = '9.9.8';
    await expect(run(['--stage'], env())).resolves.toBe(0);
    expect(await linkTarget(join(cliDir, 'next'))).toBeNull();
    await expect(readCliVersion(join(cliDir, 'current', 'solidcraft-cli'))).resolves.toBe('9.9.9');
  });

  it('rolls back to the previous release without a restart', async () => {
    await expect(run(['--stage'], env())).resolves.toBe(10);
    await expect(run(['--commit'], env())).resolves.toBe(0);

    currentVersion = '9.9.10';
    await expect(run(['--stage'], env())).resolves.toBe(10);
    await expect(run(['--commit'], env())).resolves.toBe(0);
    await expect(readCliVersion(join(cliDir, 'current', 'solidcraft-cli'))).resolves.toBe('9.9.10');

    await expect(run(['--rollback'], env())).resolves.toBe(0);
    await expect(readCliVersion(join(cliDir, 'current', 'solidcraft-cli'))).resolves.toBe('9.9.9');
    await expect(readCliVersion(join(cliDir, 'previous', 'solidcraft-cli'))).resolves.toBe('9.9.10');
  });

  it('rejects a mismatched digest and leaves current untouched', async () => {
    digestMode = 'wrong';
    await expect(run(['--stage'], env())).resolves.toBe(1);
    expect(await linkTarget(join(cliDir, 'next'))).toBeNull();
    await expect(readCliVersion(join(cliDir, 'current', 'solidcraft-cli'))).rejects.toThrow();
  });

  it('rejects a release with no integrity data', async () => {
    digestMode = 'none';
    checksumMode = 'none';
    await expect(run(['--stage'], env())).resolves.toBe(1);
    expect(await linkTarget(join(cliDir, 'next'))).toBeNull();
  });

  it('enforces the production gate for scheduled runs', async () => {
    await expect(run(['--scheduled', '--stage'], env({ DEPLOY_ENV: 'dev' }))).resolves.toBe(1);
    await expect(run(['--scheduled', '--stage'], env({ SOLIDCRAFT_CLI_AUTO_UPDATE: '0' }))).resolves.toBe(1);
  });

  it('adopts an existing binary and detects its version', async () => {
    const legacy = join(root, 'legacy-solidcraft-cli');
    await writeFile(
      legacy,
      '#!/bin/sh\nif [ "$1" = "--version" ]; then echo "solidcraft-cli 9.9.9"; else echo \'[{"id":"snapshot"}]\'; fi\n',
    );
    await chmod(legacy, 0o755);

    await expect(run(['--adopt', legacy], env())).resolves.toBe(0);
    await expect(readCliVersion(join(cliDir, 'current', 'solidcraft-cli'))).resolves.toBe('9.9.9');
    expect(await linkTarget(join(cliDir, 'next'))).toBeNull();
  });

  it('discards a staged update', async () => {
    await expect(run(['--stage'], env())).resolves.toBe(10);
    await expect(run(['--commit'], env())).resolves.toBe(0);

    currentVersion = '9.9.10';
    await expect(run(['--stage'], env())).resolves.toBe(10);
    await expect(run(['--discard'], env())).resolves.toBe(0);

    expect(await linkTarget(join(cliDir, 'next'))).toBeNull();
    await expect(readCliVersion(join(cliDir, 'current', 'solidcraft-cli'))).resolves.toBe('9.9.9');
  });
});

describe('CLI updater helpers', () => {
  it('normalises release tags', () => {
    expect(normalizeTag('v9.9.9')).toBe('9.9.9');
    expect(normalizeTag('9.9.9')).toBe('9.9.9');
    expect(normalizeTag('v9.9.9-rc.1')).toBeNull();
    expect(parseSemver('9.9.9')).toEqual([9, 9, 9]);
  });

  it('compares versions numerically', () => {
    expect(compareSemver('9.9.10', '9.9.9')).toBeGreaterThan(0);
    expect(compareSemver('9.9.9', '9.9.9')).toBe(0);
    expect(compareSemver('9.9.8', '9.9.9')).toBeLessThan(0);
  });

  it('selects the Linux asset for the current architecture', () => {
    const release = {
      tag_name: 'v9.9.9',
      html_url: 'https://example.test/release',
      draft: false,
      prerelease: false,
      assets: [
        { name: 'solidcraft-9.9.9-linux-aarch64.tar.gz', browser_download_url: 'https://example.test/a' },
        { name: 'solidcraft-9.9.9-linux-x86_64.tar.gz', browser_download_url: 'https://example.test/x' },
        { name: 'solidcraft-9.9.9-linux-x86_64.AppImage', browser_download_url: 'https://example.test/app' },
      ],
    };
    expect(selectAsset(release, '9.9.9', 'x86_64').browser_download_url).toBe('https://example.test/x');
    expect(selectAsset(release, '9.9.9', 'aarch64').browser_download_url).toBe('https://example.test/a');
  });
});
