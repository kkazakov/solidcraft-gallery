import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import {
  access,
  chmod,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  readlink,
  rename,
  rm,
  stat,
  statfs,
  symlink,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { readCliCommands, readCliVersion, runCommand } from '@gallery/render';

type Env = Record<string, string | undefined>;

interface ReleaseAsset {
  name: string;
  browser_download_url: string;
  size?: number;
  digest?: string | null;
}

interface Release {
  tag_name: string;
  html_url: string;
  draft: boolean;
  prerelease: boolean;
  assets: ReleaseAsset[];
}

interface PendingRelease {
  version: string;
  dir: string;
  releaseUrl: string;
  asset: string;
  sha256: string;
}

interface State {
  current?: string;
  previous?: string;
  currentDir?: string;
  previousDir?: string;
  lastCheck?: string;
  lastError?: string | null;
  etag?: string;
  pending?: PendingRelease;
  updatedAt?: string;
  releaseUrl?: string;
  asset?: string;
  sha256?: string;
}

interface Context {
  cliDir: string;
  repo: string;
  apiBase: string;
  token: string | undefined;
  keep: number;
  pruneMinAgeMs: number;
}

const STAGED_EXIT = 10;
const DEFAULT_REPO = 'tangency-labs/solidcraft';
const DEFAULT_KEEP = 5;
const MAX_ARCHIVE_BYTES = 512 * 1024 * 1024;
const MAX_CLI_BYTES = 512 * 1024 * 1024;
const MIN_FREE_BYTES = 512 * 1024 * 1024;
const LOCK_STALE_MS = 2 * 60 * 60 * 1000;

function log(level: 'info' | 'warn' | 'error', message: string, fields: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, message, ...fields });
  if (level === 'error') console.error(line);
  else console.log(line);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function nowIso(): string {
  return new Date().toISOString();
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isReleaseAsset(value: unknown): value is ReleaseAsset {
  return isObject(value) && typeof value.name === 'string' && typeof value.browser_download_url === 'string';
}

function isRelease(value: unknown): value is Release {
  return (
    isObject(value) &&
    typeof value.tag_name === 'string' &&
    typeof value.html_url === 'string' &&
    typeof value.draft === 'boolean' &&
    typeof value.prerelease === 'boolean' &&
    Array.isArray(value.assets) &&
    value.assets.every(isReleaseAsset)
  );
}

export function parseSemver(value: string): [number, number, number] | null {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value.trim());
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

export function normalizeTag(tag: string): string | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(tag.trim());
  if (!match) return null;
  return `${Number(match[1])}.${Number(match[2])}.${Number(match[3])}`;
}

export function compareSemver(left: string, right: string): number {
  const a = parseSemver(left);
  const b = parseSemver(right);
  if (!a || !b) throw new Error(`invalid version comparison: ${left} vs ${right}`);
  for (let index = 0; index < 3; index += 1) {
    const difference = a[index]! - b[index]!;
    if (difference !== 0) return difference;
  }
  return 0;
}

function targetArch(): string | null {
  if (process.arch === 'x64') return 'x86_64';
  if (process.arch === 'arm64') return 'aarch64';
  return null;
}

export function selectAsset(release: Release, version: string, arch: string): ReleaseAsset {
  const aliases = arch === 'x86_64' ? ['x86_64', 'amd64'] : ['aarch64', 'arm64'];
  const candidates = release.assets.filter((asset) => {
    const name = asset.name.toLowerCase();
    return (
      name.endsWith('.tar.gz') &&
      name.includes('linux') &&
      name.includes('solidcraft') &&
      aliases.some((alias) => name.includes(alias))
    );
  });

  if (candidates.length === 0) {
    throw new Error(`release ${release.tag_name} has no Linux ${arch} solidcraft tar.gz asset`);
  }
  return candidates.find((asset) => asset.name.includes(version)) ?? candidates[0]!;
}

