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

// Device ID — persisted so same device always has the same ID
export const [deviceId] = makePersisted(createSignal<string>(genOrderedId()), {
  name: 'baekji-device-id',
  storage: localforage as any,
});
