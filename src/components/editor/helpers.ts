import { baseKeymap, toggleMark } from 'prosemirror-commands';
import { history, redo, undo } from 'prosemirror-history';
import {
  ellipsis,
  emDash,
  InputRule,
  inputRules,
  smartQuotes,
  textblockTypeInputRule,
  wrappingInputRule,
} from 'prosemirror-inputrules';
import { keymap } from 'prosemirror-keymap';
import type { MarkType } from 'prosemirror-model';
import { TextSelection } from 'prosemirror-state';
import { liftListItem, sinkListItem } from 'prosemirror-schema-list';
import { Plugin } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import type { MdRules } from '../../state/settings';
import {
  pmSchema,
  pmSerializer,
  extractDocLabel,
  calcStats,
} from '../../lib/pm_content';

export { pmSchema, pmSerializer, extractDocLabel, calcStats };
export type { DocStats } from '../../lib/pm_content';

// ─── Input Rules ─────────────────────────────────────────────

function markInputRule(pattern: RegExp, markType: MarkType): InputRule {
  return new InputRule(pattern, (state, match, start, end) => {
    const inner = match[1];
    if (!inner) return null;
    return state.tr
      .replaceWith(start, end, state.schema.text(inner, [markType.create()]))
      .removeStoredMark(markType);
  });
}

const backslashEscapeRule = new InputRule(
  /\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])$/,
  (state, match, start, end) =>
    state.tr.replaceWith(start, end, pmSchema.text(match[1])),
);

const hrRule = new InputRule(
  /^(_{3,}|—{2,}|—+-+|-{3,})$/,
  (state, _match, start, end) => {
    const hr = pmSchema.nodes.horizontal_rule.create();
    const para = pmSchema.nodes.paragraph.create();
    const tr = state.tr.replaceWith(start - 1, end, [hr, para]);
    const pos = start - 1 + hr.nodeSize + 1;
    return tr.setSelection(
      TextSelection.near(tr.doc.resolve(Math.min(pos, tr.doc.content.size))),
    );
  },
);

export function buildInputRules(rules: MdRules): Plugin {
  const r = rules;
  return inputRules({
    rules: [
      hrRule,
      ...(r.backslashEscape ? [backslashEscapeRule] : []),
      ...(r.smartQuotes ? smartQuotes : []),
      ...(r.ellipsis ? [ellipsis, emDash] : []),
      ...(r.inlineStyles
        ? [
            markInputRule(
              /(?<!\S)\*\*([^*\s](?:[^*]*[^*\s])?)\*\*$/,
              pmSchema.marks.strong,
            ),
            markInputRule(
              /(?<!\S)\*([^*\s](?:[^*]*[^*\s])?)\*$/,
              pmSchema.marks.em,
            ),
            markInputRule(
              /(?<!\S)_([^_\s](?:[^_]*[^_\s])?)_$/,
              pmSchema.marks.em,
            ),
            markInputRule(
              /(?<!\S)~~([^~\s](?:[^~]*[^~\s])?)~~$/,
              pmSchema.marks.strikethrough,
            ),
            markInputRule(
              /(?<!\S)`([^`\s](?:[^`]*[^`\s])?)`$/,
              pmSchema.marks.code,
            ),
          ]
        : []),
      ...(r.blockquote
        ? [wrappingInputRule(/^\s*>\s$/, pmSchema.nodes.blockquote)]
        : []),
      ...(r.lists
        ? [
            wrappingInputRule(/^(\d+)\.\s$/, pmSchema.nodes.ordered_list),
            wrappingInputRule(/^\s*[-+]\s$/, pmSchema.nodes.bullet_list),
          ]
        : []),
      ...(r.codeBlock
        ? [textblockTypeInputRule(/^```$/, pmSchema.nodes.code_block)]
        : []),
      ...(r.headings
        ? [
            textblockTypeInputRule(/^#\s$/, pmSchema.nodes.heading, {
              level: 1,
            }),
            textblockTypeInputRule(/^##\s$/, pmSchema.nodes.heading, {
              level: 2,
            }),
            textblockTypeInputRule(/^###\s$/, pmSchema.nodes.heading, {
              level: 3,
            }),
          ]
        : []),
    ],
  });
}

// ─── Plugins ─────────────────────────────────────────────────

function makePlaceholderPlugin(placeholder: string): Plugin {
  return new Plugin({
    props: {
      decorations(state) {
        const doc = state.doc;
        if (
          doc.childCount === 1 &&
          doc.firstChild!.isTextblock &&
          doc.firstChild!.content.size === 0
        ) {
          const deco = Decoration.node(0, doc.content.size, {
            class: 'ProseMirror-placeholder',
            'data-placeholder': placeholder,
          });
          return DecorationSet.create(doc, [deco]);
        }
        return DecorationSet.empty;
      },
    },
  });
}

export function buildPlugins(placeholder: string, rules: MdRules): Plugin[] {
  return [
    makePlaceholderPlugin(placeholder),
    history(),
    buildInputRules(rules),
    keymap({
      'Mod-z': undo,
      'Mod-y': redo,
      'Mod-Shift-z': redo,
      'Mod-b': toggleMark(pmSchema.marks.strong),
      'Mod-i': toggleMark(pmSchema.marks.em),
      'Mod-`': toggleMark(pmSchema.marks.code),
      Tab: (state, dispatch) => {
        if (sinkListItem(pmSchema.nodes.list_item)(state, dispatch))
          return true;
        if (state.selection.$head.parent.type === pmSchema.nodes.code_block) {
          if (dispatch) dispatch(state.tr.insertText('\t'));
          return true;
        }
        return true;
      },
      'Shift-Tab': (state, dispatch) =>
        liftListItem(pmSchema.nodes.list_item)(state, dispatch),
    }),
    keymap(baseKeymap),
  ];
}
