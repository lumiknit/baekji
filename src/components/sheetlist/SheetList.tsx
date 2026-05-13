import type { Component } from 'solid-js';
import { For, Show, createSignal } from 'solid-js';
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
} from 'solid-icons/tb';
import BackupIcon from '../BackupIcon';
import {
  filteredSheets,
  liveSheets,
  trashSheets,
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
} from '../../state/sheet_list';
import {
  activeProjectDoc,
  activeProjectId,
  activeProjectLabel,
  activeSheetId,
} from '../../state/workspace_v1';
import { setSidebarView } from '../../state/workspace';
import {
  openBackupModal,
  openProjectSearchModal,
  showConfirm,
} from '../../state/modal';
import TagFilterInput from './TagFilterInput';
import SheetItem from './SheetItem';
import Dropdown from '../Dropdown';
import type { SheetMeta } from '../../lib/doc/v1';
import { s } from '../../lib/i18n';

// ─── Drag-and-drop ────────────────────────────────────────────────

function useDrag(getSheets: () => SheetMeta[]) {
  const [draggingId, setDraggingId] = createSignal<string | null>(null);
  const [dropIndex, setDropIndex] = createSignal<number | null>(null);

  const computeDropIndex = (clientY: number) => {
    const sheets = getSheets();
    const els = document.querySelectorAll<HTMLElement>('[data-sheet-id]');
    let idx = sheets.length;
    for (const el of els) {
      const rect = el.getBoundingClientRect();
      const elId = el.dataset.sheetId!;
      const elIdx = sheets.findIndex((s) => s.id === elId);
      if (clientY < rect.top + rect.height / 2) {
        idx = elIdx;
        break;
      }
    }
    setDropIndex(idx);
  };

  const startDrag = (e: PointerEvent, id: string) => {
    setDraggingId(id);
    computeDropIndex(e.clientY);

    const onMove = (me: PointerEvent) => {
      me.preventDefault();
      computeDropIndex(me.clientY);
    };

    const onUp = () => {
      const dragId = draggingId();
      const target = dropIndex();
      if (dragId !== null && target !== null) {
        const sheets = getSheets();
        const selected =
          isSelectMode() && selectedIds().has(dragId)
            ? sheets.filter((s) => selectedIds().has(s.id)).map((s) => s.id)
            : [dragId];

        if (selected.length === 1) {
          const fromIdx = sheets.findIndex((s) => s.id === dragId);
          if (fromIdx !== -1 && target !== fromIdx && target !== fromIdx + 1) {
            const newKey = orderKeyBetween(
              fromIdx < target
                ? (sheets[target]?.orderKey ?? null)
                : (sheets[target - 1]?.orderKey ?? null),
              fromIdx < target
                ? (sheets[target + 1]?.orderKey ?? null)
                : (sheets[target]?.orderKey ?? null),
            );
            reorderSheet(dragId, newKey);
          }
        } else {
          // target is an index into filteredSheets; convert to orderKey bounds
          const filtered = getSheets(); // filteredSheets
          const beforeKey = filtered[target - 1]?.orderKey ?? null;
          const afterKey = filtered[target]?.orderKey ?? null;

          // Build the ordered list of selected IDs from liveSheets (preserving original order)
          const selectedSet = new Set(selected);
          const allOrdered = liveSheets();
          const orderedSelected = allOrdered
            .filter((s) => selectedSet.has(s.id))
            .map((s) => s.id);

          const keys = orderKeysBetween(
            orderedSelected.length,
            beforeKey,
            afterKey,
          );
          orderedSelected.forEach((id, i) => reorderSheet(id, keys[i]));
        }
      }
      setDraggingId(null);
      setDropIndex(null);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
  };

  return { draggingId, dropIndex, startDrag };
}

// ─── SheetList ────────────────────────────────────────────────────

const SheetList: Component = () => {
  const navigate = useNavigate();
  const [trashOpen, setTrashOpen] = createSignal(false);
  const [projectMenuOpen, setProjectMenuOpen] = createSignal(false);
  const [selectionMenuOpen, setSelectionMenuOpen] = createSignal(false);

  const projectLabel = activeProjectLabel;

  const { draggingId, dropIndex, startDrag } = useDrag(filteredSheets);

  const activeSheetOption = () => {
    const id = activeSheetId();
    return id ? { after: id } : undefined;
  };

  const handleNewSheet = () => {
    const id = createSheet([], activeSheetOption());
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
        when={activeProjectDoc()}
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
          <A href={`/project/${activeProjectId()}`} class="tree-project-link">
            <div class="btn-pad">
              <span class="tree-project-name">{projectLabel()}</span>
            </div>
          </A>

          <div class="tree-project-header-btns">
            <button
              class="sb-icon-btn"
              title={s('backup.title')}
              onClick={openBackupModal}
            >
              <div class="btn-pad">
                <BackupIcon />
              </div>
            </button>
            <Dropdown
              triggerClass="sb-icon-btn"
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
                { separator: true },
                {
                  icon: TbOutlineListCheck,
                  label: s('tree.select_mode'),
                  onSelect: enterSelectMode,
                },
              ]}
            />
          </div>
        </div>

        <div class="sl-toolbar">
          <TagFilterInput />
        </div>

        <Show when={isSelectMode()}>
          <div class="sl-selection-bar">
            <Dropdown
              triggerClass="sl-selection-bar-trigger"
              triggerAriaLabel={s('sidebar.more_actions')}
              align="left"
              direction="up"
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
                      s('tree.delete_selected_confirm', { count: ids.length }),
                    );
                    if (!ok) return;
                    for (const id of ids) softDeleteSheet(id);
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

        <div class="sl-list">
          <For each={filteredSheets()}>
            {(sheet, idx) => (
              <div
                data-sheet-id={sheet.id}
                class="sl-item-wrap"
                classList={{ 'sl-item--dragging': draggingId() === sheet.id }}
              >
                <Show when={dropIndex() === idx() && draggingId() !== sheet.id}>
                  <div class="sl-drop-line sl-drop-line--top" />
                </Show>
                <SheetItem
                  sheet={sheet}
                  onDragStart={(e) => startDrag(e, sheet.id)}
                  onOpenSelectionMenu={() => {
                    setSelectionMenuOpen(true);
                  }}
                />
              </div>
            )}
          </For>
          <Show when={dropIndex() === filteredSheets().length}>
            <div class="sl-drop-line" />
          </Show>

          <Show when={filteredSheets().length === 0}>
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
              <Show when={trashSheets().length > 0}>
                <span class="tree-trash-count">{trashSheets().length}</span>
                <button
                  class="tree-trash-empty-btn sb-icon-btn"
                  title={s('tree.trash_empty_btn')}
                  onClick={async (e) => {
                    e.stopPropagation();
                    const ok = await showConfirm(
                      s('tree.trash_empty_btn'),
                      s('tree.trash_empty_confirm'),
                    );
                    if (ok) emptyTrash();
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
                when={trashSheets().length > 0}
                fallback={
                  <div class="tree-trash-empty-msg">
                    {s('tree.trash_empty')}
                  </div>
                }
              >
                <For each={trashSheets()}>
                  {(sheet) => <SheetItem sheet={sheet} isTrash />}
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
