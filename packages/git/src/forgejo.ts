import { AppError } from '@gallery/core';

export interface ForgejoOptions {
  /** API base, e.g. http://forgejo:3000 (no /api/v1 suffix). */
  baseUrl: string;
  /** Browser-facing base for constructed repository URLs. */
  publicUrl?: string;
  token: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface ForgejoRepo {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  url: string;
  defaultBranch: string;
  private: boolean;
}

export interface ForgejoFileResult {
  commit: string;
}

interface ForgejoRepoJson {
  id?: unknown;
  name?: unknown;
  full_name?: unknown;
  html_url?: unknown;
  default_branch?: unknown;
  private?: unknown;
  owner?: { login?: unknown };
}

function join(base: string, path: string): URL {
  const clean = base.replace(/\/+$/, '');
  return new URL(`${clean}/api/v1/${path.replace(/^\/+/, '')}`);
}

function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

/**
 * Read/write Forgejo repositories through the REST API. The site never clones
 * or runs git for hosted projects; contents calls create the commits and the
 * returned commit SHA is the version identity.
 */
export class ForgejoClient {
  private readonly baseUrl: string;
  private readonly publicUrl: string;
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: ForgejoOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.publicUrl = (options.publicUrl ?? options.baseUrl).replace(/\/+$/, '');
    this.token = options.token;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 12_000;
  }

  private async request(path: string, init: RequestInit = {}, allow404 = false): Promise<Response> {
    let response: Response;
    try {
      response = await this.fetchImpl(join(this.baseUrl, path), {
        ...init,
        headers: {
          accept: 'application/json',
          authorization: `token ${this.token}`,
          ...(init.body ? { 'content-type': 'application/json' } : {}),
          ...init.headers,
        },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new AppError('upstream_unavailable', 'Forgejo did not answer; try again shortly');
    }

    if (allow404 && response.status === 404) return response;
    if (response.status === 401 || response.status === 403) {
      throw new AppError('forbidden', 'Forgejo refused the provisioning request');
    }
    if (response.status === 404) throw new AppError('not_found', 'Forgejo repository or file not found');
    if (response.status === 409) throw new AppError('conflict', 'Forgejo reported a conflicting change');
    if (response.status === 422) throw new AppError('validation_failed', 'Forgejo rejected the repository change');
    if (response.status === 429) throw new AppError('rate_limited', 'Forgejo rate limit reached');
    if (!response.ok) {
      throw new AppError('upstream_unavailable', `Forgejo returned HTTP ${response.status}`);
    }
    return response;
  }

  private repoFromJson(body: ForgejoRepoJson, fallback: { owner: string; name: string }): ForgejoRepo {
    const owner = typeof body.owner?.login === 'string' ? body.owner.login : fallback.owner;
    const name = typeof body.name === 'string' ? body.name : fallback.name;
    const fullName = typeof body.full_name === 'string' ? body.full_name : `${owner}/${name}`;
    return {
      id: String(body.id ?? fullName),
      owner,
      name,
      fullName,
      url: `${this.publicUrl}/${fullName}`,
      defaultBranch: typeof body.default_branch === 'string' ? body.default_branch : 'main',
      private: body.private !== false,
    };
  }

  async repo(owner: string, name: string): Promise<ForgejoRepo> {
    const response = await this.request(`repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`);
    return this.repoFromJson((await response.json()) as ForgejoRepoJson, { owner, name });
  }

  async createRepo(input: { name: string; private: boolean }): Promise<ForgejoRepo> {
    const response = await this.request('user/repos', {
      method: 'POST',
      body: JSON.stringify({
        name: input.name,
        private: input.private,
        auto_init: true,
        default_branch: 'main',
      }),
    });
    return this.repoFromJson((await response.json()) as ForgejoRepoJson, { owner: 'unknown', name: input.name });
  }

  async addCollaborator(owner: string, repo: string, username: string): Promise<void> {
    await this.request(
      `repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/collaborators/${encodeURIComponent(username)}`,
      { method: 'PUT', body: JSON.stringify({ permission: 'write' }) },
    );
  }

  async upsertFile(input: {
    owner: string;
    repo: string;
    path: string;
    content: Uint8Array;
    message: string;
    branch: string;
  }): Promise<ForgejoFileResult> {
    const base = `repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}/contents/${encodePath(input.path)}`;
    const existing = await this.request(`${base}?ref=${encodeURIComponent(input.branch)}`, {}, true);

    let sha: string | undefined;
    if (existing.status === 200) {
      const body = (await existing.json()) as { sha?: unknown };
      if (typeof body.sha !== 'string') {
        throw new AppError('validation_failed', 'Forgejo returned an unexpected contents response');
      }
      sha = body.sha;
    }

    const response = await this.request(base, {
      method: sha ? 'PUT' : 'POST',
      body: JSON.stringify({
        content: Buffer.from(input.content).toString('base64'),
        message: input.message.slice(0, 200),
        branch: input.branch,
        ...(sha ? { sha } : {}),
      }),
    });

    const body = (await response.json()) as { commit?: { sha?: unknown } };
    if (typeof body.commit?.sha !== 'string' || !/^[0-9a-f]{40}([0-9a-f]{24})?$/.test(body.commit.sha)) {
      throw new AppError('upstream_unavailable', 'Forgejo did not return a commit SHA');
    }
    return { commit: body.commit.sha };
  }

  async tag(input: { owner: string; repo: string; name: string; target: string; message?: string }): Promise<void> {
    await this.request(`repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}/tags`, {
      method: 'POST',
      body: JSON.stringify({
        tag_name: input.name,
        target: input.target,
        ...(input.message ? { message: input.message.slice(0, 200) } : {}),
      }),
    });
  }

  async setPrivate(owner: string, repo: string, isPrivate: boolean): Promise<void> {
    await this.request(`repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, {
      method: 'PATCH',
      body: JSON.stringify({ private: isPrivate }),
    });
  }
}
