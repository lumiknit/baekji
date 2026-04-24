import {
  TbFillFolderOpen,
  TbFillTrash,
  TbOutlineCheck,
  TbOutlineColorSwatch,
  TbOutlineDeviceFloppy,
  TbOutlineDotsVertical,
  TbOutlineFile,
  TbOutlineFileImport,
  TbOutlineFilePlus,
  TbOutlineFolder,
  TbOutlineFolderMinus,
  TbOutlineFolderPlus,
  TbOutlineFolderSearch,
  TbOutlinePencil,
  TbOutlineReportAnalytics,
  TbOutlineSearch,
  TbOutlineX,
} from 'solid-icons/tb';
import type { Component } from 'solid-js';
import {
  For,
  Match,
  Show,
  Switch,
  createContext,
  createEffect,
  createSignal,
  useContext,
} from 'solid-js';

import { A, useLocation, useNavigate } from '@solidjs/router';
import { hexToHsl, nodeColorToCss } from '../lib/color';
import { parseBak, prepareBakImport } from '../lib/doc/backup';
import { commitBakImport, importTextAsSheet } from '../lib/doc/db_helper';
import { s } from '../lib/i18n';
import { showConfirm, showExport, showPrompt } from '../state/modal';
import type { MoveTarget } from '../state/project_tree';
import {
  createTreeNode,
  deleteTreeNode,
  fetchProjectTree,
  moveTreeNode,
  moveTreeNodes,
  projectTree,
  renameProjectMeta,
  renameTreeNode,
  setNodeColor,
} from '../state/project_tree';
import {
  isGroupOpen,
  isSidebarOpen,
  setAllGroupsOpen,
  setGroupOpen,
  setSidebarView,
} from '../state/workspace';

import Dropdown from './Dropdown';

// ─── Context ────────────────────────────────────────────────

type SidebarMode = 'normal' | 'color';

interface TreeCtx {
  mode: () => SidebarMode;
  draggingId: () => string | null;
  dropTarget: () => MoveTarget | null;
  startDrag: (itemId: string, parentId: string, e: PointerEvent) => void;
  selectedIds: () => Set<string>;
  toggleSelect: (id: string, shift: boolean, parentId: string) => void;
  clearSelection: () => void;
}

const TreeCtx = createContext<TreeCtx>();

function calcDropTarget(
  e: PointerEvent,
  draggingId: string | null,
): MoveTarget | null {
  const el = document.elementFromPoint(e.clientX, e.clientY);
  if (!el) return null;
  const row = (el as HTMLElement).closest(
    '[data-item-id]',
  ) as HTMLElement | null;
  if (!row) return null;
  const itemId = row.dataset.itemId!;
  const parentId = row.dataset.parentId!;
  const isGroup = row.dataset.itemType === 'group';
  if (itemId === draggingId) return null;
  const rect = row.getBoundingClientRect();
  const relY = (e.clientY - rect.top) / rect.height;
  if (isGroup) {
    if (relY < 0.25) return { kind: 'before', itemId, parentId };
    if (relY > 0.75) return { kind: 'after', itemId, parentId };
    return { kind: 'into', groupId: itemId };
  }
  return relY < 0.5
    ? { kind: 'before', itemId, parentId }
    : { kind: 'after', itemId, parentId };
}

// ─── TreeItem ────────────────────────────────────────────────

interface TreeItemProps {
  id: string;
  parentId: string;
  depth: number;
  hidden?: boolean;
}

