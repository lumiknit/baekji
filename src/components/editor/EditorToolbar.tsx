import type { Component, JSX } from 'solid-js';
import { createSignal } from 'solid-js';
import {
  TbOutlineAlignJustified,
  TbOutlineArrowBackUp,
  TbOutlineArrowForwardUp,
  TbOutlineBold,
  TbOutlineCode,
  TbOutlineDeviceFloppy,
  TbOutlineDots,
  TbOutlineH1,
  TbOutlineH2,
  TbOutlineH3,
  TbOutlineH4,
  TbOutlineIndentDecrease,
  TbOutlineIndentIncrease,
  TbOutlineItalic,
  TbOutlineList,
  TbOutlineListNumbers,
  TbOutlineQuote,
  TbOutlineSourceCode,
  TbOutlineStrikethrough,
  TbOutlineTextDecrease,
} from 'solid-icons/tb';
import { lift, setBlockType, toggleMark, wrapIn } from 'prosemirror-commands';
import {
  liftListItem,
  sinkListItem,
  wrapInList,
} from 'prosemirror-schema-list';
import type { EditorState } from 'prosemirror-state';
import Dropdown from '../Dropdown';
import type { DropdownItem } from '../Dropdown';
import { pmSchema } from './helpers';
import { s } from '../../lib/i18n';

type Cmd = (state: EditorState, dispatch: (tr: any) => void) => boolean;

interface CharStyle {
  id: string;
  icon: () => JSX.Element;
  label: string;
  cmd: Cmd;
}

const clearMarksCmd: Cmd = (state, dispatch) => {
  const { from, to } = state.selection;
  if (dispatch) dispatch(state.tr.removeMark(from, to));
  return true;
};

const CHAR_STYLES: CharStyle[] = [
  {
    id: 'bold',
    icon: () => <TbOutlineBold />,
    label: 'Bold',
    cmd: toggleMark(pmSchema.marks.strong),
  },
  {
    id: 'italic',
    icon: () => <TbOutlineItalic />,
    label: 'Italic',
    cmd: toggleMark(pmSchema.marks.em),
  },
  {
    id: 'strikethrough',
    icon: () => <TbOutlineStrikethrough />,
    label: 'Strikethrough',
    cmd: toggleMark(pmSchema.marks.strikethrough),
  },
  {
    id: 'code',
    icon: () => <TbOutlineCode />,
    label: 'Monospace',
    cmd: toggleMark(pmSchema.marks.code),
  },
  {
    id: 'clear',
    icon: () => <TbOutlineTextDecrease />,
    label: 'Clear styles',
    cmd: clearMarksCmd,
  },
];

// Reset any block wrapping (list, blockquote, etc.) then set to paragraph
const resetBlock = (exec: (cmd: Cmd) => void) => {
  exec(liftListItem(pmSchema.nodes.list_item));
  exec(lift);
  exec(setBlockType(pmSchema.nodes.paragraph));
};

const execBlock = (exec: (cmd: Cmd) => void, cmd: Cmd) => {
  resetBlock(exec);
  exec(cmd);
};

const BLOCK_STYLE_ITEMS = (exec: (cmd: Cmd) => void): DropdownItem[] => [
  {
    label: (
      <>
        <TbOutlineH1 /> H1
      </>
    ),
    onSelect: () =>
      execBlock(exec, setBlockType(pmSchema.nodes.heading, { level: 1 })),
  },
  {
    label: (
      <>
        <TbOutlineH2 /> H2
      </>
    ),
    onSelect: () =>
      execBlock(exec, setBlockType(pmSchema.nodes.heading, { level: 2 })),
  },
  {
    label: (
      <>
        <TbOutlineH3 /> H3
      </>
    ),
    onSelect: () =>
      execBlock(exec, setBlockType(pmSchema.nodes.heading, { level: 3 })),
  },
  {
    label: (
      <>
        <TbOutlineH4 /> H4
      </>
    ),
    onSelect: () =>
      execBlock(exec, setBlockType(pmSchema.nodes.heading, { level: 4 })),
  },
  { separator: true },
  {
    label: (
      <>
        <TbOutlineAlignJustified /> Paragraph
      </>
    ),
    onSelect: () => resetBlock(exec),
  },
  { separator: true },
  {
    label: (
      <>
        <TbOutlineList /> Bullet list
      </>
    ),
    onSelect: () => execBlock(exec, wrapInList(pmSchema.nodes.bullet_list)),
  },
  {
    label: (
      <>
        <TbOutlineListNumbers /> Ordered list
      </>
    ),
    onSelect: () => execBlock(exec, wrapInList(pmSchema.nodes.ordered_list)),
  },
  {
    label: (
      <>
        <TbOutlineIndentIncrease /> Indent
      </>
    ),
    onSelect: () => exec(sinkListItem(pmSchema.nodes.list_item)),
  },
  {
    label: (
      <>
        <TbOutlineIndentDecrease /> Dedent
      </>
    ),
    onSelect: () => exec(liftListItem(pmSchema.nodes.list_item)),
  },
  { separator: true },
  {
    label: (
      <>
        <TbOutlineQuote /> Quote
      </>
    ),
    onSelect: () => execBlock(exec, wrapIn(pmSchema.nodes.blockquote)),
  },
  {
    label: (
      <>
        <TbOutlineSourceCode /> Code block
      </>
    ),
    onSelect: () => execBlock(exec, setBlockType(pmSchema.nodes.code_block)),
  },
];

export interface EditorToolbarProps {
  canUndo: boolean;
  canRedo: boolean;
  isDirty: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onExec: (cmd: Cmd) => void;
  onSave: () => void;
}

const EditorToolbar: Component<EditorToolbarProps> = (props) => {
  const [lastStyleId, setLastStyleId] = createSignal('bold');

  const lastStyle = () =>
    CHAR_STYLES.find((s) => s.id === lastStyleId()) ?? CHAR_STYLES[0];

  const execStyle = (style: CharStyle) => {
    setLastStyleId(style.id);
    props.onExec(style.cmd);
  };

  const charStyleDropdownItems = (): DropdownItem[] =>
    CHAR_STYLES.map((style) => ({
      label: (
        <>
          {style.icon()} {style.label}
        </>
      ),
      onSelect: () => execStyle(style),
    }));

  const moreItems = (): DropdownItem[] => [
    {
      label: (
        <>
          <TbOutlineDeviceFloppy /> {s('common.save')}
        </>
      ),
      onSelect: props.onSave,
    },
  ];

  return (
    <div class="editor-toolbar">
      {/* History */}
      <button
        onClick={props.onUndo}
        title="Undo"
        style={{ opacity: props.canUndo ? '1' : '0.5' }}
      >
        <TbOutlineArrowBackUp />
      </button>
      <button
        onClick={props.onRedo}
        title="Redo"
        style={{ opacity: props.canRedo ? '1' : '0.5' }}
      >
        <TbOutlineArrowForwardUp />
      </button>

      <div class="separator" />

      {/* Char style: last used + dropdown */}
      <button
        onClick={() => props.onExec(lastStyle().cmd)}
        title={lastStyle().label}
      >
        {lastStyle().icon()}
      </button>
      <Dropdown trigger={<TbOutlineDots />} items={charStyleDropdownItems()} />

      <div class="separator" />

      {/* Block style */}
      <Dropdown
        trigger={<TbOutlineH1 />}
        items={BLOCK_STYLE_ITEMS(props.onExec)}
      />

      {/* More options */}
      <Dropdown
        trigger={<TbOutlineDots />}
        items={moreItems()}
        align="right"
        class="ml-auto"
      />
    </div>
  );
};

export default EditorToolbar;
