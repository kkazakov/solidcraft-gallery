import { error } from '@sveltejs/kit';
import { AppError } from '@gallery/core';
import { getDatabase, latestReadyVersion, listArtifacts, listVersions } from '@gallery/db';
import { currentViewer } from '../../../lib/server/auth.js';
import { getViewableProject } from '../../../lib/server/projects.js';

export async function load(event) {
  const viewer = await currentViewer(event);
  let project;
  try {
    project = await getViewableProject(event.params.owner, event.params.slug, viewer);
  } catch (loadError) {
    if (loadError instanceof AppError) throw error(404, 'Not found');
    throw loadError;
  }

  const db = getDatabase();
  const latest = await latestReadyVersion(db, project.id);
  if (!latest && viewer?.id !== project.ownerId && viewer?.role !== 'admin') {
    throw error(404, 'Not found');
  }

  const artifacts = latest ? await listArtifacts(db, latest.id) : [];
  const versions = await listVersions(db, project.id);
  const images: Record<string, string> = {};
  const formats: Record<string, boolean> = { sc: latest !== null, step: false, stl: false };
  let model: { url: string; bytes: number } | null = null;
  for (const artifact of artifacts) {
    if (['iso', 'top', 'front', 'bottom'].includes(artifact.kind)) {
      images[artifact.kind] = `/media/${artifact.storageKey}`;
    }
    if (artifact.kind === 'step' || artifact.kind === 'stl') formats[artifact.kind] = true;
    if (artifact.kind === 'stl') model = { url: `/media/${artifact.storageKey}`, bytes: artifact.bytes };
  }

  const metrics = latest
    ? {
        bodies: Number(latest.metrics.bodies ?? 0),
        volume: Number(latest.metrics.volume_mm3 ?? 0),
        mass: Number(latest.metrics.mass_g ?? 0),
        bbox: Array.isArray(latest.metrics.bbox_mm) ? (latest.metrics.bbox_mm as number[]) : null,
      }
    : null;

  return {
    project,
    latest,
    versions,
    images,
    formats,
    model,
    metrics,
    isOwner: viewer?.id === project.ownerId,
  };
}
