import { join, resolve } from 'node:path';
import { LocalGitBackend } from '@gallery/git';
import { LocalStorage } from '@gallery/storage';

const dataDir = resolve(process.env.DATA_DIR ?? 'data');

export const REPO_DIR = resolve(process.env.REPO_DIR ?? join(dataDir, 'repos'));
export const ARTIFACT_DIR = resolve(process.env.ARTIFACT_DIR ?? join(dataDir, 'artifacts'));

/** Process-wide singletons; both classes are stateless beyond their root path. */
export const git = new LocalGitBackend(REPO_DIR);
export const storage = new LocalStorage(ARTIFACT_DIR);
