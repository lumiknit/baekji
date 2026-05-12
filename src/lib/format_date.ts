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
