import type { Component } from 'solid-js';
import { For, Show, createSignal, onMount, onCleanup } from 'solid-js';
import { A, useNavigate } from '@solidjs/router';
import {
  TbOutlineFilePlus,
  TbFillTrash,
  TbOutlineChevronDown,
  TbOutlineChevronRight,
  TbOutlineDotsVertical,
  TbOutlineSearch,
  TbOutlineFileImport,
  TbOutlineListCheck,
  TbOutlinePlus,
  TbOutlineFilter,
  TbOutlineTag,
} from 'solid-icons/tb';
import Sortable from 'sortablejs';
import {
  filteredSheets,
  filteredSheetIds,
  liveSheets,
  trashSortedIds,
  createSheet,
  createSheetWithContent,
  emptyTrash,
  reorderSheet,
  orderKeyBetween,
  orderKeysBetween,
  filterQuery,
  selectedIds,
  softDeleteSheet,
  selectAll,
  clearSelection,
  isSelectMode,
  enterSelectMode,
  exitSelectMode,
  updateSelectedSheetTags,
} from '../../state/sheet_list.ts';
import {
  activeProjectId,
  activeProjectLabel,
  activeSheetId,
} from '../../state/workspace_v3.ts';
import {
  setSidebarView,
  showUpdatedAt,
  setShowUpdatedAt,
} from '../../state/workspace.ts';
import {
  openProjectSearchModal,
  showConfirm,
  showTagEdit,
} from '../../state/modal.ts';
import TagFilterInput from './TagFilterInput.tsx';
import SheetItem from './SheetItem.tsx';
import Dropdown from '../Dropdown.tsx';
import { s } from '../../lib/i18n/index.ts';
import toast from 'solid-toast';

