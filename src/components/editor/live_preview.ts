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

// ─── Decoration builder ──────────────────────────────────────
//
// RangeSetBuilder requires (from asc, startSide asc) order. Line decos
// (startSide = -∞) must come before range decos (startSide = 0) at the same
// `from`. We push directly to the builder — no intermediate array or sort —
// by observing two rules:
//
//  1. Blockquote siblings: QuoteMark emits a line deco then a range deco at
//     line.from. Its siblings (Paragraph, ATXHeading) would later emit line
//     decos at the same line.from, violating startSide order. Fix: skip those
//     line decos when the node is a direct child of Blockquote.
//     Trade-off: paragraph indent and heading size are not applied inside
//     blockquotes, which is acceptable in practice.
//
//  2. Nested blockquotes: InnerQuoteMark.line.from == OuterQuoteMark.line.from,
//     so its line deco would follow the outer range deco. Fix: only the
//     outermost QuoteMark on each line emits the blockquote line deco.
//
//  3. Inline containers (StrongEmphasis etc.) share `from` with their opening
//     mark child but have a larger `to`, so they must NOT be pushed from their
//     own enter (parent fires before child). Instead the opening mark's enter
//     pushes the container span immediately after itself — same from, larger to,
//     which is valid builder order.

function buildDecoSet(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const sel = view.state.selection.main;
  const doc = view.state.doc;
  const vpFrom = view.viewport.from;
  const vpTo = view.viewport.to;

  syntaxTree(view.state).iterate({
    from: vpFrom,
    to: vpTo,
    enter(node): boolean | void {
      switch (node.name) {
        // ── Fenced code block ─────────────────────────────────
        case 'FencedCode': {
          for (let pos = Math.max(node.from, vpFrom); pos <= doc.length;) {
            const line = doc.lineAt(pos);
            if (line.from > vpTo) break;
            builder.add(line.from, line.from, DECO.codeBlock);
            if (line.to >= node.to) break;
            pos = line.to + 1;
          }
          return false;
        }

        // ── ATX Headings ──────────────────────────────────────
        // Skip line deco inside Blockquote: QuoteMark's range deco at
        // line.from is already in the builder before this node is visited.
        case 'ATXHeading1':
        case 'ATXHeading2':
        case 'ATXHeading3':
        case 'ATXHeading4':
        case 'ATXHeading5':
        case 'ATXHeading6': {
          if (node.node.parent?.name === 'Blockquote') break;
          const level = +node.name[node.name.length - 1];
          builder.add(doc.lineAt(node.from).from, doc.lineAt(node.from).from, DECO.h[level]!);
          break;
        }

        case 'HeaderMark': {
          const line = doc.lineAt(node.from);
          if (!inRange(line.from, line.to, sel)) {
            builder.add(node.from, Math.min(node.to + 1, line.to), DECO.hide);
          } else {
            builder.add(node.from, node.to, DECO.marker);
          }
          break;
        }

        // ── Horizontal rule ───────────────────────────────────
        case 'HorizontalRule': {
          const line = doc.lineAt(node.from);
          if (!inRange(line.from, line.to, sel))
            builder.add(node.from, node.to, DECO.hr);
          break;
        }

        // ── Blockquote ────────────────────────────────────────
        // Line deco emitted per QuoteMark below. Lazy continuation unsupported.
        case 'Blockquote':
          break;

        case 'QuoteMark': {
          const line = doc.lineAt(node.from);
          // Outermost QuoteMark only: inner ones share the same line.from as
          // the outer range deco already in the builder.
          if (node.node.parent?.parent?.name !== 'Blockquote')
            builder.add(line.from, line.from, DECO.blockquote);
          if (!inRange(line.from, line.to, sel)) {
            builder.add(node.from, Math.min(node.to + 1, line.to), DECO.hide);
          } else {
            builder.add(node.from, node.to, DECO.marker);
          }
          break;
        }

        // ── List bullets ─────────────────────────────────────
        case 'ListMark': {
          const listItem = node.node.parent;
          if (
            listItem?.name === 'ListItem' &&
            listItem.parent?.name === 'BulletList'
          )
            builder.add(node.from, node.to, DECO.bullet);
          break;
        }

        // ── Paragraph ─────────────────────────────────────────
        // Skip inside Blockquote (same reason as ATXHeading above).
        case 'Paragraph': {
          if (node.node.parent?.name === 'ListItem') break;
          if (node.node.parent?.name === 'Blockquote') break;
          builder.add(doc.lineAt(node.from).from, doc.lineAt(node.from).from, DECO.paragraph);
          break;
        }

        // ── Inline containers ─────────────────────────────────
        // Pushed from the opening-mark handler below (rule 3 above).
        case 'StrongEmphasis':
        case 'Emphasis':
        case 'InlineCode':
        case 'Strikethrough':
          break;

        // ── Inline marker nodes ───────────────────────────────
        case 'EmphasisMark':
        case 'StrikethroughMark': {
          const parent = node.node.parent;
          const show =
            (parent && inRange(parent.from, parent.to, sel)) ||
            cursorInAnyAncestor(node.node.parent, sel);
          builder.add(node.from, node.to, show ? DECO.marker : DECO.hide);
          // Opening mark: push enclosing container spans right after.
          // Same from, larger to — valid builder order.
          if (!show && parent?.from === node.from) {
            let anc = parent as ReturnType<typeof syntaxTree>['topNode']['node'] | null;
            while (anc && INLINE_FORMAT.has(anc.name) && anc.from === node.from) {
              if (!inRange(anc.from, anc.to, sel)) {
                let d: Decoration | null = null;
                if (anc.name === 'StrongEmphasis') d = DECO.strong;
                else if (anc.name === 'Emphasis') d = DECO.em;
                else if (anc.name === 'Strikethrough') d = DECO.strike;
                if (d) builder.add(anc.from, anc.to, d);
              }
              anc = anc.parent;
            }
          }
          break;
        }

        case 'CodeMark': {
          const parent = node.node.parent;
          if (parent?.name === 'InlineCode') {
            const show = inRange(parent.from, parent.to, sel);
            builder.add(node.from, node.to, show ? DECO.marker : DECO.hide);
            // Opening backtick: push InlineCode span after (same from, larger to).
            if (!show && parent.from === node.from)
              builder.add(parent.from, parent.to, DECO.code);
          }
          break;
        }

        // ── Links ─────────────────────────────────────────────
        case 'Link': {
          if (inRange(node.from, node.to, sel)) break;
          let firstMark = null, secondMark = null;
          for (let c = node.node.firstChild; c; c = c.nextSibling) {
            if (c.name !== 'LinkMark') continue;
            if (!firstMark) firstMark = c;
            else { secondMark = c; break; }
          }
          if (firstMark && secondMark) {
            builder.add(firstMark.from, firstMark.to, DECO.hide);
            builder.add(firstMark.to, secondMark.from, DECO.link);
            builder.add(secondMark.from, node.to, DECO.hide);
          }
          break;
        }

        // ── Images ────────────────────────────────────────────
        case 'Image': {
          if (inRange(node.from, node.to, sel)) break;
          let firstMark = null, secondMark = null;
          for (let c = node.node.firstChild; c; c = c.nextSibling) {
            if (c.name !== 'LinkMark') continue;
            if (!firstMark) firstMark = c;
            else { secondMark = c; break; }
          }
          if (firstMark && secondMark) {
            builder.add(node.from, firstMark.to, DECO.hide);
            builder.add(firstMark.to, secondMark.from, DECO.imageAlt);
            builder.add(secondMark.from, node.to, DECO.hide);
          }
          break;
        }

        case 'LinkMark':
        case 'URL':
        case 'LinkTitle':
        case 'LinkLabel':
          break;
      }
    },
  });

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
    private prevSelInSensitive = false;

    constructor(view: EditorView) {
      this.decorations = buildDecoSet(view);
      const sel = view.state.selection.main;
      this.prevSelFrom = sel.from;
      this.prevSelLine = view.state.doc.lineAt(sel.from).number;
      this.prevSelInSensitive = isInSensitiveNode(this.prevSelFrom, view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildDecoSet(update.view);
        const sel = update.view.state.selection.main;
        this.prevSelFrom = sel.from;
        this.prevSelLine = update.view.state.doc.lineAt(sel.from).number;
        this.prevSelInSensitive = isInSensitiveNode(
          this.prevSelFrom,
          update.view,
        );
        return;
      }
      if (!update.selectionSet) return;

      const sel = update.view.state.selection.main;
      const newLine = update.view.state.doc.lineAt(sel.from).number;
      const inSensitive = isInSensitiveNode(sel.from, update.view);

      // Skip rebuild when cursor stays on the same line AND neither the
      // old nor new position is inside a node whose visibility depends
      // on cursor proximity.
      const sameLine = newLine === this.prevSelLine;
      if (sameLine && !inSensitive && !this.prevSelInSensitive) {
        this.prevSelFrom = sel.from;
        this.prevSelInSensitive = inSensitive;
        return;
      }

      this.decorations = buildDecoSet(update.view);
      this.prevSelFrom = sel.from;
      this.prevSelLine = newLine;
      this.prevSelInSensitive = inSensitive;
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
