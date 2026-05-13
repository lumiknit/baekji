import type { Component } from 'solid-js';
import { onMount, onCleanup } from 'solid-js';
import * as Y from 'yjs';
import { EditorView } from '@codemirror/view';
import { EditorState, type Extension } from '@codemirror/state';
import { yCollab, yUndoManagerKeymap } from 'y-codemirror.next';
import { keymap } from '@codemirror/view';
import {
  openSheet,
  closeSheet,
  activeProjectDoc,
  lastProjectId,
  openProject,
} from '../../state/workspace_v1';
import { touchSheetUpdatedAt } from '../../state/sheet_list';
import { buildExtensions } from './cm_setup';
import { s } from '../../lib/i18n';

export type EditorCoreHandle = {
  undo: () => void;
  redo: () => void;
  copy: () => Promise<void>;
  scrollToEdge: (edge: 'start' | 'end') => void;
  getSplitContent: () => { head: string; tail: string } | null;
};

interface Props {
  sheetId: string;
  onCharCount: (n: number) => void;
  handle: (h: EditorCoreHandle) => void;
  onLoadError: () => void;
}

const EditorCore: Component<Props> = (props) => {
  let editorRef: HTMLDivElement | undefined;
  let view: EditorView | undefined;
  let undoManager: Y.UndoManager | undefined;
  let touchTimer: ReturnType<typeof setTimeout> | undefined;

  onMount(async () => {
    if (!activeProjectDoc()) {
      const id = lastProjectId();
      if (id) await openProject(id);
    }

    try {
      const doc = await openSheet(props.sheetId);

      undoManager = new Y.UndoManager(doc.content);

      const extensions: Extension[] = [
        ...buildExtensions({
          placeholderText: s('editor.placeholder'),
          onChange: () => {
            props.onCharCount(view?.state.doc.length ?? 0);
            clearTimeout(touchTimer);
            touchTimer = setTimeout(
              () => touchSheetUpdatedAt(props.sheetId),
              3000,
            );
          },
          onSave: () => {},
          getTypewriterMode: () => false,
        }),
        keymap.of([...yUndoManagerKeymap]),
        yCollab(doc.content, null as never, { undoManager }),
      ];

      const initialDoc = doc.content.toString();
      const state = EditorState.create({ doc: initialDoc, extensions });

      if (!editorRef) return;
      view = new EditorView({ state, parent: editorRef });
      props.onCharCount(initialDoc.length);
      view.focus();

      props.handle({
        undo: () => {
          undoManager?.undo();
          view?.focus();
        },
        redo: () => {
          undoManager?.redo();
          view?.focus();
        },
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
          const selection = view.state.selection.main;
          const pos = selection.head;
          const text = view.state.doc.toString();
          return {
            head: text.slice(0, pos),
            tail: text.slice(pos),
          };
        },
      });
    } catch (err) {
      console.error('EditorCore: failed to open sheet', err);
      props.onLoadError();
    }
  });

  onCleanup(() => {
    clearTimeout(touchTimer);
    view?.destroy();
    undoManager?.destroy();
    closeSheet();
  });

  return <div ref={(el) => (editorRef = el)} class="cm-editor-wrap typo" />;
};

export default EditorCore;
