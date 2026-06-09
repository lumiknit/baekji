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
  TbOutlineSquareArrowUp,
  TbOutlineSquareArrowDown,
  TbOutlineCopy,
  TbOutlineCheck,
} from 'solid-icons/tb';
import { loadSheetContent } from '../../lib/doc/db_v3.ts';
import { activeSheetId } from '../../state/workspace_v3.ts';
import { setSidebarOpen, showUpdatedAt } from '../../state/workspace.ts';
import {
  sheetsStore,
  sheetStatsStore,
  liveSortedIds,
  softDeleteSheet,
  restoreSheet,
  deleteSheetPermanently,
  mergeSheetDown,
  isSelected,
  toggleSelect,
  rangeSelect,
  filteredSheets,
  createSheet,
  createSheetWithContent,
  isSelectMode,
  enterSelectMode,
  previewVersion,
} from '../../state/sheet_list.ts';
import { tagToHsl } from '../../lib/tag/color.ts';
import { showConfirm } from '../../state/modal.ts';
import Dropdown from '../Dropdown.tsx';
import { s } from '../../lib/i18n/index.ts';
import toast from 'solid-toast';

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

interface Props {
  id: string;
  isTrash?: boolean;
  onOpenSelectionMenu?: () => void;
}

const SheetItem: Component<Props> = (props) => {
  const navigate = useNavigate();
  const [preview, setPreview] = createSignal<PreviewLine[] | null>(null);
  const [menuOpen, setMenuOpen] = createSignal(false);
  const [everVisible, setEverVisible] = createSignal(false);
  const sheet = () => sheetsStore[props.id];
  const isActive = () => activeSheetId() === props.id;

  let itemRef: HTMLDivElement | undefined;

  const isLast = () => {
    const ids = liveSortedIds();
    return ids[ids.length - 1] === props.id;
  };

  const fetchPreview = async () => {
    const text = await loadSheetContent(props.id);
    setPreview(extractPreview(text));
  };

  // Re-fetch preview when content is flushed (only if this is the active sheet)
  createEffect(() => {
    previewVersion(); // subscribe
    if (isActive() && everVisible()) {
      fetchPreview();
    }
  });

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
    void sheetStatsStore[props.id]?.updatedAt;
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
      navigate(`/sheets/${props.id}`);
      return;
    }

    if (e.shiftKey && isSelectMode()) {
      rangeSelect(props.id, filteredSheets());
    } else if (e.shiftKey || e.ctrlKey || e.metaKey) {
      if (!isSelectMode()) {
        // Enter select mode with active sheet pre-selected as anchor
        const active = activeSheetId();
        enterSelectMode(active ?? undefined);
      }
      if (props.id !== activeSheetId()) toggleSelect(props.id);
    } else if (isSelectMode()) {
      toggleSelect(props.id);
    } else if (
      isActive() &&
      globalThis.matchMedia('(max-width: 768px)').matches
    ) {
      setSidebarOpen(false);
    } else {
      navigate(`/sheets/${props.id}`);
    }
  };

  const handleContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    // Allow right-click only on desktop; mobile long-press fires contextmenu and
    // leaves the dropdown open, consuming the next touch as an outside-click.
    if (globalThis.matchMedia('(pointer: fine)').matches) openMenu();
  };

  const handleDuplicate = async () => {
    const text = await loadSheetContent(props.id);
    const newId = await createSheetWithContent(
      [...(sheet()?.tags ?? [])],
      text,
      {
        after: props.id,
      },
    );
    if (newId) navigate(`/sheets/${newId}`);
  };

  const handleDeletePermanently = async () => {
    const ok = await showConfirm(
      s('sheet.delete_permanent'),
      s('sheet.delete_permanent_confirm'),
    );
    if (ok) {
      deleteSheetPermanently(props.id);
      toast.success(s('sheet.toast_permanently_deleted'));
    }
  };

  const dropdownItems = () => {
    if (props.isTrash) return [];
    const items: Parameters<typeof Dropdown>[0]['items'] = [
      {
        icon: TbOutlineSquareArrowUp,
        label: s('sidebar.new_sheet_above'),
        onSelect: async () => {
          const newId = await createSheet([...(sheet()?.tags ?? [])], {
            before: props.id,
          });
          if (newId) navigate(`/sheets/${newId}`);
        },
      },
      {
        icon: TbOutlineSquareArrowDown,
        label: s('sidebar.new_sheet_below'),
        onSelect: async () => {
          const newId = await createSheet([...(sheet()?.tags ?? [])], {
            after: props.id,
          });
          if (newId) navigate(`/sheets/${newId}`);
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
        onSelect: () => mergeSheetDown(props.id, filteredSheets()),
      });
    }
    items.push({
      icon: TbFillTrash,
      label: s('common.delete'),
      danger: true,
      onSelect: () => {
        softDeleteSheet(props.id);
        toast.success(s('sheet.toast_deleted'));
      },
    });
    return items;
  };

  return (
    <div
      ref={(el) => {
        itemRef = el;
      }}
      id={`sheet-item-${props.id}`}
      class={`sl-item${isActive() ? ' sl-item--active' : ''}${props.isTrash ? ' sl-item--trash' : ''}${isSelected(props.id) ? ' sl-item--selected' : ''}${menuOpen() ? ' sl-item--open' : ''}`}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
    >
      <Show when={isSelectMode() && !props.isTrash}>
        <div class="sl-item-checkbox">
          <Show when={isSelected(props.id)}>
            <TbOutlineCheck />
          </Show>
        </div>
      </Show>

      <div class="sl-item-body">
        <Show when={(sheet()?.tags.length ?? 0) > 0}>
          <div class="sl-item-tags">
            <For each={sheet()?.tags ?? []}>
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
            {new Date(
              sheetStatsStore[props.id]?.updatedAt ?? '',
            ).toLocaleString()}
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
                onClick={() => {
                  restoreSheet(props.id);
                  toast.success(s('sheet.toast_restored'));
                }}
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
