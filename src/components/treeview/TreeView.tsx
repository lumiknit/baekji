import {
  TbFillTrash,
  TbOutlineCheck,
  TbOutlineCloud,
  TbOutlineColorSwatch,
  TbOutlineDotsVertical,
  TbOutlineFileImport,
  TbOutlineFilePlus,
  TbOutlineFolderMinus,
  TbOutlineFolderPlus,
  TbOutlineFolderSearch,
  TbOutlinePencil,
  TbOutlineReportAnalytics,
  TbOutlineSearch,
  TbOutlineX,
} from 'solid-icons/tb';
import type { Component } from 'solid-js';
import { For, Show, createEffect, createSignal } from 'solid-js';
import { A, useLocation, useNavigate } from '@solidjs/router';

import { s } from '../../lib/i18n';
import { showBackup, showConfirm, showPrompt } from '../../state/modal';
import {
  createTreeNode,
  deleteTreeNode,
  isDescendantOf,
  projectTree,
  renameProjectMeta,
} from '../../state/project_tree';
import {
  isSidebarOpen,
  setAllGroupsOpen,
  setSidebarView,
} from '../../state/workspace';
import Dropdown from '../Dropdown';
import { TreeCtxKey } from './context';
import { useDragDrop } from './drag_drop';
import { openImportFileDialog } from './import_file';
import TreeItem from './TreeItem';

const TreeView: Component = () => {
  const navigate = useNavigate();
  const meta = () => projectTree.meta;
  const rootChildren = () => {
    const rootId = meta()?.pjVerId;
    return rootId ? (projectTree.nodes[rootId]?.children ?? []) : [];
  };

  const [mode, setMode] = createSignal<'normal' | 'color'>('normal');
  const [selectedIds, setSelectedIds] = createSignal<Set<string>>(new Set());
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

  const { draggingId, dropTarget, startDrag } = useDragDrop(
    selectedIds,
    selectedParents,
  );

  createEffect(() => {
    if (!isSidebarOpen()) setMode('normal');
  });

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

  const [projectMenuOpen, setProjectMenuOpen] = createSignal(false);

  const handleProjectContextMenu = (e: MouseEvent) => {
    if (mode() !== 'normal') return;
    e.preventDefault();
    e.stopPropagation();
    setProjectMenuOpen(true);
  };

  const treeCtx = {
    mode,
    draggingId,
    dropTarget,
    startDrag,
    selectedIds,
    toggleSelect,
    clearSelection,
  };

  const location = useLocation();

  return (
    <TreeCtxKey.Provider value={treeCtx}>
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
                        s('common.delete'),
                        s('tree.delete_selected_confirm', {
                          count: selectedIds().size,
                        }),
                      );
                      if (!confirmed) return;

                      const currentPathId =
                        location.pathname.match(/^\/nodes\/([^/]+)/)?.[1];
                      if (currentPathId) {
                        for (const id of selectedIds()) {
                          if (
                            id === currentPathId ||
                            isDescendantOf(id, currentPathId)
                          ) {
                            navigate(`/nodes/${p().pjVerId}`);
                            break;
                          }
                        }
                      }

                      for (const id of selectedIds()) await deleteTreeNode(id);
                      clearSelection();
                    }}
                  >
                    <span class="icon">
                      <TbFillTrash />
                    </span>
                  </button>
                  <button
                    class="tree-toggle"
                    onClick={clearSelection}
                    title={s('tree.deselect')}
                  >
                    <span class="icon">
                      <TbOutlineX />
                    </span>
                  </button>
                </div>
              </Show>

              {/* ── Project header: title row ── */}
              <div
                class="sidebar-project-header"
                onContextMenu={handleProjectContextMenu}
              >
                <A href={`/nodes/${p().pjVerId}`} class="tree-project-link">
                  <div class="btn-pad">
                    <span class="tree-project-name">{p().label}</span>
                  </div>
                </A>

                <Show
                  when={mode() !== 'normal'}
                  fallback={
                    <div class="tree-project-header-btns">
                      <button
                        class="sb-icon-btn"
                        onClick={() =>
                          showBackup({
                            id: p().projectId,
                            pjVerNodeId: p().pjVerId,
                            label: p().label,
                            exportedAt: p().exportedAt,
                            exportedBy: p().exportedBy,
                          })
                        }
                        title={s('common.pj_backup')}
                      >
                        <div class="btn-pad">
                          <span class="icon">
                            <TbOutlineCloud />
                          </span>
                        </div>
                      </button>
                      <Dropdown
                        triggerClass="sb-icon-btn"
                        triggerAriaLabel={s('common.more_actions')}
                        align="right"
                        open={projectMenuOpen}
                        onOpenChange={setProjectMenuOpen}
                        trigger={
                          <div class="btn-pad">
                            <span class="icon">
                              <TbOutlineDotsVertical />
                            </span>
                          </div>
                        }
                        items={[
                          {
                            icon: TbOutlineSearch,
                            label: s('common.search'),
                            onSelect: () => navigate('/search'),
                          },
                          { separator: true as const },
                          {
                            icon: TbOutlineFilePlus,
                            label: s('common.new_sheet'),
                            onSelect: () => addRootChild('sheet'),
                          },
                          {
                            icon: TbOutlineFolderPlus,
                            label: s('common.new_group'),
                            onSelect: () => addRootChild('group'),
                          },
                          {
                            icon: TbOutlineFileImport,
                            label: s('common.import_file'),
                            onSelect: () => {
                              const rootId = meta()?.pjVerId;
                              if (rootId) openImportFileDialog(rootId);
                            },
                          },
                          { separator: true as const },
                          {
                            icon: TbOutlineReportAnalytics,
                            label: s('common.analysis'),
                            onSelect: () =>
                              navigate(`/nodes/${p().pjVerId}/analysis`),
                          },
                          {
                            icon: TbOutlineFolderSearch,
                            label: s('tree.expand_all'),
                            onSelect: () =>
                              setAllGroupsOpen(projectTree.nodes, true),
                          },
                          {
                            icon: TbOutlineFolderMinus,
                            label: s('tree.collapse_all'),
                            onSelect: () =>
                              setAllGroupsOpen(projectTree.nodes, false),
                          },
                          {
                            icon: TbOutlineColorSwatch,
                            label: s('common.color'),
                            onSelect: () => setMode('color'),
                          },
                          { separator: true as const },
                          {
                            icon: TbOutlineCloud,
                            label: s('common.pj_backup'),
                            onSelect: () =>
                              showBackup({
                                id: p().projectId,
                                pjVerNodeId: p().pjVerId,
                                label: p().label,
                                exportedAt: p().exportedAt,
                                exportedBy: p().exportedBy,
                              }),
                          },
                          {
                            icon: TbOutlinePencil,
                            label: s('common.rename'),
                            onSelect: handleRenameProject,
                          },
                        ]}
                      />
                    </div>
                  }
                >
                  <div class="tree-project-header-btns">
                    <button
                      class="btn-border btn-sm"
                      onClick={() => setMode('normal')}
                    >
                      <span class="icon">
                        <TbOutlineCheck />
                      </span>{' '}
                      {s('common.done')}
                    </button>
                  </div>
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
        <div
          style={{ 'min-height': '3rem', flex: '1' }}
          onContextMenu={handleProjectContextMenu}
        />
      </div>
    </TreeCtxKey.Provider>
  );
};

export default TreeView;
