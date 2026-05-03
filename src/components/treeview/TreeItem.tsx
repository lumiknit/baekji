import {
  TbFillTrash,
  TbOutlineArrowMerge,
  TbOutlineChevronDown,
  TbOutlineChevronRight,
  TbOutlineDeviceFloppy,
  TbOutlineDotsVertical,
  TbOutlineFileImport,
  TbOutlineFilePlus,
  TbOutlineFileText,
  TbOutlineFolder,
  TbOutlineFolderPlus,
  TbOutlinePencil,
  TbOutlineReportAnalytics,
} from 'solid-icons/tb';
import type { Component } from 'solid-js';
import {
  createMemo,
  createSignal,
  For,
  Match,
  Show,
  Switch,
  useContext,
} from 'solid-js';
import { useLocation, useNavigate } from '@solidjs/router';
import toast from 'solid-toast';

import { hexToHsl, nodeColorToCss } from '../../lib/color';
import {
  collectGroupMarkdown,
  getSheetContentAsMarkdown,
  saveMarkdownSheet,
} from '../../lib/doc/db_helper';
import { getShortLabel } from '../../lib/markdown';
import { s } from '../../lib/i18n';
import { showConfirm, showPrompt } from '../../state/modal';
import {
  createTreeNode,
  deleteTreeNode,
  isDescendantOf,
  projectTree,
  renameTreeNode,
  setNodeColor,
} from '../../state/project_tree';
import { isGroupOpen, setGroupOpen } from '../../state/workspace';
import Dropdown from '../Dropdown';
import { TreeCtxKey } from './context';
import { openImportFileDialog } from './import_file';
import { Dynamic } from 'solid-js/web';

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
  const ctx = useContext(TreeCtxKey)!;

  const isActive = () => {
    if (!node()) return false;
    return location.pathname.includes(`/${props.id}`);
  };

  const isDragging = () => ctx.draggingId() === props.id;
  const isSelected = () => ctx.selectedIds().has(props.id);
  const dropHighlight = createMemo(() => {
    const d = ctx.dropTarget();
    return {
      before: d?.kind === 'before' && d.itemId === props.id,
      after: d?.kind === 'after' && d.itemId === props.id,
      into: d?.kind === 'into' && d.groupId === props.id,
    };
  });

  const handleToggle = (e: MouseEvent) => {
    e.stopPropagation();
    setGroupOpen(props.id, !isOpen());
  };

  const handleActivate = () => {
    if (ctx.mode() !== 'normal') return;
    if (ctx.selectedIds().size > 0) ctx.clearSelection();
    const n = node();
    if (!n) return;
    if (n.type === 'sheet') navigate(`/nodes/${n.id}`);
    else if (isActive()) setGroupOpen(props.id, !isOpen());
    else navigate(`/nodes/${n.id}`);
  };

  const handleSelect = (e: MouseEvent) => {
    if (ctx.mode() !== 'normal') return;
    if (e.shiftKey) {
      e.preventDefault();
      ctx.toggleSelect(props.id, true, props.parentId);
      return;
    }
    handleActivate();
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

  const handleDelete = async () => {
    const n = node();
    if (!n) return;
    const confirmed = await showConfirm(
      s('common.delete'),
      `"${n.label || s('common.untitled')}" ${s('common.delete')}?`,
    );
    if (!confirmed) return;

    const currentPathId = location.pathname.match(/^\/nodes\/([^/]+)/)?.[1];
    if (
      currentPathId &&
      (props.id === currentPathId || isDescendantOf(props.id, currentPathId))
    ) {
      const rootId = projectTree.meta?.pjVerId;
      if (rootId) navigate(`/nodes/${rootId}`);
      else navigate('/');
    }

    await deleteTreeNode(props.id);
  };

  const mergeGroupToSheet = async () => {
    const n = node();
    if (!n || n.type !== 'group') return;
    const confirmed = await showConfirm(
      s('tree.merge_title'),
      s('tree.merge_group_confirm', { label: n.label || s('common.untitled') }),
    );
    if (!confirmed) return;

    const markdown = await collectGroupMarkdown(props.id, projectTree.nodes);
    const label = getShortLabel(markdown) || n.label;

    const newId = await createTreeNode('sheet', props.parentId, label);
    if (!newId) return;
    await saveMarkdownSheet(newId, markdown, { anchor: 0, head: 0 });
    navigate(`/nodes/${newId}`);
    await deleteTreeNode(props.id);
  };

  const mergeSheetDown = async () => {
    const n = node();
    if (!n || n.type !== 'sheet') return;
    const siblings = projectTree.nodes[props.parentId]?.children ?? [];
    const idx = siblings.indexOf(props.id);
    const nextId = siblings[idx + 1];
    const nextNode = nextId ? projectTree.nodes[nextId] : null;

    if (!nextNode || nextNode.type !== 'sheet') {
      toast(s('tree.merge_no_next'));
      return;
    }

    const confirmed = await showConfirm(
      s('tree.merge_title'),
      s('tree.merge_down_confirm', {
        a: n.label || s('common.untitled'),
        b: nextNode.label || s('common.untitled'),
      }),
    );
    if (!confirmed) return;

    const md1 = (await getSheetContentAsMarkdown(props.id)).trim();
    const md2 = (await getSheetContentAsMarkdown(nextId)).trim();
    const merged = [md1, md2].filter(Boolean).join('\n\n');
    const label = getShortLabel(merged) || n.label;

    const newId = await createTreeNode('sheet', props.parentId, label);
    if (!newId) return;
    await saveMarkdownSheet(newId, merged, { anchor: 0, head: 0 });
    navigate(`/nodes/${newId}`);
    await deleteTreeNode(props.id);
    await deleteTreeNode(nextId);
  };

  const handleColorChange = async (hex: string) => {
    const { h, s: sat } = hexToHsl(hex);
    await setNodeColor(props.id, { h, s: sat });
  };

  const handleColorClear = async () => {
    await setNodeColor(props.id, { h: 0, s: 0 });
  };

  const labelColor = () => nodeColorToCss(node()?.color);

  const [dropdownOpen, setDropdownOpen] = createSignal(false);

  const handleContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDropdownOpen(true);
  };

  return (
    <Show when={node()}>
      {(n) => (
        <div
          class="tree-node"
          classList={{ 'tree-node--dragging': isDragging() }}
        >
          <Show when={dropHighlight().before}>
            <div class="tree-insert-line" />
          </Show>

          <div
            class="tree-row"
            classList={{
              'tree-row--drop-into': dropHighlight().into,
              'tree-row--active': isActive(),
              'tree-row--selected': isSelected(),
            }}
            style={{ '--tree-depth': props.depth }}
            data-item-id={props.id}
            data-parent-id={props.parentId}
            data-item-type={n().type}
            role="button"
            tabIndex={0}
            aria-label={n().label || s('common.untitled')}
            onClick={handleSelect}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleActivate();
              }
            }}
            onContextMenu={handleContextMenu}
            onPointerDown={(e) => ctx.startDrag(props.id, props.parentId, e)}
          >
            <div
              class="tree-row-inner"
              style={{ opacity: props.hidden ? '0.75' : undefined }}
            >
              <button
                class="tree-toggle"
                style={{ color: labelColor() }}
                onClick={handleToggle}
              >
                <Switch>
                  <Match when={n().type === 'group'}>
                    <Dynamic
                      component={
                        isOpen() ? TbOutlineChevronDown : TbOutlineChevronRight
                      }
                    />
                    <span class="icon">
                      <TbOutlineFolder />
                    </span>
                  </Match>
                  <Match when>
                    <span class="icon">
                      <TbOutlineFileText />
                    </span>
                  </Match>
                </Switch>
              </button>

              <span
                class="tree-label"
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
                  class={`tree-actions${!isActive() ? ' tree-actions--hidden' : ''}`}
                  triggerClass="sb-icon-btn"
                  triggerAriaLabel={s('common.more_actions')}
                  align="right"
                  open={dropdownOpen}
                  onOpenChange={setDropdownOpen}
                  trigger={
                    <div class="btn-pad">
                      <span class="icon">
                        <TbOutlineDotsVertical />
                      </span>
                    </div>
                  }
                  items={[
                    ...(n().type === 'group'
                      ? [
                          {
                            label: (
                              <>
                                <span class="icon">
                                  <TbOutlineFilePlus />
                                </span>{' '}
                                {s('common.new_sheet')}
                              </>
                            ),
                            onSelect: () => addChild('sheet'),
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
                            onSelect: () => addChild('group'),
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
                            onSelect: () => openImportFileDialog(props.id),
                          },
                          { separator: true as const },
                        ]
                      : []),
                    {
                      label: (
                        <>
                          <span class="icon">
                            <TbOutlineReportAnalytics />
                          </span>{' '}
                          {s('common.analysis')}
                        </>
                      ),
                      onSelect: () => navigate(`/nodes/${props.id}/analysis`),
                    },
                    {
                      label: (
                        <>
                          <span class="icon">
                            <TbOutlineDeviceFloppy />
                          </span>{' '}
                          {s('common.export')}
                        </>
                      ),
                      onSelect: () => navigate(`/nodes/${props.id}/export`),
                    },
                    { separator: true as const },
                    ...(n().type === 'group'
                      ? [
                          {
                            label: (
                              <>
                                <span class="icon">
                                  <TbOutlinePencil />
                                </span>{' '}
                                {s('common.rename')}
                              </>
                            ),
                            onSelect: renameNode,
                          },
                          {
                            label: (
                              <>
                                <span class="icon">
                                  <TbOutlineArrowMerge />
                                </span>{' '}
                                {s('tree.merge_to_sheet')}
                              </>
                            ),
                            onSelect: mergeGroupToSheet,
                          },
                        ]
                      : [
                          {
                            label: (
                              <>
                                <span class="icon">
                                  <TbOutlineArrowMerge />
                                </span>{' '}
                                {s('tree.merge_down')}
                              </>
                            ),
                            onSelect: mergeSheetDown,
                          },
                        ]),
                    {
                      label: (
                        <span class="btn-danger">
                          <span class="icon">
                            <TbFillTrash />
                          </span>{' '}
                          {s('common.delete')}
                        </span>
                      ),
                      onSelect: handleDelete,
                    },
                  ]}
                />
              </Show>
            </div>
            {/* tree-row-inner */}
          </div>
          {/* tree-row */}

          <Show when={dropHighlight().after}>
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

export default TreeItem;
