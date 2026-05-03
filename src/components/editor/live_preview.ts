import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from '@codemirror/view';
import { RangeSetBuilder, type SelectionRange } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';

// ─── Widgets ──────────────────────────────────────────────────

class HrWidget extends WidgetType {
  toDOM() {
    const el = document.createElement('div');
    el.className = 'cm-md-hr-widget';
    return el;
  }
  eq() {
    return true;
  }
  ignoreEvent() {
    return false;
  }
}
const hrWidget = new HrWidget();

// ─── Helpers ──────────────────────────────────────────────────

const INLINE_FORMAT = new Set([
  'StrongEmphasis',
  'Emphasis',
  'InlineCode',
  'Strikethrough',
]);

function inRange(from: number, to: number, sel: SelectionRange): boolean {
  return sel.from >= from && sel.from <= to;
}

// Walk up ancestors: show marker if cursor is inside ANY inline-format ancestor.
// This handles ***bold italic*** where EmphasisMark is nested.
function cursorInAnyAncestor(
  nodeParent: ReturnType<typeof syntaxTree>['topNode']['node'] | null,
  sel: SelectionRange,
): boolean {
  let anc = nodeParent;
  while (anc && INLINE_FORMAT.has(anc.name)) {
    if (inRange(anc.from, anc.to, sel)) return true;
    anc = anc.parent;
  }
  return false;
}

// ─── Cached decoration instances ──────────────────────────────
// Creating Decoration objects is cheap but doing it inside a hot
// iterate() loop allocates GC pressure on every update.

const DECO = {
  hide: Decoration.replace({}),
  marker: Decoration.mark({ class: 'cm-md-marker' }),
  paragraph: Decoration.line({ class: 'cm-md-paragraph' }),
  blockquote: Decoration.line({ class: 'cm-md-blockquote' }),
  codeBlock: Decoration.line({ class: 'cm-md-code-block' }),
  strong: Decoration.mark({ class: 'cm-md-strong' }),
  em: Decoration.mark({ class: 'cm-md-em' }),
  code: Decoration.mark({ class: 'cm-md-code' }),
  strike: Decoration.mark({ class: 'cm-md-strike' }),
  link: Decoration.mark({ class: 'cm-md-link' }),
  imageAlt: Decoration.mark({ class: 'cm-md-image-alt' }),
  h: ['', 1, 2, 3, 4, 5, 6].map((n) =>
    n ? Decoration.line({ class: `cm-md-h${n}` }) : null,
  ) as (Decoration | null)[],
  hr: Decoration.replace({ widget: hrWidget }),
  // bullet uses a CSS class + ::before instead of a WidgetType to avoid
  // DOM creation and layout thrashing on every list item in the viewport.
  bullet: Decoration.mark({ class: 'cm-md-bullet-mark' }),
};

// ─── Decoration collector ──────────────────────────────────────

type DecoSpec = { from: number; to: number; value: Decoration };

