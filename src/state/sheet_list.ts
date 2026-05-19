import { createRoot, createSignal, createEffect, createMemo, untrack, batch } from 'solid-js';
import { createStore, produce, reconcile } from 'solid-js/store';
import * as Y from 'yjs';
import type { SheetMeta } from '../lib/doc/v1';
import { activeProjectDoc } from './workspace_v1';
import { matchQuery } from '../lib/tag/query';
import { genUnorderedId } from '../lib/uuid';
import { withSheetDoc } from '../lib/doc/docCache';

// ─── Sheet list state ────────────────────────────────────────────

// Fine-grained store: per-sheet updates without rebuilding the full array.
export const [sheetsStore, setSheetsStore] = createStore<Record<string, SheetMeta>>({});

// Sorted ID lists — only rebuilt when order or membership changes.
const [_liveSortedIds, _setLiveSortedIds] = createSignal<string[]>([]);
const [_trashSortedIds, _setTrashSortedIds] = createSignal<string[]>([]);

export const liveSortedIds = _liveSortedIds;

function rebuildSortedIds() {
  const all = Object.values(sheetsStore);
  _setLiveSortedIds(
    all.filter(s => !s.deletedAt).sort((a, b) => a.orderKey - b.orderKey).map(s => s.id),
  );
  _setTrashSortedIds(
    all.filter(s => !!s.deletedAt).sort((a, b) => a.orderKey - b.orderKey).map(s => s.id),
  );
}

export const [filterQuery, setFilterQuery] = createSignal('');
export const [selectedIds, setSelectedIds] = createSignal<Set<string>>(
  new Set(),
);
export const [isSelectMode, setSelectMode] = createSignal(false);
// last toggled id for shift+click range select
const [_anchorId, setAnchorId] = createSignal<string | null>(null);

export const enterSelectMode = () => setSelectMode(true);
export const exitSelectMode = () => {
  setSelectMode(false);
  setSelectedIds(new Set<string>());
  setAnchorId(null);
};

export const isSelected = (id: string) => selectedIds().has(id);
export const clearSelection = () => {
  setSelectedIds(new Set<string>());
  setAnchorId(null);
};
export const toggleSelect = (id: string) =>
  setSelectedIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setAnchorId(id);
    if (next.size === 0) setSelectMode(false);
    return next;
  });

export const rangeSelect = (
  toId: string,
  sheets: ReturnType<typeof liveSheets>,
) => {
  const anchor = _anchorId();
  if (!anchor) {
    toggleSelect(toId);
    return;
  }
  const ids = sheets.map((s) => s.id);
  const a = ids.indexOf(anchor);
  const b = ids.indexOf(toId);
  if (a === -1 || b === -1) {
    toggleSelect(toId);
    return;
  }
  const [from, to] = a < b ? [a, b] : [b, a];
  setSelectedIds((prev) => {
    const next = new Set(prev);
    for (let i = from; i <= to; i++) next.add(ids[i]);
    return next;
  });
};

export const trashSortedIds = _trashSortedIds;

// For rendering: ID-only memo avoids re-running <For> on metadata changes.
export const filteredSheetIds = createMemo(() => {
  const q = filterQuery().trim();
  if (!q) return _liveSortedIds();
  return _liveSortedIds().filter(id => {
    const sheet = sheetsStore[id];
    return sheet && matchQuery(q, new Set(sheet.tags));
  });
});

// allTags is reactive (used in tag filter UI).
export const allTags = createMemo(() => {
  const tags = new Set<string>();
  for (const id of _liveSortedIds()) {
    for (const tag of sheetsStore[id]?.tags ?? []) tags.add(tag);
  }
  return Array.from(tags).sort();
});

// Plain functions — not memos — so they do not accumulate reactive dependencies
// when unused, and callers decide the tracking context.
export function liveSheets(): SheetMeta[] {
  return _liveSortedIds().map(id => sheetsStore[id]).filter(Boolean) as SheetMeta[];
}

export function trashSheets(): SheetMeta[] {
  return _trashSortedIds().map(id => sheetsStore[id]).filter(Boolean) as SheetMeta[];
}

export function filteredSheets(): SheetMeta[] {
  return filteredSheetIds().map(id => sheetsStore[id]).filter(Boolean) as SheetMeta[];
}

export const selectAll = () => {
  setSelectedIds(new Set<string>(filteredSheets().map((s) => s.id)));
  setSelectMode(true);
};

// ─── Y.Map subscription ──────────────────────────────────────────

