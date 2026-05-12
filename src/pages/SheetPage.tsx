import type { Component } from 'solid-js';
import {
  createSignal,
  createEffect,
  onMount,
  onCleanup,
  Show,
} from 'solid-js';
import { useParams, useNavigate } from '@solidjs/router';
import { activeProjectDoc, activeProjectId } from '../state/workspace_v1';
import { updateSheetTags } from '../state/sheet_list';
import EditorCore, {
  type EditorCoreHandle,
} from '../components/editor/EditorCore';
import EditorToolOverlay from '../components/editor/EditorToolOverlay';
import TagEditor from '../components/editor/TagEditor';
import type { SheetMeta } from '../lib/doc/v1';

const SheetPage: Component = () => {
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [charCount, setCharCount] = createSignal(0);
  const [sheetMeta, setSheetMeta] = createSignal<SheetMeta | null>(null);
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

  const handleUpdateTags = (tags: string[]) => {
    updateSheetTags(params.id, tags);
    syncMeta();
  };

  const handleAnalysis = () => {
    const pjId = activeProjectId();
    if (pjId) {
      navigate(`/project/${pjId}/analysis?sheetId=${params.id}`);
    }
  };

  const handleExport = () => {
    const pjId = activeProjectId();
    if (pjId) {
      navigate(`/project/${pjId}/export?sheetId=${params.id}`);
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
          onSplit={() => {}}
          onAnalysis={handleAnalysis}
        />
      </div>

      <div
        class="editor-section-marker editor-section-marker--start"
        onClick={() => handle?.scrollToEdge('start')}
      >
        <TagEditor tags={currentTags} onUpdate={handleUpdateTags} />
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
