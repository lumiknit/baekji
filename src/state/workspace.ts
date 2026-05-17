import { createSignal } from 'solid-js';
import { makePersisted } from '@solid-primitives/storage';
import localforage from 'localforage';
import { genOrderedId } from '../lib/uuid';

localforage.config({
  name: 'baekji-kv-pairs',
  storeName: 'keyvaluepairs',
});

const storage = {
  getItem: (key: string) => localforage.getItem<string>(key),
  setItem: (key: string, value: string) => localforage.setItem(key, value),
  removeItem: (key: string) => localforage.removeItem(key),
};

// Sidebar width persistence
export const [sidebarWidth, setSidebarWidth] = makePersisted(
  createSignal(260),
  {
    name: 'baekji-sidebar-width',
    storage,
  },
);

// Sidebar open state — persisted, default true so sidebar shows on first visit
export const [isSidebarOpen, setSidebarOpen] = makePersisted(
  createSignal(true),
  {
    name: 'baekji-sidebar-open',
    storage,
  },
);

// Sidebar view: 'tree' = project treeview, 'projects' = project list
export const [sidebarView, setSidebarView] = makePersisted(
  createSignal<'tree' | 'projects'>('tree'),
  {
    name: 'baekji-sidebar-view',
    storage,
  },
);

// Sheet list view options
export const [showUpdatedAt, setShowUpdatedAt] = makePersisted(
  createSignal(false),
  {
    name: 'baekji-show-updated-at',
    storage,
  },
);

// Bumped whenever the project list should be refreshed (e.g. after backup import)
export const [projectListVersion, setProjectListVersion] = createSignal(0);
export const invalidateProjectList = () => setProjectListVersion((v) => v + 1);

// Device ID — persisted so same device always has the same ID
export const [deviceId] = makePersisted(createSignal<string>(genOrderedId()), {
  name: 'baekji-device-id',
  storage,
});
