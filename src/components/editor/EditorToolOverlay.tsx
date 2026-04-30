import {
  TbOutlineCircleCheck,
  TbOutlineDeviceFloppy,
  TbOutlineArrowsSplit,
  TbOutlineAnalyze,
  TbOutlineArrowBackUp,
  TbOutlineArrowForwardUp,
  TbOutlineDots,
} from 'solid-icons/tb';
import type { Component } from 'solid-js';
import { createSignal, Show } from 'solid-js';
import CircularProgress from '../CircularProgress';
import { formatCompact } from '../../lib/number';
import { s } from '../../lib/i18n';

interface EditorToolOverlayProps {
  charCount: () => number;
  isDirty: () => boolean;
  autosaveEndTime: () => Date | null;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  onSplit: () => void;
  onAnalysis: () => void;
}

const EditorToolOverlay: Component<EditorToolOverlayProps> = (props) => {
  const [dropdownOpen, setDropdownOpen] = createSignal(false);

  const toggleDropdown = () => setDropdownOpen((v) => !v);
  const closeDropdown = () => setDropdownOpen(false);

  const handleAction = (fn: () => void) => {
    closeDropdown();
    fn();
  };

  return (
    <div class="editor-tool-overlay">
      <div class="editor-tool-status">
        <span class="editor-tool-charcount">{s('editor.size', { count: formatCompact(props.charCount()) })}</span>
        <Show when={props.isDirty()} fallback={<TbOutlineCircleCheck size={14} />}>
          <CircularProgress endTime={props.autosaveEndTime()} size={14} strokeWidth={0.4} />
        </Show>
      </div>

      <button class="editor-tool-btn" title={s('editor.undo')} onClick={props.onUndo}>
        <TbOutlineArrowBackUp size={14} />
      </button>
      <button class="editor-tool-btn" title={s('editor.redo')} onClick={props.onRedo}>
        <TbOutlineArrowForwardUp size={14} />
      </button>

      <div class="editor-tool-dropdown-wrap">
        <button class="editor-tool-btn" onClick={toggleDropdown}>
          <TbOutlineDots size={14} />
        </button>
        <Show when={dropdownOpen()}>
          <div class="editor-tool-dropdown-backdrop" onClick={closeDropdown} />
          <div class="editor-tool-dropdown">
            <button class="editor-tool-dropdown-item" onClick={() => handleAction(props.onSave)}>
              <TbOutlineDeviceFloppy size={14} />
              {s('editor.save')}
            </button>
            <button class="editor-tool-dropdown-item" onClick={() => handleAction(props.onSplit)}>
              <TbOutlineArrowsSplit size={14} />
              {s('editor.split')}
            </button>
            <button class="editor-tool-dropdown-item" onClick={() => handleAction(props.onAnalysis)}>
              <TbOutlineAnalyze size={14} />
              {s('editor.analysis')}
            </button>
          </div>
        </Show>
      </div>
    </div>
  );
};

export default EditorToolOverlay;
