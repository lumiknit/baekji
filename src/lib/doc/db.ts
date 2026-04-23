import { openDB, deleteDB } from 'idb';
import type { IDBPDatabase } from 'idb';
import type {
  DocNode,
  GroupNode,
  SheetNode,
  SheetContent,
  SheetDelta,
  StateKV,
  docVersionRootSchema,
} from './v0';
import { z } from 'zod/v4';
import {
  SK_LAST_OPEN_NODE_ID,
  SK_SHEET_LAST_SELECTION,
  SK_GROUP_COLLAPSED,
} from './v0';

// Zod v4 inference doesn't pick up `active` from `.boolean().describe(...)`;
// intersect manually to keep TypeScript happy.
export type VersionRootNode = z.infer<typeof docVersionRootSchema> & {
  active: boolean;
};
type DataNode = GroupNode | SheetNode;

const DB_NAME = 'baekji-doc-v1';
const DB_VERSION = 1;

const NODES = 'nodes';
const SHEET_CONTENTS = 'sheetContents';
const SHEET_DELTAS = 'sheetDeltas';
const APP_STATE = 'appState';

export const ORDER_GAP = 1024;

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const nodes = db.createObjectStore(NODES, { keyPath: 'id' });
        nodes.createIndex('by-parentId', 'parentId');
        nodes.createIndex('by-pjVerId', 'pjVerId');
        nodes.createIndex('by-type', 'type');
        nodes.createIndex('by-projectId-type', ['projectId', 'type']);

        const sheetContents = db.createObjectStore(SHEET_CONTENTS, {
          keyPath: 'id',
        });
        sheetContents.createIndex('by-nodeId', 'nodeId', { unique: true });

        const sheetDeltas = db.createObjectStore(SHEET_DELTAS, {
          keyPath: ['contentId', 'seq'],
        });
        sheetDeltas.createIndex('by-contentId', 'contentId');

        const appState = db.createObjectStore(APP_STATE, {
          keyPath: ['scope', 'scopeId', 'key'],
        });
        appState.createIndex('by-scope-scopeId', ['scope', 'scopeId']);
      },
    });
  }
  return dbPromise;
}

// ─── Nodes ───────────────────────────────────────────────────

export async function getNode(id: string): Promise<DocNode | undefined> {
  const db = await getDB();
  return db.get(NODES, id);
}

export async function putNode(node: DocNode): Promise<void> {
  const db = await getDB();
  await db.put(NODES, node);
}

export async function deleteNode(id: string): Promise<void> {
  const db = await getDB();
  await db.delete(NODES, id);
}

// ─── Version Roots ────────────────────────────────────────────

export async function getAllVersionRoots(): Promise<VersionRootNode[]> {
  const db = await getDB();
  const all = await db.getAllFromIndex(NODES, 'by-type', 'versionRoot');
  return all as VersionRootNode[];
}

export async function getVersionRoots(
  projectId: string,
): Promise<VersionRootNode[]> {
  const db = await getDB();
  const all = await db.getAllFromIndex(NODES, 'by-projectId-type', [
    projectId,
    'versionRoot',
  ]);
  return all as VersionRootNode[];
}

export async function getActiveVersionRoot(
  projectId: string,
): Promise<VersionRootNode | undefined> {
  const roots = await getVersionRoots(projectId);
  return roots.find((r) => r.active);
}

export async function setActiveVersion(
  projectId: string,
  versionId: string,
): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(NODES, 'readwrite');
  const roots = (await tx.store
    .index('by-projectId-type')
    .getAll([projectId, 'versionRoot'])) as VersionRootNode[];
  for (const root of roots) {
    await tx.store.put({ ...root, active: root.id === versionId });
  }
  await tx.done;
}

// ─── Children (ordered by orderKey) ───────────────────────────

export async function getChildren(parentId: string): Promise<DataNode[]> {
  const db = await getDB();
  const results = await db.getAllFromIndex(NODES, 'by-parentId', parentId);
  return (results as DataNode[]).sort(
    (a, b) => (a.orderKey ?? 0) - (b.orderKey ?? 0),
  );
}

export async function getAllNodesInVersion(
  pjVerId: string,
): Promise<DataNode[]> {
  const db = await getDB();
  const results = await db.getAllFromIndex(NODES, 'by-pjVerId', pjVerId);
  return results as DataNode[];
}

