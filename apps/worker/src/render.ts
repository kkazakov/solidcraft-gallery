import { constants } from 'node:fs';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import {
  findProjectById,
  findVersionById,
  markVersionFailed,
  markVersionReady,
  markVersionRendering,
  setProjectReady,
  upsertArtifact,
  type Database,
} from '@gallery/db';
import { directRenderPlan, runCommand, runPlan, type Command } from '@gallery/render';
import { artifactKey, sha256Hex, type LocalStorage } from '@gallery/storage';
import type { WorkerConfig } from './config.js';
import type { Logger } from './logger.js';

export interface RenderContext {
  db: Database;
  storage: LocalStorage;
  config: WorkerConfig;
  log: Logger;
}

export interface RenderResult {
  ok: boolean;
  errorCode?: string;
  artifacts?: number;
}

class RenderFailure extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'RenderFailure';
  }
}

function isPng(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  );
}

function designPathFor(localPath: string, designPath: string): string {
  const root = resolve(localPath);
  const path = resolve(root, designPath);
  if (!path.startsWith(`${root}${sep}`))
    throw new RenderFailure('design_unreadable', 'design path escapes the repository');
  return path;
}

function planFor(config: WorkerConfig, designPath: string, outDir: string): { name: string; command: Command }[] {
  if (config.sandboxMode === 'nsjail') {
    // The jail root, CLI mount and user are built in M1's deployment step.
    throw new RenderFailure('renderer_unavailable', 'nsjail rendering is not wired on this worker yet');
  }
  if (process.env.NODE_ENV === 'production' && !config.allowUnsandboxed) {
    throw new RenderFailure('renderer_unavailable', 'unsandboxed rendering is disabled in production');
  }
  return directRenderPlan({ cli: config.cli, designPath, outDir });
}

async function ensureCli(config: WorkerConfig): Promise<void> {
  try {
    await access(config.cli, constants.X_OK);
  } catch {
    throw new RenderFailure('renderer_unavailable', `solidcraft-cli is not executable at ${config.cli}`);
  }
}

/**
 * Render one version into content-addressed artifacts and mark it ready.
 * A failure is recorded on the version; the job itself completes so a
 * deterministic bad design does not retry forever.
 */
