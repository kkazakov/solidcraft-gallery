import { AppError, LIMITS } from '@gallery/core';

export interface GitHubOptions {
  apiBase?: string;
  rawBase?: string;
  token?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxFileBytes?: number;
}

export interface GitHubRepoRef {
  owner: string;
  repo: string;
  url: string;
}

export interface GitHubRepo {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  url: string;
  defaultBranch: string;
  private: boolean;
  /** Approximate repository size in bytes, as reported by GitHub (KB units). */
  sizeBytes: number;
  description: string;
}

export interface GitHubCommit {
  sha: string;
  message: string;
  authorName: string;
  authoredAt: Date;
}

export interface GitHubTreeEntry {
  path: string;
  type: string;
  size: number;
}

const USER_AGENT = 'solidcraft-gallery';
const DEFAULT_MAX_TREE_ENTRIES = 10_000;
const DEFAULT_REPO_BYTES = 1024 * 1024 * 1024;

function segment(value: string): string {
  return encodeURIComponent(value);
}

function joinUrl(base: string, path: string): URL {
  return new URL(path.replace(/^\/+/, ''), base.endsWith('/') ? base : `${base}/`);
}

/** Accept only canonical public GitHub repository URLs. */
export function parseGitHubUrl(input: string): GitHubRepoRef {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new AppError('validation_failed', 'Enter a full https://github.com/owner/repo URL');
  }

  if (url.protocol !== 'https:') throw new AppError('validation_failed', 'Only https:// repository URLs are supported');
  if (url.username || url.password)
    throw new AppError('validation_failed', 'Repository URLs must not contain credentials');
  if (url.search || url.hash)
    throw new AppError('validation_failed', 'Repository URLs must not contain a query or fragment');
  if (url.hostname.toLowerCase() !== 'github.com' && url.hostname.toLowerCase() !== 'www.github.com') {
    throw new AppError('validation_failed', 'Only github.com repositories are supported in this milestone');
  }

  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length !== 2) throw new AppError('validation_failed', 'Expected https://github.com/owner/repo');
  const owner = parts[0]!;
  const repo = parts[1]!.replace(/\.git$/i, '');
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9_.-]{0,38})$/.test(owner) || !/^[A-Za-z0-9_.-]{1,100}$/.test(repo)) {
    throw new AppError('validation_failed', 'The repository URL contains an invalid owner or name');
  }
  if (repo === '.' || repo === '..')
    throw new AppError('validation_failed', 'The repository URL contains an invalid name');

  return { owner, repo, url: `https://github.com/${owner}/${repo}` };
}

/**
 * Minimal read-only GitHub client. It only needs public metadata, a commit and
 * raw files; no clone, no token for public repositories. `apiBase` and
 * `rawBase` are injectable so tests never call github.com.
 */
export class GitHubClient {
  private readonly apiBase: string;
  private readonly rawBase: string;
  private readonly token: string | undefined;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly maxFileBytes: number;

  constructor(options: GitHubOptions = {}) {
    this.apiBase = options.apiBase ?? 'https://api.github.com/';
    this.rawBase = options.rawBase ?? 'https://raw.githubusercontent.com/';
    this.token = options.token;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 12_000;
    this.maxFileBytes = options.maxFileBytes ?? LIMITS.designBytes;
  }

  private headers(accept: string): Record<string, string> {
    return {
      accept,
      'user-agent': USER_AGENT,
      'x-github-api-version': '2022-11-28',
      ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
    };
  }

