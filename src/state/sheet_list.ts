import { createSignal, createMemo } from 'solid-js';
import { createStore, produce, reconcile, unwrap } from 'solid-js/store';
import type { SheetMeta, SheetStats, WritingGoal } from '../lib/doc/v1.ts';
import { activeProjectId } from './workspace_v3.ts';
import { matchQuery } from '../lib/tag/query.ts';
import { genUnorderedId } from '../lib/uuid.ts';
import {
  getSheetMetasByProject,
  putSheetMeta,
  putSheetMetaBatch,
  deleteSheetMeta,
  deleteSheetDeltas,
  deleteSheetStats,
  appendSheetDelta,
  loadSheetContent,
  replaceSheetContent,
  putSheetStats,
  getSheetStatsByProject,
} from '../lib/doc/db_v3.ts';

// ─── Sheet list state ────────────────────────────────────────────

export const [sheetsStore, setSheetsStore] = createStore<
  Record<string, SheetMeta>
>({});
export const [sheetStatsStore, setSheetStatsStore] = createStore<
  Record<string, SheetStats>
>({});

// Incremented whenever sheet content is flushed so previews can re-fetch.
const [_previewVersion, setPreviewVersion] = createSignal(0);
export const previewVersion = _previewVersion;
export function invalidateSheetPreview() {
  setPreviewVersion((v) => v + 1);
}

const [_liveSortedIds, _setLiveSortedIds] = createSignal<string[]>([]);
const [_trashSortedIds, _setTrashSortedIds] = createSignal<string[]>([]);

export const liveSortedIds = _liveSortedIds;

function rebuildSortedIds() {
  const all = Object.values(sheetsStore);
  _setLiveSortedIds(
    all
      .filter((s) => !s.deletedAt)
      .sort((a, b) => a.orderKey - b.orderKey)
      .map((s) => s.id),
  );
  _setTrashSortedIds(
    all
      .filter((s) => !!s.deletedAt)
      .sort((a, b) => a.orderKey - b.orderKey)
      .map((s) => s.id),
  );
}

export const [filterQuery, setFilterQuery] = createSignal('');
export const [selectedIds, setSelectedIds] = createSignal<Set<string>>(
  new Set(),
);
export const [isSelectMode, setSelectMode] = createSignal(false);
const [_anchorId, setAnchorId] = createSignal<string | null>(null);

export const enterSelectMode = (initialId?: string) => {
  setSelectMode(true);
  if (initialId) {
    setSelectedIds(new Set([initialId]));
    setAnchorId(initialId);
  }
};
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

export const filteredSheetIds = createMemo(() => {
  const q = filterQuery().trim();
  if (!q) return _liveSortedIds();
  return _liveSortedIds().filter((id) => {
    const sheet = sheetsStore[id];
    return sheet && matchQuery(q, new Set(sheet.tags));
  });
});

export const allTags = createMemo(() => {
  const tags = new Set<string>();
  for (const id of _liveSortedIds()) {
    for (const tag of sheetsStore[id]?.tags ?? []) tags.add(tag);
  }
  return Array.from(tags).sort();
});

export function liveSheets(): SheetMeta[] {
  return _liveSortedIds()
    .map((id) => sheetsStore[id])
    .filter(Boolean) as SheetMeta[];
}

export function trashSheets(): SheetMeta[] {
  return _trashSortedIds()
    .map((id) => sheetsStore[id])
    .filter(Boolean) as SheetMeta[];
}

export function filteredSheets(): SheetMeta[] {
  return filteredSheetIds()
    .map((id) => sheetsStore[id])
    .filter(Boolean) as SheetMeta[];
}

export const selectAll = () => {
  setSelectedIds(new Set<string>(filteredSheets().map((s) => s.id)));
  setSelectMode(true);
};

// ─── Load sheets for active project ──────────────────────────────

export async function loadSheetsForProject(projectId: string): Promise<void> {
  const [metas, statsList] = await Promise.all([
    getSheetMetasByProject(projectId),
    getSheetStatsByProject(projectId),
  ]);
  const metaMap: Record<string, SheetMeta> = {};
  for (const m of metas) metaMap[m.id] = m;
  const statsMap: Record<string, SheetStats> = {};
  for (const s of statsList) statsMap[s.sheetId] = s;
  setSheetsStore(reconcile(metaMap));
  setSheetStatsStore(reconcile(statsMap));
  rebuildSortedIds();
}

export function clearSheets(): void {
  setSheetsStore(reconcile({}));
  setSheetStatsStore(reconcile({}));
  _setLiveSortedIds([]);
  _setTrashSortedIds([]);
}

// ─── Helpers ─────────────────────────────────────────────────────

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

