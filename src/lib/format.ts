import { s } from './i18n';

export function formatRelativeDate(dateOrIso: Date | string): string {
  const d = typeof dateOrIso === 'string' ? new Date(dateOrIso) : dateOrIso;
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return s('time.just_now');
  if (diff < 3_600_000)
    return s('time.minutes_ago', { n: Math.floor(diff / 60_000) });
  if (diff < 86_400_000)
    return s('time.hours_ago', { n: Math.floor(diff / 3_600_000) });
  return d.toLocaleDateString();
}

/** "YYMMdd_HHmm" suffix for filenames */
export function timestampSuffix(): string {
  const now = new Date();
  const y = now.getFullYear().toString().slice(2);
  const mo = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  return `${y}${mo}${d}_${h}${m}`;
}

export function formatExpiry(expiresAt: number): string {
  const diff = expiresAt - Date.now();
  if (diff <= 0) return s('dropbox.expiry_expired');
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  if (h > 0) return s('dropbox.expiry_hours', { h, m });
  return s('dropbox.expiry_minutes', { m });
}

const COMPACT_UNITS = ['', 'k', 'M', 'G', 'T'] as const;

export function formatCompact(n: number): string {
  let unit = 0;
  while (unit < COMPACT_UNITS.length - 1 && Math.abs(n) >= 1000) {
    n /= 1000;
    unit++;
  }
  if (unit === 0) return String(Math.round(n));
  return n.toFixed(1) + COMPACT_UNITS[unit];
}