const SheetList: Component = () => {
  const navigate = useNavigate();
  const [trashOpen, setTrashOpen] = createSignal(false);
  const [addMenuOpen, setAddMenuOpen] = createSignal(false);
  const [filterOpen, setFilterOpen] = createSignal(false);
  const [projectMenuOpen, setProjectMenuOpen] = createSignal(false);
  const [selectionMenuOpen, setSelectionMenuOpen] = createSignal(false);

  const handleToggleFilter = () => {
    setFilterOpen((v) => !v);
  };

  const projectLabel = activeProjectLabel;

  let listEl: HTMLDivElement | undefined;
  let sortable: Sortable | undefined;

  onMount(() => {
    if (!listEl) return;

    // Store the original DOM position before drag so we can revert it
    // before SolidJS re-renders (node ref is safer than index with mixed children).
    let originalNextSibling: Node | null = null;
    let originalParent: Node | null = null;

    sortable = Sortable.create(listEl, {
      animation: 150,
      delay: 200,
      delayOnTouchOnly: true,
      touchStartThreshold: 6,
      filter: '.tree-trash-section, .sl-item-actions, .sl-item-checkbox',
      draggable: '.sl-item-wrap',
      ghostClass: 'sl-item--ghost',
      chosenClass: 'sl-item--chosen',
      onStart(evt) {
        originalNextSibling = evt.item.nextSibling;
        originalParent = evt.item.parentNode;
      },
      onEnd(evt) {
        const draggedId = evt.item.dataset.sheetId;
        const oldIdx = evt.oldDraggableIndex;
        const newIdx = evt.newDraggableIndex;

        // Revert the DOM move so SolidJS <For> re-renders from a clean state.
        if (originalParent && evt.item.parentNode === originalParent) {
          originalParent.insertBefore(evt.item, originalNextSibling);
        }
        originalNextSibling = null;
        originalParent = null;

        if (
          !draggedId ||
          oldIdx === undefined ||
          newIdx === undefined ||
          oldIdx === newIdx
        )
          return;

        const sheets = filteredSheets();

        if (isSelectMode() && selectedIds().has(draggedId)) {
          const selectedSet = selectedIds();
          const orderedSelected = liveSheets()
            .filter((s) => selectedSet.has(s.id))
            .map((s) => s.id);
          const beforeKey = sheets[newIdx - 1]?.orderKey ?? null;
          const afterKey = sheets[newIdx]?.orderKey ?? null;
          const keys = orderKeysBetween(
            orderedSelected.length,
            beforeKey,
            afterKey,
          );
          Promise.all(
            orderedSelected.map((id, i) => reorderSheet(id, keys[i])),
          );
        } else {
          const newKey = orderKeyBetween(
            oldIdx < newIdx
              ? (sheets[newIdx]?.orderKey ?? null)
              : (sheets[newIdx - 1]?.orderKey ?? null),
            oldIdx < newIdx
              ? (sheets[newIdx + 1]?.orderKey ?? null)
              : (sheets[newIdx]?.orderKey ?? null),
          );
          reorderSheet(draggedId, newKey);
        }
      },
    });
  });
  onCleanup(() => sortable?.destroy());

  const activeSheetOption = () => {
    const id = activeSheetId();
    return id ? { after: id } : undefined;
  };

  const handleNewSheet = async () => {
    const id = await createSheet([], activeSheetOption());
    if (id) navigate(`/sheets/${id}`);
  };

  const handleImportFile = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.md,.txt';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const text = await file.text();
      const id = await createSheetWithContent([], text, activeSheetOption());
      if (id) navigate(`/sheets/${id}`);
    };
    input.click();
  };

  return (
    <div class="tree-view">
      <Show
        when={activeProjectId()}
        fallback={
          <div class="tree-no-project">
            <span class="tree-no-project-label">{s('tree.no_project')}</span>
            <button
              class="btn-border btn-sm"
              onClick={() => setSidebarView('projects')}
            >
              {s('tree.view_list')}
            </button>
          </div>
        }
      >
        <div class="sb-header sidebar-project-header">
          <div class="sidebar-project-header-row">
            <A href={`/project/${activeProjectId()}`} class="tree-project-link">
              <div class="btn-pad">
                <span class="tree-project-name">{projectLabel()}</span>
              </div>
            </A>

            <div class="tree-project-header-btns">
              <Dropdown
                triggerClass="sb-icon-btn sb-icon-btn--sm"
                triggerAriaLabel={s('sidebar.new_sheet')}
                align="right"
                open={addMenuOpen}
                onOpenChange={setAddMenuOpen}
                trigger={
                  <div class="btn-pad">
                    <TbOutlinePlus />
                  </div>
                }
                items={[
                  {
                    icon: TbOutlineFilePlus,
                    label: s('sidebar.new_sheet'),
                    onSelect: handleNewSheet,
                  },
                  {
                    icon: TbOutlineFileImport,
                    label: s('common.import_sheet_from_file'),
                    onSelect: handleImportFile,
                  },
                ]}
              />
              <button
                class={`sb-icon-btn sb-icon-btn--sm${filterOpen() ? ' sb-icon-btn--active' : ''}`}
                style={filterQuery() ? 'color: var(--hl)' : undefined}
                title={s('sidebar.filter_toggle')}
                onClick={handleToggleFilter}
              >
                <div class="btn-pad">
                  <TbOutlineFilter />
                </div>
              </button>
              <Dropdown
                triggerClass="sb-icon-btn sb-icon-btn--sm"
                triggerAriaLabel={s('sidebar.more_actions')}
                align="right"
                open={projectMenuOpen}
                onOpenChange={setProjectMenuOpen}
                trigger={
                  <div class="btn-pad">
                    <TbOutlineDotsVertical />
                  </div>
                }
                items={[
                  {
                    icon: TbOutlineSearch,
                    label: s('common.search'),
                    onSelect: openProjectSearchModal,
                  },
                  { separator: true },
                  {
                    icon: TbOutlineListCheck,
                    label: s('tree.select_mode'),
                    onSelect: () =>
                      enterSelectMode(activeSheetId() ?? undefined),
                  },
                  { separator: true },
                  {
                    label: s('tree.show_updated_at'),
                    checked: showUpdatedAt(),
                    onSelect: () => setShowUpdatedAt((v) => !v),
                  },
                ]}
              />
            </div>
          </div>

          <Show when={filterOpen()}>
            <TagFilterInput />
          </Show>

          <Show when={isSelectMode()}>
            <div class="sl-selection-bar">
              <Dropdown
                triggerClass="sl-selection-bar-trigger"
                triggerAriaLabel={s('sidebar.more_actions')}
                align="left"
                direction="down"
                open={selectionMenuOpen}
                onOpenChange={setSelectionMenuOpen}
                trigger={
                  <span>
                    {s('tree.selected_count_label', {
                      count: selectedIds().size,
                    })}
                    {' ▾'}
                  </span>
                }
                items={[
                  { label: s('tree.select_all'), onSelect: selectAll },
                  { label: s('tree.deselect_all'), onSelect: clearSelection },
                  { separator: true },
                  {
                    icon: TbOutlineTag,
                    label: s('sheet.edit_tags'),
                    onSelect: async () => {
                      const ids = [...selectedIds()];
                      if (ids.length === 0) return;
                      const sheets = liveSheets();
                      const merged = Array.from(
                        new Set(
                          ids.flatMap(
                            (id) => sheets.find((s) => s.id === id)?.tags ?? [],
                          ),
                        ),
                      );
                      const nextTags = await showTagEdit(
                        s('sheet.edit_tags'),
                        merged,
                      );
                      if (nextTags === null) return;
                      updateSelectedSheetTags(ids, nextTags);
                    },
                  },
                  { separator: true },
                  ...(selectedIds().size === 2
                    ? [
                        {
                          label: s('tree.compare_merge'),
                          onSelect: () => {
                            const [idA, idB] = [...selectedIds()];
                            exitSelectMode();
                            navigate(`/compare/${idA}/${idB}`);
                          },
                        },
                      ]
                    : []),
                  {
                    icon: TbFillTrash,
                    label: s('tree.delete_selected'),
                    danger: true,
                    onSelect: async () => {
                      const ids = [...selectedIds()];
                      if (ids.length === 0) return;
                      const ok = await showConfirm(
                        s('tree.delete_selected'),
                        s('tree.delete_selected_confirm', {
                          count: ids.length,
                        }),
                      );
                      if (!ok) return;
                      await Promise.all(ids.map((id) => softDeleteSheet(id)));
                      toast.success(
                        s('sheet.toast_deleted_count', { count: ids.length }),
                      );
                      exitSelectMode();
                    },
                  },
                ]}
              />
              <button class="btn-border btn-sm" onClick={exitSelectMode}>
                {s('tree.select_mode_exit')}
              </button>
            </div>
          </Show>
        </div>

        <div class="sl-list" ref={(el) => (listEl = el)}>
          <For each={filteredSheetIds()}>
            {(id) => (
              <div data-sheet-id={id} class="sl-item-wrap">
                <SheetItem
                  id={id}
                  onOpenSelectionMenu={() => {
                    setSelectionMenuOpen(true);
                  }}
                />
              </div>
            )}
          </For>

          <Show when={filteredSheetIds().length === 0}>
            <div class="tree-trash-empty-msg">
              {filterQuery() ? s('sheet.no_match') : s('sheet.empty')}
            </div>
          </Show>

          <div class="tree-trash-section">
            <button
              class="tree-trash-header"
              onClick={() => setTrashOpen((v) => !v)}
            >
              <span class="icon">
                {trashOpen() ? (
                  <TbOutlineChevronDown />
                ) : (
                  <TbOutlineChevronRight />
                )}
              </span>
              <span class="icon">
                <TbFillTrash />
              </span>
              <span class="tree-trash-label">{s('tree.trash')}</span>
              <Show when={trashSortedIds().length > 0}>
                <span class="tree-trash-count">{trashSortedIds().length}</span>
                <button
                  class="tree-trash-empty-btn sb-icon-btn"
                  title={s('tree.trash_empty_btn')}
                  onClick={async (e) => {
                    e.stopPropagation();
                    const ok = await showConfirm(
                      s('tree.trash_empty_btn'),
                      s('tree.trash_empty_confirm'),
                    );
                    if (ok) {
                      await emptyTrash();
                      toast.success(s('sheet.toast_trash_emptied'));
                    }
                  }}
                >
                  <div class="btn-pad">
                    <TbFillTrash />
                  </div>
                </button>
              </Show>
            </button>

            <Show when={trashOpen()}>
              <Show
                when={trashSortedIds().length > 0}
                fallback={
                  <div class="tree-trash-empty-msg">
                    {s('tree.trash_empty')}
                  </div>
                }
              >
                <For each={trashSortedIds()}>
                  {(id) => <SheetItem id={id} isTrash />}
                </For>
              </Show>
            </Show>
          </div>
        </div>
      </Show>
    </div>
  );
};

export default SheetList;
