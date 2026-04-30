import { createRoot } from 'solid-js';
import { createStore } from 'solid-js/store';
import { createEffect } from 'solid-js';
import { activePjVerId, setGroupOpen } from './workspace';
import {
  getNode,
  putNode,
  deleteProject as dbDeleteProject,
  getAllNodesInVersion,
  deleteNodeSubtree,
  moveNodeAtomic,
  createNodeAtomic,
} from '../lib/doc/db';
import type { GroupNode, SheetNode, SheetContent } from '../lib/doc/v0';
import { genUnorderedId } from '../lib/uuid';
import { logError } from './log';

// ─── Types ─────────────────────────────────────────────────────

export interface NodeColor {
  h: number; // 0-360
  s: number; // 0-100, 0 = no color
}

export interface TreeNodeMeta {
  id: string;
  type: 'group' | 'sheet';
  label: string;
  updatedAt: string;
  parentId: string;
  children: string[]; // sorted by orderKey (built from parentId index)
  preview?: string;
  color?: NodeColor;
}

export interface ProjectInfo {
  pjVerId: string; // versionRoot node ID
  projectId: string;
  label: string;
  updatedAt: string;
  exportedAt?: string;
  exportedBy?: string;
}

export interface ProjectTreeStore {
  meta: ProjectInfo | null;
  nodes: Record<string, TreeNodeMeta>;
  loading: boolean;
}

export type MoveTarget =
  | { kind: 'before'; itemId: string; parentId: string }
  | { kind: 'after'; itemId: string; parentId: string }
  | { kind: 'into'; groupId: string };

// ─── Store ───────────────────────────────────────────────────

const [tree, setTree] = createStore<ProjectTreeStore>({
  meta: null,
  nodes: {},
  loading: false,
});

export { tree as projectTree };

// ─── Internal Utils ────────────────────────────────────────────────

function toMeta(
  node: GroupNode | SheetNode,
  childIds: string[],
  preview?: string,
): TreeNodeMeta {
  return {
    id: node.id,
    type: node.type,
    label: node.label,
    updatedAt: node.updatedAt,
    parentId: node.parentId,
    children: node.type === 'group' ? childIds : [],
    preview,
    color:
      node.visual.colorS > 0
        ? { h: node.visual.colorH, s: node.visual.colorS }
        : undefined,
  };
}

function vId(): string | null {
  return tree.meta?.pjVerId ?? null;
}

// ─── Fetch ───────────────────────────────────────────────────

export async function fetchProjectTree(pjVerId: string): Promise<void> {
  setTree('loading', true);
  try {
    const versionRoot = await getNode(pjVerId);
    if (!versionRoot || versionRoot.type !== 'versionRoot') {
      setTree({ meta: null, nodes: {}, loading: false });
      return;
    }

    const dataNodes = await getAllNodesInVersion(pjVerId);

    // Build parentId → sorted-children map
    const childMap = new Map<string, Array<GroupNode | SheetNode>>();
    for (const node of dataNodes) {
      const siblings = childMap.get(node.parentId) ?? [];
      siblings.push(node);
      childMap.set(node.parentId, siblings);
    }
    for (const siblings of childMap.values()) {
      siblings.sort((a, b) => a.orderKey - b.orderKey);
    }

    const nodeMap: Record<string, TreeNodeMeta> = {};
    for (const node of dataNodes) {
      const childIds = (childMap.get(node.id) ?? []).map((c) => c.id);
      nodeMap[node.id] = toMeta(node, childIds);
    }

    // versionRoot itself must be in nodeMap so TreeView can read its children
    const rootChildIds = (childMap.get(pjVerId) ?? []).map((c) => c.id);
    nodeMap[pjVerId] = {
      id: pjVerId,
      type: 'group',
      label: versionRoot.label,
      updatedAt: versionRoot.updatedAt,
      parentId: '',
      children: rootChildIds,
    };

    setTree({
      meta: {
        pjVerId,
        projectId: versionRoot.projectId,
        label: versionRoot.label,
        updatedAt: versionRoot.updatedAt,
        exportedAt: versionRoot.exportedAt,
        exportedBy: versionRoot.exportedBy,
      },
      nodes: nodeMap,
      loading: false,
    });
  } catch (err) {
    logError('project_tree:fetchProjectTree', err);
    setTree('loading', false);
  }
}

createRoot(() => {
  createEffect(() => {
    const id = activePjVerId();
    if (id) fetchProjectTree(id);
    else setTree({ meta: null, nodes: {}, loading: false });
  });
});

// ─── Helpers ─────────────────────────────────────────────────

export function findParentId(targetId: string): string | null {
  return tree.nodes[targetId]?.parentId || null;
}

export function updateSheetMeta(
  id: string,
  label: string,
  preview: string,
): void {
  if (!tree.nodes[id]) return;
  setTree('nodes', id, (prev) => ({
    ...prev,
    label,
    preview,
    updatedAt: new Date().toISOString(),
  }));
}

// ─── Create ──────────────────────────────────────────────────

