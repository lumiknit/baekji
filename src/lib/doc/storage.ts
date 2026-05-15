import { openSheetDoc, closeSheetDoc, waitForSync } from './ydoc';

export async function listBaekjiDatabases(): Promise<
  { name: string; estimatedBytes?: number }[]
> {
  if (!indexedDB.databases) return [];
  const all = await indexedDB.databases();
  return all
    .filter((db) => db.name?.startsWith('baekji-'))
    .map((db) => ({ name: db.name! }));
}

export async function estimateStorageUsage(): Promise<{
  used: number;
  quota: number;
}> {
  if (!navigator.storage?.estimate) return { used: 0, quota: 0 };
  const { usage = 0, quota = 0 } = await navigator.storage.estimate();
  return { used: usage, quota };
}

export async function deleteOrphanSheetDatabases(
  liveSheetIds: Set<string>,
): Promise<number> {
  const dbs = await listBaekjiDatabases();
  let count = 0;
  for (const db of dbs) {
    const match = db.name.match(/^baekji-v2-sheet-(.+)$/);
    if (!match) continue;
    const id = match[1];
    if (!liveSheetIds.has(id)) {
      indexedDB.deleteDatabase(db.name);
      count++;
    }
  }
  return count;
}

export async function compactSheetDoc(sheetId: string): Promise<void> {
  const sd = openSheetDoc(sheetId);
  await waitForSync(sd.provider);
  const content = sd.content.toString();
  await sd.provider.clearData(); // destroy + deleteDB
  // Re-open and write the snapshot
  const sd2 = openSheetDoc(sheetId);
  await waitForSync(sd2.provider);
  sd2.doc.transact(() => {
    sd2.content.delete(0, sd2.content.length);
    sd2.content.insert(0, content);
  });
  closeSheetDoc(sd2);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export { formatBytes };
