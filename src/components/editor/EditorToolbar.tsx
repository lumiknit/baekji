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
  TbOutlineLink,
  TbOutlineList,
  TbOutlineListNumbers,
  TbOutlineMinus,
  TbOutlinePhoto,
  TbOutlineQuote,
  TbOutlineScissors,
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
    icon: () => (
      <span class="icon">
        <TbOutlineBold />
      </span>
    ),
    label: 'Bold',
    cmd: toggleMark(pmSchema.marks.strong),
  },
  {
    id: 'italic',
    icon: () => (
      <span class="icon">
        <TbOutlineItalic />
      </span>
    ),
    label: 'Italic',
    cmd: toggleMark(pmSchema.marks.em),
  },
  {
    id: 'strikethrough',
    icon: () => (
      <span class="icon">
        <TbOutlineStrikethrough />
      </span>
    ),
    label: 'Strikethrough',
    cmd: toggleMark(pmSchema.marks.strikethrough),
  },
  {
    id: 'code',
    icon: () => (
      <span class="icon">
        <TbOutlineCode />
      </span>
    ),
    label: 'Monospace',
    cmd: toggleMark(pmSchema.marks.code),
  },
  {
    id: 'clear',
    icon: () => (
      <span class="icon">
        <TbOutlineTextDecrease />
      </span>
    ),
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
        <span class="icon">
          <TbOutlineAlignJustified />
        </span>{' '}
        Paragraph
      </>
    ),
    onSelect: () => resetBlock(exec),
  },
  { separator: true },
  {
    label: (
      <>
        <span class="icon">
          <TbOutlineList />
        </span>{' '}
        Bullet list
      </>
    ),
    onSelect: () => execBlock(exec, wrapInList(pmSchema.nodes.bullet_list)),
  },
  {
    label: (
      <>
        <span class="icon">
          <TbOutlineListNumbers />
        </span>{' '}
        Ordered list
      </>
    ),
    onSelect: () => execBlock(exec, wrapInList(pmSchema.nodes.ordered_list)),
  },
  {
    label: (
      <>
        <span class="icon">
          <TbOutlineIndentIncrease />
        </span>{' '}
        Indent
      </>
    ),
    onSelect: () => exec(sinkListItem(pmSchema.nodes.list_item)),
  },
  {
    label: (
      <>
        <span class="icon">
          <TbOutlineIndentDecrease />
        </span>{' '}
        Dedent
      </>
    ),
    onSelect: () => exec(liftListItem(pmSchema.nodes.list_item)),
  },
  { separator: true },
  {
    label: (
      <>
        <span class="icon">
          <TbOutlineQuote />
        </span>{' '}
        Quote
      </>
    ),
    onSelect: () => execBlock(exec, wrapIn(pmSchema.nodes.blockquote)),
  },
  {
    label: (
      <>
        <span class="icon">
          <TbOutlineSourceCode />
        </span>{' '}
        Code block
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
  onLink: () => void;
  onImage: () => void;
  onSplit: () => void;
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
          <span class="icon">
            <TbOutlineDeviceFloppy />
          </span>{' '}
          {s('common.save')}
        </>
      ),
      onSelect: props.onSave,
    },
    {
      label: (
        <>
          <span class="icon">
            <TbOutlineScissors />
          </span>{' '}
          {s('editor.split')}
        </>
      ),
      onSelect: props.onSplit,
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
        <span class="icon">
          <TbOutlineArrowBackUp />
        </span>
      </button>
      <button
        onClick={props.onRedo}
        title="Redo"
        style={{ opacity: props.canRedo ? '1' : '0.5' }}
      >
        <span class="icon">
          <TbOutlineArrowForwardUp />
        </span>
      </button>

      <div class="separator" />

      {/* Char style: last used + dropdown */}
      <button
        onClick={() => props.onExec(lastStyle().cmd)}
        title={lastStyle().label}
      >
        {lastStyle().icon()}
      </button>
      <Dropdown
        trigger={
          <span class="icon">
            <TbOutlineDots />
          </span>
        }
        items={charStyleDropdownItems()}
      />

      <div class="separator" />

      {/* Link / Image dropdown */}
      <Dropdown
        trigger={
          <span class="icon">
            <TbOutlineLink />
          </span>
        }
        items={[
          {
            label: (
              <>
                <span class="icon">
                  <TbOutlineLink />
                </span>{' '}
                Link
              </>
            ),
            onSelect: props.onLink,
          },
          {
            label: (
              <>
                <span class="icon">
                  <TbOutlinePhoto />
                </span>{' '}
                Image
              </>
            ),
            onSelect: props.onImage,
          },
          { separator: true as const },
          {
            label: (
              <>
                <span class="icon">
                  <TbOutlineMinus />
                </span>{' '}
                Horizontal rule
              </>
            ),
            onSelect: () =>
              props.onExec((state, dispatch) => {
                const hr = state.schema.nodes.horizontal_rule;
                if (!hr) return false;
                if (dispatch)
                  dispatch(
                    state.tr.replaceSelectionWith(hr.create()).scrollIntoView(),
                  );
                return true;
              }),
          },
        ]}
      />

      {/* Block style */}
      <Dropdown
        trigger={
          <span class="icon">
            <TbOutlineH1 />
          </span>
        }
        items={BLOCK_STYLE_ITEMS(props.onExec)}
      />

      {/* More options */}
      <Dropdown
        trigger={
          <span class="icon">
            <TbOutlineDots />
          </span>
        }
        items={moreItems()}
        align="right"
        class="ml-auto"
      />
    </div>
  );
};

export default EditorToolbar;