const TreeItem: Component<TreeItemProps> = (props) => {
  const node = () => projectTree.nodes[props.id];
  const isOpen = () => isGroupOpen(props.id);
  const navigate = useNavigate();
  const location = useLocation();
  const ctx = useContext(TreeCtx)!;

  const isActive = () => {
    if (!node()) return false;
    // Match /node/:id, /preview/:id, /analysis/:id, etc.
    return location.pathname.includes(`/${props.id}`);
  };

  const isDragging = () => ctx.draggingId() === props.id;
  const isSelected = () => ctx.selectedIds().has(props.id);
  const dt = ctx.dropTarget;
  const showBefore = () => {
    const d = dt();
    return d?.kind === 'before' && d.itemId === props.id;
  };
  const showAfter = () => {
    const d = dt();
    return d?.kind === 'after' && d.itemId === props.id;
  };
  const showInto = () => {
    const d = dt();
    return d?.kind === 'into' && d.groupId === props.id;
  };

  const handleToggle = (e: MouseEvent) => {
    e.stopPropagation();
    setGroupOpen(props.id, !isOpen());
  };

  const handleSelect = (e: MouseEvent) => {
    if (ctx.mode() !== 'normal') return;
    if (e.shiftKey) {
      e.preventDefault();
      ctx.toggleSelect(props.id, true, props.parentId);
      return;
    }
    // If there are selections, clicking clears them and navigates
    if (ctx.selectedIds().size > 0) {
      ctx.clearSelection();
    }
    const n = node();
    if (!n) return;
    if (n.type === 'sheet') navigate(`/nodes/${n.id}`);
    else if (isActive()) setGroupOpen(props.id, !isOpen());
    else navigate(`/nodes/${n.id}`);
  };

  const addChild = async (type: 'group' | 'sheet') => {
    if (type === 'sheet') {
      const newId = await createTreeNode('sheet', props.id, '');
      if (newId) navigate(`/nodes/${newId}`);
      return;
    }
    const label = await showPrompt(
      s('common.ok'),
      s('modal.rename_prompt'),
      s('common.new_group'),
    );
    if (!label) return;
    const newId = await createTreeNode('group', props.id, label);
    if (newId) navigate(`/nodes/${newId}`);
  };

  const renameNode = async () => {
    const n = node();
    if (!n) return;
    const newName = await showPrompt(
      s('modal.rename_title'),
      s('modal.rename_prompt'),
      n.label,
    );
    if (newName && newName !== n.label) await renameTreeNode(props.id, newName);
  };

  const importFile = (parentId: string) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.md,.txt,.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const text = await file.text();
      const pjVerId = projectTree.meta?.pjVerId ?? '';
      if (file.name.endsWith('.json')) {
        try {
          const bak = parseBak(JSON.parse(text));
          const result = await prepareBakImport(bak);
          await commitBakImport(result);
        } catch (err) {
          await showConfirm('Import failed', String(err));
          return;
        }
      } else {
        await importTextAsSheet(text, file.name, pjVerId, parentId);
      }
      await fetchProjectTree(pjVerId);
    };
    input.click();
  };

  const handleDelete = async () => {
    const n = node();
    if (!n) return;
    const confirmed = await showConfirm(
      s('modal.rename_title'),
      `"${n.label || s('common.untitled')}" ${s('common.delete')}?`,
    );
    if (!confirmed) return;
    await deleteTreeNode(props.id);
  };

  const handleColorChange = async (hex: string) => {
    const { h, s: sat } = hexToHsl(hex);
    await setNodeColor(props.id, { h, s: sat });
  };

  const handleColorClear = async () => {
    await setNodeColor(props.id, { h: 0, s: 0 });
  };

  const labelColor = () => nodeColorToCss(node()?.color);

  return (
    <Show when={node()}>
      {(n) => (
        <div
          class="tree-node"
          classList={{ 'tree-node--dragging': isDragging() }}
        >
          <Show when={showBefore()}>
            <div class="tree-insert-line" />
          </Show>

          <div
            class="tree-row"
            classList={{
              'tree-row--drop-into': showInto(),
              'tree-row--active': isActive(),
              'tree-row--selected': isSelected(),
            }}
            style={{
              '--tree-depth': props.depth,
              opacity: props.hidden ? '0.75' : undefined,
            }}
            data-item-id={props.id}
            data-parent-id={props.parentId}
            data-item-type={n().type}
            onClick={handleSelect}
            onContextMenu={(e) => e.preventDefault()}
            onPointerDown={(e) => {
              ctx.startDrag(props.id, props.parentId, e);
            }}
          >
            <Switch>
              <Match when={n().type === 'group'}>
                <button
                  class="tree-toggle"
                  style={{ color: labelColor() }}
                  onClick={handleToggle}
                >
                  <Switch>
                    <Match when={isOpen()}>
                      <TbFillFolderOpen />
                    </Match>
                    <Match when={!isOpen()}>
                      <TbOutlineFolder />
                    </Match>
                  </Switch>
                </button>
              </Match>
              <Match when={n().type === 'sheet'}>
                <span
                  class="tree-toggle"
                  style={{
                    opacity: labelColor() ? '1' : '0.4',
                    color: labelColor(),
                  }}
                >
                  <TbOutlineFile />
                </span>
              </Match>
            </Switch>

            <span
              class="tree-label flex-1 overflow-hidden"
              style={{
                'font-style': n().label ? 'normal' : 'italic',
                color: labelColor(),
              }}
            >
              {n().label || s('common.untitled')}
            </span>

            <Show when={ctx.mode() === 'color'}>
              <div
                class="flex items-center gap-4"
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  type="color"
                  class="tree-color-input"
                  onInput={(e) => handleColorChange(e.currentTarget.value)}
                />
                <Show when={n().color && n().color!.s > 0}>
                  <button class="tree-color-clear" onClick={handleColorClear}>
                    ✕
                  </button>
                </Show>
              </div>
            </Show>

            <Show when={ctx.mode() === 'normal'}>
              <Dropdown
                class="tree-actions"
                align="right"
                trigger={<TbOutlineDotsVertical />}
                items={[
                  ...(n().type === 'group'
                    ? [
                        {
                          label: (
                            <>
                              <TbOutlineFilePlus /> {s('common.new_sheet')}
                            </>
                          ),
                          onSelect: () => addChild('sheet'),
                        },
                        {
                          label: (
                            <>
                              <TbOutlineFolderPlus /> {s('common.new_group')}
                            </>
                          ),
                          onSelect: () => addChild('group'),
                        },
                        {
                          label: (
                            <>
                              <TbOutlineFileImport /> {s('common.import_file')}
                            </>
                          ),
                          onSelect: () => importFile(props.id),
                        },
                        { separator: true as const },
                      ]
                    : []),
                  {
                    label: (
                      <>
                        <TbOutlineReportAnalytics /> {s('common.analysis')}
                      </>
                    ),
                    onSelect: () => navigate(`/nodes/${props.id}/analysis`),
                  },
                  {
                    label: (
                      <>
                        <TbOutlineDeviceFloppy /> {s('common.export')}
                      </>
                    ),
                    onSelect: () => showExport(props.id),
                  },
                  { separator: true as const },
                  ...(n().type === 'group'
                    ? [
                        {
                          label: (
                            <>
                              <TbOutlinePencil /> {s('common.rename')}
                            </>
                          ),
                          onSelect: renameNode,
                        },
                      ]
                    : []),
                  {
                    label: (
                      <span class="btn-danger">
                        <TbFillTrash /> {s('common.delete')}
                      </span>
                    ),
                    onSelect: handleDelete,
                  },
                ]}
              />
            </Show>
          </div>

          <Show when={showAfter()}>
            <div class="tree-insert-line" />
          </Show>

          <Show when={n().type === 'group' && isOpen()}>
            <For each={n().children}>
              {(childId) => (
                <TreeItem
                  id={childId}
                  parentId={props.id}
                  depth={props.depth + 1}
                  hidden={props.hidden || n().label.startsWith('.')}
                />
              )}
            </For>
          </Show>
        </div>
      )}
    </Show>
  );
};

