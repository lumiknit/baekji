import type { Component } from 'solid-js';
import { onMount, onCleanup, createEffect } from 'solid-js';
import { EditorView } from '@codemirror/view';
import { EditorState, ChangeSet } from '@codemirror/state';
import type { Extension } from '@codemirror/state';
import { undo, redo } from '@codemirror/commands';
import {
  openSheet,
  closeSheet,
  activeProjectId,
  lastProjectId,
  openProject,
} from '../../state/workspace_v3';
import { touchSheetStats } from '../../state/sheet_list';
import {
  buildExtensions,
  openSearchPanel,
  createActiveLineCompartment,
  activeLineExtension,
} from './cm_setup';
import { s } from '../../lib/i18n';
import { settings } from '../../state/settings';
import {
  appendSheetDelta,
  getSheetMeta,
  getSheetStats,
  loadSheetResult,
  replaceSheetContent,
} from '../../lib/doc/db_v3';
import toast from 'solid-toast';
import { logError } from '../../state/log';
import {
  loadSheetsForProject,
  invalidateSheetPreview,
} from '../../state/sheet_list';
import type { DeltaPayload } from '../../lib/doc/cm';

const FLUSH_INTERVAL = 3_000;
const AUTO_COMPACT_THRESHOLD = 100;

const EditorCore: Component<{
  sheetId: string;
  onCharCount: (n: number) => void;
  handle: (h: EditorCoreHandle) => void;
  onLoadError: () => void;
}> = (props) => {
  let editorRef: HTMLDivElement | undefined;
  let view: EditorView | undefined;
  let pendingCS: ChangeSet | null = null;
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let deltaCount = 0;
  let writingSeconds = 0;
  const activeLineCompartment = createActiveLineCompartment();

  async function flush() {
    if (flushTimer !== null) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    if (!pendingCS) return;
    const cs = pendingCS;
    pendingCS = null;
    try {
      await appendSheetDelta(props.sheetId, cs.toJSON() as DeltaPayload);
      writingSeconds += FLUSH_INTERVAL / 1000;
      touchSheetStats(props.sheetId, writingSeconds);
      invalidateSheetPreview();
      deltaCount++;
      if (deltaCount >= AUTO_COMPACT_THRESHOLD) {
        await saveSnapshot(true);
      }
    } catch (err) {
      // Restore cs into pendingCS so it is not lost.
      pendingCS = pendingCS ? cs.compose(pendingCS) : cs;
      logError('flush:appendSheetDelta', err);
      toast.error(
        `Failed to save changes: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async function saveSnapshot(silent = false) {
    if (flushTimer !== null) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    pendingCS = null;
    const content = view?.state.doc.toString() ?? '';
    try {
      await replaceSheetContent(props.sheetId, content);
      touchSheetStats(props.sheetId, writingSeconds);
      invalidateSheetPreview();
      deltaCount = 0;
      if (!silent) toast.success(s('editor.snapshot_saved'));
    } catch (err) {
      logError('saveSnapshot', err);
      toast.error(
        `Failed to save snapshot: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  function scheduleFlush() {
    if (flushTimer !== null) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flush();
    }, FLUSH_INTERVAL);
  }

  onMount(async () => {
    try {
      // Resolve projectId from sheetMeta, falling back to lastProjectId
      const sheetMeta = await getSheetMeta(props.sheetId);
      const projectId = sheetMeta?.projectId ?? lastProjectId();
      if (projectId && projectId !== activeProjectId()) {
        await openProject(projectId);
        await loadSheetsForProject(projectId);
      }

      const [
        { content: initialContent, truncated, deltaCount: initialDeltaCount },
        initialStats,
      ] = await Promise.all([
        loadSheetResult(props.sheetId),
        getSheetStats(props.sheetId),
      ]);
      deltaCount = initialDeltaCount;
      writingSeconds = initialStats?.writingSeconds ?? 0;
      openSheet(props.sheetId);
      if (truncated) {
        toast.error(s('editor.deltaCorrupt'));
      }

      const extensions: Extension[] = [
        ...buildExtensions({
          placeholderText: s('editor.placeholder'),
          onChange: (cs: ChangeSet) => {
            props.onCharCount(view?.state.doc.length ?? 0);
            pendingCS = pendingCS ? pendingCS.compose(cs) : cs;
            scheduleFlush();
          },
          onSave: () => {
            saveSnapshot();
          },
          getTypewriterMode: () => settings.typewriterMode ?? false,
          activeLineCompartment,
          initialHighlightActiveLine: settings.focusMode ?? false,
        }),
      ];

      const state = EditorState.create({ doc: initialContent, extensions });

      if (!editorRef) return;
      view = new EditorView({ state, parent: editorRef });
      props.onCharCount(initialContent.length);
      view.focus();

      props.handle({
        undo: () => {
          if (view) {
            undo(view);
            view.focus();
          }
        },
        redo: () => {
          if (view) {
            redo(view);
            view.focus();
          }
        },
        save: saveSnapshot,
        copy: async () => {
          const text = view?.state.doc.toString() ?? '';
          await navigator.clipboard.writeText(text);
        },
        scrollToEdge: (edge) => {
          if (!view) return;
          const pos = edge === 'start' ? 0 : view.state.doc.length;
          view.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
          view.focus();
        },
        getSplitContent: () => {
          if (!view) return null;
          const pos = view.state.selection.main.head;
          const text = view.state.doc.toString();
          return { head: text.slice(0, pos), tail: text.slice(pos) };
        },
        openSearch: () => {
          if (view) openSearchPanel(view);
        },
        getWritingSeconds: () => writingSeconds,
      });
    } catch (err) {
      console.error('EditorCore: failed to open sheet', err);
      props.onLoadError();
    }
  });

  createEffect(() => {
    if (!view) return;
    view.dispatch({
      effects: activeLineCompartment.reconfigure(activeLineExtension()),
    });
  });

  onCleanup(async () => {
    view?.destroy();
    await flush();
    closeSheet();
  });

  return <div ref={(el) => (editorRef = el)} class="cm-editor-wrap typo" />;
};

export type EditorCoreHandle = {
  undo: () => void;
  redo: () => void;
  save: () => Promise<void>;
  copy: () => Promise<void>;
  scrollToEdge: (edge: 'start' | 'end') => void;
  getSplitContent: () => { head: string; tail: string } | null;
  openSearch: () => void;
  getWritingSeconds: () => number;
};

export default EditorCore;
