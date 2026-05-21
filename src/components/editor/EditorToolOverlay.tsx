import {
  TbOutlineFileExport,
  TbOutlineArrowsSplit,
  TbOutlineAnalyze,
  TbOutlineArrowBackUp,
  TbOutlineArrowForwardUp,
  TbOutlineDots,
  TbOutlineCopy,
  TbOutlineSearch,
  TbOutlineDeviceFloppy,
  TbOutlineTarget,
} from 'solid-icons/tb';

import type { Component } from 'solid-js';
import Dropdown from '../Dropdown.tsx';
import { formatCompact } from '../../lib/format.ts';
import { s } from '../../lib/i18n/index.ts';
import { settings, setSettings } from '../../state/settings.ts';

interface EditorToolOverlayProps {
  charCount: () => number;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  onCopy: () => void;
  onExport: () => void;
  onSplit: () => void;
  onAnalysis: () => void;
  onSearch: () => void;
}

const EditorToolOverlay: Component<EditorToolOverlayProps> = (props) => {
  return (
    <div
      class="editor-tool-overlay"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div class="editor-tool-status">
        <span class="editor-tool-charcount">
          {s('editor.chars', { count: formatCompact(props.charCount()) })}
        </span>
      </div>

      <button
        class="editor-tool-btn"
        title={s('editor.undo')}
        onClick={props.onUndo}
      >
        <TbOutlineArrowBackUp size={14} />
      </button>
      <button
        class="editor-tool-btn"
        title={s('editor.redo')}
        onClick={props.onRedo}
      >
        <TbOutlineArrowForwardUp size={14} />
      </button>

      <Dropdown
        triggerClass="editor-tool-btn"
        align="right"
        trigger={<TbOutlineDots size={14} />}
        items={[
          {
            icon: TbOutlineDeviceFloppy,
            label: s('editor.snapshot_save'),
            onSelect: props.onSave,
          },
          { separator: true },
          {
            icon: TbOutlineSearch,
            label: s('editor.find_replace'),
            onSelect: props.onSearch,
          },
          {
            icon: TbOutlineCopy,
            label: s('common.copy'),
            onSelect: props.onCopy,
          },
          {
            icon: TbOutlineFileExport,
            label: s('common.preview_export'),
            onSelect: props.onExport,
          },
          {
            icon: TbOutlineAnalyze,
            label: s('common.analysis'),
            onSelect: props.onAnalysis,
          },
          { separator: true },
          {
            icon: TbOutlineTarget,
            label: s('goal.title'),
            checked: settings.showGoalOverlay,
            onSelect: () => setSettings('showGoalOverlay', (v) => !v),
          },
          { separator: true },
          {
            icon: TbOutlineArrowsSplit,
            label: s('editor.split'),
            onSelect: props.onSplit,
          },
        ]}
      />
    </div>
  );
};

export default EditorToolOverlay;
