const UNITS = ['', 'k', 'M', 'G', 'T'] as const;

export function formatCompact(n: number): string {
  let unit = 0;
  while (unit < UNITS.length - 1 && Math.abs(n) >= 1000) {
    n /= 1000;
    unit++;
  }
  if (unit === 0) return String(Math.round(n));
  return n.toFixed(1) + UNITS[unit];
}
