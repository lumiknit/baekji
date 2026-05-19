import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';

// ─── Cached decoration instances ──────────────────────────────
// Creating Decoration objects is cheap but doing it inside a hot
// iterate() loop allocates GC pressure on every update.

const DECO = {
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
  hr: Decoration.line({ class: 'cm-md-hr' }),
  bullet: Decoration.mark({ class: 'cm-md-bullet-mark' }),
  // bullet uses a CSS class + ::before instead of a WidgetType to avoid
  // DOM creation and layout thrashing on every list item in the viewport.
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
          for (let pos = Math.max(node.from, vpFrom); pos <= doc.length; ) {
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
          const lf = doc.lineAt(node.from).from;
          builder.add(lf, lf, DECO.h[level]!);
          break;
        }

        case 'SetextHeading1':
        case 'SetextHeading2': {
          if (node.node.parent?.name === 'Blockquote') break;
          const level = node.name === 'SetextHeading1' ? 1 : 2;
          const lf = doc.lineAt(node.from).from;
          builder.add(lf, lf, DECO.h[level]!);
          break;
        }

        case 'HeaderMark':
        case 'SetextHeadingMark': {
          builder.add(node.from, node.to, DECO.marker);
          break;
        }

        // ── Horizontal rule ───────────────────────────────────
        case 'HorizontalRule': {
          const lf = doc.lineAt(node.from).from;
          builder.add(lf, lf, DECO.hr);
          builder.add(node.from, node.to, DECO.marker);
          break;
        }

        // ── Blockquote ────────────────────────────────────────
        // Iterate lines ourselves rather than relying on QuoteMark children,
        // because lezer-markdown may only emit a QuoteMark node for the first
        // line of a multi-line blockquote. Walking firstChild/nextSibling lets
        // us find whichever QuoteMarks do exist without allocating an array.
        // Border and marker are mutually exclusive: border when cursor is away,
        // raw '>' marker when cursor is on the line.
        case 'Blockquote': {
          const outermost = node.node.parent?.name !== 'Blockquote';
          let child = node.node.firstChild;
          for (let pos = Math.max(node.from, vpFrom); pos <= node.to; ) {
            const line = doc.lineAt(pos);
            if (line.from > vpTo) break;
            // Advance child pointer past nodes before this line
            while (child && child.from < line.from) child = child.nextSibling;
            const qm =
              child?.name === 'QuoteMark' && child.from <= line.to
                ? child
                : null;
            if (outermost) builder.add(line.from, line.from, DECO.blockquote);
            const qmFrom = qm ? qm.from : line.from;
            const qmTo = qm ? qm.to : Math.min(line.from + 1, line.to);
            builder.add(qmFrom, qmTo, DECO.marker);
            pos = line.to + 1;
          }
          return false;
        }

        case 'QuoteMark':
          break;

        case 'ListMark': {
          builder.add(node.from, node.to, DECO.bullet);
          break;
        }

        // ── Paragraph ─────────────────────────────────────────
        // Skip inside Blockquote (same reason as ATXHeading above).
        case 'Paragraph': {
          const pn = node.node.parent?.name;
          if (pn === 'ListItem' || pn === 'Blockquote') break;
          const lf = doc.lineAt(node.from).from;
          builder.add(lf, lf, DECO.paragraph);
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
          builder.add(node.from, node.to, DECO.marker);
          // Opening mark: push the container span right after (same from, larger to).
          if (parent?.from === node.from) {
            if (parent.name === 'StrongEmphasis')
              builder.add(parent.from, parent.to, DECO.strong);
            else if (parent.name === 'Emphasis')
              builder.add(parent.from, parent.to, DECO.em);
            else if (parent.name === 'Strikethrough')
              builder.add(parent.from, parent.to, DECO.strike);
          }
          break;
        }

        case 'CodeMark': {
          const parent = node.node.parent;
          if (parent?.name === 'InlineCode') {
            builder.add(node.from, node.to, DECO.marker);
            if (parent.from === node.from)
              builder.add(parent.from, parent.to, DECO.code);
          }
          break;
        }

        // ── Links ─────────────────────────────────────────────
        case 'Link': {
          let firstMark = null,
            secondMark = null;
          for (let c = node.node.firstChild; c; c = c.nextSibling) {
            if (c.name !== 'LinkMark') continue;
            if (!firstMark) firstMark = c;
            else {
              secondMark = c;
              break;
            }
          }
          if (firstMark && secondMark) {
            builder.add(firstMark.from, firstMark.to, DECO.marker);
            builder.add(firstMark.to, secondMark.from, DECO.link);
            builder.add(secondMark.from, node.to, DECO.marker);
          }
          break;
        }

        // ── Images ────────────────────────────────────────────
        case 'Image': {
          let firstMark = null,
            secondMark = null;
          for (let c = node.node.firstChild; c; c = c.nextSibling) {
            if (c.name !== 'LinkMark') continue;
            if (!firstMark) firstMark = c;
            else {
              secondMark = c;
              break;
            }
          }
          if (firstMark && secondMark) {
            builder.add(node.from, firstMark.to, DECO.marker);
            builder.add(firstMark.to, secondMark.from, DECO.imageAlt);
            builder.add(secondMark.from, node.to, DECO.marker);
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

// ─── Plugin ────────────────────────────────────────────────────

export const livePreviewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildDecoSet(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildDecoSet(update.view);
      }
    }
  },
  {
    decorations: (v) => v.decorations,
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
  '.cm-content': { padding: '0', caretColor: 'var(--text)' },
  '.cm-line': { padding: '0' },
  '&.cm-focused': { outline: 'none' },
  '.cm-cursor': { borderLeftColor: 'var(--text)' },
  '.cm-selectionBackground': {
    background: 'var(--cm-selection) !important',
  },
  '&.cm-focused .cm-selectionBackground': {
    background: 'var(--cm-sel-focus) !important',
  },

  // Paragraph
  '.cm-line.cm-md-paragraph': { textIndent: 'var(--typo-indent, 0)' },

  // Headings — match typo.css sizing
  '.cm-line.cm-md-h1': {
    fontSize: '2em',
    fontWeight: '900',
    color: 'var(--cm-text-bold, inherit)',
  },
  '.cm-line.cm-md-h2': {
    fontSize: '1.75em',
    fontWeight: '900',
    color: 'var(--cm-text-bold, inherit)',
  },
  '.cm-line.cm-md-h3': {
    fontSize: '1.5em',
    fontWeight: '800',
    color: 'var(--cm-text-bold, inherit)',
  },
  '.cm-line.cm-md-h4': {
    fontSize: '1.4em',
    fontWeight: 'bold',
    color: 'var(--cm-text-bold, inherit)',
  },
  '.cm-line.cm-md-h5': {
    fontSize: '1.25em',
    fontWeight: 'bold',
    color: 'var(--cm-text-bold, inherit)',
  },
  '.cm-line.cm-md-h6': {
    fontSize: '1.125em',
    fontWeight: 'bold',
    color: 'var(--cm-md-mark, #888)',
  },

  // Inline styles
  '.cm-md-strong': { fontWeight: 'bold' },
  '.cm-md-em': { fontStyle: 'italic' },
  '.cm-md-strike': {
    textDecoration: 'line-through',
    color: 'var(--cm-md-mark, #888)',
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
    color: 'var(--cm-hl, #06c)',
    textDecoration: 'underline',
    cursor: 'pointer',
  },
  '.cm-md-image-alt': { color: 'var(--cm-md-mark, #888)', fontStyle: 'italic' },

  // Blockquote
  '.cm-line.cm-md-blockquote': {
    borderLeft: '4px solid var(--cm-md-mark, #888)',
    paddingLeft: '0.75em',
    fontStyle: 'italic',
    color: 'var(--cm-md-mark, #888)',
  },

  // Code block lines (fenced code)
  '.cm-line.cm-md-code-block': {
    fontFamily: 'var(--font-mono)',
    fontSize: '0.9em',
    background: 'var(--cm-code-bg)',
  },

  // HR: draw rule via ::after; hide raw text via marker CSS. On active line,
  // show the raw text and suppress the rule to avoid visual overlap.
  '.cm-line.cm-md-hr': { position: 'relative' },
  '.cm-line.cm-md-hr::after': {
    content: '""',
    position: 'absolute',
    top: '50%',
    left: '0',
    right: '0',
    borderTop: '1px solid var(--cm-md-mark, #888)',
    transform: 'translateY(-50%)',
  },
  '.cm-activeLine.cm-md-hr::after': { display: 'none' },

  // List marks: colored but always visible, no hiding.
  '.cm-md-bullet-mark': { color: 'var(--cm-md-mark, #888)' },

  // Markers hidden by default; revealed on the active line via .cm-activeLine.
  // font-size:1px (not 0) keeps cursor movement correct while being visually invisible.
  '.cm-md-marker': { color: 'transparent', fontSize: '1px' },
  '.cm-activeLine .cm-md-marker': {
    color: 'var(--cm-md-mark, #888)',
    fontSize: 'inherit',
  },
});
