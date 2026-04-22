import { createStore } from 'solid-js/store';
import { makePersisted } from '@solid-primitives/storage';
import localforage from 'localforage';

export interface MdRules {
  headings: boolean;
  lists: boolean;
  inlineStyles: boolean;
  blockquote: boolean;
  codeBlock: boolean;
  ellipsis: boolean;
  smartQuotes: boolean;
  backslashEscape: boolean;
}

export interface FontSettings {
  sans: string; // '' = system, 'BuiltinNotoSans' = builtin, other = custom
  serif: string;
  mono: string;
}

export type ThemeVariant = 'default' | 'warm' | 'cool';

export interface Settings {
  fontFamily: string;
  fonts: FontSettings;
  themeLight: ThemeVariant;
  themeDark: ThemeVariant;
  fontSize: number;
  fontWeight: number;
  fontBoldWeight: number;
  indentFirstLine: string;
  lineHeight: number;
  autosaveInterval: number; // In seconds
  previewFontSize: number;
  mdRules: MdRules;
}

const defaultSettings: Settings = {
  fontFamily: 'serif',
  fonts: { sans: '', serif: '', mono: '' },
  themeLight: 'default',
  themeDark: 'default',
  fontSize: 16,
  fontWeight: 500,
  fontBoldWeight: 900,
  indentFirstLine: '1em',
  lineHeight: 1.2,
  autosaveInterval: 3,
  previewFontSize: 13,
  mdRules: {
    headings: true,
    lists: true,
    inlineStyles: true,
    blockquote: true,
    codeBlock: true,
    ellipsis: true,
    smartQuotes: true,
    backslashEscape: true,
  },
};

const [settings, setSettings] = makePersisted(
  createStore<Settings>(defaultSettings),
  {
    name: 'baekji-settings',
    storage: localforage as any,
  },
);

function buildFontVar(name: string, fallback: string): string {
  return name ? `'${name}', ${fallback}` : fallback;
}

export function updateRootStyle() {
  const el = document.documentElement;

  // Apply theme classes
  [...el.classList]
    .filter((c) => c.startsWith('theme-'))
    .forEach((c) => el.classList.remove(c));
  el.classList.add(`theme-light-${settings.themeLight ?? 'default'}`);
  el.classList.add(`theme-dark-${settings.themeDark ?? 'default'}`);

  const root = el.style;

  const fontSans = buildFontVar(settings.fonts?.sans ?? '', 'sans-serif');
  const fontSerif = buildFontVar(settings.fonts?.serif ?? '', 'serif');
  root.setProperty('--font-sans', fontSans);
  root.setProperty('--font-serif', fontSerif);
  root.setProperty(
    '--font-mono',
    buildFontVar(settings.fonts?.mono ?? '', 'monospace'),
  );

  root.setProperty(
    '--typo-ff',
    settings.fontFamily === 'serif' ? fontSerif : fontSans,
  );
  root.setProperty('--typo-fs', `${settings.fontSize}px`);
  root.setProperty('--typo-preview-fs', `${settings.previewFontSize}px`);
  root.setProperty('--typo-lh', String(settings.lineHeight));
  root.setProperty('--typo-indent', settings.indentFirstLine || '0');
  root.setProperty('--typo-fw', String(settings.fontWeight));
  root.setProperty('--typo-fw-bold', String(settings.fontBoldWeight));

  const LIGHT_BG: Record<string, string> = {
    default: '#ffffff',
    warm: '#fdf6e3',
    cool: '#eef4fb',
  };
  const DARK_BG: Record<string, string> = {
    default: '#000000',
    warm: '#2a1e0a',
    cool: '#1e2a3a',
  };
  const lightMeta = document.querySelector<HTMLMetaElement>(
    'meta[name="theme-color"][media*="light"]',
  );
  const darkMeta = document.querySelector<HTMLMetaElement>(
    'meta[name="theme-color"][media*="dark"]',
  );
  if (lightMeta)
    lightMeta.content = LIGHT_BG[settings.themeLight ?? 'default'] ?? '#ffffff';
  if (darkMeta)
    darkMeta.content = DARK_BG[settings.themeDark ?? 'default'] ?? '#000000';
}

export { settings, setSettings };