createRoot(() => {
  let unobserve: (() => void) | null = null;

  createEffect(() => {
    const pd = activeProjectDoc();
    if (unobserve) {
      unobserve();
      unobserve = null;
    }
    if (!pd) {
      batch(() => {
        setSheetsStore(reconcile({}));
        _setLiveSortedIds([]);
        _setTrashSortedIds([]);
      });
      return;
    }

    const sheetsMap = pd.sheets;

    // Full load on initial attach. batch ensures store and sorted IDs update
    // atomically. untrack prevents createEffect from depending on sheetsStore
    // values, which would re-run the effect on every sheet change.
    batch(() => {
      setSheetsStore(reconcile(Object.fromEntries(sheetsMap.entries())));
      untrack(() => rebuildSortedIds());
    });

    // Called from Y.Map observer — not a Solid reactive context, so store reads
    // inside rebuildSortedIds() are safe and do not create reactive dependencies.
    // batch ensures all key changes in a single Y.Map transaction are applied
    // atomically, so dependents are only notified once per transaction.
    const handler = (event: Y.YMapEvent<SheetMeta>) => {
      batch(() => {
        let orderChanged = false;

        for (const [id, change] of event.changes.keys) {
          if (change.action === 'delete') {
            setSheetsStore(produce(s => { delete s[id]; }));
            orderChanged = true;
          } else {
            const newVal = sheetsMap.get(id)!;
            const oldVal = sheetsStore[id];
            if (!oldVal) {
              // New sheet added.
              setSheetsStore(id, reconcile(newVal));
              orderChanged = true;
            } else if (
              oldVal.orderKey !== newVal.orderKey ||
              !!oldVal.deletedAt !== !!newVal.deletedAt
            ) {
              // Order or live/trash membership changed.
              setSheetsStore(id, reconcile(newVal));
              orderChanged = true;
            } else {
              // Only metadata (updatedAt, tags, etc.) changed — reconcile ensures
              // only the actually-changed fields notify their subscribers.
              setSheetsStore(id, reconcile(newVal));
            }
          }
        }

        if (orderChanged) rebuildSortedIds();
      });
    };

    sheetsMap.observe(handler);
    unobserve = () => sheetsMap.unobserve(handler);
  });
});

// ─── Helpers ─────────────────────────────────────────────────────

function getSheetsMap() {
  return activeProjectDoc()?.sheets ?? null;
}

function maxOrderKey(): number {
  return liveSheets().reduce(
    (m, s) => (s.orderKey > m ? s.orderKey : m),
    -Infinity,
  );
}

const ORDER_KEY_GAP = 1024;

export function orderKeyBetween(a: number | null, b: number | null): number {
  if (a === null && b === null) return ORDER_KEY_GAP;
  if (a === null) return b! - ORDER_KEY_GAP;
  if (b === null) return a + ORDER_KEY_GAP;
  return (a + b) / 2;
}

export function orderKeysBetween(
  n: number,
  a: number | null,
  b: number | null,
): number[] {
  const start = a === null ? (b === null ? 0 : b - ORDER_KEY_GAP * (n + 1)) : a;
  const end = b === null ? start + ORDER_KEY_GAP * (n + 1) : b;
  const step = (end - start) / (n + 1);
  return Array.from({ length: n }, (_, i) => start + step * (i + 1));
}

// ─── CRUD ────────────────────────────────────────────────────────

export function createSheet(
  tags: string[],
  options?: { after?: string; before?: string },
): string | null {
  const sheetsMap = getSheetsMap();
  const pd = activeProjectDoc();
  if (!sheetsMap || !pd) return null;

  const projectId = (pd.meta.get('id') as string | undefined) ?? '';
  const id = genUnorderedId();
  const now = new Date().toISOString();

  let orderKey: number;
  const sheets = liveSheets();

  if (options?.after) {
    const idx = sheets.findIndex((s) => s.id === options.after);
    if (idx !== -1) {
      const currentOrderKey = sheets[idx].orderKey;
      const nextOrderKey =
        idx + 1 < sheets.length ? sheets[idx + 1].orderKey : null;
      orderKey = orderKeyBetween(currentOrderKey, nextOrderKey);
    } else {
      orderKey = orderKeyBetween(maxOrderKey(), null);
    }
  } else if (options?.before) {
    const idx = sheets.findIndex((s) => s.id === options.before);
    if (idx !== -1) {
      const currentOrderKey = sheets[idx].orderKey;
      const prevOrderKey = idx > 0 ? sheets[idx - 1].orderKey : null;
      orderKey = orderKeyBetween(prevOrderKey, currentOrderKey);
    } else {
      orderKey = orderKeyBetween(null, sheets[0]?.orderKey ?? null);
    }
  } else {
    orderKey = orderKeyBetween(maxOrderKey(), null);
  }

  const meta: SheetMeta = {
    id,
    projectId,
    updatedAt: now,
    orderKey,
    tags,
  };

  sheetsMap.set(id, meta);
  return id;
}

export function softDeleteSheet(id: string): void {
  const sheetsMap = getSheetsMap();
  if (!sheetsMap) return;
  const meta = sheetsMap.get(id);
  if (!meta) return;
  const now = new Date().toISOString();
  sheetsMap.set(id, { ...meta, updatedAt: now, deletedAt: now });
}

export function touchSheetUpdatedAt(id: string): void {
  const sheetsMap = getSheetsMap();
  if (!sheetsMap) return;
  const meta = sheetsMap.get(id);
  if (!meta) return;
  sheetsMap.set(id, { ...meta, updatedAt: new Date().toISOString() });
}