function applyMeta(meta: SheetMeta): void {
  setSheetsStore(meta.id, reconcile(meta));
  rebuildSortedIds();
}

// Strip SolidJS Proxy wrapping before passing to IDB structured clone.
function plain(meta: SheetMeta): SheetMeta {
  return unwrap(meta);
}

// ─── Stats helpers ────────────────────────────────────────────────

export function touchSheetStats(id: string, writingSeconds: number): void {
  const updatedAt = new Date().toISOString();
  const stats: SheetStats = { sheetId: id, updatedAt, writingSeconds };
  setSheetStatsStore(id, reconcile(stats));
  putSheetStats(stats);
}

export function updateSheetGoal(
  id: string,
  goal: WritingGoal | undefined,
): void {
  const meta = sheetsStore[id];
  if (!meta) return;
  const updated = { ...plain(meta), goal };
  setSheetsStore(id, reconcile(updated));
  putSheetMeta(updated);
}

export function resetSheetWritingSeconds(id: string): void {
  const existing = sheetStatsStore[id];
  const stats: SheetStats = {
    sheetId: id,
    updatedAt: existing?.updatedAt ?? new Date().toISOString(),
    writingSeconds: 0,
  };
  setSheetStatsStore(id, reconcile(stats));
  putSheetStats(stats);
}

// ─── CRUD ────────────────────────────────────────────────────────

export async function createSheet(
  tags: string[],
  options?: { after?: string; before?: string },
): Promise<string | null> {
  const projectId = activeProjectId();
  if (!projectId) return null;

  const id = genUnorderedId();

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

  const meta: SheetMeta = { id, projectId, orderKey, tags };
  applyMeta(meta);
  putSheetMeta(plain(meta));
  return id;
}

export function softDeleteSheet(id: string): void {
  const meta = sheetsStore[id];
  if (!meta) return;
  const now = new Date().toISOString();
  const updated = { ...plain(meta), deletedAt: now };
  applyMeta(updated);
  putSheetMeta(updated);
  touchSheetStats(id, sheetStatsStore[id]?.writingSeconds ?? 0);
}

export function restoreSheet(id: string): void {
  const meta = sheetsStore[id];
  if (!meta) return;
  const restored = { ...plain(meta) };
  delete restored.deletedAt;
  applyMeta(restored);
  putSheetMeta(restored);
}

export async function deleteSheetPermanently(id: string): Promise<void> {
  await Promise.all([
    deleteSheetDeltas(id),
    deleteSheetMeta(id),
    deleteSheetStats(id),
  ]);
  setSheetsStore(
    produce((s) => {
      delete s[id];
    }),
  );
  setSheetStatsStore(
    produce((s) => {
      delete s[id];
    }),
  );
  rebuildSortedIds();
}

export function updateSheetTags(id: string, tags: string[]): void {
  const meta = sheetsStore[id];
  if (!meta) return;
  const updated = { ...plain(meta), tags };
  setSheetsStore(id, reconcile(updated));
  putSheetMeta(updated);
}

export async function updateSheetTagsBatch(
  updates: Map<string, string[]>,
): Promise<void> {
  const metas: ReturnType<typeof plain>[] = [];
  for (const [id, tags] of updates) {
    const meta = sheetsStore[id];
    if (!meta) continue;
    const updated = { ...plain(meta), tags };
    setSheetsStore(id, reconcile(updated));
    metas.push(updated);
  }
  await putSheetMetaBatch(metas);
}

export function updateSelectedSheetTags(ids: string[], tags: string[]): void {
  const metas: SheetMeta[] = [];
  for (const id of ids) {
    const meta = sheetsStore[id];
    if (!meta) continue;
    const updated = { ...plain(meta), tags };
    setSheetsStore(id, reconcile(updated));
    metas.push(updated);
  }
  putSheetMetaBatch(metas);
}

export function reorderSheet(id: string, newOrderKey: number): void {
  const meta = sheetsStore[id];
  if (!meta) return;
  const updated = { ...plain(meta), orderKey: newOrderKey };
  applyMeta(updated);
  putSheetMeta(updated);
}

export async function reindexOrderKeys(): Promise<void> {
  const sorted = [...liveSheets(), ...trashSheets()].sort(
    (a, b) => a.orderKey - b.orderKey,
  );
  await Promise.all(
    sorted.map(async (sheet, i) => {
      const updated = { ...plain(sheet), orderKey: (i + 1) * ORDER_KEY_GAP };
      await putSheetMeta(updated);
      setSheetsStore(sheet.id, 'orderKey', updated.orderKey);
    }),
  );
  rebuildSortedIds();
}

