import type { Component } from 'solid-js';
import { For, Show, createSignal } from 'solid-js';
import { A, useNavigate } from '@solidjs/router';
import {
  TbOutlineFilePlus,
  TbFillTrash,
  TbOutlineChevronDown,
  TbOutlineChevronRight,
  TbOutlineDotsVertical,
} from 'solid-icons/tb';
import {
  filteredSheets,
  trashSheets,
  createSheet,
  emptyTrash,
  reorderSheet,
  orderKeyBetween,
  filterQuery,
} from '../../state/sheet_list';
import { activeProjectDoc, activeProjectId, activeProjectLabel } from '../../state/workspace_v1';
import { setSidebarView } from '../../state/workspace';
import TagFilterInput from './TagFilterInput';
import SheetItem from './SheetItem';
import Dropdown from '../Dropdown';
import type { SheetMeta } from '../../lib/doc/v1';

// ─── Drag-and-drop ────────────────────────────────────────────────

function useDrag(getSheets: () => SheetMeta[]) {
  const [draggingId, setDraggingId] = createSignal<string | null>(null);
  const [dropIndex, setDropIndex] = createSignal<number | null>(null);

  const startDrag = (e: PointerEvent, id: string) => {
    e.preventDefault();
    setDraggingId(id);

    const onMove = (me: PointerEvent) => {
      const sheets = getSheets();
      const els = document.querySelectorAll<HTMLElement>('[data-sheet-id]');
      let idx = sheets.length;
      for (const el of els) {
        const rect = el.getBoundingClientRect();
        const mid = rect.top + rect.height / 2;
        const elId = el.dataset.sheetId!;
        const elIdx = sheets.findIndex((s) => s.id === elId);
        if (me.clientY < mid) {
          idx = elIdx;
          break;
        }
      }
      setDropIndex(idx);
    };

    const onUp = () => {
      const dragId = draggingId();
      const target = dropIndex();
      if (dragId !== null && target !== null) {
        const sheets = getSheets();
        const fromIdx = sheets.findIndex((s) => s.id === dragId);
        if (fromIdx !== -1 && target !== fromIdx && target !== fromIdx + 1) {
          const before = sheets[target - 1]?.orderKey ?? null;
          const after = sheets[target]?.orderKey ?? null;
          const newKey = orderKeyBetween(
            fromIdx < target ? (sheets[target]?.orderKey ?? null) : before,
            fromIdx < target ? after : (sheets[target]?.orderKey ?? null),
          );
          reorderSheet(dragId, newKey);
        }
      }
      setDraggingId(null);
      setDropIndex(null);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return { draggingId, dropIndex, startDrag };
}

// ─── SheetList ────────────────────────────────────────────────────

const SheetList: Component = () => {
  const navigate = useNavigate();
  const [trashOpen, setTrashOpen] = createSignal(false);
  const [projectMenuOpen, setProjectMenuOpen] = createSignal(false);

  const projectLabel = activeProjectLabel;

  const { draggingId, dropIndex, startDrag } = useDrag(filteredSheets);

  const handleNewSheet = () => {
    const id = createSheet();
    if (id) navigate(`/sheets/${id}`);
  };

  return (
    <div class="tree-view">
      <Show
        when={activeProjectDoc()}
        fallback={
          <div class="tree-no-project">
            <span class="tree-no-project-label">프로젝트가 선택되지 않았습니다</span>
            <button class="btn-border btn-sm" onClick={() => setSidebarView('projects')}>
              목록 보기
            </button>
          </div>
        }
      >
        {/* ── 프로젝트 헤더 ── */}
        <div class="sidebar-project-header">
          <A href={`/project/${activeProjectId()}`} class="tree-project-link">
            <div class="btn-pad">
              <span class="tree-project-name">{projectLabel()}</span>
            </div>
          </A>

          <div class="tree-project-header-btns">
            <button class="sb-icon-btn" title="새 시트" onClick={handleNewSheet}>
              <div class="btn-pad"><TbOutlineFilePlus /></div>
            </button>
            <Dropdown
              triggerClass="sb-icon-btn"
              triggerAriaLabel="더보기"
              align="right"
              open={projectMenuOpen}
              onOpenChange={setProjectMenuOpen}
              trigger={<div class="btn-pad"><TbOutlineDotsVertical /></div>}
              items={[
                { label: '프로젝트 목록', onSelect: () => setSidebarView('projects') },
              ]}
            />
          </div>
        </div>

        {/* ── 필터 바 ── */}
        <div class="sl-toolbar">
          <TagFilterInput />
        </div>

        {/* ── 시트 목록 (휴지통 포함) ── */}
        <div class="sl-list">
          <For each={filteredSheets()}>
            {(sheet, idx) => (
              <>
                <Show when={dropIndex() === idx() && draggingId() !== sheet.id}>
                  <div class="sl-drop-line" />
                </Show>
                <div
                  data-sheet-id={sheet.id}
                  classList={{ 'sl-item--dragging': draggingId() === sheet.id }}
                >
                  <SheetItem
                    sheet={sheet}
                    onDragStart={(e) => startDrag(e, sheet.id)}
                  />
                </div>
              </>
            )}
          </For>
          <Show when={dropIndex() === filteredSheets().length}>
            <div class="sl-drop-line" />
          </Show>

          <Show when={filteredSheets().length === 0}>
            <div class="tree-trash-empty-msg">
              {filterQuery() ? '일치하는 시트 없음' : '시트가 없습니다'}
            </div>
          </Show>

          {/* ── 휴지통 (리스트 안에 포함) ── */}
          <div class="tree-trash-section">
            <div
              class="tree-trash-header"
              role="button"
              tabIndex={0}
              onClick={() => setTrashOpen((v) => !v)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setTrashOpen((v) => !v); }}
            >
              <span class="icon">{trashOpen() ? <TbOutlineChevronDown /> : <TbOutlineChevronRight />}</span>
              <span class="icon"><TbFillTrash /></span>
              <span class="tree-trash-label">휴지통</span>
              <Show when={trashSheets().length > 0}>
                <span class="tree-trash-count">{trashSheets().length}</span>
                <button
                  class="tree-trash-empty-btn sb-icon-btn"
                  title="휴지통 비우기"
                  onClick={(e) => { e.stopPropagation(); emptyTrash(); }}
                >
                  <div class="btn-pad"><TbFillTrash /></div>
                </button>
              </Show>
            </div>

            <Show when={trashOpen()}>
              <Show
                when={trashSheets().length > 0}
                fallback={<div class="tree-trash-empty-msg">휴지통이 비어 있습니다</div>}
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
