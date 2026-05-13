import { createRoot, createSignal, createEffect, createMemo } from 'solid-js';
import type { SheetMeta } from '../lib/doc/v1';
import { activeProjectDoc } from './workspace_v1';
import { matchQuery } from '../lib/tag/query';
import { genUnorderedId } from '../lib/uuid';
import { readSheetText, writeSheetText } from '../lib/doc/ydoc';

// ─── Sheet list state ────────────────────────────────────────────

const [allSheets, setAllSheets] = createSignal<SheetMeta[]>([]);
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

export const liveSheets = createMemo(() =>
  allSheets()
    .filter((s) => !s.deletedAt)
    .sort((a, b) => a.orderKey - b.orderKey),
);

export const trashSheets = createMemo(() =>
  allSheets()
    .filter((s) => !!s.deletedAt)
    .sort((a, b) => a.orderKey - b.orderKey),
);

export const filteredSheets = createMemo(() => {
  const q = filterQuery().trim();
  if (!q) return liveSheets();
  return liveSheets().filter((s) => matchQuery(q, new Set(s.tags)));
});

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
      setAllSheets([]);
      return;
    }

    const sheetsMap = pd.sheets;
    const handler = () => {
      setAllSheets(Array.from(sheetsMap.values()));
    };
    sheetsMap.observe(handler);
    setAllSheets(Array.from(sheetsMap.values()));
    unobserve = () => sheetsMap.unobserve(handler);
  });
});

// ─── Helpers ─────────────────────────────────────────────────────

function getSheetsMap() {
  return activeProjectDoc()?.sheets ?? null;
}

function maxOrderKey(): number {
  const sheets = liveSheets();
  return sheets.length > 0 ? Math.max(...sheets.map((s) => s.orderKey)) : 0;
}

const ORDER_KEY_GAP = 1024;

export function orderKeyBetween(a: number | null, b: number | null): number {
  if (a === null && b === null) return ORDER_KEY_GAP;
  if (a === null) return b! - ORDER_KEY_GAP;
  if (b === null) return a + ORDER_KEY_GAP;
  return (a + b) / 2;
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
}

export function updateSheetTags(id: string, tags: string[]): void {
  const sheetsMap = getSheetsMap();
  if (!sheetsMap) return;
  const meta = sheetsMap.get(id);
  if (!meta) return;
  sheetsMap.set(id, { ...meta, tags, updatedAt: new Date().toISOString() });
}

export function reorderSheet(id: string, newOrderKey: number): void {
  const sheetsMap = getSheetsMap();
  if (!sheetsMap) return;
  const meta = sheetsMap.get(id);
  if (!meta) return;
  sheetsMap.set(id, { ...meta, orderKey: newOrderKey });
}

export function emptyTrash(): void {
  const sheetsMap = getSheetsMap();
  if (!sheetsMap) return;
  for (const s of trashSheets()) sheetsMap.delete(s.id);
}

export async function createSheetWithContent(
  tags: string[],
  content: string,
  options?: { after?: string; before?: string },
): Promise<string | null> {
  const id = createSheet(tags, options);
  if (!id) return null;
  await writeSheetText(id, content);
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
    readSheetText(id),
    readSheetText(nextId),
  ]);
  const text1 = text1Raw.trimEnd();
  const text2 = text2Raw.trimStart();
  const merged = text1 + (text1 && text2 ? '\n\n' : '') + text2;

  await writeSheetText(id, merged);
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

  await Promise.all([writeSheetText(id, head), writeSheetText(nextId, tail)]);

  const now = new Date().toISOString();
  sheetsMap.set(id, { ...meta, updatedAt: now });
  const nextMeta = sheetsMap.get(nextId);
  if (nextMeta) sheetsMap.set(nextId, { ...nextMeta, updatedAt: now });

  return nextId;
}
