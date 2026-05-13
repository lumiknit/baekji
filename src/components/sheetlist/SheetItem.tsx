import type { Component } from 'solid-js';
import { createSignal, createEffect, For, Show } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import {
  TbOutlineDotsVertical,
  TbFillTrash,
  TbOutlineRestore,
  TbOutlineArrowMerge,
  TbOutlineReportAnalytics,
  TbOutlineTag,
  TbOutlineSquareArrowUp,
  TbOutlineSquareArrowDown,
  TbOutlineFileExport,
  TbOutlineCheck,
} from 'solid-icons/tb';
import { withSheetDoc } from '../../lib/doc/docCache';
import type { SheetMeta } from '../../lib/doc/v1';
import {
  activeSheetId,
  activeProjectDoc,
  activeSheetDoc,
} from '../../state/workspace_v1';
import {
  softDeleteSheet,
  restoreSheet,
  deleteSheetPermanently,
  mergeSheetDown,
  liveSheets,
  updateSheetTags,
  isSelected,
  toggleSelect,
  rangeSelect,
  filteredSheets,
  createSheet,
  isSelectMode,
  enterSelectMode,
} from '../../state/sheet_list';
import { tagToHsl } from '../../lib/tag/color';
import { showConfirm, showTagEdit } from '../../state/modal';
import Dropdown from '../Dropdown';
import { s } from '../../lib/i18n';

const LONG_PRESS_MS = 500;
const DRAG_THRESHOLD_PX = 8;

