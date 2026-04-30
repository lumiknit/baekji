import { ChangeSet, EditorState, type Extension } from '@codemirror/state';
import { EditorView, keymap, placeholder } from '@codemirror/view';
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';
import { livePreviewPlugin, livePreviewTheme } from './live_preview';

export function buildExtensions(opts: {
  placeholderText: string;
  onChange: (changes: ChangeSet) => void;
  onSave: () => void;
  getTypewriterMode: () => boolean;
}): Extension[] {
  const { placeholderText, onChange, onSave, getTypewriterMode } = opts;

  return [
    history(),
    keymap.of([
      ...defaultKeymap,
      ...historyKeymap,
      indentWithTab,
      {
        key: 'Mod-s',
        run() {
          onSave();
          return true;
        },
      },
    ]),
    markdown({ extensions: [GFM] }),
    livePreviewPlugin,
    livePreviewTheme,
    placeholder(placeholderText),
    EditorView.lineWrapping,
    EditorView.updateListener.of(
      (() => {
        let rafId = 0;
        return (update) => {
          if (!update.docChanged) return;
          onChange(update.changes);
          if (!getTypewriterMode()) return;
          // Cancel any pending rAF so rapid keystrokes only scroll once.
          if (rafId) cancelAnimationFrame(rafId);
          const { from } = update.state.selection.main;
          rafId = requestAnimationFrame(() => {
            rafId = 0;
            const coords = update.view.coordsAtPos(from);
            if (!coords) return;
            const diff = coords.top - window.innerHeight / 2;
            if (Math.abs(diff) > 10)
              window.scrollBy({ top: diff, behavior: 'smooth' });
          });
        };
      })(),
    ),
  ];
}

export function createEditorState(
  doc: string,
  selection: { anchor: number; head: number },
  extensions: Extension[],
): EditorState {
  const safeAnchor = Math.min(selection.anchor, doc.length);
  const safeHead = Math.min(selection.head, doc.length);
  return EditorState.create({
    doc,
    selection: { anchor: safeAnchor, head: safeHead },
    extensions,
  });
}
