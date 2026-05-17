import type { Component } from 'solid-js';
import { createSignal, createEffect, on, onCleanup, Show, For } from 'solid-js';
import { useParams, useNavigate } from '@solidjs/router';
import { activeProjectDoc } from '../state/workspace_v1';
import { updateSheetTags, splitSheet } from '../state/sheet_list';
import { showConfirm } from '../state/modal';
import { s } from '../lib/i18n';
import EditorCore, {
  type EditorCoreHandle,
} from '../components/editor/EditorCore';
import EditorToolOverlay from '../components/editor/EditorToolOverlay';
import TagEditor from '../components/editor/TagEditor';
import type { SheetMeta } from '../lib/doc/v1';
import { tagToHsl } from '../lib/tag/color';
import { TbOutlineEdit } from 'solid-icons/tb';

const SheetPage: Component = () => {
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [charCount, setCharCount] = createSignal(0);
  const [sheetMeta, setSheetMeta] = createSignal<SheetMeta | null>(null);
  const [tagEditing, setTagEditing] = createSignal(false);
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

  createEffect(
    on(
      () => params.id,
      (id) => {
        document
          .getElementById(`sheet-item-${id}`)
          ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      },
      { defer: true },
    ),
  );

  createEffect(() => {
    const pd = activeProjectDoc();
    if (!pd) return;
    const metaHandler = () => syncMeta();
    pd.sheets.observe(metaHandler);
    onCleanup(() => pd.sheets.unobserve(metaHandler));
  });

  const handleUpdateTags = (tags: string[]) => {
    updateSheetTags(params.id, tags);
    syncMeta();
  };

  const handleAnalysis = () => {
    const pjId = activeProjectDoc()?.id;
    if (pjId) {
      navigate(`/project/${pjId}/analysis?sheetId=${params.id}`);
    }
  };

  const handleExport = () => {
    const pjId = activeProjectDoc()?.id;
    if (pjId) {
      navigate(`/project/${pjId}/export?sheetId=${params.id}`);
    }
  };

  const handleSplit = async () => {
    const content = handle?.getSplitContent();
    if (!content) return;

    const ok = await showConfirm(
      s('editor.split_title'),
      s('editor.split_confirm'),
    );
    if (!ok) return;

    const nextId = await splitSheet(params.id, content.head, content.tail);
    if (nextId) {
      navigate(`/sheets/${nextId}`);
    }
  };

  return (
    <div class="editor-container">
      <div class="editor-tool-overlay-anchor">
        <EditorToolOverlay
          charCount={charCount}
          onUndo={() => handle?.undo()}
          onRedo={() => handle?.redo()}
          onCopy={() => handle?.copy() ?? Promise.resolve()}
          onExport={handleExport}
          onSplit={handleSplit}
          onAnalysis={handleAnalysis}
          onSearch={() => handle?.openSearch()}
        />
      </div>

      <div
        class="editor-section-marker editor-section-marker--start"
        onClick={() => handle?.scrollToEdge('start')}
      >
        <Show
          when={tagEditing()}
          fallback={
            <div
              class="tag-editor-v2 tag-list"
              onClick={(e) => e.stopPropagation()}
            >
              <For each={currentTags()}>
                {(tag) => {
                  const { h, s: sat } = tagToHsl(tag);
                  return (
                    <span
                      class="tag"
                      style={{
                        background: `hsl(${h}deg ${sat}% 60% / 0.25)`,
                        color: `hsl(${h}deg ${sat}% var(--color-l))`,
                      }}
                    >
                      {tag}
                    </span>
                  );
                }}
              </For>
              <button
                class="tag tag--edit"
                onClick={() => setTagEditing(true)}
                title={s('common.edit')}
              >
                <TbOutlineEdit />
              </button>
            </div>
          }
        >
          <TagEditor
            tags={currentTags}
            onUpdate={handleUpdateTags}
            onSave={(tags) => {
              handleUpdateTags(tags);
              setTagEditing(false);
            }}
            onCancel={() => setTagEditing(false)}
          />
        </Show>
        <div class="editor-sod-line">
          <span class="editor-section-label">SOD</span>
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
      </div>
    </div>
  );
};

export default SheetPage;
