export function load() {
  return {
    devLogin: process.env.DEV_LOGIN === '1' && process.env.NODE_ENV !== 'production',
  };
}
