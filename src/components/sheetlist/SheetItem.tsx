import type { Component } from 'solid-js';
import {
  createSignal,
  createEffect,
  For,
  Show,
  onMount,
  onCleanup,
} from 'solid-js';
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
} from 'solid-icons/tb';
import { readSheetText } from '../../lib/doc/ydoc';
import type { SheetMeta } from '../../lib/doc/v1';
import {
  activeSheetId,
  activeProjectId,
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
  selectedIds,
  createSheet,
  filteredSheets,
} from '../../state/sheet_list';
import { tagToHsl } from '../../lib/tag/color';
import { showConfirm, showTagEdit } from '../../state/modal';
import Dropdown from '../Dropdown';
import { s } from '../../lib/i18n';

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
    const text = await readSheetText(props.sheet.id);
    setPreview(extractPreview(text));
  };

  onMount(() => {
    fetchPreview();
  });

  createEffect(() => {
    // Re-fetch preview when updatedAt changes (e.g. after split or sync)
    void props.sheet.updatedAt;
    fetchPreview();
  });

  {
    let observedContent: import('yjs').Text | null = null;
    const onUpdate = () => {
      const sd = activeSheetDoc();
      if (sd) setPreview(extractPreview(sd.content.toString()));
    };
    createEffect(() => {
      if (observedContent) {
        observedContent.unobserve(onUpdate);
        observedContent = null;
      }
      if (activeSheetId() !== props.sheet.id) return;
      const sd = activeSheetDoc();
      if (!sd) return;
      observedContent = sd.content;
      observedContent.observe(onUpdate);
    });
    onCleanup(() => {
      if (observedContent) observedContent.unobserve(onUpdate);
    });
  }

  const handleClick = () => {
    if (props.isTrash) return;
    if (selectedIds().size > 0) {
      toggleSelect(props.sheet.id);
      return;
    }
    navigate(`/sheets/${props.sheet.id}`);
  };

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
    if (ok) {
      deleteSheetPermanently(props.sheet.id);
    }
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
          const id = activeProjectId();
          if (id) navigate(`/project/${id}/analysis?sheetId=${props.sheet.id}`);
        },
      },
      {
        icon: TbOutlineFileExport,
        label: s('common.export'),
        onSelect: () => {
          const id = activeProjectId();
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

  return (
    <div
      class={`sl-item${isActive() ? ' sl-item--active' : ''}${props.isTrash ? ' sl-item--trash' : ''}${isSelected(props.sheet.id) ? ' sl-item--selected' : ''}${menuOpen() ? ' sl-item--open' : ''}`}
      onClick={handleClick}
      onContextMenu={(e) => {
        e.preventDefault();
        setMenuOpen(true);
      }}
      onPointerDown={props.isTrash ? undefined : props.onDragStart}
    >
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
          <Show when={preview() !== null} fallback="…">
            <Show when={preview()} fallback={s('sheet.empty_content')}>
              {preview()}
            </Show>
          </Show>
        </div>
      </div>

      <div class="sl-item-actions" onClick={(e) => e.stopPropagation()}>
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
      </div>
    </div>
  );
};

export default SheetItem;