function collectDecos(view: EditorView): DecoSpec[] {
  const specs: DecoSpec[] = [];
  const sel = view.state.selection.main;
  const doc = view.state.doc;

  syntaxTree(view.state).iterate({
    from: view.viewport.from,
    to: view.viewport.to,
    enter(node): boolean | void {
      switch (node.name) {
        // ── Fenced code block ─────────────────────────────────
        // Apply monospace styling to all lines; skip children so
        // inline markdown inside code is not decorated.
        case 'FencedCode': {
          const vpTo = view.viewport.to;
          for (
            let pos = Math.max(node.from, view.viewport.from);
            pos <= doc.length;
          ) {
            const line = doc.lineAt(pos);
            if (line.from > vpTo) break; // past viewport bottom
            specs.push({
              from: line.from,
              to: line.from,
              value: DECO.codeBlock,
            });
            if (line.to >= node.to) break;
            pos = line.to + 1;
          }
          return false;
        }

        // ── ATX Headings (# through ######) ──────────────────
        case 'ATXHeading1':
        case 'ATXHeading2':
        case 'ATXHeading3':
        case 'ATXHeading4':
        case 'ATXHeading5':
        case 'ATXHeading6': {
          const level = +node.name[node.name.length - 1];
          const line = doc.lineAt(node.from);
          specs.push({ from: line.from, to: line.from, value: DECO.h[level]! });
          break;
        }

        case 'HeaderMark': {
          // Hide "# " when cursor is on a different line
          const line = doc.lineAt(node.from);
          if (!inRange(line.from, line.to, sel)) {
            const hideEnd = Math.min(node.to + 1, line.to); // +1 to eat trailing space
            specs.push({ from: node.from, to: hideEnd, value: DECO.hide });
          } else {
            specs.push({ from: node.from, to: node.to, value: DECO.marker });
          }
          break;
        }

        // ── Horizontal rule ───────────────────────────────────
        case 'HorizontalRule': {
          const line = doc.lineAt(node.from);
          if (!inRange(line.from, line.to, sel))
            specs.push({ from: node.from, to: node.to, value: DECO.hr });
          break;
        }

        // ── Blockquote ────────────────────────────────────────
        case 'Blockquote': {
          const vpTo = view.viewport.to;
          for (
            let pos = Math.max(node.from, view.viewport.from);
            pos <= doc.length;
          ) {
            const line = doc.lineAt(pos);
            if (line.from > vpTo) break; // past viewport bottom
            specs.push({
              from: line.from,
              to: line.from,
              value: DECO.blockquote,
            });
            if (line.to >= node.to) break;
            pos = line.to + 1;
          }
          break;
        }

        case 'QuoteMark': {
          const line = doc.lineAt(node.from);
          if (!inRange(line.from, line.to, sel)) {
            const hideEnd = Math.min(node.to + 1, line.to); // eat "> "
            specs.push({ from: node.from, to: hideEnd, value: DECO.hide });
          } else {
            specs.push({ from: node.from, to: node.to, value: DECO.marker });
          }
          break;
        }

        // ── List bullets ─────────────────────────────────────
        // Replace the raw "-"/"*" with a styled span via CSS ::before.
        // A mark decoration is cheaper than a WidgetType (no DOM element).
        case 'ListMark': {
          const listItem = node.node.parent;
          if (
            listItem?.name === 'ListItem' &&
            listItem.parent?.name === 'BulletList'
          )
            specs.push({ from: node.from, to: node.to, value: DECO.bullet });
          break;
        }

        // ── Paragraph first-line indent (skip inside list items) ──
        case 'Paragraph': {
          if (node.node.parent?.name === 'ListItem') break;
          const line = doc.lineAt(node.from);
          specs.push({ from: line.from, to: line.from, value: DECO.paragraph });
          break;
        }

        // ── Inline containers (apply visual class) ────────────
        case 'StrongEmphasis':
          if (!inRange(node.from, node.to, sel))
            specs.push({ from: node.from, to: node.to, value: DECO.strong });
          break;

        case 'Emphasis':
          if (!inRange(node.from, node.to, sel))
            specs.push({ from: node.from, to: node.to, value: DECO.em });
          break;

        case 'InlineCode':
          if (!inRange(node.from, node.to, sel))
            specs.push({ from: node.from, to: node.to, value: DECO.code });
          break;

        case 'Strikethrough':
          if (!inRange(node.from, node.to, sel))
            specs.push({ from: node.from, to: node.to, value: DECO.strike });
          break;

        // ── Inline marker nodes ───────────────────────────────
        // Walk up ancestor chain so ***bold italic*** shows/hides
        // all markers together when cursor is in any nesting level.
        case 'EmphasisMark':
        case 'StrikethroughMark': {
          const parent = node.node.parent;
          const show =
            (parent && inRange(parent.from, parent.to, sel)) ||
            cursorInAnyAncestor(node.node.parent, sel);
          specs.push({
            from: node.from,
            to: node.to,
            value: show ? DECO.marker : DECO.hide,
          });
          break;
        }

        case 'CodeMark': {
          // Only hide backticks for inline code; fenced code marks are kept.
          const parent = node.node.parent;
          if (parent?.name === 'InlineCode') {
            const show = inRange(parent.from, parent.to, sel);
            specs.push({
              from: node.from,
              to: node.to,
              value: show ? DECO.marker : DECO.hide,
            });
          }
          break;
        }

        // ── Links ─────────────────────────────────────────────
        // [label](url) → show only "label" with link style.
        case 'Link': {
          if (inRange(node.from, node.to, sel)) break;
          const marks = node.node.getChildren('LinkMark');
          if (marks.length >= 2) {
            specs.push({
              from: marks[0].from,
              to: marks[0].to,
              value: DECO.hide,
            }); // hide [
            specs.push({
              from: marks[0].to,
              to: marks[1].from,
              value: DECO.link,
            });
            specs.push({ from: marks[1].from, to: node.to, value: DECO.hide }); // hide ](url)
          }
          break;
        }

        // ── Images ────────────────────────────────────────────
        // ![alt](url) → show only "alt" with image-alt style.
        case 'Image': {
          if (inRange(node.from, node.to, sel)) break;
          const marks = node.node.getChildren('LinkMark');
          if (marks.length >= 2) {
            specs.push({ from: node.from, to: marks[0].to, value: DECO.hide }); // hide ![
            specs.push({
              from: marks[0].to,
              to: marks[1].from,
              value: DECO.imageAlt,
            });
            specs.push({ from: marks[1].from, to: node.to, value: DECO.hide }); // hide ](url)
          }
          break;
        }

        // Handled inline above; skip here to avoid double-processing.
        case 'LinkMark':
        case 'URL':
        case 'LinkTitle':
        case 'LinkLabel':
          break;
      }
    },
  });

  return specs;
}

