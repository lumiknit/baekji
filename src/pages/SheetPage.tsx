import type { Component } from 'solid-js';
import {
  createEffect,
  createSignal,
  For,
  onCleanup,
  onMount,
} from 'solid-js';
import { useParams, useNavigate } from '@solidjs/router';
import * as Y from 'yjs';
import { EditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { yCollab, yUndoManagerKeymap } from 'y-codemirror.next';
import { keymap } from '@codemirror/view';
import { openSheet, closeSheet, activeProjectDoc } from '../state/workspace_v1';
import { updateSheetTags } from '../state/sheet_list';
import { buildExtensions } from '../components/editor/cm_setup';
import EditorToolOverlay from '../components/editor/EditorToolOverlay';
import { s } from '../lib/i18n';
import { isValidTag } from '../lib/tag/query';
import { tagToHsl } from '../lib/tag/color';
import type { SheetMeta } from '../lib/doc/v1';

const SheetPage: Component = () => {
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();

  let editorRef: HTMLDivElement | undefined;
  let view: EditorView | undefined;
  let undoManager: Y.UndoManager | undefined;

  const [charCount, setCharCount] = createSignal(0);
  const [sheetMeta, setSheetMeta] = createSignal<SheetMeta | null>(null);
  const [tagInput, setTagInput] = createSignal('');

  const currentTags = () => sheetMeta()?.tags ?? [];

  const syncMeta = () => {
    const pd = activeProjectDoc();
    if (!pd) return;
    const meta = pd.sheets.get(params.id);
    if (meta) setSheetMeta(meta as SheetMeta);
  };

  const applySheet = async (id: string) => {
    // 새로고침 등으로 프로젝트가 닫혀 있으면 먼저 복원
    if (!activeProjectDoc()) {
      const { restoreLastProject } = await import('../state/workspace_v1');
      await restoreLastProject();
    }
    // 이전 에디터 정리
    view?.destroy();
    undoManager?.destroy();
    view = undefined;
    undoManager = undefined;

    try {
      const doc = await openSheet(id);
      syncMeta();

      undoManager = new Y.UndoManager(doc.content);

      const baseExtensions = buildExtensions({
        placeholderText: s('editor.placeholder'),
        onChange: () => {
          setCharCount(view?.state.doc.length ?? 0);
        },
        onSave: () => {},
        getTypewriterMode: () => false,
      });

      const extensions = [
        ...baseExtensions,
        keymap.of([...yUndoManagerKeymap]),
        yCollab(doc.content, null as any, { undoManager }),
      ];

      // Y.Text 내용으로 초기 doc 설정
      const initialDoc = doc.content.toString();
      const state = EditorState.create({
        doc: initialDoc,
        extensions,
      });

      if (!editorRef) return;
      view = new EditorView({ state, parent: editorRef });
      setCharCount(initialDoc.length);
      view.focus();
    } catch (err) {
      console.error('SheetPage: failed to open sheet', err);
      navigate('/', { replace: true });
    }
  };

  onMount(() => {
    const pd = activeProjectDoc();
    const metaHandler = () => syncMeta();
    pd?.sheets.observe(metaHandler);
    onCleanup(() => pd?.sheets.unobserve(metaHandler));
  });

  // params.id가 바뀔 때마다 에디터 재초기화
  createEffect(() => {
    const id = params.id;
    if (!id) return;
    void applySheet(id);
  });

  onCleanup(() => {
    view?.destroy();
    undoManager?.destroy();
    closeSheet();
  });

  const addTag = () => {
    const tag = tagInput().trim();
    if (!isValidTag(tag)) return;
    const tags = currentTags();
    if (tags.includes(tag)) { setTagInput(''); return; }
    updateSheetTags(params.id, [...tags, tag]);
    setTagInput('');
    syncMeta();
  };

  const removeTag = (tag: string) => {
    updateSheetTags(params.id, currentTags().filter((t) => t !== tag));
    syncMeta();
  };

  const scrollToEdge = (edge: 'start' | 'end') => {
    if (!view) return;
    const pos = edge === 'start' ? 0 : view.state.doc.length;
    view.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
    view.focus();
  };

  return (
    <div class="editor-container">
      <div class="editor-tool-overlay-anchor">
        <EditorToolOverlay
          charCount={charCount}
          isDirty={() => false}
          autosaveEndTime={() => null}
          onUndo={() => { undoManager?.undo(); view?.focus(); }}
          onRedo={() => { undoManager?.redo(); view?.focus(); }}
          onSave={() => {}}
          onCopy={async () => {
            const text = view?.state.doc.toString() ?? '';
            await navigator.clipboard.writeText(text);
          }}
          onSplit={() => {}}
          onAnalysis={() => {}}
        />
      </div>

      <div
        class="editor-section-marker editor-section-marker--start"
        onClick={() => scrollToEdge('start')}
      >
        <div class="sheet-tags-bar" onClick={(e) => e.stopPropagation()}>
          <For each={currentTags()}>
            {(tag) => {
              const { h, s: sv } = tagToHsl(tag);
              return (
                <span
                  class="sl-tag sl-tag--removable"
                  style={{ background: `hsl(${h}deg ${sv}% 60% / 0.25)`, color: `hsl(${h}deg ${sv}% 35%)` }}
                  onClick={() => removeTag(tag)}
                  title="클릭하여 제거"
                >
                  {tag} ×
                </span>
              );
            }}
          </For>
          <input
            class="sheet-tag-input"
            type="text"
            placeholder="태그 추가…"
            value={tagInput()}
            onInput={(e) => setTagInput(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                addTag();
              }
            }}
          />
        </div>
      </div>

      <div ref={editorRef} class="cm-editor-wrap typo" />

      <div
        class="editor-section-marker editor-section-marker--end"
        onClick={() => scrollToEdge('end')}
      >
        <span class="editor-section-label">EOD</span>
        <hr class="separator-line flex-1" />
      </div>
    </div>
  );
};

export default SheetPage;