// ─── OrderKey (Internal Helpers for Atomic Ops) ────────────────

async function getNextOrderKeyInTx(
  store: IDBObjectStore,
  parentId: string,
): Promise<number> {
  const parentIdx = store.index('by-parentId');
  const results = (await parentIdx.getAll(parentId)) as DataNode[];
  const last = results
    .sort((a, b) => (a.orderKey ?? 0) - (b.orderKey ?? 0))
    .pop();
  return last ? (last.orderKey ?? 0) + ORDER_GAP : ORDER_GAP;
}

// ─── Atomic Create ───────────────────────────────────────────

export async function createNodeAtomic(
  node: DataNode,
  sheetContent?: SheetContent,
): Promise<void> {
  const db = await getDB();
  const tx = db.transaction([NODES, SHEET_CONTENTS], 'readwrite');
  const store = tx.objectStore(NODES);

  const orderKey = await getNextOrderKeyInTx(store, node.parentId);
  const finalNode = { ...node, orderKey };

  await store.put(finalNode);
  if (node.type === 'sheet' && sheetContent !== undefined) {
    await tx.objectStore(SHEET_CONTENTS).put(sheetContent);
  }
  await tx.done;
}

// ─── Sheet Contents ───────────────────────────────────────────

export async function getSheetContent(
  nodeId: string,
): Promise<SheetContent | undefined> {
  const db = await getDB();
  return db.getFromIndex(SHEET_CONTENTS, 'by-nodeId', nodeId);
}

export async function putSheetContent(content: SheetContent): Promise<void> {
  const db = await getDB();
  await db.put(SHEET_CONTENTS, content);
}

export async function deleteSheetContent(nodeId: string): Promise<void> {
  const db = await getDB();
  const existing = await db.getFromIndex(SHEET_CONTENTS, 'by-nodeId', nodeId);
  if (existing) await db.delete(SHEET_CONTENTS, existing.id);
}

// ─── Sheet Deltas ─────────────────────────────────────────────

export async function getSheetDeltas(contentId: string): Promise<SheetDelta[]> {
  const db = await getDB();
  const results = await db.getAllFromIndex(
    SHEET_DELTAS,
    'by-contentId',
    contentId,
  );
  return (results as SheetDelta[]).sort((a, b) => a.seq - b.seq);
}

export async function putSheetDelta(delta: SheetDelta): Promise<void> {
  const db = await getDB();
  await db.put(SHEET_DELTAS, delta);
}

export async function deleteSheetDeltasByContentId(
  contentId: string,
): Promise<void> {
  const db = await getDB();
  const keys = await db.getAllKeysFromIndex(
    SHEET_DELTAS,
    'by-contentId',
    contentId,
  );
  const tx = db.transaction(SHEET_DELTAS, 'readwrite');
  for (const key of keys) await tx.store.delete(key);
  await tx.done;
}

// ─── App State ────────────────────────────────────────────────

export async function getStateKV(
  scope: string,
  scopeId: string,
  key: string,
): Promise<StateKV | undefined> {
  const db = await getDB();
  return db.get(APP_STATE, [scope, scopeId, key]);
}

export async function setStateKV(
  scope: string,
  scopeId: string,
  key: string,
  value: unknown,
): Promise<void> {
  const db = await getDB();
  const entry: StateKV = {
    scope,
    scopeId,
    key,
    value,
    updatedAt: new Date().toISOString(),
  };
  await db.put(APP_STATE, entry);
}

export async function deleteStateKV(
  scope: string,
  scopeId: string,
  key: string,
): Promise<void> {
  const db = await getDB();
  await db.delete(APP_STATE, [scope, scopeId, key]);
}

// ─── State KV Convenience ─────────────────────────────────────

export async function getLastOpenNodeId(
  versionId: string,
): Promise<string | undefined> {
  const kv = await getStateKV('version', versionId, SK_LAST_OPEN_NODE_ID);
  return kv?.value as string | undefined;
}

export async function setLastOpenNodeId(
  versionId: string,
  nodeId: string,
): Promise<void> {
  await setStateKV('version', versionId, SK_LAST_OPEN_NODE_ID, nodeId);
}

