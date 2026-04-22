/**
 * Quick and simple UUID generator.
 * @returns
 */
export function genId(): string {
  const now = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2);
  return `${now}-${rand}`;
}
