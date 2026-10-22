export type DesignKind = 'container' | 'json' | 'unknown';

/**
 * A .solidcraft is either a ZIP container or a UTF-8 JSON document. The
 * extension is not evidence: the reader detects a ZIP by its local-header
 * signature and falls back to JSON (SolidCraft docs/design-container.md).
 */
export function detectDesignKind(bytes: Uint8Array): DesignKind {
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
    return 'container';
  }

  // Skip a UTF-8 BOM and leading whitespace, then look for the first `{`.
  let i = 0;
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) i = 3;
  while (i < bytes.length && (bytes[i] === 0x20 || bytes[i] === 0x09 || bytes[i] === 0x0a || bytes[i] === 0x0d)) i += 1;
  return bytes[i] === 0x7b ? 'json' : 'unknown';
}
