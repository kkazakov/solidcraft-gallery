export function load({ url }: { url: URL }) {
  return {
    q: (url.searchParams.get('q') ?? '').slice(0, 200),
  };
}