export function checksumFor(text: string, assetName: string): string | null {
  for (const line of text.split(/\r?\n/)) {
    const match = /^([a-fA-F0-9]{64})\s+\*?(.+?)\s*$/.exec(line.trim());
    if (match && match[2] === assetName) return match[1]!.toLowerCase();
  }
  return null;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function positiveInt(value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

async function readState(cliDir: string): Promise<State> {
  try {
    const parsed = JSON.parse(await readFile(join(cliDir, 'state.json'), 'utf8')) as unknown;
    return isObject(parsed) ? (parsed as State) : {};
  } catch {
    return {};
  }
}

async function writeState(cliDir: string, state: State): Promise<void> {
  await mkdir(cliDir, { recursive: true });
  const target = join(cliDir, 'state.json');
  const temporary = join(cliDir, `state.json.tmp-${process.pid}-${Date.now()}`);
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o644 });
  await rename(temporary, target);
}

async function readLink(path: string): Promise<string | null> {
  try {
    return await readlink(path);
  } catch {
    return null;
  }
}

async function atomicSymlink(target: string, link: string): Promise<void> {
  const temporary = `${link}.tmp-${process.pid}-${Date.now()}`;
  await symlink(target, temporary);
  await rename(temporary, link);
}

async function removeLink(path: string): Promise<void> {
  await unlink(path).catch(() => undefined);
}

function targetDir(cliDir: string, target: string): string {
  const root = resolve(cliDir);
  const directory = resolve(root, target);
  if (directory !== root && !directory.startsWith(`${root}${sep}`)) {
    throw new Error('CLI symlink points outside the CLI directory');
  }
  return directory;
}

async function versionForTarget(cliDir: string, target: string): Promise<string> {
  return readCliVersion(join(targetDir(cliDir, target), 'solidcraft-cli'));
}

async function currentVersion(cliDir: string): Promise<string | null> {
  const cli = join(cliDir, 'current', 'solidcraft-cli');
  if (!(await exists(cli))) return null;
  try {
    return await readCliVersion(cli);
  } catch {
    // A broken current binary should be repaired by the next update.
    return null;
  }
}

function githubHeaders(token: string | undefined): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'solidcraft-gallery-cli-updater',
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

interface ReleaseResponse {
  notModified: boolean;
  release?: Release;
  etag?: string;
}

async function fetchLatestRelease(ctx: Context, etag: string | undefined): Promise<ReleaseResponse> {
  const url = `${ctx.apiBase.replace(/\/+$/, '')}/repos/${ctx.repo}/releases/latest`;
  const headers = githubHeaders(ctx.token);
  if (etag) headers['If-None-Match'] = etag;

  const response = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) });
  if (response.status === 304) return { notModified: true };
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new Error(`GitHub release lookup failed (${response.status})${detail ? `: ${detail}` : ''}`);
  }

  const body = (await response.json()) as unknown;
  if (!isRelease(body)) throw new Error('GitHub returned an unexpected latest-release payload');
  const nextEtag = response.headers.get('etag');
  return { notModified: false, release: body, ...(nextEtag ? { etag: nextEtag } : {}) };
}

async function downloadTo(
  url: string,
  destination: string,
  maxBytes: number,
): Promise<{ sha256: string; bytes: number }> {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'solidcraft-gallery-cli-updater' },
    signal: AbortSignal.timeout(10 * 60_000),
  });
  if (!response.ok) throw new Error(`download failed (${response.status}): ${url}`);

  const declared = Number(response.headers.get('content-length') ?? '0');
  if (declared > maxBytes) throw new Error(`download is larger than ${maxBytes} bytes`);

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > maxBytes) throw new Error(`download is larger than ${maxBytes} bytes`);
  await writeFile(destination, buffer, { mode: 0o600 });
  return { sha256: createHash('sha256').update(buffer).digest('hex'), bytes: buffer.byteLength };
}

