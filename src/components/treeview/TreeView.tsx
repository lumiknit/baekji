import {
  TbFillTrash,
  TbOutlineCheck,
  TbOutlineCloudDown,
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
import { A, useNavigate } from '@solidjs/router';

import { s } from '../../lib/i18n';
import { showBackup, showConfirm, showPrompt } from '../../state/modal';
import {
  createTreeNode,
  deleteTreeNode,
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

  const treeCtx = {
    mode,
    draggingId,
    dropTarget,
    startDrag,
    selectedIds,
    toggleSelect,
    clearSelection,
  };

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
                        s('modal.rename_title'),
                        s('tree.delete_selected_confirm', {
                          count: selectedIds().size,
                        }),
                      );
                      if (!confirmed) return;
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
                        <span class="icon">
                          <TbOutlineSearch />
                        </span>
                      </button>
                      <button
                        class="tree-toggle"
                        onClick={() => showBackup(p().pjVerId, p().label)}
                        title={s('common.backup_download')}
                      >
                        <span class="icon">
                          <TbOutlineCloudDown />
                        </span>
                      </button>
                      <Dropdown
                        align="right"
                        trigger={
                          <span class="icon">
                            <TbOutlineDotsVertical />
                          </span>
                        }
                        items={[
                          {
                            label: (
                              <>
                                <span class="icon">
                                  <TbOutlineFilePlus />
                                </span>{' '}
                                {s('common.new_sheet')}
                              </>
                            ),
                            onSelect: () => addRootChild('sheet'),
                          },
                          {
                            label: (
                              <>
                                <span class="icon">
                                  <TbOutlineFolderPlus />
                                </span>{' '}
                                {s('common.new_group')}
                              </>
                            ),
                            onSelect: () => addRootChild('group'),
                          },
                          {
                            label: (
                              <>
                                <span class="icon">
                                  <TbOutlineFileImport />
                                </span>{' '}
                                {s('common.import_file')}
                              </>
                            ),
                            onSelect: () => {
                              const rootId = meta()?.pjVerId;
                              if (rootId) openImportFileDialog(rootId);
                            },
                          },
                          { separator: true as const },
                          {
                            label: (
                              <>
                                <span class="icon">
                                  <TbOutlineReportAnalytics />
                                </span>{' '}
                                {s('common.analysis')}
                              </>
                            ),
                            onSelect: () =>
                              navigate(`/nodes/${p().pjVerId}/analysis`),
                          },
                          {
                            label: (
                              <>
                                <span class="icon">
                                  <TbOutlineFolderSearch />
                                </span>{' '}
                                {s('tree.expand_all')}
                              </>
                            ),
                            onSelect: () =>
                              setAllGroupsOpen(projectTree.nodes, true),
                          },
                          {
                            label: (
                              <>
                                <span class="icon">
                                  <TbOutlineFolderMinus />
                                </span>{' '}
                                {s('tree.collapse_all')}
                              </>
                            ),
                            onSelect: () =>
                              setAllGroupsOpen(projectTree.nodes, false),
                          },
                          {
                            label: (
                              <>
                                <span class="icon">
                                  <TbOutlineColorSwatch />
                                </span>{' '}
                                {s('common.color')}
                              </>
                            ),
                            onSelect: () => setMode('color'),
                          },
                          { separator: true as const },
                          {
                            label: (
                              <>
                                <span class="icon">
                                  <TbOutlinePencil />
                                </span>{' '}
                                {s('common.rename')}
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
                    <span class="icon">
                      <TbOutlineCheck />
                    </span>{' '}
                    {s('common.done')}
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
    </TreeCtxKey.Provider>
  );
};

export default TreeView;
