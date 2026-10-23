import { currentViewer } from '../lib/server/auth';
import { formatUpdatedAt, siteBuiltAt } from '../lib/server/updated';

export async function load(event) {
  const builtAt = siteBuiltAt();

  let viewer = null;
  try {
    viewer = await currentViewer(event);
  } catch {
    // The public shell must render even when the database is down.
  }

  return {
    viewer,
    siteUpdated: {
      iso: builtAt.toISOString(),
      // The no-JavaScript fallback is UTC; app.html localises it in the browser.
      label: formatUpdatedAt(builtAt, 'UTC'),
    },
  };
}
