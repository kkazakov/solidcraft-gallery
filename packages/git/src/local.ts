import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { isValidSlug } from '@gallery/core';

export interface LocalRepo {
  owner: string;
  slug: string;
  path: string;
  url: string;
}

export interface CommitInput {
  repo: LocalRepo;
  files: Record<string, string | Uint8Array>;
  message: string;
}

export interface CommitResult {
  commit: string;
  url: string;
}

function git(args: string[], cwd: string, encoding: 'buffer'): Promise<Buffer>;
function git(args: string[], cwd: string, encoding?: 'utf8'): Promise<string>;
function git(args: string[], cwd: string, encoding: 'utf8' | 'buffer' = 'utf8'): Promise<string | Buffer> {
  return new Promise((resolvePromise, reject) => {
    execFile('git', args, { cwd, maxBuffer: 32 * 1024 * 1024, encoding, timeout: 30_000 }, (error, stdout, stderr) => {
      if (error) {
        const detail = stderr.toString().trim();
        reject(new Error(`git ${args[0]} failed${detail ? `: ${detail}` : ''}`));
        return;
      }
      resolvePromise(stdout);
    });
  });
}

function safeRelative(path: string): string {
  if (
    path.length === 0 ||
    path.startsWith('/') ||
    path.includes('\\') ||
    path.includes('\0') ||
    path.split('/').some((part) => part === '..' || part === '')
  ) {
    throw new Error(`unsafe repository path: ${path}`);
  }
  return path;
}

/**
 * A real git repository on disk. Used for local hosted projects and tests; the
 * Forgejo backend implements the same commit shape over its API. Every argument
 * is passed to execFile as an array — there is no shell.
 */
export class LocalGitBackend {
  private readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  private repoPath(owner: string, slug: string): string {
    if (!isValidSlug(owner) || !isValidSlug(slug)) throw new Error('invalid owner or slug');
    const path = resolve(this.root, owner, slug);
    if (!path.startsWith(`${this.root}${sep}`)) throw new Error('repository path escapes the root');
    return path;
  }

  async createRepo(input: { owner: string; slug: string; title: string }): Promise<LocalRepo> {
    const path = this.repoPath(input.owner, input.slug);
    await mkdir(path, { recursive: true });
    await git(['init', '-b', 'main'], path);
    await writeFile(join(path, 'README.md'), `# ${input.title}\n`, 'utf8');
    await writeFile(join(path, '.gitattributes'), '*.solidcraft -text\n', 'utf8');

    const repo: LocalRepo = { owner: input.owner, slug: input.slug, path, url: `file://${path}` };
    await this.commitFiles({
      repo,
      files: {
        'README.md': `# ${input.title}\n`,
        '.gitattributes': '*.solidcraft -text\n',
      },
      message: 'Initial commit',
    });
    return repo;
  }

  async commitFiles(input: CommitInput): Promise<CommitResult> {
    const { repo } = input;
    const path = this.repoPath(repo.owner, repo.slug);
    if (path !== repo.path) throw new Error('repository path mismatch');

    for (const [name, content] of Object.entries(input.files)) {
      const relative = safeRelative(name);
      const target = join(path, relative);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, content);
    }

    await git(['add', '-A'], path);
    const status = (await git(['status', '--porcelain'], path)).toString();
    if (!status.trim()) {
      const head = (await git(['rev-parse', 'HEAD'], path)).toString().trim();
      return { commit: head, url: repo.url };
    }

    await git(
      [
        '-c',
        'user.name=SolidCraft Gallery',
        '-c',
        'user.email=gallery@localhost',
        'commit',
        '-m',
        input.message.slice(0, 200),
      ],
      path,
    );
    const commit = (await git(['rev-parse', 'HEAD'], path)).toString().trim();
    return { commit, url: repo.url };
  }

  async readFile(input: { repo: LocalRepo; commit: string; path: string }): Promise<Uint8Array> {
    if (!/^[0-9a-f]{40}([0-9a-f]{24})?$/.test(input.commit)) throw new Error('invalid commit');
    const relative = safeRelative(input.path);
    const path = this.repoPath(input.repo.owner, input.repo.slug);
    const stdout = await git(['show', `${input.commit}:${relative}`], path, 'buffer');
    return new Uint8Array(stdout);
  }

  async tag(input: { repo: LocalRepo; commit: string; tag: string }): Promise<void> {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(input.tag)) throw new Error('invalid tag');
    if (!/^[0-9a-f]{40}([0-9a-f]{24})?$/.test(input.commit)) throw new Error('invalid commit');
    const path = this.repoPath(input.repo.owner, input.repo.slug);
    await git(['tag', '-f', input.tag, input.commit], path);
  }

  async head(input: { repo: LocalRepo }): Promise<string> {
    const path = this.repoPath(input.repo.owner, input.repo.slug);
    return (await git(['rev-parse', 'HEAD'], path)).toString().trim();
  }
}
