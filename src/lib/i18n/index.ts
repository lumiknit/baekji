import { createSignal } from 'solid-js';
import { logError } from '../../state/log.ts';

type FileData = { [k: string]: string | FileData };

/**
 * ParsedDict holds an array of split strings for each key.
 * Example: "home.welcome": ["Welcome, ", " name ", "!"]
 * Elements at odd indices (1, 3, ...) are keys for substitution.
 */
type ParsedDict = Record<string, string[]>;

const [dict, setDict] = createSignal<ParsedDict>({});
const [locale, setLocale] = createSignal<string>('en');

/**
 * Recursively flattens nested dictionary objects and parses strings into segments.
 */
function flattenAndParse(obj: FileData, prefix: string, result: ParsedDict) {
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') {
      // Split by {{ or }}
      // "a {{b}} c" -> ["a ", "b", " c"]
      const splitted = value.split(/{{|}}/);
      if (splitted.length % 2 === 0) {
        splitted.push(''); // Push empty string.
      }
      result[fullKey] = splitted;
    } else if (typeof value === 'object' && value !== null) {
      flattenAndParse(value, fullKey, result);
    }
  }
}

/**
 * i18n translation function s
 * @param key Translation key (e.g., 'common.ok')
 * @param params Template parameters (e.g., { name: 'Alice' })
 */
export function s(
  key: string,
  params?: Record<string, string | number>,
): string {
  const parts = dict()[key];
  if (!parts) return key;

  // Return joined parts if no parameters provided
  if (!params) return parts.join('');

  let result = parts[0];
  for (let i = 1; i < parts.length; i += 2) {
    // Odd index: placeholder
    const pKey = parts[i].trim();
    const val = params[pKey];
    result += val !== undefined ? String(val) : `{{${parts[i]}}}`;

    // Even index, just append
    result += parts[i + 1];
  }
  return result;
}

/**
 * Detect browser language and load the appropriate translation file.
 */
export async function initI18n() {
  const browserLang = navigator.language.split('-')[0];
  const targetLocale = ['ko', 'en'].includes(browserLang) ? browserLang : 'en';

  setLocale(targetLocale);

  const locales: Record<string, () => Promise<{ default: FileData }>> = {
    ko: () => import('./ko.json'),
    en: () => import('./en.json'),
  };

  try {
    const data = await (locales[targetLocale] ?? locales.en)();
    const newDict: ParsedDict = {};
    flattenAndParse(data.default, '', newDict);
    setDict(newDict);
    document.documentElement.lang = targetLocale;
  } catch (err) {
    logError('i18n:init', err);
    const fallback = await import('./en.json');
    const fallbackDict: ParsedDict = {};
    flattenAndParse(fallback.default, '', fallbackDict);
    setDict(fallbackDict);
    document.documentElement.lang = 'en';
  }
}

export { locale };
