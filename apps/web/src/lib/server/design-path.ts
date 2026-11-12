/** The current SolidCraft design extension is `.sc`; `.solidcraft` is legacy. */
export function isDesignPath(path: string): boolean {
  const lower = path.toLowerCase();
  return lower.endsWith('.sc') || lower.endsWith('.solidcraft');
}
