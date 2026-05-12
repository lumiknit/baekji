import type { Component } from 'solid-js';
import {
  createSignal,
  createEffect,
  For,
  onMount,
  onCleanup,
  Show,
} from 'solid-js';
import { useParams, useNavigate } from '@solidjs/router';
import { activeProjectDoc } from '../state/workspace_v1';
import { updateSheetTags } from '../state/sheet_list';
import EditorCore, {
  type EditorCoreHandle,
} from '../components/editor/EditorCore';
import EditorToolOverlay from '../components/editor/EditorToolOverlay';
import { isValidTag } from '../lib/tag/query';
import { tagToHsl } from '../lib/tag/color';
import { s } from '../lib/i18n';
import toast from 'solid-toast';
import type { SheetMeta } from '../lib/doc/v1';

const SheetPage: Component = () => {
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [charCount, setCharCount] = createSignal(0);
  const [sheetMeta, setSheetMeta] = createSignal<SheetMeta | null>(null);
  const [tagInput, setTagInput] = createSignal('');
  let handle: EditorCoreHandle | undefined;

  const currentTags = () => sheetMeta()?.tags ?? [];

  const syncMeta = () => {
    const pd = activeProjectDoc();
    if (!pd) return;
    const meta = pd.sheets.get(params.id);
    if (meta) setSheetMeta(meta as SheetMeta);
  };

  createEffect(() => {
    void params.id;
    syncMeta();
  });

  onMount(() => {
    const pd = activeProjectDoc();
    const metaHandler = () => syncMeta();
    pd?.sheets.observe(metaHandler);
    onCleanup(() => pd?.sheets.unobserve(metaHandler));
  });

  const addTag = () => {
    const tag = tagInput().trim().replace(/\s+/g, '_');
    if (!isValidTag(tag)) {
      toast.error(s('sheet.tag_invalid'));
      return;
    }
    const tags = currentTags();
    if (tags.includes(tag)) {
      setTagInput('');
      return;
    }
    updateSheetTags(params.id, [...tags, tag]);
    setTagInput('');
    syncMeta();
  };

  const removeTag = (tag: string) => {
    updateSheetTags(
      params.id,
      currentTags().filter((t) => t !== tag),
    );
    syncMeta();
  };

  return (
    <div class="editor-container">
      <div class="editor-tool-overlay-anchor">
        <EditorToolOverlay
          charCount={charCount}
          onUndo={() => handle?.undo()}
          onRedo={() => handle?.redo()}
          onSave={() => {}}
          onCopy={() => handle?.copy() ?? Promise.resolve()}
          onSplit={() => {}}
          onAnalysis={() => {}}
        />
      </div>

      <div
        class="editor-section-marker editor-section-marker--start"
        onClick={() => handle?.scrollToEdge('start')}
      >
        <div class="sheet-tag-editor" onClick={(e) => e.stopPropagation()}>
          <Show when={currentTags().length > 0}>
            <div class="sheet-tag-list">
              <For each={currentTags()}>
                {(tag) => {
                  const { h, s: sat } = tagToHsl(tag);
                  return (
                    <span
                      class="tag tag--removable"
                      style={{
                        background: `hsl(${h}deg ${sat}% 60% / 0.25)`,
                        color: `hsl(${h}deg ${sat}% var(--color-l))`,
                      }}
                      onClick={() => removeTag(tag)}
                      title={s('sheet.remove_tag')}
                    >
                      {tag} ×
                    </span>
                  );
                }}
              </For>
            </div>
          </Show>
          <div style={{ display: 'flex', gap: '4px', 'align-items': 'center' }}>
            <input
              class="sheet-tag-input ghost"
              type="text"
              placeholder={s('editor.add_tag')}
              value={tagInput()}
              onInput={(e) => setTagInput(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',') {
                  e.preventDefault();
                  addTag();
                }
              }}
            />
            <Show when={tagInput()}>
              <button class="btn-sm" onClick={addTag}>
                +
              </button>
            </Show>
          </div>
        </div>
        <div class="editor-sod-line">
          <span class="editor-section-label">SOD</span>
          <hr class="separator-line flex-1" />
        </div>
      </div>

      <Show when={params.id} keyed>
        {(id) => (
          <EditorCore
            sheetId={id}
            onCharCount={setCharCount}
            handle={(h) => {
              handle = h;
            }}
            onLoadError={() => navigate('/', { replace: true })}
          />
        )}
      </Show>

      <div
        class="editor-section-marker editor-section-marker--end"
        onClick={() => handle?.scrollToEdge('end')}
      >
        <span class="editor-section-label">EOD</span>
        <hr class="separator-line flex-1" />
      </div>
    </div>
  );
};

export default SheetPage;
