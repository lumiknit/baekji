export function tagToHsl(tag: string): { h: number; s: number } {
  let hash = 5381;
  for (let i = 0; i < tag.length; i++) {
    hash = ((hash << 5) + hash) ^ tag.charCodeAt(i);
  }
  const u = hash >>> 0;
  return { h: u % 360, s: 45 + (u % 21) };
}

export function hexToHsl(hex: string): { h: number; s: number } {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d + 6) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = Math.round(h * 60);
  }
  return { h, s: max === 0 ? 0 : Math.round((d / max) * 100) };
}
