import { createRoot } from 'solid-js';
import { createStore, produce } from 'solid-js/store';
import { createEffect } from 'solid-js';
import { activePjVerId, setGroupOpen } from './workspace';
import {
  getNode,
  putNode,
  deleteNode as dbDeleteNode,
  deleteProject as dbDeleteProject,
  getAllNodesInVersion,
  getNewOrderKey,
  putSheetContent,
  deleteSheetContent,
  deleteSheetDraft,
} from '../lib/doc/db';
import type { GroupNode, SheetNode } from '../lib/doc/v0';
import { genId } from '../lib/uuid';

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
  children: string[]; // sorted by orderKey (built from parentId index)
  preview?: string;
  color?: NodeColor;
}

export interface ProjectInfo {
  pjVerId: string; // versionRoot node ID
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
      children: rootChildIds,
    };

    setTree({
      meta: {
        pjVerId,
        label: versionRoot.label,
        updatedAt: versionRoot.updatedAt,
        exportedAt: versionRoot.exportedAt,
        exportedBy: versionRoot.exportedBy,
      },
      nodes: nodeMap,
      loading: false,
    });
  } catch {
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
  for (const [id, node] of Object.entries(tree.nodes)) {
    if (node.type === 'group' && node.children.includes(targetId)) return id;
  }
  return null;
}

export function updateSheetMeta(
  id: string,
  label: string,
  preview: string,
): void {
  if (!tree.nodes[id]) return;
  setTree('nodes', id, 'label', label);
  setTree('nodes', id, 'preview', preview);
  setTree('nodes', id, 'updatedAt', new Date().toISOString());
}

// ─── Create ──────────────────────────────────────────────────

export async function createTreeNode(
  type: 'group' | 'sheet',
  parentId: string,
  label: string,
): Promise<string | null> {
  const vid = vId();
  if (!vid) return null;

  const newId = genId();
  const orderKey = await getNewOrderKey(parentId);
  const now = new Date().toISOString();

  const base = {
    id: newId,
    pjVerId: vid,
    parentId,
    orderKey,
    label,
    updatedAt: now,
    visual: { colorH: 0, colorS: 0 },
    tags: [] as string[],
  };

  const newNode: GroupNode | SheetNode =
    type === 'group' ? { ...base, type: 'group' } : { ...base, type: 'sheet' };

  await putNode(newNode);
  if (type === 'sheet') await putSheetContent(newId, '');
  if (type === 'group') setGroupOpen(newId, true);

  setTree(
    'nodes',
    produce((nodes) => {
      nodes[newId] = toMeta(newNode, []);
      if (nodes[parentId]) nodes[parentId].children.push(newId);
    }),
  );

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
  setTree('nodes', id, 'label', newLabel);
  setTree('nodes', id, 'updatedAt', now);
}

export async function renameProjectMeta(newLabel: string): Promise<void> {
  const vid = vId();
  if (!vid) return;
  const node = await getNode(vid);
  if (!node || node.type !== 'versionRoot') return;
  const now = new Date().toISOString();
  await putNode({ ...node, label: newLabel, updatedAt: now });
  setTree('meta', 'label', newLabel);
  setTree('meta', 'updatedAt', now);
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

function collectDescendants(
  nodes: Record<string, TreeNodeMeta>,
  id: string,
): string[] {
  const node = nodes[id];
  if (!node) return [];
  if (node.type === 'sheet') return [id];
  return [id, ...node.children.flatMap((c) => collectDescendants(nodes, c))];
}

export async function deleteTreeNode(
  id: string,
  parentId: string,
): Promise<void> {
  const toDelete = collectDescendants(tree.nodes, id);

  await Promise.all(
    toDelete.map(async (nodeId) => {
      await dbDeleteNode(nodeId);
      if (tree.nodes[nodeId]?.type === 'sheet') {
        await deleteSheetContent(nodeId);
        await deleteSheetDraft(nodeId);
      }
    }),
  );

  setTree(
    'nodes',
    produce((nodes) => {
      if (nodes[parentId]) {
        nodes[parentId].children = nodes[parentId].children.filter(
          (c) => c !== id,
        );
      }
      for (const nodeId of toDelete) delete nodes[nodeId];
    }),
  );
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
  if (ancestorId === targetId) return true;
  const node = tree.nodes[ancestorId];
  if (!node || node.type !== 'group') return false;
  return node.children.some((childId) => isDescendantOf(childId, targetId));
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
  const sameGroup = sourceParentId === targetGroupId;

  const srcChildren = [...(tree.nodes[sourceParentId]?.children ?? [])];
  const srcWithout = srcChildren.filter((id) => id !== itemId);

  const tgtChildren = sameGroup
    ? srcWithout
    : [...(tree.nodes[targetGroupId]?.children ?? [])];

  let insertIdx: number;
  if (target.kind === 'into') {
    insertIdx = 0;
  } else {
    const refIdx = tgtChildren.indexOf(target.itemId);
    if (refIdx === -1) return;
    insertIdx = target.kind === 'before' ? refIdx : refIdx + 1;
  }

  tgtChildren.splice(insertIdx, 0, itemId);

  // Compute new parentId and orderKey for the moved node
  const newParentId = targetGroupId;
  const afterId = insertIdx > 0 ? tgtChildren[insertIdx - 1] : undefined;

  // Update DB: change parentId + recompute orderKey
  const movedNode = await getNode(itemId);
  if (!movedNode || movedNode.type === 'versionRoot') return;

  // Temporarily update in-memory to allow getNewOrderKey to read correct siblings
  // (We update in DB first then mirror to store)
  const newOrderKey = await getNewOrderKey(newParentId, afterId);
  await putNode({ ...movedNode, parentId: newParentId, orderKey: newOrderKey });

  setTree(
    'nodes',
    produce((nodes) => {
      nodes[sourceParentId].children = srcWithout;
      if (!sameGroup) nodes[targetGroupId].children = tgtChildren;
      else nodes[sourceParentId].children = tgtChildren;
    }),
  );
}

export async function moveTreeNodes(
  items: Array<{ itemId: string; parentId: string }>,
  target: MoveTarget,
): Promise<void> {
  for (const { itemId, parentId } of items) {
    await moveTreeNode(itemId, parentId, target);
  }
}
