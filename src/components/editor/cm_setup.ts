import {
  Compartment,
  ChangeSet,
  EditorState,
  type Extension,
} from '@codemirror/state';
import {
  EditorView,
  keymap,
  placeholder,
  highlightActiveLine,
} from '@codemirror/view';
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';
import { search, openSearchPanel, searchKeymap } from '@codemirror/search';
import { livePreviewPlugin, livePreviewTheme } from './live_preview.ts';

export { openSearchPanel };

export function createActiveLineCompartment() {
  return new Compartment();
}

export function activeLineExtension(): Extension {
  // highlightActiveLine is always on so .cm-activeLine is always present for marker CSS.
  // The enabled flag is kept for API compatibility but currently unused.
  return highlightActiveLine();
}

export function buildExtensions(opts: {
  placeholderText: string;
  onChange: (changes: ChangeSet) => void;
  onSave: () => void;
  getTypewriterMode: () => boolean;
  activeLineCompartment: Compartment;
  initialHighlightActiveLine: boolean;
}): Extension[] {
  const {
    placeholderText,
    onChange,
    onSave,
    getTypewriterMode,
    activeLineCompartment,
  } = opts;

  return [
    history(),
    keymap.of([
      ...defaultKeymap,
      ...historyKeymap,
      ...searchKeymap,
      indentWithTab,
      {
        key: 'Mod-s',
        run() {
          onSave();
          return true;
        },
      },
    ]),
    search({ top: true }),
    activeLineCompartment.of(activeLineExtension()),
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
          if (!getTypewriterMode() || update.view.composing) return;
          // Cancel any pending rAF so rapid keystrokes only scroll once.
          if (rafId) cancelAnimationFrame(rafId);
          const { from } = update.state.selection.main;
          rafId = requestAnimationFrame(() => {
            rafId = 0;
            const coords = update.view.coordsAtPos(from);
            if (!coords) return;
            const diff = coords.top - globalThis.innerHeight / 2;
            if (Math.abs(diff) > 16) {
              update.view.dispatch({
                effects: EditorView.scrollIntoView(from, { y: 'center' }),
              });
            }
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
