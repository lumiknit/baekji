import type { Component, JSX } from 'solid-js';
import { For } from 'solid-js';
import { A } from '@solidjs/router';
import { settings, setSettings } from '../state/settings';
import type { MdRules } from '../state/settings';
import ThemePreview from '../components/ThemePreview';
import { s } from '../lib/i18n';
import { showConfirm } from '../state/modal';
import { fullReset } from '../lib/doc/db';

const SettingRow: Component<{ label: string; children: JSX.Element }> = (
  props,
) => (
  <label class="flex justify-between items-center">
    {props.label}
    {props.children}
  </label>
);

const SettingsPage: Component = () => {
  const handleFullReset = async () => {
    const confirmed = await showConfirm(
      s('settings.reset_title'),
      s('settings.reset_confirm'),
    );
    if (confirmed) await fullReset();
  };

  return (
    <div class="p-16 mt-32 max-w-800 m-auto">
      <div class="flex items-center justify-between">
        <h1 class="m-0">{s('settings.title')}</h1>
        <A href="/about" class="btn-skeleton">
          About
        </A>
      </div>

      <div class="mt-32 flex flex-column gap-16">
        <section>
          <h3>Theme</h3>
          <div class="mt-32 flex flex-column gap-16">
            <For
              each={
                [
                  ['themeLight', s('settings.theme_light'), 'light'],
                  ['themeDark', s('settings.theme_dark'), 'dark'],
                ] as [keyof typeof settings, string, string][]
              }
            >
              {([key, label, side]) => (
                <div class="flex flex-column gap-8">
                  <span style={{ 'font-size': 'var(--fs-sm)', opacity: '0.7' }}>
                    {label}
                  </span>
                  <div class="flex gap-8">
                    <For each={['default', 'warm', 'cool'] as const}>
                      {(variant) => (
                        <ThemePreview
                          label={s(`settings.theme_${variant}`)}
                          themeClass={`theme-${side}-${variant}`}
                          active={
                            ((settings[key] as string) ?? 'default') === variant
                          }
                          onClick={() => setSettings(key as any, variant)}
                        />
                      )}
                    </For>
                  </div>
                </div>
              )}
            </For>
          </div>
        </section>

        <section>
          <h3>{s('settings.typography')}</h3>
          <div class="mt-32 flex flex-column gap-8">
            <SettingRow label={s('settings.font_family')}>
              <select
                value={settings.fontFamily}
                onChange={(e) =>
                  setSettings('fontFamily', e.currentTarget.value)
                }
              >
                <option value="serif">{s('settings.serif')}</option>
                <option value="sans-serif">{s('settings.sans_serif')}</option>
              </select>
            </SettingRow>

            <For
              each={[
                ['sans', s('settings.font_sans'), 'BuiltinSans'] as const,
                ['serif', s('settings.font_serif'), 'BuiltinSerif'] as const,
                ['mono', s('settings.font_mono'), 'monospace'] as const,
              ]}
            >
              {([key, label, notoName]) => {
                const val = () => settings.fonts?.[key] ?? '';
                const isNoto = () => val() === notoName;
                const toggleNoto = () => {
                  setSettings('fonts', key, isNoto() ? '' : notoName);
                };
                return (
                  <div class="flex flex-column gap-4">
                    <label class="flex justify-between items-center">
                      {label}
                      <input
                        type="text"
                        placeholder={
                          isNoto()
                            ? notoName
                            : s('settings.font_custom_placeholder')
                        }
                        value={isNoto() ? '' : val()}
                        disabled={isNoto()}
                        onInput={(e) =>
                          setSettings('fonts', key, e.currentTarget.value)
                        }
                      />
                    </label>
                    <label
                      class="flex justify-end items-center gap-4"
                      style={{ 'font-size': 'var(--fs-sm)' }}
                    >
                      <input
                        type="checkbox"
                        checked={isNoto()}
                        onChange={toggleNoto}
                      />
                      {s('settings.font_use_noto')}
                    </label>
                  </div>
                );
              }}
            </For>

            <p
              style={{ margin: 0, 'font-size': 'var(--fs-sm)', opacity: '0.6' }}
            >
              ⚠️ {s('settings.font_noto_warning')}
            </p>

            <SettingRow label={s('settings.font_size')}>
              <input
                type="number"
                value={settings.fontSize}
                min="6"
                max="24"
                onInput={(e) =>
                  setSettings('fontSize', parseInt(e.currentTarget.value))
                }
                style={{ width: '60px' }}
              />
            </SettingRow>
            <input
              type="range"
              min="6"
              max="24"
              step="1"
              value={settings.fontSize}
              onInput={(e) =>
                setSettings('fontSize', parseInt(e.currentTarget.value))
              }
              class="w-full"
            />

            <SettingRow label={s('settings.preview_font_size')}>
              <input
                type="number"
                value={settings.previewFontSize}
                min="6"
                max="24"
                onInput={(e) =>
                  setSettings(
                    'previewFontSize',
                    parseInt(e.currentTarget.value),
                  )
                }
                style={{ width: '60px' }}
              />
            </SettingRow>
            <input
              type="range"
              min="6"
              max="24"
              step="1"
              value={settings.previewFontSize}
              onInput={(e) =>
                setSettings('previewFontSize', parseInt(e.currentTarget.value))
              }
              class="w-full"
            />

            <SettingRow label={s('settings.line_height')}>
              <input
                type="number"
                step="0.1"
                value={settings.lineHeight}
                min="0.8"
                max="2.5"
                onInput={(e) =>
                  setSettings('lineHeight', parseFloat(e.currentTarget.value))
                }
                style={{ width: '60px' }}
              />
            </SettingRow>
            <input
              type="range"
              min="0.8"
              max="2.5"
              step="0.1"
              value={settings.lineHeight}
              onInput={(e) =>
                setSettings('lineHeight', parseFloat(e.currentTarget.value))
              }
              class="w-full"
            />
          </div>
        </section>

        <section>
          <h3>{s('settings.paragraphs')}</h3>
          <div class="mt-32 flex flex-column gap-8">
            <SettingRow label={s('settings.indent_first_line')}>
              <input
                type="text"
                value={settings.indentFirstLine}
                onInput={(e) =>
                  setSettings('indentFirstLine', e.currentTarget.value)
                }
                style={{ width: '60px' }}
              />
            </SettingRow>

            <SettingRow label={s('settings.autosave_interval')}>
              <input
                type="number"
                min="1"
                value={settings.autosaveInterval}
                onInput={(e) =>
                  setSettings(
                    'autosaveInterval',
                    Math.max(1, parseInt(e.currentTarget.value) || 1),
                  )
                }
                style={{ width: '60px' }}
              />
            </SettingRow>
          </div>
        </section>
        <section>
          <h3>{s('settings.md_rules')}</h3>
          <div class="mt-32 flex flex-column gap-8">
            <For
              each={
                [
                  ['headings', s('settings.md_headings')],
                  ['lists', s('settings.md_lists')],
                  ['inlineStyles', s('settings.md_inline_styles')],
                  ['blockquote', s('settings.md_blockquote')],
                  ['codeBlock', s('settings.md_code_block')],
                  ['ellipsis', s('settings.md_ellipsis')],
                  ['smartQuotes', s('settings.md_smart_quotes')],
                  ['backslashEscape', s('settings.md_backslash_escape')],
                ] as [keyof MdRules, string][]
              }
            >
              {([key, label]) => (
                <label class="flex justify-between items-center">
                  {label}
                  <input
                    type="checkbox"
                    checked={settings.mdRules?.[key] ?? true}
                    onChange={(e) =>
                      setSettings('mdRules', key, e.currentTarget.checked)
                    }
                  />
                </label>
              )}
            </For>
          </div>
        </section>

        <section class="mt-32">
          <hr class="separator-line" />
          <div class="danger-zone">
            <p class="danger-zone-title">Danger Zone</p>
            <p class="danger-zone-desc">{s('settings.reset_description')}</p>
            <div>
              <button class="btn-danger-solid" onClick={handleFullReset}>
                {s('settings.reset_button')}
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default SettingsPage;