function buildDecoSet(view: EditorView): DecorationSet {
  const specs = collectDecos(view);
  specs.sort((a, b) => a.from - b.from || a.to - b.to);
  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to, value } of specs) builder.add(from, to, value);
  return builder.finish();
}

// ─── Sensitive-node check for selection optimization ──────────

const SENSITIVE_NODES = new Set([
  'ATXHeading1',
  'ATXHeading2',
  'ATXHeading3',
  'ATXHeading4',
  'ATXHeading5',
  'ATXHeading6',
  'HorizontalRule',
  'Blockquote',
  'StrongEmphasis',
  'Emphasis',
  'InlineCode',
  'Strikethrough',
  'Link',
  'Image',
]);

// Returns true if the cursor position sits inside or on a node whose
// decoration depends on cursor proximity (would change on enter/exit).
function isInSensitiveNode(pos: number, view: EditorView): boolean {
  let node = syntaxTree(view.state).resolveInner(pos, 1);
  while (node.parent) {
    if (SENSITIVE_NODES.has(node.name)) return true;
    node = node.parent;
  }
  return false;
}

// ─── Plugin ────────────────────────────────────────────────────

export const livePreviewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    private prevSelFrom = -1;
    private prevSelLine = -1;

    constructor(view: EditorView) {
      this.decorations = buildDecoSet(view);
      const sel = view.state.selection.main;
      this.prevSelFrom = sel.from;
      this.prevSelLine = view.state.doc.lineAt(sel.from).number;
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildDecoSet(update.view);
        const sel = update.view.state.selection.main;
        this.prevSelFrom = sel.from;
        this.prevSelLine = update.view.state.doc.lineAt(sel.from).number;
        return;
      }
      if (!update.selectionSet) return;

      const sel = update.view.state.selection.main;
      const newLine = update.view.state.doc.lineAt(sel.from).number;

      // Skip rebuild when cursor stays on the same line AND neither the
      // old nor new position is inside a node whose visibility depends
      // on cursor proximity.
      const sameLine = newLine === this.prevSelLine;
      if (
        sameLine &&
        !isInSensitiveNode(sel.from, update.view) &&
        !isInSensitiveNode(this.prevSelFrom, update.view)
      ) {
        this.prevSelFrom = sel.from;
        return;
      }

      this.decorations = buildDecoSet(update.view);
      this.prevSelFrom = sel.from;
      this.prevSelLine = newLine;
    }
  },
  {
    decorations: (v) => v.decorations,
    // Treat HR replace-decorations as atomic so the cursor skips over them
    // cleanly rather than landing inside the replaced range.
    provide: (plugin) =>
      EditorView.atomicRanges.of((view) => {
        return view.plugin(plugin)?.decorations ?? Decoration.none;
      }),
  },
);