async function verifyArchive(
  release: Release,
  asset: ReleaseAsset,
  archive: string,
  actualSha256: string,
): Promise<void> {
  const checksumAsset = release.assets.find((candidate) => /^sha256sums(\.txt)?$/i.test(candidate.name));
  const apiDigest =
    typeof asset.digest === 'string' && asset.digest.toLowerCase().startsWith('sha256:')
      ? asset.digest.slice('sha256:'.length).toLowerCase()
      : null;

  let fileDigest: string | null = null;
  if (checksumAsset) {
    const checksumPath = join(dirname(archive), 'SHA256SUMS.txt');
    await downloadTo(checksumAsset.browser_download_url, checksumPath, 1024 * 1024);
    fileDigest = checksumFor(await readFile(checksumPath, 'utf8'), asset.name);
    if (!fileDigest) throw new Error(`SHA256SUMS.txt has no entry for ${asset.name}`);
  }

  if (!apiDigest && !fileDigest) throw new Error(`release ${release.tag_name} has no checksum or digest`);
  if (apiDigest && apiDigest !== actualSha256) throw new Error('GitHub asset digest does not match the download');
  if (fileDigest && fileDigest !== actualSha256) throw new Error('SHA256SUMS.txt does not match the download');
}

async function extractCli(archive: string, destination: string): Promise<string> {
  const listing = await runCommand(
    { command: 'tar', args: ['-tzf', archive] },
    { timeoutMs: 60_000, maxOutputBytes: 8 * 1024 * 1024 },
  );
  if (listing.code !== 0) {
    throw new Error(`cannot list ${basename(archive)}: ${listing.stderr.trim().slice(0, 300)}`);
  }

  const members = listing.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const candidates = members.filter(
    (member) => !member.startsWith('/') && !member.split('/').includes('..') && basename(member) === 'solidcraft-cli',
  );
  if (candidates.length === 0) throw new Error(`${basename(archive)} does not contain solidcraft-cli`);
  const member = candidates.find((candidate) => candidate.split('/').includes('bin')) ?? candidates[0]!;
  const stripComponents = member.split('/').filter(Boolean).length - 1;

  await mkdir(destination, { recursive: true });
  const extracted = await runCommand(
    {
      command: 'tar',
      args: [
        '-xzf',
        archive,
        '-C',
        destination,
        '--no-same-owner',
        `--strip-components=${stripComponents}`,
        '--',
        member,
      ],
    },
    { timeoutMs: 60_000, maxOutputBytes: 1024 * 1024 },
  );
  if (extracted.code !== 0) {
    throw new Error(`cannot extract solidcraft-cli: ${extracted.stderr.trim().slice(0, 300)}`);
  }

  const cli = join(destination, 'solidcraft-cli');
  const info = await lstat(cli);
  if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_CLI_BYTES) {
    throw new Error('extracted solidcraft-cli is not a usable regular file');
  }
  await chmod(cli, 0o755);
  return cli;
}

async function validateCli(cli: string, expectedVersion: string): Promise<void> {
  const version = await readCliVersion(cli);
  if (version !== expectedVersion) {
    throw new Error(`the new solidcraft-cli reports ${version}, but the release is ${expectedVersion}`);
  }
  await readCliCommands(cli);
}

async function ensureDiskSpace(cliDir: string): Promise<void> {
  const info = await statfs(cliDir);
  const free = Number(info.bavail) * Number(info.bsize);
  if (free < MIN_FREE_BYTES) throw new Error(`not enough free disk space for a CLI update (${free} bytes)`);
}

async function discardNext(cliDir: string, state: State): Promise<void> {
  const next = join(cliDir, 'next');
  const target = await readLink(next);
  await removeLink(next);
  delete state.pending;

  if (!target) return;
  const directory = targetDir(cliDir, target);
  const current = await readLink(join(cliDir, 'current'));
  const previous = await readLink(join(cliDir, 'previous'));
  const currentDir = current ? targetDir(cliDir, current) : null;
  const previousDir = previous ? targetDir(cliDir, previous) : null;
  if (directory !== currentDir && directory !== previousDir) {
    await rm(directory, { recursive: true, force: true });
  }
}

