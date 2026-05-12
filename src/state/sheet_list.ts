import { createRoot, createSignal, createEffect, createMemo } from 'solid-js';
import type { SheetMeta } from '../lib/doc/v1';
import { activeProjectDoc } from './workspace_v1';
import { matchQuery } from '../lib/tag/query';
import { genUnorderedId } from '../lib/uuid';

// ─── Sheet list state ────────────────────────────────────────────

const [allSheets, setAllSheets] = createSignal<SheetMeta[]>([]);
export const [filterQuery, setFilterQuery] = createSignal('');

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

export function orderKeyBetween(
  a: number | null,
  b: number | null,
): number {
  if (a === null && b === null) return 1000;
  if (a === null) return b! - 1000;
  if (b === null) return a + 1000;
  return (a + b) / 2;
}

// ─── CRUD ────────────────────────────────────────────────────────

export function createSheet(tags: string[] = []): string | null {
  const sheetsMap = getSheetsMap();
  const pd = activeProjectDoc();
  if (!sheetsMap || !pd) return null;

  const projectId = (pd.meta.get('id') as string | undefined) ?? '';
  const id = genUnorderedId();
  const now = new Date().toISOString();

  const meta: SheetMeta = {
    id,
    projectId,
    updatedAt: now,
    orderKey: maxOrderKey() + 1000,
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
  sheetsMap.set(id, { ...meta, deletedAt: new Date().toISOString() });
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

/** 두 시트 content를 합쳐서 첫 번째에 저장하고 두 번째를 휴지통으로 이동. */
export async function mergeSheetDown(id: string): Promise<void> {
  const sheets = liveSheets();
  const idx = sheets.findIndex((s) => s.id === id);
  if (idx < 0 || idx >= sheets.length - 1) return;

  const nextId = sheets[idx + 1].id;

  const { openSheetDoc, closeSheetDoc, waitForSync } = await import('../lib/doc/ydoc');
  const sd1 = openSheetDoc(id);
  const sd2 = openSheetDoc(nextId);
  await Promise.all([waitForSync(sd1.provider), waitForSync(sd2.provider)]);

  const text1 = sd1.content.toString().trimEnd();
  const text2 = sd2.content.toString().trimStart();
  const merged = text1 + (text1 && text2 ? '\n\n' : '') + text2;

  sd1.doc.transact(() => {
    sd1.content.delete(0, sd1.content.length);
    sd1.content.insert(0, merged);
  });

  closeSheetDoc(sd1);
  closeSheetDoc(sd2);
  softDeleteSheet(nextId);
}
