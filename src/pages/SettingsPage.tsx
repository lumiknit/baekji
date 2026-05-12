import type { Component, JSX } from 'solid-js';
import { createMemo, createSignal, For, Show } from 'solid-js';
import { A } from '@solidjs/router';
import { settings, setSettings } from '../state/settings';
import type { FontSettings } from '../state/settings';
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

const CUSTOM = '__custom__';

const FontPicker: Component<{
  label: string;
  fontKey: keyof FontSettings;
  presets: { value: string; label: string }[];
}> = (props) => {
  const val = () => settings.fonts?.[props.fontKey] ?? '';
  const presetValues = createMemo(() => props.presets.map((p) => p.value));
  const isPreset = () => presetValues().includes(val());

  // Track whether user explicitly switched to custom mode
  const [customMode, setCustomMode] = createSignal(!isPreset());

  const showInput = () => customMode() || !isPreset();
  const selectVal = () => (showInput() ? CUSTOM : val());

  const onSelect = (v: string) => {
    if (v === CUSTOM) {
      setCustomMode(true);
    } else {
      setCustomMode(false);
      setSettings('fonts', props.fontKey, v);
    }
  };

  return (
    <label class="flex justify-between items-center gap-8">
      {props.label}
      <div
        class="flex gap-4 items-center"
        style={{
          flex: '1',
          'max-width': '240px',
          'justify-content': 'flex-end',
        }}
      >
        <Show when={showInput()}>
          <input
            type="text"
            placeholder={s('settings.font_custom_placeholder')}
            value={isPreset() ? '' : val()}
            onInput={(e) =>
              setSettings('fonts', props.fontKey, e.currentTarget.value)
            }
            style={{ flex: '1', 'min-width': '0' }}
          />
        </Show>
        <select
          value={selectVal()}
          onChange={(e) => onSelect(e.currentTarget.value)}
        >
          <For each={props.presets}>
            {(p) => <option value={p.value}>{p.label}</option>}
          </For>
          <option value={CUSTOM}>{s('settings.font_custom')}</option>
        </select>
      </div>
    </label>
  );
};

const NumberInputWithSlider: Component<{
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (val: number) => void;
}> = (props) => {
  return (
    <div class="flex flex-column gap-4">
      <SettingRow label={props.label}>
        <input
          type="number"
          step={props.step}
          value={props.value}
          min={props.min}
          max={props.max}
          onChange={(e) => props.onChange(parseFloat(e.currentTarget.value))}
          style={{ width: '80px' }}
        />
      </SettingRow>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onInput={(e) => props.onChange(parseFloat(e.currentTarget.value))}
        class="w-full"
      />
    </div>
  );
};

const SettingsPage: Component = () => {
  const handleFullReset = async () => {
    const confirmed = await showConfirm(
      s('settings.reset_title'),
      s('settings.reset_confirm'),
    );
    if (confirmed) await fullReset();
  };

  return (
    <div class="p-16 mt-32 max-w-720 m-auto">
      <div class="flex items-center justify-between">
        <h1 class="m-0">{s('settings.title')}</h1>
        <A href="/about" class="btn-skeleton">
          About
        </A>
      </div>

      <div class="mt-32 flex flex-column gap-16">
        <section>
          <h3>{s('settings.theme_title')}</h3>
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
          <h3>{s('settings.font_settings')}</h3>
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

            <FontPicker
              label={s('settings.font_sans')}
              fontKey="sans"
              presets={[
                { value: '', label: s('settings.font_system') },
                { value: 'BuiltinSans', label: 'Noto Sans' },
              ]}
            />
            <FontPicker
              label={s('settings.font_serif')}
              fontKey="serif"
              presets={[
                { value: '', label: s('settings.font_system') },
                { value: 'BuiltinSerif', label: 'Noto Serif' },
                { value: 'RIDIBatang', label: 'RIDI Batang' },
                { value: 'Daehan', label: '대한체' },
              ]}
            />
            <FontPicker
              label={s('settings.font_mono')}
              fontKey="mono"
              presets={[{ value: '', label: s('settings.font_system') }]}
            />

            <NumberInputWithSlider
              label={s('settings.font_size')}
              value={settings.fontSize}
              min={6}
              max={32}
              step={1}
              onChange={(v) => setSettings('fontSize', v)}
            />

            <NumberInputWithSlider
              label={s('settings.preview_font_size')}
              value={settings.previewFontSize}
              min={6}
              max={32}
              step={1}
              onChange={(v) => setSettings('previewFontSize', v)}
            />

            <NumberInputWithSlider
              label={s('settings.font_weight')}
              value={settings.fontWeight}
              min={100}
              max={900}
              step={10}
              onChange={(v) => setSettings('fontWeight', v)}
            />

            <NumberInputWithSlider
              label={s('settings.font_bold_weight')}
              value={settings.fontBoldWeight}
              min={100}
              max={900}
              step={10}
              onChange={(v) => setSettings('fontBoldWeight', v)}
            />
          </div>
        </section>

        <section>
          <h3>{s('settings.typography')}</h3>
          <div class="mt-32 flex flex-column gap-8">
            <NumberInputWithSlider
              label={s('settings.line_height')}
              value={settings.lineHeight}
              min={0.8}
              max={3.0}
              step={0.1}
              onChange={(v) => setSettings('lineHeight', v)}
            />
            <NumberInputWithSlider
              label={s('settings.indent_first_line')}
              value={settings.indentFirstLine}
              min={0}
              max={5}
              step={0.5}
              onChange={(v) => setSettings('indentFirstLine', v)}
            />
            <NumberInputWithSlider
              label={s('settings.paragraph_spacing')}
              value={settings.paragraphSpacing}
              min={0}
              max={3}
              step={0.1}
              onChange={(v) => setSettings('paragraphSpacing', v)}
            />
          </div>
        </section>

        <section>
          <h3>{s('settings.editor_settings')}</h3>
          <div class="mt-32 flex flex-column gap-8">
            <NumberInputWithSlider
              label={s('settings.autosave_interval')}
              value={settings.autosaveInterval}
              min={0.5}
              max={10}
              step={0.25}
              onChange={(v) => setSettings('autosaveInterval', v)}
            />
            <SettingRow label={s('settings.typewriter_mode')}>
              <input
                type="checkbox"
                checked={settings.typewriterMode}
                onChange={(e) =>
                  setSettings('typewriterMode', e.currentTarget.checked)
                }
              />
            </SettingRow>
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
          <div class="mt-32 opacity-50 text-center">
            <A href="/logs" class="btn-skeleton">
              View System Logs
            </A>
          </div>
        </section>
      </div>
    </div>
  );
};

export default SettingsPage;