function stripMarkdown(line: string): string {
  return line
    .replace(/^#{1,6}\s+/, '')
    .replace(/[*_~`]/g, '')
    .trim();
}

interface Props {
  sheet: SheetMeta;
  isTrash?: boolean;
  onDragStart?: (e: PointerEvent) => void;
  onOpenSelectionMenu?: () => void;
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

  const extractPreview = (text: string) => {
    const lines = text
      .slice(0, 300)
      .split('\n')
      .map(stripMarkdown)
      .filter((l) => l.length > 0)
      .slice(0, 2);
    return lines.join('\n') || '';
  };

  const fetchPreview = async () => {
    const text = await withSheetDoc(props.sheet.id, async (sd) =>
      sd.content.toString(),
    );
    setPreview(extractPreview(text));
  };

  createEffect(() => {
    void props.sheet.updatedAt;
    fetchPreview();
  });

  createEffect(() => {
    if (activeSheetId() !== props.sheet.id) return;
    const sd = activeSheetDoc();
    if (!sd) return;
    const onUpdate = () => setPreview(extractPreview(sd.content.toString()));
    sd.content.observe(onUpdate);
    return () => sd.content.unobserve(onUpdate);
  });

  // ─── Gesture handling ─────────────────────────────────────────

  const openMenu = () => {
    if (isSelectMode()) {
      props.onOpenSelectionMenu?.();
    } else {
      setMenuOpen(true);
    }
  };

  const handlePointerDown = (e: PointerEvent) => {
    if (props.isTrash) return;
    if (e.button !== 0) return;

    const startX = e.clientX;
    const startY = e.clientY;
    let ended = false;

    const longPressTimer = setTimeout(() => {
      ended = true;
      cleanup();
      openMenu();
    }, LONG_PRESS_MS);

    const onMove = (me: PointerEvent) => {
      if (
        Math.hypot(me.clientX - startX, me.clientY - startY) > DRAG_THRESHOLD_PX
      ) {
        clearTimeout(longPressTimer);
        ended = true;
        cleanup();
        props.onDragStart?.(me);
      }
    };

    const onUp = (ue: PointerEvent) => {
      clearTimeout(longPressTimer);
      cleanup();
      if (ended) return;

      if (ue.shiftKey && isSelectMode()) {
        rangeSelect(props.sheet.id, filteredSheets());
      } else if (ue.ctrlKey || ue.metaKey) {
        if (!isSelectMode()) enterSelectMode();
        toggleSelect(props.sheet.id);
      } else if (isSelectMode()) {
        toggleSelect(props.sheet.id);
      } else {
        navigate(`/sheets/${props.sheet.id}`);
      }
    };

    const cleanup = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  // Keep for desktop right-click and iOS Safari contextmenu fallback.
  // Long-press timer above covers cases where contextmenu doesn't fire.
  const handleContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    openMenu();
  };

  // ─── Dropdown items ───────────────────────────────────────────

  const handleEditTags = async () => {
    const nextTags = await showTagEdit(s('sheet.edit_tags'), props.sheet.tags);
    if (nextTags === null) return;
    updateSheetTags(props.sheet.id, nextTags);
  };

  const handleDeletePermanently = async () => {
    const ok = await showConfirm(
      s('sheet.delete_permanent'),
      s('sheet.delete_permanent_confirm'),
    );
    if (ok) deleteSheetPermanently(props.sheet.id);
  };

  const dropdownItems = () => {
    if (props.isTrash) return [];
    const items: Parameters<typeof Dropdown>[0]['items'] = [
      {
        icon: TbOutlineTag,
        label: s('sheet.edit_tags'),
        onSelect: handleEditTags,
      },
      {
        icon: TbOutlineReportAnalytics,
        label: s('common.analysis'),
        onSelect: () => {
          const id = activeProjectDoc()?.id;
          if (id) navigate(`/project/${id}/analysis?sheetId=${props.sheet.id}`);
        },
      },
      {
        icon: TbOutlineFileExport,
        label: s('common.export'),
        onSelect: () => {
          const id = activeProjectDoc()?.id;
          if (id) navigate(`/project/${id}/export?sheetId=${props.sheet.id}`);
        },
      },
      { separator: true as const },
      {
        icon: TbOutlineSquareArrowUp,
        label: s('sidebar.new_sheet_above'),
        onSelect: () => {
          const id = createSheet([...props.sheet.tags], {
            before: props.sheet.id,
          });
          if (id) navigate(`/sheets/${id}`);
        },
      },
      {
        icon: TbOutlineSquareArrowDown,
        label: s('sidebar.new_sheet_below'),
        onSelect: () => {
          const id = createSheet([...props.sheet.tags], {
            after: props.sheet.id,
          });
          if (id) navigate(`/sheets/${id}`);
        },
      },
      { separator: true as const },
    ];
    if (!isLast()) {
      items.push({
        icon: TbOutlineArrowMerge,
        label: s('tree.merge_down'),
        onSelect: () => mergeSheetDown(props.sheet.id, filteredSheets()),
      });
    }
    items.push({
      icon: TbFillTrash,
      label: s('common.delete'),
      danger: true,
      onSelect: () => softDeleteSheet(props.sheet.id),
    });
    return items;
  };

  // ─── Render ───────────────────────────────────────────────────

  return (
    <div
      class={`sl-item${isActive() ? ' sl-item--active' : ''}${props.isTrash ? ' sl-item--trash' : ''}${isSelected(props.sheet.id) ? ' sl-item--selected' : ''}${menuOpen() ? ' sl-item--open' : ''}`}
      onPointerDown={handlePointerDown}
      onContextMenu={handleContextMenu}
    >
      <Show when={isSelectMode() && !props.isTrash}>
        <div class="sl-item-checkbox">
          <Show when={isSelected(props.sheet.id)}>
            <TbOutlineCheck />
          </Show>
        </div>
      </Show>

      <div class="sl-item-body">
        <Show when={props.sheet.tags.length > 0}>
          <div class="sl-item-tags">
            <For each={props.sheet.tags}>
              {(tag) => {
                const { h, s: sat } = tagToHsl(tag);
                return (
                  <span
                    class="tag"
                    style={{
                      background: `hsl(${h}deg ${sat}% 60% / 0.25)`,
                      color: `hsl(${h}deg ${sat}% var(--color-l))`,
                    }}
                  >
                    {tag}
                  </span>
                );
              }}
            </For>
          </div>
        </Show>
        <div
          class={`sl-item-preview${preview() === null ? ' sl-item-preview--loading' : ''}${preview() === '' ? ' sl-item-preview--empty' : ''}`}
        >
          {preview() === null ? '…' : preview() || s('sheet.empty_content')}
        </div>
      </div>

      <div class="sl-item-actions" onPointerDown={(e) => e.stopPropagation()}>
        <Show
          when={!props.isTrash}
          fallback={
            <>
              <button
                class="sb-icon-btn"
                title={s('sheet.restore')}
                onClick={() => restoreSheet(props.sheet.id)}
              >
                <div class="btn-pad">
                  <TbOutlineRestore />
                </div>
              </button>
              <button
                class="sb-icon-btn"
                title={s('sheet.delete_permanent')}
                onClick={handleDeletePermanently}
              >
                <div class="btn-pad">
                  <TbFillTrash />
                </div>
              </button>
            </>
          }
        >
          <Show when={!isSelectMode()}>
            <Dropdown
              triggerClass="sb-icon-btn"
              triggerAriaLabel={s('sheet.more_actions')}
              align="right"
              open={menuOpen}
              onOpenChange={setMenuOpen}
              trigger={
                <div class="btn-pad">
                  <TbOutlineDotsVertical />
                </div>
              }
              items={dropdownItems()}
            />
          </Show>
        </Show>
      </div>
    </div>
  );
};

export default SheetItem;
