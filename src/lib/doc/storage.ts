import { compactSheet } from './db_v3.ts';

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

export async function compactSheetDoc(sheetId: string): Promise<void> {
  await compactSheet(sheetId);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export { formatBytes };
