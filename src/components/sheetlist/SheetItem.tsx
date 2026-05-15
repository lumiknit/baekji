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
import * as Y from 'yjs';
import {
  TbOutlineDotsVertical,
  TbFillTrash,
  TbOutlineRestore,
  TbOutlineArrowMerge,
  TbOutlineReportAnalytics,
  TbOutlineTag,
  TbOutlineSquareArrowUp,
  TbOutlineSquareArrowDown,
  TbOutlineCopy,
  TbOutlineFileExport,
  TbOutlineCheck,
} from 'solid-icons/tb';
import { withSheetDoc } from '../../lib/doc/docCache';
import type { SheetMeta } from '../../lib/doc/v1';
import { activeSheetId, activeProjectDoc } from '../../state/workspace_v1';
import { setSidebarOpen, showUpdatedAt } from '../../state/workspace';
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
  createSheetWithContent,
  isSelectMode,
  enterSelectMode,
} from '../../state/sheet_list';
import { tagToHsl } from '../../lib/tag/color';
import { showConfirm, showTagEdit } from '../../state/modal';
import Dropdown from '../Dropdown';
import { s } from '../../lib/i18n';

type PreviewLine = { text: string; heading: boolean };

function stripMarkdown(line: string): string {
  return line
    .replace(/^#{1,6}\s+/, '')
    .replace(/[*_~`]/g, '')
    .trim();
}

function extractPreview(text: string): PreviewLine[] {
  const lines = text
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .slice(0, 2);
  let remaining = 128;
  return lines.flatMap((l) => {
    if (remaining <= 0) return [];
    const heading = /^#{1,6}\s/.test(l);
    const stripped = stripMarkdown(l).slice(0, remaining);
    remaining -= stripped.length;
    return stripped ? [{ text: stripped, heading }] : [];
  });
}

function extractPreviewFromYText(content: Y.Text): PreviewLine[] {
  let buf = '';
  for (const op of content.toDelta() as Array<{ insert?: unknown }>) {
    if (typeof op.insert === 'string') {
      buf += op.insert;
      const nonEmpty = buf.split('\n').filter((l) => l.trim().length > 0);
      if (nonEmpty.length >= 2)
        return extractPreview(nonEmpty.slice(0, 2).join('\n'));
    }
    if (buf.length > 128) break;
  }
  return extractPreview(buf);
}

interface Props {
  sheet: SheetMeta;
  isTrash?: boolean;
  onOpenSelectionMenu?: () => void;
}

const SheetItem: Component<Props> = (props) => {
  const navigate = useNavigate();
  const [preview, setPreview] = createSignal<PreviewLine[] | null>(null);
  const [menuOpen, setMenuOpen] = createSignal(false);
  const [everVisible, setEverVisible] = createSignal(false);
  const isActive = () => activeSheetId() === props.sheet.id;

  let itemRef: HTMLDivElement | undefined;

  const isLast = () => {
    const sheets = liveSheets();
    return sheets[sheets.length - 1]?.id === props.sheet.id;
  };

  const fetchPreview = async () => {
    const lines = await withSheetDoc(props.sheet.id, async (sd) =>
      extractPreviewFromYText(sd.content),
    );
    setPreview(lines);
  };

  // lazy load: fetch once when the item enters the viewport
  onMount(() => {
    const el = itemRef;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setEverVisible(true);
          fetchPreview();
          observer.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(el);
    onCleanup(() => observer.disconnect());
  });

  // re-fetch on updatedAt change, but only after the first load
  createEffect(() => {
    void props.sheet.updatedAt;
    if (everVisible()) fetchPreview();
  });

  const openMenu = () => {
    if (isSelectMode()) {
      props.onOpenSelectionMenu?.();
    } else {
      setMenuOpen(true);
    }
  };

  const handleClick = (e: MouseEvent) => {
    if (
      (e.target as HTMLElement).closest('.sl-item-actions, .sl-item-checkbox')
    )
      return;

    if (props.isTrash) {
      navigate(`/sheets/${props.sheet.id}`);
      return;
    }

    if (e.shiftKey && isSelectMode()) {
      rangeSelect(props.sheet.id, filteredSheets());
    } else if (e.ctrlKey || e.metaKey) {
      if (!isSelectMode()) enterSelectMode();
      toggleSelect(props.sheet.id);
    } else if (isSelectMode()) {
      toggleSelect(props.sheet.id);
    } else if (isActive() && window.matchMedia('(max-width: 768px)').matches) {
      setSidebarOpen(false);
    } else {
      navigate(`/sheets/${props.sheet.id}`);
    }
  };

  const handleContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    // Allow right-click only on desktop; mobile long-press fires contextmenu and
    // leaves the dropdown open, consuming the next touch as an outside-click.
    if (window.matchMedia('(pointer: fine)').matches) openMenu();
  };

  const handleEditTags = async () => {
    const nextTags = await showTagEdit(s('sheet.edit_tags'), props.sheet.tags);
    if (nextTags === null) return;
    updateSheetTags(props.sheet.id, nextTags);
  };

  const handleDuplicate = async () => {
    const text = await withSheetDoc(props.sheet.id, async (sd) =>
      sd.content.toString(),
    );
    const id = await createSheetWithContent([...props.sheet.tags], text, {
      after: props.sheet.id,
    });
    if (id) navigate(`/sheets/${id}`);
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
        label: s('common.preview_export'),
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
      {
        icon: TbOutlineCopy,
        label: s('sidebar.duplicate_sheet'),
        onSelect: handleDuplicate,
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
      ref={(el) => {
        itemRef = el;
      }}
      id={`sheet-item-${props.sheet.id}`}
      class={`sl-item${isActive() ? ' sl-item--active' : ''}${props.isTrash ? ' sl-item--trash' : ''}${isSelected(props.sheet.id) ? ' sl-item--selected' : ''}${menuOpen() ? ' sl-item--open' : ''}`}
      onClick={handleClick}
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
          class={`sl-item-preview${preview() === null ? ' sl-item-preview--loading' : ''}${preview()?.length === 0 ? ' sl-item-preview--empty' : ''}`}
        >
          <Show when={preview() !== null} fallback="…">
            <Show
              when={preview()!.length > 0}
              fallback={s('sheet.empty_content')}
            >
              <For each={preview()}>
                {(line, i) => (
                  <>
                    <Show when={i() > 0}>{'\n'}</Show>
                    <span
                      class={
                        line.heading ? 'sl-item-preview__heading' : undefined
                      }
                    >
                      {line.text}
                    </span>
                  </>
                )}
              </For>
            </Show>
          </Show>
        </div>
        <Show when={showUpdatedAt()}>
          <div class="sl-item-date">
            {new Date(props.sheet.updatedAt).toLocaleString()}
          </div>
        </Show>
      </div>

      <div class="sl-item-actions">
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
