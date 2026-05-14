import { createSignal } from 'solid-js';
import { makePersisted } from '@solid-primitives/storage';
import localforage from 'localforage';
import { genOrderedId } from '../lib/uuid';

localforage.config({
  name: 'baekji-kv-pairs',
  storeName: 'keyvaluepairs',
});

// Sidebar width persistence
export const [sidebarWidth, setSidebarWidth] = makePersisted(
  createSignal(260),
  {
    name: 'baekji-sidebar-width',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    storage: localforage as any,
  },
);

// Sidebar open state — persisted, default true so sidebar shows on first visit
export const [isSidebarOpen, setSidebarOpen] = makePersisted(
  createSignal(true),
  {
    name: 'baekji-sidebar-open',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    storage: localforage as any,
  },
);

// Sidebar view: 'tree' = project treeview, 'projects' = project list
export const [sidebarView, setSidebarView] = makePersisted(
  createSignal<'tree' | 'projects'>('tree'),
  {
    name: 'baekji-sidebar-view',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    storage: localforage as any,
  },
);

// Sheet list view options
export const [showUpdatedAt, setShowUpdatedAt] = makePersisted(
  createSignal(false),
  {
    name: 'baekji-show-updated-at',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    storage: localforage as any,
  },
);

// Bumped whenever the project list should be refreshed (e.g. after backup import)
export const [projectListVersion, setProjectListVersion] = createSignal(0);
export const invalidateProjectList = () => setProjectListVersion((v) => v + 1);

// Device ID — persisted so same device always has the same ID
export const [deviceId] = makePersisted(createSignal<string>(genOrderedId()), {
  name: 'baekji-device-id',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  storage: localforage as any,
});