export async function getSheetSelection(
  sheetId: string,
): Promise<{ anchor: number; head: number } | undefined> {
  const kv = await getStateKV('sheet', sheetId, SK_SHEET_LAST_SELECTION);
  return kv?.value as { anchor: number; head: number } | undefined;
}

export async function setSheetSelection(
  sheetId: string,
  sel: { anchor: number; head: number },
): Promise<void> {
  await setStateKV('sheet', sheetId, SK_SHEET_LAST_SELECTION, sel);
}

export async function getGroupCollapsed(groupId: string): Promise<boolean> {
  const kv = await getStateKV('group', groupId, SK_GROUP_COLLAPSED);
  return (kv?.value as boolean | undefined) ?? false;
}

export async function setGroupCollapsed(
  groupId: string,
  collapsed: boolean,
): Promise<void> {
  await setStateKV('group', groupId, SK_GROUP_COLLAPSED, collapsed);
}

// ─── Bulk Insert (for import, atomic) ─────────────────────────

export async function insertVersion(
  versionRoot: VersionRootNode,
  nodes: DataNode[],
  sheetContents: SheetContent[],
): Promise<void> {
  const db = await getDB();
  const tx = db.transaction([NODES, SHEET_CONTENTS], 'readwrite');
  tx.objectStore(NODES).put(versionRoot);
  for (const node of nodes) tx.objectStore(NODES).put(node);
  for (const sc of sheetContents) {
    // Remove old snapshot for this nodeId if any (unique index)
    const old = await tx
      .objectStore(SHEET_CONTENTS)
      .index('by-nodeId')
      .get(sc.nodeId);
    if (old) await tx.objectStore(SHEET_CONTENTS).delete(old.id);
    await tx.objectStore(SHEET_CONTENTS).put(sc);
  }
  await tx.done;
}

// ─── Delete Version Subtree (atomic) ──────────────────────────

export async function deleteVersionSubtree(versionId: string): Promise<void> {
  const dataNodes = await getAllNodesInVersion(versionId);
  const sheetIds = dataNodes.filter((n) => n.type === 'sheet').map((n) => n.id);

  const db = await getDB();

  // Collect contentIds for delta cleanup (must be done before transaction)
  const contentIds: string[] = [];
  for (const sheetId of sheetIds) {
    const sc = await db.getFromIndex(SHEET_CONTENTS, 'by-nodeId', sheetId);
    if (sc) contentIds.push(sc.id);
  }

  // Delete deltas first (separate transaction)
  for (const contentId of contentIds) {
    await deleteSheetDeltasByContentId(contentId);
  }

  const tx = db.transaction([NODES, SHEET_CONTENTS, APP_STATE], 'readwrite');

  await tx.objectStore(NODES).delete(versionId);
  for (const node of dataNodes) await tx.objectStore(NODES).delete(node.id);
  for (const contentId of contentIds) {
    await tx.objectStore(SHEET_CONTENTS).delete(contentId);
  }

  // Cleanup version-specific app state
  const appStore = tx.objectStore(APP_STATE);
  const appIdx = appStore.index('by-scope-scopeId');
  const appKeys = await appIdx.getAllKeys(['version', versionId]);
  for (const key of appKeys) await appStore.delete(key);

  await tx.done;
}

// ─── Delete Node Subtree (atomic) ──────────────────────────────

export async function deleteNodeSubtree(nodeId: string): Promise<void> {
  const db = await getDB();

  // Collect all descendant node IDs
  const idsToDelete = new Set<string>([nodeId]);
  const stack = [nodeId];
  while (stack.length > 0) {
    const parentId = stack.pop()!;
    const children = (await db.getAllFromIndex(
      NODES,
      'by-parentId',
      parentId,
    )) as DataNode[];
    for (const child of children) {
      if (!idsToDelete.has(child.id)) {
        idsToDelete.add(child.id);
        stack.push(child.id);
      }
    }
  }

  // Collect contentIds for sheet nodes (for delta cleanup)
  const contentIds: string[] = [];
  for (const id of idsToDelete) {
    const node = (await db.get(NODES, id)) as DocNode | undefined;
    if (node?.type === 'sheet') {
      const sc = await db.getFromIndex(SHEET_CONTENTS, 'by-nodeId', id);
      if (sc) contentIds.push(sc.id);
    }
  }

  // Delete deltas first
  for (const contentId of contentIds) {
    await deleteSheetDeltasByContentId(contentId);
  }

  const tx = db.transaction([NODES, SHEET_CONTENTS], 'readwrite');
  for (const id of idsToDelete) await tx.objectStore(NODES).delete(id);
  for (const contentId of contentIds) {
    await tx.objectStore(SHEET_CONTENTS).delete(contentId);
  }
  await tx.done;
}

