import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseCliVersion, readCliCommands, readCliVersion } from '../src/version.js';

describe('parseCliVersion', () => {
  it('reads the normal CLI banner', () => {
    expect(parseCliVersion('solidcraft-cli 9.9.9\n')).toBe('9.9.9');
  });

  it('tolerates a path or extra diagnostics', () => {
    expect(parseCliVersion('warning: something\n/opt/solidcraft/current/solidcraft-cli 1.2.3\n')).toBe('1.2.3');
  });

  it('returns null when no version is present', () => {
    expect(parseCliVersion('solidcraft-cli: command not found')).toBeNull();
  });
});

const maybe = process.platform === 'win32' ? describe.skip : describe;

maybe('CLI probes', () => {
  let dir: string;
  let cli: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'gallery-cli-probe-'));
    cli = join(dir, 'solidcraft-cli');
    await writeFile(
      cli,
      [
        '#!/bin/sh',
        'if [ "$1" = "--version" ]; then',
        '  echo "solidcraft-cli 9.9.9"',
        'elif [ "$1" = "commands" ]; then',
        '  echo \'[{"id":"snapshot"}]\'',
        'else',
        '  echo "unexpected argument: $1" >&2',
        '  exit 2',
        'fi',
        '',
      ].join('\n'),
    );
    await chmod(cli, 0o755);
  });

  afterAll(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it('reads a version', async () => {
    await expect(readCliVersion(cli)).resolves.toBe('9.9.9');
  });

  it('reads the command table', async () => {
    await expect(readCliCommands(cli)).resolves.toBe(1);
  });

  it('rejects a CLI that does not report a version', async () => {
    const broken = join(dir, 'broken-cli');
    await writeFile(broken, '#!/bin/sh\necho "no version here"\n');
    await chmod(broken, 0o755);
    await expect(readCliVersion(broken)).rejects.toThrow(/did not report a version/);
  });

  it('rejects a CLI that cannot list commands', async () => {
    const broken = join(dir, 'broken-commands');
    await writeFile(broken, '#!/bin/sh\nexit 1\n');
    await chmod(broken, 0o755);
    await expect(readCliCommands(broken)).rejects.toThrow(/commands failed/);
  });
});
