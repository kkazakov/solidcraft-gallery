export function load() {
  return {
    version: process.env.APP_VERSION ?? 'dev',
  };
}
