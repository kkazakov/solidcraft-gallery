import { currentViewer } from '../lib/server/auth';

export async function load(event) {
  try {
    return { viewer: await currentViewer(event) };
  } catch {
    // The public shell must render even when the database is down.
    return { viewer: null };
  }
}