// ─── Project-level Delete ─────────────────────────────────────

export async function deleteProject(projectId: string): Promise<void> {
  const roots = await getVersionRoots(projectId);
  for (const root of roots) {
    await deleteVersionSubtree(root.id);
  }
}

// ─── Atomic Move ─────────────────────────────────────────────

/**
 * Moves a node to a new parent and position atomically.
 * If afterId is null, moves to the start.
 * If afterId is undefined, moves to the end.
 * Otherwise, moves after the specified node ID.
 */
export async function moveNodeAtomic(
  itemId: string,
  newParentId: string,
  afterId?: string | null,
): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(NODES, 'readwrite');
  const store = tx.objectStore(NODES);
  const parentIdx = store.index('by-parentId');

  // 1. Get the target node
  const node = (await store.get(itemId)) as DocNode | undefined;
  if (!node || node.type === 'versionRoot') {
    await tx.done;
    return;
  }

  // 2. Get and sort current siblings in the target parent
  const results = (await parentIdx.getAll(newParentId)) as DataNode[];
  // Sort by orderKey, filtering out the moving item itself if it's already there
  const siblings = results
    .filter((s) => s.id !== itemId)
    .sort((a, b) => (a.orderKey ?? 0) - (b.orderKey ?? 0));

  let newOrderKey: number;

  if (afterId === null) {
    // Move to start
    const first = siblings[0];
    newOrderKey = first
      ? Math.floor((first.orderKey ?? ORDER_GAP) / 2)
      : ORDER_GAP;
  } else if (afterId === undefined) {
    // Move to end
    const last = siblings[siblings.length - 1];
    newOrderKey = last ? (last.orderKey ?? 0) + ORDER_GAP : ORDER_GAP;
  } else {
    // Move after specific ID
    const idx = siblings.findIndex((s) => s.id === afterId);
    if (idx === -1) {
      // Fallback to end if afterId not found
      const last = siblings[siblings.length - 1];
      newOrderKey = last ? (last.orderKey ?? 0) + ORDER_GAP : ORDER_GAP;
    } else {
      const cur = siblings[idx].orderKey ?? 0;
      const next = siblings[idx + 1]?.orderKey;
      if (next === undefined) {
        newOrderKey = cur + ORDER_GAP;
      } else {
        newOrderKey = Math.floor((cur + next) / 2);
      }
    }
  }

  // 3. Handle key exhaustion (if mid becomes equal to boundary)
  // Check if newOrderKey is already taken or is 0
  const isConflict =
    siblings.some((s) => s.orderKey === newOrderKey) || newOrderKey <= 0;

  if (isConflict) {
    // Re-index all siblings in this transaction to create space
    for (let i = 0; i < siblings.length; i++) {
      const s = siblings[i];
      await store.put({ ...s, orderKey: (i + 1) * ORDER_GAP });
    }
    // Re-calculate based on new standard indexing
    if (afterId === null) {
      newOrderKey = Math.floor(ORDER_GAP / 2);
    } else if (afterId === undefined) {
      newOrderKey = (siblings.length + 1) * ORDER_GAP;
    } else {
      const idx = siblings.findIndex((s) => s.id === afterId);
      newOrderKey = (idx + 1) * ORDER_GAP + Math.floor(ORDER_GAP / 2);
    }
  }

  // 4. Update the node
  await store.put({
    ...node,
    parentId: newParentId,
    orderKey: Math.floor(newOrderKey),
    updatedAt: new Date().toISOString(),
  });

  await tx.done;
}

// ─── Full Reset ───────────────────────────────────────────────

export async function fullReset(): Promise<void> {
  try {
    const db = await getDB();
    db.close();
    dbPromise = null;
    await deleteDB(DB_NAME);
  } catch {
    /* ignore */
  }

  if ('serviceWorker' in navigator) {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister()));
  }
  if ('caches' in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  }
  localStorage.clear();
  sessionStorage.clear();
  window.location.reload();
}
