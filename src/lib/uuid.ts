/**
 * Quick and simple UUID generator.
 * Unlike genUnorderedId, this generates IDs starts with the current timestamp,
 * so that they are roughly ordered by creation time when sorted lexicographically.
 * @returns
 */
export function genOrderedId(): string {
  const now = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2);
  return `${now}-${rand}`;
}

/**
 * Quick and simple UUID generator.
 * @returns
 */
export function genUnorderedId(): string {
  const now = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2);
  return `${rand}-${now}`;
}
