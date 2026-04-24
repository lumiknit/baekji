import { createSignal } from 'solid-js';
import { makePersisted } from '@solid-primitives/storage';
import localforage from 'localforage';
import { genId } from '../lib/uuid';

localforage.config({
  name: 'baekji-kv-pairs',
  storeName: 'keyvaluepairs',
});

// Sidebar width persistence
export const [sidebarWidth, setSidebarWidth] = makePersisted(
  createSignal(260),
  {
    name: 'baekji-sidebar-width',
    storage: localforage as any,
  },
);

// Sidebar open state — persisted, default true so sidebar shows on first visit
export const [isSidebarOpen, setSidebarOpen] = makePersisted(
  createSignal(true),
  {
    name: 'baekji-sidebar-open',
    storage: localforage as any,
  },
);

// Sidebar view: 'tree' = project treeview, 'projects' = project list
export const [sidebarView, setSidebarView] = makePersisted(
  createSignal<'tree' | 'projects'>('tree'),
  {
    name: 'baekji-sidebar-view',
    storage: localforage as any,
  },
);

// Active project version root ID
export const [activePjVerId, setActivePjVerId] = createSignal<string | null>(
  null,
);

// Persistent device ID — generated once on first visit, used in backup metadata
export const [deviceId] = makePersisted(createSignal<string>(genId()), {
  name: 'baekji-device-id',
  storage: localforage as any,
});

// Last globally opened node ID
export const [lastGlobalNodeId, setLastGlobalNodeId] = makePersisted(
  createSignal<string | null>(null),
  { name: 'baekji-last-node', storage: localforage as any },
);

// Group open/close state: undefined = default (closed), true = open, false = closed
export const [groupOpenState, setGroupOpenState] = makePersisted(
  createSignal<Record<string, boolean | undefined>>({}),
  {
    name: 'baekji-group-open-state',
    storage: localforage as any,
  },
);

export function setGroupOpen(groupId: string, open: boolean): void {
  setGroupOpenState((prev) => ({ ...prev, [groupId]: open }));
}

export function setAllGroupsOpen(
  nodes: Record<string, { type: string }>,
  open: boolean,
): void {
  const patch: Record<string, boolean> = {};
  for (const [id, node] of Object.entries(nodes)) {
    if (node.type === 'group') patch[id] = open;
  }
  setGroupOpenState((prev) => ({ ...prev, ...patch }));
}

export function isGroupOpen(groupId: string, defaultOpen = false): boolean {
  const v = groupOpenState()[groupId];
  return v === undefined ? defaultOpen : v;
}