export async function createTreeNode(
  type: 'group' | 'sheet',
  parentId: string,
  label: string,
): Promise<string | null> {
  const vid = vId();
  if (!vid) return null;

  const newId = genUnorderedId();
  const now = new Date().toISOString();

  const base = {
    id: newId,
    pjVerId: vid,
    parentId,
    label,
    updatedAt: now,
    visual: { colorH: 0, colorS: 0 },
    tags: [] as string[],
    orderKey: 0, // overwritten atomically by createNodeAtomic
  };

  const newNode: GroupNode | SheetNode =
    type === 'group' ? { ...base, type: 'group' } : { ...base, type: 'sheet' };

  let sheetContent: SheetContent | undefined;
  if (type === 'sheet') {
    sheetContent = {
      id: genUnorderedId(),
      nodeId: newId,
      markdown: '',
      selection: { anchor: 0, head: 0 },
    };
  }
  await createNodeAtomic(newNode, sheetContent);
  if (type === 'group') setGroupOpen(newId, true);

  await fetchProjectTree(vid);
  return newId;
}

// ─── Rename ──────────────────────────────────────────────────

export async function renameTreeNode(
  id: string,
  newLabel: string,
): Promise<void> {
  const node = await getNode(id);
  if (!node || node.type === 'versionRoot') return;
  const now = new Date().toISOString();
  await putNode({ ...node, label: newLabel, updatedAt: now });
  await fetchProjectTree(node.pjVerId);
}

export async function renameProjectMeta(newLabel: string): Promise<void> {
  const vid = vId();
  if (!vid) return;
  const node = await getNode(vid);
  if (!node || node.type !== 'versionRoot') return;
  const now = new Date().toISOString();
  await putNode({ ...node, label: newLabel, updatedAt: now });
  await fetchProjectTree(vid);
}

// ─── Color ───────────────────────────────────────────────────

export async function setNodeColor(
  id: string,
  color: NodeColor | undefined,
): Promise<void> {
  const node = await getNode(id);
  if (!node || node.type === 'versionRoot') return;
  const visual = color
    ? { colorH: color.h, colorS: color.s }
    : { colorH: 0, colorS: 0 };
  await putNode({ ...node, visual });
  setTree('nodes', id, 'color', color);
}

// ─── Delete ──────────────────────────────────────────────────

export async function deleteTreeNode(id: string): Promise<void> {
  const vid = vId();
  if (!vid) return;
  await deleteNodeSubtree(id);
  await fetchProjectTree(vid);
}

// ─── Delete Project ───────────────────────────────────────────

export async function deleteCurrentProjectTree(): Promise<void> {
  const vid = vId();
  if (!vid) return;
  const versionRoot = await getNode(vid);
  if (!versionRoot || versionRoot.type !== 'versionRoot') return;
  await dbDeleteProject(versionRoot.projectId);
  setTree({ meta: null, nodes: {}, loading: false });
}

// ─── Move ────────────────────────────────────────────────────

export function isDescendantOf(ancestorId: string, targetId: string): boolean {
  const stack = [ancestorId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (id === targetId) return true;
    const node = tree.nodes[id];
    if (node?.type === 'group') stack.push(...node.children);
  }
  return false;
}

export async function moveTreeNode(
  itemId: string,
  sourceParentId: string,
  target: MoveTarget,
): Promise<void> {
  const vid = vId();
  if (!vid) return;

  if (target.kind === 'into') {
    if (target.groupId === itemId) return;
    if (isDescendantOf(itemId, target.groupId)) return;
    if (target.groupId === sourceParentId) return;
  }

  const targetGroupId =
    target.kind === 'into' ? target.groupId : target.parentId;

  let afterId: string | null | undefined;
  if (target.kind === 'into') {
    afterId = undefined; // Default 'into' to end of group
  } else if (target.kind === 'after') {
    afterId = target.itemId;
  } else {
    // kind === 'before'
    const siblings = tree.nodes[targetGroupId]?.children ?? [];
    const idx = siblings.indexOf(target.itemId);
    afterId = idx > 0 ? siblings[idx - 1] : null; // null means 0th
  }

  await moveNodeAtomic(itemId, targetGroupId, afterId);
  await fetchProjectTree(vid);
}

export async function moveTreeNodes(
  items: Array<{ itemId: string; parentId: string }>,
  target: MoveTarget,
): Promise<void> {
  const vid = vId();
  if (!vid) return;

  const itemIds = new Set(items.map((i) => i.itemId));
  const topLevelItems = items.filter(({ itemId }) => {
    let curr = findParentId(itemId);
    while (curr) {
      if (itemIds.has(curr)) return false;
      curr = findParentId(curr);
    }
    return true;
  });

  const targetGroupId =
    target.kind === 'into' ? target.groupId : target.parentId;

  let currentAfterId: string | null | undefined;
  if (target.kind === 'into') {
    currentAfterId = undefined;
  } else if (target.kind === 'after') {
    currentAfterId = target.itemId;
  } else {
    const siblings = tree.nodes[targetGroupId]?.children ?? [];
    const idx = siblings.indexOf(target.itemId);
    currentAfterId = idx > 0 ? siblings[idx - 1] : null;
  }

  for (const { itemId } of topLevelItems) {
    await moveNodeAtomic(itemId, targetGroupId, currentAfterId);
    // After moving the first item, subsequent items should follow it
    currentAfterId = itemId;
  }

  await fetchProjectTree(vid);
}