export function restoreSheet(id: string): void {
  const sheetsMap = getSheetsMap();
  if (!sheetsMap) return;
  const meta = sheetsMap.get(id);
  if (!meta) return;
  const restored = { ...meta };
  delete restored.deletedAt;
  sheetsMap.set(id, restored);
}

export function deleteSheetPermanently(id: string): void {
  const sheetsMap = getSheetsMap();
  if (!sheetsMap) return;
  sheetsMap.delete(id);
  indexedDB.deleteDatabase(`baekji-v2-sheet-${id}`);
}

export function updateSheetTags(id: string, tags: string[]): void {
  const sheetsMap = getSheetsMap();
  if (!sheetsMap) return;
  const meta = sheetsMap.get(id);
  if (!meta) return;
  sheetsMap.set(id, { ...meta, tags, updatedAt: new Date().toISOString() });
}

export function updateSelectedSheetTags(ids: string[], tags: string[]): void {
  const sheetsMap = getSheetsMap();
  if (!sheetsMap) return;
  for (const id of ids) {
    const meta = sheetsMap.get(id);
    if (meta)
      sheetsMap.set(id, { ...meta, tags, updatedAt: new Date().toISOString() });
  }
}

export function reorderSheet(id: string, newOrderKey: number): void {
  const sheetsMap = getSheetsMap();
  if (!sheetsMap) return;
  const meta = sheetsMap.get(id);
  if (!meta) return;
  sheetsMap.set(id, { ...meta, orderKey: newOrderKey });
}

export function reindexOrderKeys(): void {
  const sheetsMap = getSheetsMap();
  const pd = activeProjectDoc();
  if (!sheetsMap || !pd) return;
  const sorted = Array.from(sheetsMap.values()).sort(
    (a, b) => a.orderKey - b.orderKey,
  );
  pd.doc.transact(() => {
    sorted.forEach((sheet, i) => {
      sheetsMap.set(sheet.id, { ...sheet, orderKey: (i + 1) * ORDER_KEY_GAP });
    });
  });
}

export function emptyTrash(): void {
  const sheetsMap = getSheetsMap();
  if (!sheetsMap) return;
  for (const s of trashSheets()) {
    sheetsMap.delete(s.id);
    indexedDB.deleteDatabase(`baekji-v2-sheet-${s.id}`);
  }
}

export async function createSheetWithContent(
  tags: string[],
  content: string,
  options?: { after?: string; before?: string },
): Promise<string | null> {
  const id = createSheet(tags, options);
  if (!id) return null;
  await withSheetDoc(id, async (sd) => {
    sd.doc.transact(() => {
      sd.content.delete(0, sd.content.length);
      sd.content.insert(0, content);
    });
  });
  return id;
}

/** 두 시트 content를 합쳐서 첫 번째에 저장하고 두 번째를 휴지통으로 이동.
 * list가 주어지면 해당 리스트에서 id 다음 항목과 합침. */
export async function mergeSheetDown(
  id: string,
  list?: SheetMeta[],
): Promise<void> {
  const sheets = list ?? liveSheets();
  const idx = sheets.findIndex((s) => s.id === id);
  if (idx < 0 || idx >= sheets.length - 1) return;

  const nextId = sheets[idx + 1].id;

  const [text1Raw, text2Raw] = await Promise.all([
    withSheetDoc(id, async (sd) => sd.content.toString()),
    withSheetDoc(nextId, async (sd) => sd.content.toString()),
  ]);
  const text1 = text1Raw.trimEnd();
  const text2 = text2Raw.trimStart();
  const merged = text1 + (text1 && text2 ? '\n\n' : '') + text2;

  await withSheetDoc(id, async (sd) => {
    sd.doc.transact(() => {
      sd.content.delete(0, sd.content.length);
      sd.content.insert(0, merged);
    });
  });
  softDeleteSheet(nextId);
}

/** 시트를 지정된 위치에서 둘로 나눔. */
export async function splitSheet(
  id: string,
  head: string,
  tail: string,
): Promise<string | null> {
  const sheetsMap = getSheetsMap();
  if (!sheetsMap) return null;
  const meta = sheetsMap.get(id);
  if (!meta) return null;

  const nextId = createSheet(meta.tags, { after: id });
  if (!nextId) return null;

  // Write tail to new sheet first; if this fails, the original is untouched.
  await withSheetDoc(nextId, async (sd) => {
    sd.doc.transact(() => {
      sd.content.delete(0, sd.content.length);
      sd.content.insert(0, tail);
    });
  });
  await withSheetDoc(id, async (sd) => {
    sd.doc.transact(() => {
      sd.content.delete(0, sd.content.length);
      sd.content.insert(0, head);
    });
  });

  const now = new Date().toISOString();
  sheetsMap.set(id, { ...meta, updatedAt: now });
  const nextMeta = sheetsMap.get(nextId);
  if (nextMeta) sheetsMap.set(nextId, { ...nextMeta, updatedAt: now });

  return nextId;
}
