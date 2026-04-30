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
import { Show } from 'solid-js';
import CircularProgress from '../CircularProgress';
import Dropdown from '../Dropdown';
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
  return (
    <div class="editor-tool-overlay">
      <div class="editor-tool-status">
        <span class="editor-tool-charcount">
          {s('editor.size', { count: formatCompact(props.charCount()) })}
        </span>
        <Show
          when={props.isDirty()}
          fallback={<TbOutlineCircleCheck size={14} />}
        >
          <CircularProgress
            endTime={props.autosaveEndTime()}
            size={14}
            strokeWidth={0.4}
          />
        </Show>
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
            label: (
              <>
                <span class="icon">
                  <TbOutlineDeviceFloppy size={14} />
                </span>
                {s('editor.save')}
              </>
            ),
            onSelect: props.onSave,
          },
          {
            label: (
              <>
                <span class="icon">
                  <TbOutlineArrowsSplit size={14} />
                </span>
                {s('editor.split')}
              </>
            ),
            onSelect: props.onSplit,
          },
          {
            label: (
              <>
                <span class="icon">
                  <TbOutlineAnalyze size={14} />
                </span>
                {s('editor.analysis')}
              </>
            ),
            onSelect: props.onAnalysis,
          },
        ]}
      />
    </div>
  );
};

export default EditorToolOverlay;