// ─── Theme ────────────────────────────────────────────────────

export const livePreviewTheme = EditorView.theme({
  // Base
  '&': { background: 'transparent' },
  '.cm-scroller': {
    fontFamily: 'inherit',
    lineHeight: 'inherit',
    overflow: 'visible',
  },
  '.cm-content': { padding: '0', caretColor: 'var(--fg)' },
  '.cm-line': { padding: '0' },
  '&.cm-focused': { outline: 'none' },
  '.cm-cursor': { borderLeftColor: 'var(--fg)' },
  '.cm-selectionBackground': {
    background: 'color-mix(in srgb, var(--fg) 15%, transparent) !important',
  },
  '&.cm-focused .cm-selectionBackground': {
    background: 'color-mix(in srgb, var(--fg) 20%, transparent) !important',
  },

  // Paragraph
  '.cm-line.cm-md-paragraph': { textIndent: 'var(--typo-indent, 0)' },

  // Headings — match typo.css sizing
  '.cm-line.cm-md-h1': {
    fontSize: '2em',
    fontWeight: '900',
    color: 'var(--text-bold, inherit)',
  },
  '.cm-line.cm-md-h2': {
    fontSize: '1.75em',
    fontWeight: '900',
    color: 'var(--text-bold, inherit)',
  },
  '.cm-line.cm-md-h3': {
    fontSize: '1.5em',
    fontWeight: '800',
    color: 'var(--text-bold, inherit)',
  },
  '.cm-line.cm-md-h4': {
    fontSize: '1.4em',
    fontWeight: 'bold',
    color: 'var(--text-bold, inherit)',
  },
  '.cm-line.cm-md-h5': {
    fontSize: '1.25em',
    fontWeight: 'bold',
    color: 'var(--text-bold, inherit)',
  },
  '.cm-line.cm-md-h6': {
    fontSize: '1.125em',
    fontWeight: 'bold',
    color: 'var(--md-mark, #888)',
  },

  // Inline styles
  '.cm-md-strong': { fontWeight: 'bold' },
  '.cm-md-em': { fontStyle: 'italic' },
  '.cm-md-strike': {
    textDecoration: 'line-through',
    color: 'var(--md-mark, #888)',
  },
  '.cm-md-code': {
    fontFamily: 'var(--font-mono)',
    fontSize: '0.88em',
    background: 'var(--border)',
    borderRadius: '3px',
    padding: '0.1em 3px',
  },

  // Links and images
  '.cm-md-link': {
    color: 'var(--hl, #06c)',
    textDecoration: 'underline',
    cursor: 'pointer',
  },
  '.cm-md-image-alt': { color: 'var(--md-mark, #888)', fontStyle: 'italic' },

  // Blockquote
  '.cm-line.cm-md-blockquote': {
    borderLeft: '4px solid var(--md-mark, #888)',
    paddingLeft: '0.75em',
    fontStyle: 'italic',
    color: 'var(--md-mark, #888)',
  },

  // Code block lines (fenced code)
  '.cm-line.cm-md-code-block': {
    fontFamily: 'var(--font-mono)',
    fontSize: '0.9em',
    background: 'color-mix(in srgb, var(--fg) 4%, transparent)',
  },

  // HR widget
  '.cm-md-hr-widget': {
    display: 'block',
    width: '100%',
    height: '0',
    borderTop: '1px solid var(--md-mark, #888)',
  },

  // Bullet mark: hide the raw "-"/"*" and inject "•" via ::before.
  '.cm-md-bullet-mark': { fontSize: '0', color: 'transparent' },
  '.cm-md-bullet-mark::before': {
    content: '"•"',
    fontSize: '1rem',
    color: 'var(--md-mark, #888)',
  },

  // Visible markdown markers (when cursor is nearby): *, **, ~~, `, #, >
  '.cm-md-marker': { color: 'var(--md-mark, #888)' },
});