export async function emptyTrash(): Promise<void> {
  await Promise.all(trashSheets().map((s) => deleteSheetPermanently(s.id)));
}

// ─── Query helper ─────────────────────────────────────────────────

export type SheetData = {
  id: string;
  label: string;
  tags: string[];
  text: string;
};

/** Load sheet contents matching a query or explicit id list. */
export async function loadSheetsByQuery(opts: {
  sheetIds?: string[];
  query?: string;
}): Promise<SheetData[]> {
  const { sheetIds = [], query = '' } = opts;
  let sheets = liveSheets();
  if (sheetIds.length > 0) {
    sheets = sheets.filter((sh) => sheetIds.includes(sh.id));
  } else if (query.trim()) {
    sheets = sheets.filter((sh) => matchQuery(query.trim(), new Set(sh.tags)));
  }
  const texts = await Promise.all(sheets.map((sh) => loadSheetContent(sh.id)));
  return sheets.map((sheet, i) => ({
    id: sheet.id,
    label: sheet.tags[0] ?? sheet.id.slice(0, 8),
    tags: sheet.tags,
    text: texts[i],
  }));
}

export async function createSheetWithContent(
  tags: string[],
  content: string,
  options?: { after?: string; before?: string },
): Promise<string | null> {
  const id = await createSheet(tags, options);
  if (!id) return null;
  await appendSheetDelta(id, content);
  return id;
}

export async function mergeSheetDown(
  id: string,
  list?: SheetMeta[],
): Promise<void> {
  const sheets = list ?? liveSheets();
  const idx = sheets.findIndex((s) => s.id === id);
  if (idx < 0 || idx >= sheets.length - 1) return;

  const nextId = sheets[idx + 1].id;

  const [text1Raw, text2Raw] = await Promise.all([
    loadSheetContent(id),
    loadSheetContent(nextId),
  ]);
  const text1 = text1Raw.trimEnd();
  const text2 = text2Raw.trimStart();
  const merged = text1 + (text1 && text2 ? '\n\n' : '') + text2;

  await replaceSheetContent(id, merged);

  // Merge stats: sum of both writingSeconds, goal removed.
  const stats1 = sheetStatsStore[id];
  const stats2 = sheetStatsStore[nextId];
  const mergedSeconds =
    (stats1?.writingSeconds ?? 0) + (stats2?.writingSeconds ?? 0);
  touchSheetStats(id, mergedSeconds);

  // Remove goal from merged sheet.
  const meta = sheetsStore[id];
  if (meta?.goal) {
    const updated = { ...plain(meta) };
    delete updated.goal;
    setSheetsStore(id, reconcile(updated));
    putSheetMeta(updated);
  }

  softDeleteSheet(nextId);
}

export async function splitSheet(
  id: string,
  head: string,
  tail: string,
): Promise<string | null> {
  const meta = sheetsStore[id];
  if (!meta) return null;

  const nextId = await createSheet(meta.tags, { after: id });
  if (!nextId) return null;

  await replaceSheetContent(nextId, tail);
  await replaceSheetContent(id, head);

  // Split writingSeconds proportionally by character length.
  const totalLen = head.length + tail.length;
  const existingSeconds = sheetStatsStore[id]?.writingSeconds ?? 0;
  const headSeconds =
    totalLen > 0 ? Math.round((existingSeconds * head.length) / totalLen) : 0;
  const tailSeconds = existingSeconds - headSeconds;

  // Remove goal from both halves.
  const updatedMeta = { ...plain(meta) };
  delete updatedMeta.goal;
  setSheetsStore(id, reconcile(updatedMeta));
  putSheetMeta(updatedMeta);

  touchSheetStats(id, headSeconds);
  touchSheetStats(nextId, tailSeconds);

  return nextId;
}

// ─── Goal helpers ────────────────────────────────────────────────

export function startGoal(id: string, goalChars: number, dueAt?: string): void {
  const writingSeconds = sheetStatsStore[id]?.writingSeconds ?? 0;
  const goal: WritingGoal = {
    startedAt: new Date().toISOString(),
    startedWritingSeconds: writingSeconds,
    goalChars,
    ...(dueAt ? { dueAt } : {}),
  };
  updateSheetGoal(id, goal);
}

export function achieveGoal(id: string): void {
  const meta = sheetsStore[id];
  if (!meta?.goal) return;
  const writingSeconds = sheetStatsStore[id]?.writingSeconds ?? 0;
  const achieved: WritingGoal = {
    ...unwrap(meta.goal),
    achievedAt: new Date().toISOString(),
    achievedWritingSeconds: writingSeconds,
  };
  updateSheetGoal(id, achieved);
}

export function clearGoal(id: string): void {
  updateSheetGoal(id, undefined);
}
