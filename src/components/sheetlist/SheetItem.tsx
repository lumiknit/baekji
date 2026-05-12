import type { Component } from 'solid-js';
import { createSignal, For, Show, onMount } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import {
  TbOutlineDotsVertical,
  TbFillTrash,
  TbOutlineRestore,
  TbOutlineArrowMerge,
  TbOutlineReportAnalytics,
  TbOutlineTag,
} from 'solid-icons/tb';
import { openSheetDoc, closeSheetDoc, waitForSync } from '../../lib/doc/ydoc';
import type { SheetMeta } from '../../lib/doc/v1';
import { activeSheetId } from '../../state/workspace_v1';
import {
  softDeleteSheet,
  restoreSheet,
  deleteSheetPermanently,
  mergeSheetDown,
  liveSheets,
  updateSheetTags,
} from '../../state/sheet_list';
import { tagToHsl } from '../../lib/tag/color';
import { isValidTag } from '../../lib/tag/query';
import { showPrompt } from '../../state/modal';
import Dropdown from '../Dropdown';

function stripMarkdown(line: string): string {
  return line.replace(/^#{1,6}\s+/, '').replace(/[*_~`]/g, '').trim();
}

interface Props {
  sheet: SheetMeta;
  isTrash?: boolean;
  onDragStart?: (e: PointerEvent) => void;
}

const SheetItem: Component<Props> = (props) => {
  const navigate = useNavigate();
  const [preview, setPreview] = createSignal<string | null>(null);
  const [menuOpen, setMenuOpen] = createSignal(false);
  const isActive = () => activeSheetId() === props.sheet.id;
  const isLast = () => {
    const sheets = liveSheets();
    return sheets[sheets.length - 1]?.id === props.sheet.id;
  };

  onMount(async () => {
    const sd = openSheetDoc(props.sheet.id);
    await waitForSync(sd.provider);
    const text = sd.content.toString().slice(0, 300);
    closeSheetDoc(sd);

    const lines = text
      .split('\n')
      .map(stripMarkdown)
      .filter((l) => l.length > 0)
      .slice(0, 3);
    setPreview(lines.join(' ') || null);
  });

  const handleClick = () => {
    if (props.isTrash) return;
    navigate(`/sheets/${props.sheet.id}`);
  };

  const handleEditTags = async () => {
    const current = props.sheet.tags.join(', ');
    const input = await showPrompt('태그 편집', '태그를 쉼표로 구분하여 입력하세요', current);
    if (input === null) return;
    const tags = input
      .split(',')
      .map((t) => t.trim())
      .filter((t) => isValidTag(t));
    updateSheetTags(props.sheet.id, tags);
  };

  const dropdownItems = () => {
    if (props.isTrash) return [];
    const items: Parameters<typeof Dropdown>[0]['items'] = [
      { icon: TbOutlineTag, label: '태그 편집', onSelect: handleEditTags },
      { icon: TbOutlineReportAnalytics, label: '분석', onSelect: () => navigate(`/sheets/${props.sheet.id}/analysis`) },
      { separator: true as const },
    ];
    if (!isLast()) {
      items.push({ icon: TbOutlineArrowMerge, label: '아래 시트와 합치기', onSelect: () => mergeSheetDown(props.sheet.id) });
    }
    items.push({ icon: TbFillTrash, label: '삭제', danger: true, onSelect: () => softDeleteSheet(props.sheet.id) });
    return items;
  };

  return (
    <div
      class={`sl-item${isActive() ? ' sl-item--active' : ''}${props.isTrash ? ' sl-item--trash' : ''}`}
      onClick={handleClick}
      onPointerDown={props.isTrash ? undefined : props.onDragStart}
    >
      <div class="sl-item-body">
        <Show when={props.sheet.tags.length > 0}>
          <div class="sl-item-tags">
            <For each={props.sheet.tags}>
              {(tag) => {
                const { h, s } = tagToHsl(tag);
                return (
                  <span
                    class="sl-tag"
                    style={{ background: `hsl(${h}deg ${s}% 60% / 0.25)`, color: `hsl(${h}deg ${s}% 35%)` }}
                  >
                    {tag}
                  </span>
                );
              }}
            </For>
          </div>
        </Show>
        <div class={`sl-item-preview${preview() === null ? ' sl-item-preview--loading' : ''}${preview() === '' ? ' sl-item-preview--empty' : ''}`}>
          <Show when={preview() !== null} fallback="…">
            <Show when={preview()} fallback="(비어 있음)">{preview()}</Show>
          </Show>
        </div>
      </div>

      <div class="sl-item-actions" onClick={(e) => e.stopPropagation()}>
        <Show
          when={!props.isTrash}
          fallback={
            <>
              <button class="sb-icon-btn" title="복원" onClick={() => restoreSheet(props.sheet.id)}>
                <div class="btn-pad"><TbOutlineRestore /></div>
              </button>
              <button class="sb-icon-btn" title="영구 삭제" onClick={() => deleteSheetPermanently(props.sheet.id)}>
                <div class="btn-pad"><TbFillTrash /></div>
              </button>
            </>
          }
        >
          <Dropdown
            triggerClass="sb-icon-btn"
            triggerAriaLabel="더보기"
            align="right"
            open={menuOpen}
            onOpenChange={setMenuOpen}
            trigger={<div class="btn-pad"><TbOutlineDotsVertical /></div>}
            items={dropdownItems()}
          />
        </Show>
      </div>
    </div>
  );
};

export default SheetItem;