// ─── TreeView ────────────────────────────────────────────────

const TreeView: Component = () => {
  const meta = () => projectTree.meta;
  const rootChildren = () => {
    const rootId = meta()?.pjVerId;
    return rootId ? (projectTree.nodes[rootId]?.children ?? []) : [];
  };

  const [mode, setMode] = createSignal<SidebarMode>('normal');
  const [draggingId, setDraggingId] = createSignal<string | null>(null);
  const [dropTarget, setDropTarget] = createSignal<MoveTarget | null>(null);
  const [selectedIds, setSelectedIds] = createSignal<Set<string>>(new Set());
  // Track parentId per selected node for multi-drag
  const selectedParents = new Map<string, string>();

  const toggleSelect = (id: string, _shift: boolean, parentId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        selectedParents.delete(id);
      } else {
        next.add(id);
        selectedParents.set(id, parentId);
      }
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedIds(new Set<string>());
    selectedParents.clear();
  };

  createEffect(() => {
    if (!isSidebarOpen()) setMode('normal');
  });

  const startDrag = (itemId: string, parentId: string, e: PointerEvent) => {
    let dragStarted = false;
    let longPressTimer: any = null;
    const target = e.currentTarget as HTMLElement;

    // Prevent scrolling once drag has started
    const onTouchMove = (te: TouchEvent) => {
      if (dragStarted) {
        if (te.cancelable) te.preventDefault();
      }
    };

    const cleanup = () => {
      clearTimeout(longPressTimer);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      window.removeEventListener('touchmove', onTouchMove, { capture: true });
      if (target.hasPointerCapture(e.pointerId)) {
        target.releasePointerCapture(e.pointerId);
      }
    };

    const MOUSE_THRESHOLD = 8;
    const TOUCH_CANCEL_THRESHOLD = 10;

    const onMove = (me: PointerEvent) => {
      if (!dragStarted && me.pointerType === 'mouse') {
        const dx = Math.abs(me.clientX - e.clientX);
        const dy = Math.abs(me.clientY - e.clientY);
        if (dx > MOUSE_THRESHOLD || dy > MOUSE_THRESHOLD) {
          dragStarted = true;
          setDraggingId(itemId);
          target.setPointerCapture(e.pointerId);
        }
      }

      if (dragStarted) {
        setDropTarget(calcDropTarget(me, itemId));
      } else if (me.pointerType !== 'mouse') {
        // Cancel long-press if finger moves too much
        if (
          Math.abs(me.clientX - e.clientX) > TOUCH_CANCEL_THRESHOLD ||
          Math.abs(me.clientY - e.clientY) > TOUCH_CANCEL_THRESHOLD
        ) {
          cleanup();
        }
      }
    };

    const onUp = async () => {
      cleanup();
      if (dragStarted) {
        const dt = dropTarget();
        if (dt) {
          const sel = selectedIds();
          if (sel.size > 1 && sel.has(itemId)) {
            const items = [...sel].map((id) => ({
              itemId: id,
              parentId: selectedParents.get(id) ?? parentId,
            }));
            await moveTreeNodes(items, dt);
          } else {
            await moveTreeNode(itemId, parentId, dt);
          }
        }
        setDraggingId(null);
        setDropTarget(null);
      }
    };

    if (e.pointerType === 'mouse') {
      // Mouse events handle movement in onMove
    } else {
      // Non-mouse: wait for 300ms long press to activate drag
      longPressTimer = setTimeout(() => {
        dragStarted = true;
        setDraggingId(itemId);
        target.setPointerCapture(e.pointerId);
        if ('vibrate' in navigator) navigator.vibrate(20);
      }, 350);
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    // Add touchmove listener with passive: false to allow preventDefault
    window.addEventListener('touchmove', onTouchMove, {
      passive: false,
      capture: true,
    });
  };

  const addRootChild = async (type: 'group' | 'sheet') => {
    const rootId = meta()?.pjVerId;
    if (!rootId) return;
    if (type === 'sheet') {
      const newId = await createTreeNode('sheet', rootId, '');
      if (newId) navigate(`/nodes/${newId}`);
      return;
    }
    const label = await showPrompt(
      s('common.ok'),
      s('modal.rename_prompt'),
      s('common.new_group'),
    );
    if (!label) return;
    const newId = await createTreeNode('group', rootId, label);
    if (newId) navigate(`/nodes/${newId}`);
  };

  const handleRenameProject = async () => {
    const p = meta();
    if (!p) return;
    const newName = await showPrompt(
      s('modal.rename_title'),
      s('modal.rename_prompt'),
      p.label,
    );
    if (newName && newName !== p.label) await renameProjectMeta(newName);
  };

  const importRootFile = () => {
    const rootId = meta()?.pjVerId;
    if (!rootId) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.md,.txt,.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const text = await file.text();
      if (file.name.endsWith('.json')) {
        try {
          const bak = parseBak(JSON.parse(text));
          const result = await prepareBakImport(bak);
          await commitBakImport(result);
        } catch (err) {
          await showConfirm('Import failed', String(err));
          return;
        }
      } else {
        await importTextAsSheet(text, file.name, rootId, rootId);
      }
      await fetchProjectTree(rootId);
    };
    input.click();
  };

  const navigate = useNavigate();
  const treeCtx: TreeCtx = {
    mode,
    draggingId,
    dropTarget,
    startDrag,
    selectedIds,
    toggleSelect,
    clearSelection,
  };

  return (
    <TreeCtx.Provider value={treeCtx}>
      <div class="tree-view">
        <Show
          when={meta()}
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
          {(p) => (
            <>
              <Show when={selectedIds().size > 0}>
                <div class="tree-selection-bar">
                  <span class="tree-selection-bar-label">
                    {s('tree.selected_count', { count: selectedIds().size })}
                  </span>
                  <button
                    class="btn-border btn-sm"
                    onClick={async () => {
                      const confirmed = await showConfirm(
                        s('modal.rename_title'),
                        s('tree.delete_selected_confirm', {
                          count: selectedIds().size,
                        }),
                      );
                      if (!confirmed) return;
                      for (const id of selectedIds()) {
                        await deleteTreeNode(id);
                      }
                      clearSelection();
                    }}
                  >
                    <TbFillTrash />
                  </button>
                  <button
                    class="tree-toggle"
                    onClick={clearSelection}
                    title={s('tree.deselect')}
                  >
                    <TbOutlineX />
                  </button>
                </div>
              </Show>
              <div class="sidebar-project-header items-center">
                <A
                  href={`/nodes/${p().pjVerId}`}
                  class="bold flex-1 overflow-hidden tree-project-link"
                >
                  {p().label}
                </A>

                <Show
                  when={mode() !== 'normal'}
                  fallback={
                    <div class="flex gap-4">
                      <button
                        class="tree-toggle"
                        onClick={() => navigate('/search')}
                        title={s('common.search')}
                      >
                        <TbOutlineSearch />
                      </button>
                      <Dropdown
                        align="right"
                        trigger={<TbOutlineDotsVertical />}
                        items={[
                          {
                            label: (
                              <>
                                <TbOutlineFilePlus /> {s('common.new_sheet')}
                              </>
                            ),
                            onSelect: () => addRootChild('sheet'),
                          },
                          {
                            label: (
                              <>
                                <TbOutlineFolderPlus /> {s('common.new_group')}
                              </>
                            ),
                            onSelect: () => addRootChild('group'),
                          },
                          {
                            label: (
                              <>
                                <TbOutlineFileImport />{' '}
                                {s('common.import_file')}
                              </>
                            ),
                            onSelect: importRootFile,
                          },
                          { separator: true as const },
                          {
                            label: (
                              <>
                                <TbOutlineReportAnalytics />{' '}
                                {s('common.analysis')}
                              </>
                            ),
                            onSelect: () =>
                              navigate(`/nodes/${p().pjVerId}/analysis`),
                          },
                          {
                            label: (
                              <>
                                <TbOutlineFolderSearch /> {s('tree.expand_all')}
                              </>
                            ),
                            onSelect: () =>
                              setAllGroupsOpen(projectTree.nodes, true),
                          },
                          {
                            label: (
                              <>
                                <TbOutlineFolderMinus />{' '}
                                {s('tree.collapse_all')}
                              </>
                            ),
                            onSelect: () =>
                              setAllGroupsOpen(projectTree.nodes, false),
                          },
                          {
                            label: (
                              <>
                                <TbOutlineColorSwatch /> {s('common.color')}
                              </>
                            ),
                            onSelect: () => setMode('color'),
                          },
                          { separator: true as const },
                          {
                            label: (
                              <>
                                <TbOutlinePencil /> {s('common.rename')}
                              </>
                            ),
                            onSelect: handleRenameProject,
                          },
                        ]}
                      />
                    </div>
                  }
                >
                  <button
                    class="btn-border btn-sm"
                    onClick={() => setMode('normal')}
                  >
                    <TbOutlineCheck /> {s('common.done')}
                  </button>
                </Show>
              </div>

              <div class="tree-content">
                <Show
                  when={!projectTree.loading}
                  fallback={<div class="p-16">Loading...</div>}
                >
                  <For each={rootChildren()}>
                    {(childId) => (
                      <TreeItem id={childId} parentId={p().pjVerId} depth={0} />
                    )}
                  </For>
                </Show>
              </div>
            </>
          )}
        </Show>
      </div>
    </TreeCtx.Provider>
  );
};

export default TreeView;
