export function tagToHsl(tag: string): { h: number; s: number } {
  let hash = 5381;
  for (let i = 0; i < tag.length; i++) {
    hash = ((hash << 5) + hash) ^ tag.charCodeAt(i);
  }
  const u = hash >>> 0;
  return { h: u % 360, s: 45 + (u % 21) };
}