async function installFromArchive(
  ctx: Context,
  release: Release,
  version: string,
  asset: ReleaseAsset,
): Promise<{ versionDir: string; sha256: string }> {
  const versionsDir = join(ctx.cliDir, 'versions');
  await mkdir(versionsDir, { recursive: true });
  const staging = await mkdtemp(join(versionsDir, '.stage-'));

  try {
    const archive = join(staging, 'cli.tar.gz');
    const downloaded = await downloadTo(asset.browser_download_url, archive, MAX_ARCHIVE_BYTES);
    await verifyArchive(release, asset, archive, downloaded.sha256);

    const extractDir = join(staging, 'extract');
    const cli = await extractCli(archive, extractDir);
    await validateCli(cli, version);

    const directoryName = `${version}-${downloaded.sha256.slice(0, 8)}`;
    const versionDir = join(versionsDir, directoryName);
    if (await exists(versionDir)) {
      await validateCli(join(versionDir, 'solidcraft-cli'), version);
      return { versionDir, sha256: downloaded.sha256 };
    }

    await writeFile(
      join(extractDir, 'release.json'),
      `${JSON.stringify(
        {
          version,
          release_url: release.html_url,
          asset: asset.name,
          sha256: downloaded.sha256,
          installed_at: nowIso(),
        },
        null,
        2,
      )}\n`,
      { mode: 0o644 },
    );
    await rename(extractDir, versionDir);
    await chmod(versionDir, 0o755);
    return { versionDir, sha256: downloaded.sha256 };
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

async function stage(ctx: Context, state: State, bootstrap = false): Promise<number> {
  const current = await currentVersion(ctx.cliDir);
  if (bootstrap && current) {
    log('info', 'solidcraft-cli is already installed; bootstrap skipped', { current });
    return 0;
  }

  await discardNext(ctx.cliDir, state);

  let fetched = await fetchLatestRelease(ctx, current ? state.etag : undefined);
  if (fetched.notModified && !current) fetched = await fetchLatestRelease(ctx, undefined);
  if (fetched.notModified) {
    state.lastCheck = nowIso();
    state.lastError = null;
    await writeState(ctx.cliDir, state);
    log('info', 'solidcraft-cli is up to date', { current });
    return 0;
  }

  const release = fetched.release!;
  if (release.draft || release.prerelease) {
    log('warn', 'latest release is a draft or prerelease; keeping the current CLI', { tag: release.tag_name });
    return 0;
  }

  const version = normalizeTag(release.tag_name);
  if (!version) throw new Error(`unsupported release tag: ${release.tag_name}`);

  if (current && compareSemver(version, current) <= 0) {
    state.lastCheck = nowIso();
    state.lastError = null;
    if (fetched.etag) state.etag = fetched.etag;
    await writeState(ctx.cliDir, state);
    log('info', 'solidcraft-cli is up to date', { current, latest: version });
    return 0;
  }

  const arch = targetArch();
  if (!arch) throw new Error(`unsupported CPU architecture: ${process.arch}`);
  const asset = selectAsset(release, version, arch);
  await ensureDiskSpace(ctx.cliDir);

  try {
    const installed = await installFromArchive(ctx, release, version, asset);
    const target = `versions/${basename(installed.versionDir)}`;
    await atomicSymlink(target, join(ctx.cliDir, 'next'));
    state.pending = {
      version,
      dir: basename(installed.versionDir),
      releaseUrl: release.html_url,
      asset: asset.name,
      sha256: installed.sha256,
    };
    state.lastCheck = nowIso();
    state.lastError = null;
    if (fetched.etag) state.etag = fetched.etag;
    await writeState(ctx.cliDir, state);
    log('info', 'staged solidcraft-cli update', { version, asset: asset.name });
    return STAGED_EXIT;
  } catch (error) {
    await discardNext(ctx.cliDir, state);
    throw error;
  }
}

async function commit(ctx: Context, state: State): Promise<number> {
  const nextTarget = await readLink(join(ctx.cliDir, 'next'));
  if (!nextTarget) throw new Error('no staged solidcraft-cli to commit');

  const nextDir = targetDir(ctx.cliDir, nextTarget);
  const nextCli = join(nextDir, 'solidcraft-cli');
  await access(nextCli, constants.X_OK);
  const version = await readCliVersion(nextCli);
  if (state.pending && state.pending.version !== version) {
    throw new Error(`staged CLI reports ${version}, but the pending release is ${state.pending.version}`);
  }

  const currentTarget = await readLink(join(ctx.cliDir, 'current'));
  const previousVersion = currentTarget
    ? await versionForTarget(ctx.cliDir, currentTarget).catch(() => state.current ?? null)
    : null;

  if (currentTarget) await atomicSymlink(currentTarget, join(ctx.cliDir, 'previous'));
  else await removeLink(join(ctx.cliDir, 'previous'));

  await atomicSymlink(nextTarget, join(ctx.cliDir, 'current'));
  await removeLink(join(ctx.cliDir, 'next'));

  if (previousVersion) state.previous = previousVersion;
  else delete state.previous;
  state.current = version;
  state.currentDir = basename(nextDir);
  if (currentTarget) state.previousDir = basename(targetDir(ctx.cliDir, currentTarget));
  else delete state.previousDir;
  state.updatedAt = nowIso();
  state.lastCheck = nowIso();
  state.lastError = null;
  if (state.pending) {
    state.releaseUrl = state.pending.releaseUrl;
    state.asset = state.pending.asset;
    state.sha256 = state.pending.sha256;
  }
  delete state.pending;
  await writeState(ctx.cliDir, state);

  try {
    await pruneVersions(ctx, state);
  } catch (error) {
    log('warn', 'could not prune old solidcraft-cli versions', { error: errorMessage(error) });
  }

  log('info', 'solidcraft-cli updated', { version, previous: previousVersion ?? null });
  return 0;
}

async function discard(ctx: Context, state: State): Promise<number> {
  await discardNext(ctx.cliDir, state);
  await writeState(ctx.cliDir, state);
  log('info', 'discarded the staged solidcraft-cli update');
  return 0;
}

async function rollback(ctx: Context, state: State): Promise<number> {
  const currentTarget = await readLink(join(ctx.cliDir, 'current'));
  const previousTarget = await readLink(join(ctx.cliDir, 'previous'));
  if (!currentTarget || !previousTarget) throw new Error('there is no previous solidcraft-cli to roll back to');

  const currentDir = targetDir(ctx.cliDir, currentTarget);
  const previousDir = targetDir(ctx.cliDir, previousTarget);
  const currentVersion = await readCliVersion(join(currentDir, 'solidcraft-cli'));
  const previousVersion = await readCliVersion(join(previousDir, 'solidcraft-cli'));

  await atomicSymlink(previousTarget, join(ctx.cliDir, 'current'));
  await atomicSymlink(currentTarget, join(ctx.cliDir, 'previous'));

  state.current = previousVersion;
  state.previous = currentVersion;
  state.currentDir = basename(previousDir);
  state.previousDir = basename(currentDir);
  state.updatedAt = nowIso();
  state.lastError = null;
  await writeState(ctx.cliDir, state);
  log('info', 'solidcraft-cli rolled back', { version: previousVersion, previous: currentVersion });
  return 0;
}

async function adopt(ctx: Context, state: State, source: string): Promise<number> {
  const current = await currentVersion(ctx.cliDir);
  if (current) {
    log('info', 'solidcraft-cli is already installed; adopt skipped', { current });
    return 0;
  }

  const sourceInfo = await stat(source);
  if (!sourceInfo.isFile()) throw new Error(`${source} is not a regular file`);

  const versionsDir = join(ctx.cliDir, 'versions');
  await mkdir(versionsDir, { recursive: true });
  const staging = await mkdtemp(join(versionsDir, '.stage-'));

  try {
    const cli = join(staging, 'solidcraft-cli');
    await copyFile(source, cli);
    await chmod(cli, 0o755);
    const version = await readCliVersion(cli);
    await readCliCommands(cli);
    const sha256 = createHash('sha256')
      .update(await readFile(cli))
      .digest('hex');
    const directoryName = `${version}-${sha256.slice(0, 8)}`;
    const versionDir = join(versionsDir, directoryName);

    if (!(await exists(versionDir))) {
      await writeFile(
        join(staging, 'release.json'),
        `${JSON.stringify({ version, source: 'adopted', sha256, installed_at: nowIso() }, null, 2)}\n`,
        { mode: 0o644 },
      );
      await rename(staging, versionDir);
    } else {
      await validateCli(join(versionDir, 'solidcraft-cli'), version);
    }
    await chmod(versionDir, 0o755);

    await atomicSymlink(`versions/${directoryName}`, join(ctx.cliDir, 'current'));
    state.current = version;
    state.currentDir = directoryName;
    state.updatedAt = nowIso();
    state.lastError = null;
    await writeState(ctx.cliDir, state);
    log('info', 'adopted the existing solidcraft-cli', { version });
    return 0;
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

async function check(ctx: Context): Promise<number> {
  const current = await currentVersion(ctx.cliDir);
  const fetched = await fetchLatestRelease(ctx, undefined);
  const release = fetched.release;
  if (!release) throw new Error('GitHub did not return a latest release');

  const latest = normalizeTag(release.tag_name);
  const updateAvailable = Boolean(latest && (!current || compareSemver(latest, current) > 0));
  const arch = targetArch();
  const asset = latest && arch ? selectAsset(release, latest, arch) : null;
  console.log(
    JSON.stringify(
      {
        current,
        latest,
        update_available: updateAvailable,
        release_url: release.html_url,
        asset: asset?.name ?? null,
        assets: release.assets.length,
      },
      null,
      2,
    ),
  );
  return 0;
}

async function pruneVersions(ctx: Context, state: State): Promise<void> {
  const versionsDir = join(ctx.cliDir, 'versions');
  const keepDirs = new Set([state.currentDir, state.previousDir].filter((value): value is string => Boolean(value)));
  const entries = await readdir(versionsDir, { withFileTypes: true });
  const candidates: { name: string; mtimeMs: number }[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    if (keepDirs.has(entry.name)) continue;
    const info = await stat(join(versionsDir, entry.name));
    if (Date.now() - info.mtimeMs < ctx.pruneMinAgeMs) continue;
    candidates.push({ name: entry.name, mtimeMs: info.mtimeMs });
  }

  candidates.sort((left, right) => right.mtimeMs - left.mtimeMs);
  const allowed = Math.max(0, ctx.keep - keepDirs.size);
  for (const candidate of candidates.slice(allowed)) {
    await rm(join(versionsDir, candidate.name), { recursive: true, force: true });
  }
}

async function acquireLock(cliDir: string): Promise<() => Promise<void>> {
  await mkdir(cliDir, { recursive: true });
  const path = join(cliDir, '.update.lock');

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = await open(path, 'wx', 0o600);
      await handle.writeFile(JSON.stringify({ pid: process.pid, started: nowIso() }));
      await handle.close();
      return async () => {
        await unlink(path).catch(() => undefined);
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const info = await stat(path).catch(() => null);
      if (info && Date.now() - info.mtimeMs > LOCK_STALE_MS) {
        await unlink(path).catch(() => undefined);
        continue;
      }
      throw new Error('another solidcraft-cli update is already running', { cause: error });
    }
  }

  throw new Error('could not acquire the solidcraft-cli update lock');
}

function usage(): string {
  return `solidcraft-cli updater

Usage:
  cli-update --check
  cli-update --stage [--scheduled]
  cli-update --bootstrap
  cli-update --adopt <path>
  cli-update --commit
  cli-update --discard
  cli-update --rollback

  --scheduled  require DEPLOY_ENV=prod and SOLIDCRAFT_CLI_AUTO_UPDATE=1
  --stage      download, verify and stage the latest stable release (exit 10 when staged)
  --bootstrap  stage the latest release only when no CLI is installed
  --adopt      install an existing binary and detect its version
  --commit     atomically switch current to the staged release
  --discard    remove the staged release
  --rollback   swap current and previous
  --check      print installed and latest versions without changing anything
`;
}

export async function run(argv: string[], env: Env): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: false,
      options: {
        scheduled: { type: 'boolean', default: false },
        check: { type: 'boolean', default: false },
        stage: { type: 'boolean', default: false },
        bootstrap: { type: 'boolean', default: false },
        commit: { type: 'boolean', default: false },
        discard: { type: 'boolean', default: false },
        rollback: { type: 'boolean', default: false },
        adopt: { type: 'string' },
        help: { type: 'boolean', default: false },
      },
    });
  } catch (error) {
    log('error', errorMessage(error));
    return 2;
  }

  const { values } = parsed;
  if (values.help) {
    console.log(usage());
    return 0;
  }

  const modes = [
    values.check ? 'check' : null,
    values.stage ? 'stage' : null,
    values.bootstrap ? 'bootstrap' : null,
    values.commit ? 'commit' : null,
    values.discard ? 'discard' : null,
    values.rollback ? 'rollback' : null,
    values.adopt ? 'adopt' : null,
  ].filter((mode): mode is string => Boolean(mode));
  if (modes.length !== 1) {
    console.error(usage());
    return 2;
  }

  const cliDir = resolve(env.SOLIDCRAFT_CLI_DIR ?? '/opt/solidcraft');
  const repo = env.SOLIDCRAFT_RELEASE_REPO ?? DEFAULT_REPO;
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) {
    log('error', `invalid SOLIDCRAFT_RELEASE_REPO: ${repo}`);
    return 2;
  }

  const ctx: Context = {
    cliDir,
    repo,
    apiBase: env.SOLIDCRAFT_RELEASE_API ?? 'https://api.github.com',
    token: env.SOLIDCRAFT_RELEASE_TOKEN,
    keep: positiveInt(env.SOLIDCRAFT_CLI_KEEP_VERSIONS, DEFAULT_KEEP),
    pruneMinAgeMs: positiveInt(env.SOLIDCRAFT_CLI_PRUNE_MIN_AGE_HOURS, 168) * 60 * 60 * 1000,
  };

  const automatic = values.scheduled && (values.stage || values.bootstrap);
  if (automatic && (env.DEPLOY_ENV !== 'prod' || env.SOLIDCRAFT_CLI_AUTO_UPDATE !== '1')) {
    log('error', 'automatic CLI updates are disabled outside production', {
      deploy_env: env.DEPLOY_ENV ?? null,
      auto_update: env.SOLIDCRAFT_CLI_AUTO_UPDATE ?? null,
    });
    return 1;
  }

  if (values.check) {
    try {
      return await check(ctx);
    } catch (error) {
      log('error', errorMessage(error));
      return 1;
    }
  }

  let releaseLock: (() => Promise<void>) | undefined;
  try {
    releaseLock = await acquireLock(cliDir);
    const state = await readState(cliDir);
    if (values.stage) return await stage(ctx, state);
    if (values.bootstrap) return await stage(ctx, state, true);
    if (values.commit) return await commit(ctx, state);
    if (values.discard) return await discard(ctx, state);
    if (values.rollback) return await rollback(ctx, state);
    if (values.adopt) return await adopt(ctx, state, values.adopt);
    return 2;
  } catch (error) {
    const message = errorMessage(error);
    log('error', message);
    try {
      const state = await readState(cliDir);
      state.lastError = message;
      state.lastCheck = nowIso();
      await writeState(cliDir, state);
    } catch {
      // The original error is more useful than a state-write failure.
    }
    return 1;
  } finally {
    if (releaseLock) await releaseLock();
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  run(process.argv.slice(2), process.env)
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error: unknown) => {
      log('error', errorMessage(error));
      process.exitCode = 1;
    });
}
