import { openSheetDoc, closeSheetDoc, waitForSync } from './ydoc';
import type { SheetDoc } from './ydoc';

type CachedDoc = { doc: SheetDoc; refCount: number };

const sheetDocCache = new Map<string, CachedDoc>();

export function acquireSheetDoc(sheetId: string): SheetDoc {
  const cached = sheetDocCache.get(sheetId);
  if (cached) {
    cached.refCount++;
    return cached.doc;
  }
  const doc = openSheetDoc(sheetId);
  sheetDocCache.set(sheetId, { doc, refCount: 1 });
  return doc;
}

export function releaseSheetDoc(sheetId: string): void {
  const cached = sheetDocCache.get(sheetId);
  if (!cached) return;
  cached.refCount--;
  if (cached.refCount <= 0) {
    sheetDocCache.delete(sheetId);
    closeSheetDoc(cached.doc);
  }
}

export async function withSheetDoc<T>(
  sheetId: string,
  fn: (doc: SheetDoc) => Promise<T>,
): Promise<T> {
  const doc = acquireSheetDoc(sheetId);
  await waitForSync(doc.provider);
  try {
    return await fn(doc);
  } finally {
    releaseSheetDoc(sheetId);
  }
}