export async function renderVersion(versionId: string, ctx: RenderContext): Promise<RenderResult> {
  const version = await findVersionById(ctx.db, versionId);
  if (!version) throw new Error(`version ${versionId} not found`);
  if (version.status === 'ready') return { ok: true, artifacts: 0 };

  const project = await findProjectById(ctx.db, version.projectId);
  if (!project) throw new Error(`project ${version.projectId} not found`);

  let work: string | undefined;
  try {
    await markVersionRendering(ctx.db, versionId);

    let designBytes: Uint8Array;
    if (project.localPath) {
      const source = designPathFor(project.localPath, version.designPath);
      designBytes = new Uint8Array(await readFile(source));
    } else if (version.designKey) {
      // External sources cache the lean design in artifact storage.
      designBytes = await ctx.storage.get(version.designKey);
    } else {
      throw new RenderFailure('design_unreadable', 'the version has no local repository or cached design');
    }
    const expected = Buffer.from(version.designSha256).toString('hex');
    const actual = sha256Hex(designBytes);
    if (actual !== expected) {
      throw new RenderFailure('design_hash_mismatch', 'committed design does not match the recorded hash');
    }

    await ensureCli(ctx.config);
    work = await mkdtemp(join(tmpdir(), `gallery-render-${versionId.slice(0, 8)}-`));
    const designFile = join(work, 'design.solidcraft');
    const outDir = join(work, 'out');
    await mkdir(outDir, { recursive: true });
    await writeFile(designFile, designBytes);

    const plan = planFor(ctx.config, designFile, outDir);
    // Previews and measurements are required; derivatives are best-effort.
    const required = plan.slice(0, 4);
    const derivatives = plan.slice(4);

    const run = await runPlan(required, { timeoutMs: ctx.config.timeoutSeconds * 1000 });
    if (!run.ok) {
      const failed = run.failed;
      const code = failed?.result.timedOut ? 'render_timeout' : 'render_failed';
      ctx.log.error('render plan failed', {
        version_id: versionId,
        step: failed?.name,
        exit_code: failed?.result.code,
        stdout: failed?.result.stdout.slice(0, 1000),
        stderr: failed?.result.stderr.slice(0, 2000),
      });
      throw new RenderFailure(
        code,
        `renderer stopped at ${failed?.name ?? 'an unknown step'} (exit ${failed?.result.code ?? '?'})`,
      );
    }

    for (const step of derivatives) {
      const result = await runCommand(step.command, { timeoutMs: ctx.config.timeoutSeconds * 1000 });
      if (result.code !== 0 || result.timedOut) {
        ctx.log.warn('derivative export failed', {
          version_id: versionId,
          step: step.name,
          exit_code: result.code,
          timed_out: result.timedOut,
        });
      }
    }

    const sha = actual;
    const images: { kind: 'iso' | 'top' | 'front'; file: string }[] = [
      { kind: 'iso', file: 'iso.png' },
      { kind: 'top', file: 'top.png' },
      { kind: 'front', file: 'front.png' },
    ];

    let artifacts = 0;
    for (const image of images) {
      const bytes = new Uint8Array(await readFile(join(outDir, image.file)));
      if (!isPng(bytes)) throw new RenderFailure('render_failed', `${image.file} is not a PNG`);
      const stored = await ctx.storage.put(artifactKey(sha, image.file), bytes);
      await upsertArtifact(ctx.db, {
        versionId,
        kind: image.kind,
        storageKey: stored.key,
        sha256: new Uint8Array(Buffer.from(stored.sha256, 'hex')),
        bytes: stored.bytes,
        width: 1200,
        height: 900,
      });
      artifacts += 1;
    }

    for (const [kind, file] of [
      ['step', 'model.step'],
      ['stl', 'model.stl'],
    ] as const) {
      try {
        const bytes = new Uint8Array(await readFile(join(outDir, file)));
        if (bytes.byteLength === 0) continue;
        const stored = await ctx.storage.put(artifactKey(sha, file), bytes);
        await upsertArtifact(ctx.db, {
          versionId,
          kind,
          storageKey: stored.key,
          sha256: new Uint8Array(Buffer.from(stored.sha256, 'hex')),
          bytes: stored.bytes,
        });
        artifacts += 1;
      } catch {
        // A missing derivative is a warning, not a failed version.
        ctx.log.warn('derivative missing', { version_id: versionId, kind });
      }
    }

    const metrics = JSON.parse(await readFile(join(outDir, 'metrics.json'), 'utf8')) as Record<string, unknown>;
    const bodyList = Array.isArray(metrics.bodies) ? (metrics.bodies as Record<string, unknown>[]) : [];
    const volume = bodyList.reduce((sum, body) => sum + (typeof body.volume_mm3 === 'number' ? body.volume_mm3 : 0), 0);
    const mass = bodyList.reduce((sum, body) => sum + (typeof body.mass_g === 'number' ? body.mass_g : 0), 0);
    let bbox: number[] | null = null;
    for (const body of bodyList) {
      const box = body.bbox as { min?: unknown; max?: unknown } | undefined;
      if (!box || !Array.isArray(box.min) || !Array.isArray(box.max)) continue;
      const min = box.min as number[];
      const max = box.max as number[];
      if (min.length !== 3 || max.length !== 3) continue;
      if (!bbox) bbox = [max[0]! - min[0]!, max[1]! - min[1]!, max[2]! - min[2]!];
      else {
        bbox = [
          Math.max(bbox[0]!, max[0]! - min[0]!),
          Math.max(bbox[1]!, max[1]! - min[1]!),
          Math.max(bbox[2]!, max[2]! - min[2]!),
        ];
      }
    }
    const summary = {
      ...metrics,
      bodies: bodyList.length,
      volume_mm3: Math.round(volume * 100) / 100,
      mass_g: Math.round(mass * 100) / 100,
      bbox_mm: bbox,
      body_details: bodyList.slice(0, 20),
    };

    await markVersionReady(ctx.db, versionId, summary, []);
    await setProjectReady(ctx.db, project.id);
    ctx.log.info('render ready', { version_id: versionId, artifacts, bodies: bodyList.length });
    return { ok: true, artifacts };
  } catch (error) {
    const failure =
      error instanceof RenderFailure
        ? error
        : new RenderFailure('render_failed', error instanceof Error ? error.message : String(error));
    ctx.log.error('render failed', { version_id: versionId, code: failure.code, detail: failure.message });
    await markVersionFailed(ctx.db, versionId, failure.code, failure.message);
    return { ok: false, errorCode: failure.code };
  } finally {
    if (work) await rm(work, { recursive: true, force: true });
  }
}
