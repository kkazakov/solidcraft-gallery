import { error } from '@sveltejs/kit';
import { AppError } from '@gallery/core';
import { getDatabase, latestReadyVersion, listArtifacts } from '@gallery/db';
import { currentViewer } from '../../../../lib/server/auth.js';
import { git, storage } from '../../../../lib/server/config.js';
import { getViewableProject, localRepo } from '../../../../lib/server/projects.js';

const TYPES: Record<string, string> = {
  solidcraft: 'application/octet-stream',
  step: 'application/step',
  stl: 'model/stl',
};

export async function GET(event) {
  const viewer = await currentViewer(event);

  let project;
  try {
    project = await getViewableProject(event.params.owner, event.params.slug, viewer);
  } catch (lookupError) {
    if (lookupError instanceof AppError) throw error(404, 'Not found');
    throw lookupError;
  }

  const db = getDatabase();
  const version = await latestReadyVersion(db, project.id);
  if (!version) throw error(404, 'No ready version');

  const format = event.url.searchParams.get('format') ?? 'solidcraft';
  if (!(format in TYPES)) throw error(400, 'Unknown format');

  let bytes: Uint8Array;
  let extension: string;

  if (format === 'solidcraft') {
    try {
      if (version.designKey) {
        bytes = await storage.get(version.designKey);
      } else if (project.localPath) {
        bytes = await git.readFile({ repo: localRepo(project), commit: version.commitSha, path: version.designPath });
      } else {
        throw error(404, 'Design file is not available');
      }
    } catch {
      throw error(404, 'Design file is not available');
    }
    extension = 'solidcraft';
  } else {
    const artifacts = await listArtifacts(db, version.id);
    const artifact = artifacts.find((candidate) => candidate.kind === format);
    if (!artifact) throw error(404, `This version has no ${format.toUpperCase()}`);
    bytes = await storage.get(artifact.storageKey);
    extension = format;
  }

  const suffix = version.tag ? `-${version.tag}` : '';
  const filename = `${project.slug}${suffix}.${extension}`;
  const cache = project.visibility === 'public' ? 'public, max-age=60' : 'private, no-store';

  const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return new Response(body, {
    headers: {
      'content-type': TYPES[format]!,
      'content-length': String(bytes.byteLength),
      'content-disposition': `attachment; filename="${filename.replace(/[^A-Za-z0-9._-]/g, '_')}"`,
      'cache-control': cache,
      'x-content-type-options': 'nosniff',
    },
  });
}
