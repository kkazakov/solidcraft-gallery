import { error } from '@sveltejs/kit';
import { findArtifactByStorageKey, getDatabase } from '@gallery/db';
import { currentViewer } from '../../../lib/server/auth.js';
import { storage } from '../../../lib/server/config.js';

const CONTENT_TYPES: Record<string, string> = {
  png: 'image/png',
  webp: 'image/webp',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  step: 'application/step',
  stl: 'model/stl',
};

export async function GET(event) {
  const key = event.params.key;
  if (!key) throw error(404, 'Not found');

  const artifact = await findArtifactByStorageKey(getDatabase(), key);
  if (!artifact) throw error(404, 'Not found');

  if (artifact.visibility !== 'public' || artifact.status !== 'ready') {
    const viewer = await currentViewer(event);
    if (!viewer || (viewer.id !== artifact.ownerId && viewer.role !== 'admin')) {
      throw error(404, 'Not found');
    }
  }

  const bytes = await storage.get(key);
  const extension = key.split('.').pop()?.toLowerCase() ?? '';
  const publicArtifact = artifact.visibility === 'public' && artifact.status === 'ready';

  const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return new Response(body, {
    headers: {
      'content-type': CONTENT_TYPES[extension] ?? 'application/octet-stream',
      'content-length': String(bytes.byteLength),
      'cache-control': publicArtifact ? 'public, max-age=31536000, immutable' : 'private, no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}
