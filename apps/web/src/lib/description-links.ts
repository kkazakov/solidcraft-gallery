export type DescriptionSegment = { type: 'text'; text: string } | { type: 'link'; href: string; text: string };

const HTTP_URL = /https?:\/\/[^\s<>"'`]+/gi;
const TRAILING_PUNCTUATION = new Set(['.', ',', ';', ':', '!', '?']);
const CLOSING_BRACKETS: Record<string, string> = { ')': '(', ']': '[', '}': '{' };

function count(value: string, character: string): number {
  let total = 0;
  for (const current of value) {
    if (current === character) total += 1;
  }
  return total;
}

/** Remove sentence punctuation and unmatched closing brackets from a URL candidate. */
function trimUrl(candidate: string): string {
  let url = candidate;
  while (url.length > 0) {
    const last = url.at(-1)!;
    if (TRAILING_PUNCTUATION.has(last)) {
      url = url.slice(0, -1);
      continue;
    }
    const opening = CLOSING_BRACKETS[last];
    if (opening && count(url, last) > count(url, opening)) {
      url = url.slice(0, -1);
      continue;
    }
    break;
  }
  return url;
}

function isHttpUrl(value: string): boolean {
  if (!/^https?:\/\//i.test(value)) return false;
  try {
    const parsed = new URL(value);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.hostname.length > 0;
  } catch {
    return false;
  }
}

/**
 * Split a description into plain-text and HTTP(S) link segments.
 *
 * The description is never treated as HTML: Svelte escapes every text segment and every
 * attribute. Only absolute http(s) URLs with a host become links.
 */
export function linkifyDescription(description: string): DescriptionSegment[] {
  const segments: DescriptionSegment[] = [];
  let cursor = 0;

  for (const match of description.matchAll(HTTP_URL)) {
    const href = trimUrl(match[0]);
    if (!isHttpUrl(href)) continue;

    const index = match.index ?? 0;
    if (index > cursor) {
      segments.push({ type: 'text', text: description.slice(cursor, index) });
    }
    segments.push({ type: 'link', href, text: href });
    cursor = index + href.length;
  }

  if (cursor < description.length) {
    segments.push({ type: 'text', text: description.slice(cursor) });
  }
  return segments;
}