  private async get(url: URL, accept: string): Promise<Response> {
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        headers: this.headers(accept),
        signal: AbortSignal.timeout(this.timeoutMs),
        redirect: 'follow',
      });
    } catch {
      throw new AppError('upstream_unavailable', 'GitHub did not answer; try again shortly');
    }

    if (response.status === 404) {
      throw new AppError('not_found', 'Repository not found, or it is private');
    }
    if (response.status === 429 || response.headers.get('x-ratelimit-remaining') === '0') {
      throw new AppError('rate_limited', 'GitHub rate limit reached; try again later');
    }
    if (response.status === 401 || response.status === 403) {
      throw new AppError('forbidden', 'GitHub refused the request');
    }
    if (!response.ok) {
      throw new AppError('upstream_unavailable', `GitHub returned HTTP ${response.status}`);
    }
    return response;
  }

  async repo(ref: GitHubRepoRef): Promise<GitHubRepo> {
    const response = await this.get(
      joinUrl(this.apiBase, `repos/${segment(ref.owner)}/${segment(ref.repo)}`),
      'application/vnd.github+json',
    );
    const body = (await response.json()) as {
      id?: unknown;
      full_name?: unknown;
      default_branch?: unknown;
      private?: unknown;
      size?: unknown;
      description?: unknown;
      html_url?: unknown;
      owner?: { login?: unknown };
      name?: unknown;
    };
    if (typeof body.id !== 'number' || typeof body.default_branch !== 'string') {
      throw new AppError('upstream_unavailable', 'GitHub returned an unexpected repository response');
    }
    if (body.private === true) {
      throw new AppError('forbidden', 'Private repositories are not supported yet');
    }
    const sizeKb = typeof body.size === 'number' ? body.size : 0;
    if (sizeKb * 1024 > DEFAULT_REPO_BYTES) {
      throw new AppError('payload_too_large', 'The repository is larger than the 1 GB limit');
    }
    return {
      id: String(body.id),
      owner: typeof body.owner?.login === 'string' ? body.owner.login : ref.owner,
      name: typeof body.name === 'string' ? body.name : ref.repo,
      fullName: typeof body.full_name === 'string' ? body.full_name : `${ref.owner}/${ref.repo}`,
      url: typeof body.html_url === 'string' ? body.html_url : ref.url,
      defaultBranch: body.default_branch,
      private: false,
      sizeBytes: sizeKb * 1024,
      description: typeof body.description === 'string' ? body.description : '',
    };
  }

  async commit(ref: GitHubRepoRef, branch: string): Promise<GitHubCommit> {
    const response = await this.get(
      joinUrl(this.apiBase, `repos/${segment(ref.owner)}/${segment(ref.repo)}/commits/${segment(branch)}`),
      'application/vnd.github+json',
    );
    const body = (await response.json()) as {
      sha?: unknown;
      commit?: { message?: unknown; author?: { name?: unknown; date?: unknown } };
    };
    if (typeof body.sha !== 'string' || !/^[0-9a-f]{40}([0-9a-f]{24})?$/.test(body.sha)) {
      throw new AppError('upstream_unavailable', 'GitHub returned an unexpected commit response');
    }
    const date = body.commit?.author?.date;
    return {
      sha: body.sha,
      message: typeof body.commit?.message === 'string' ? body.commit.message.slice(0, 2000) : '',
      authorName: typeof body.commit?.author?.name === 'string' ? body.commit.author.name.slice(0, 120) : '',
      authoredAt: typeof date === 'string' && !Number.isNaN(Date.parse(date)) ? new Date(date) : new Date(),
    };
  }

  async tree(ref: GitHubRepoRef, commitSha: string): Promise<GitHubTreeEntry[]> {
    const response = await this.get(
      joinUrl(
        this.apiBase,
        `repos/${segment(ref.owner)}/${segment(ref.repo)}/git/trees/${segment(commitSha)}?recursive=1`,
      ),
      'application/vnd.github+json',
    );
    const body = (await response.json()) as {
      truncated?: unknown;
      tree?: { path?: unknown; type?: unknown; size?: unknown }[];
    };
    if (body.truncated === true) {
      throw new AppError('payload_too_large', 'The repository tree is too large to index');
    }
    if (!Array.isArray(body.tree) || body.tree.length > DEFAULT_MAX_TREE_ENTRIES) {
      throw new AppError('payload_too_large', 'The repository has too many files to index');
    }
    return body.tree
      .filter((entry) => typeof entry.path === 'string' && typeof entry.type === 'string')
      .map((entry) => ({
        path: entry.path as string,
        type: entry.type as string,
        size: typeof entry.size === 'number' ? entry.size : 0,
      }));
  }

  async file(ref: GitHubRepoRef, commitSha: string, path: string): Promise<Uint8Array> {
    const encoded = path.split('/').map(segment).join('/');
    const url = joinUrl(this.rawBase, `${segment(ref.owner)}/${segment(ref.repo)}/${segment(commitSha)}/${encoded}`);
    const response = await this.get(url, 'application/vnd.github.raw');
    const declared = Number(response.headers.get('content-length') ?? '0');
    if (Number.isFinite(declared) && declared > this.maxFileBytes) {
      throw new AppError('payload_too_large', 'The design is larger than the 25 MB limit');
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > this.maxFileBytes) {
      throw new AppError('payload_too_large', 'The design is larger than the 25 MB limit');
    }
    return bytes;
  }
}
