import { openDB } from 'idb';
import type { IDBPDatabase } from 'idb';
import { ChangeSet, Text } from '@codemirror/state';
import type { ProjectMeta, SheetMeta, SheetStats } from './v1.ts';
import type { DeltaPayload } from './cm.ts';
import { logError } from '../../state/log.ts';
import toast from 'solid-toast';

const DB_NAME = 'baekji-v3-data';
const DB_VERSION = 2;

export type SheetDelta = {
  sheetId: string;
  cs: DeltaPayload;
};

export type LoadSheetResult = {
  content: string;
  truncated: boolean; // true if delta replay stopped early due to corruption
  deltaCount: number; // number of deltas replayed (0 = snapshot only)
};

// ─── DB singleton ─────────────────────────────────────────────

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          db.createObjectStore('projects', { keyPath: 'id' });
          db.createObjectStore('appState', { keyPath: 'key' });
          const sheetMetas = db.createObjectStore('sheetMetas', {
            keyPath: 'id',
          });
          sheetMetas.createIndex('by_project', 'projectId');
          const sheetDeltas = db.createObjectStore('sheetDeltas', {
            autoIncrement: true,
          });
          sheetDeltas.createIndex('by_sheet', 'sheetId');
        }
        if (oldVersion < 2) {
          db.createObjectStore('sheetStats', { keyPath: 'sheetId' });
        }
      },
      terminated() {
        dbPromise = null;
      },
    }).then((db) => {
      db.onclose = () => {
        dbPromise = null;
      };
      return db;
    });
  }
  return dbPromise;
}

function handleDBError(context: string, err: unknown): void {
  logError(context, err);
  toast.error(
    `DB error in ${context}: ${err instanceof Error ? err.message : String(err)}`,
  );
}

// ─── Projects ─────────────────────────────────────────────────

export async function listProjects(): Promise<ProjectMeta[]> {
  try {
    const db = await getDB();
    return db.getAll('projects');
  } catch (err) {
    handleDBError('listProjects', err);
    return [];
  }
}

export async function getProjectMeta(
  projectId: string,
): Promise<ProjectMeta | undefined> {
  try {
    const db = await getDB();
    return db.get('projects', projectId);
  } catch (err) {
    handleDBError('getProjectMeta', err);
    return undefined;
  }
}

export async function putProjectMeta(meta: ProjectMeta): Promise<void> {
  try {
    const db = await getDB();
    await db.put('projects', meta);
  } catch (err) {
    handleDBError('putProjectMeta', err);
  }
}

export async function deleteProjectMeta(projectId: string): Promise<void> {
  try {
    const db = await getDB();
    await db.delete('projects', projectId);
  } catch (err) {
    handleDBError('deleteProjectMeta', err);
  }
}

// ─── SheetMetas ───────────────────────────────────────────────

export async function getSheetMeta(
  sheetId: string,
): Promise<SheetMeta | undefined> {
  try {
    const db = await getDB();
    return db.get('sheetMetas', sheetId);
  } catch (err) {
    handleDBError('getSheetMeta', err);
    return undefined;
  }
}

export async function putSheetMeta(meta: SheetMeta): Promise<void> {
  try {
    const db = await getDB();
    await db.put('sheetMetas', meta);
  } catch (err) {
    handleDBError('putSheetMeta', err);
  }
}

export async function putSheetMetaBatch(metas: SheetMeta[]): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction('sheetMetas', 'readwrite');
    await Promise.all([...metas.map((m) => tx.store.put(m)), tx.done]);
  } catch (err) {
    handleDBError('putSheetMetaBatch', err);
    throw err;
  }
}

export async function deleteSheetMeta(sheetId: string): Promise<void> {
  try {
    const db = await getDB();
    await db.delete('sheetMetas', sheetId);
  } catch (err) {
    handleDBError('deleteSheetMeta', err);
  }
}

export async function getSheetMetasByProject(
  projectId: string,
): Promise<SheetMeta[]> {
  try {
    const db = await getDB();
    return db.getAllFromIndex('sheetMetas', 'by_project', projectId);
  } catch (err) {
    handleDBError('getSheetMetasByProject', err);
    return [];
  }
}

// ─── SheetDeltas ──────────────────────────────────────────────

// Errors are NOT caught here — callers handle them per their context.
export async function appendSheetDelta(
  sheetId: string,
  cs: DeltaPayload,
): Promise<void> {
  const db = await getDB();
  await db.add('sheetDeltas', { sheetId, cs });
}

export async function getSheetDeltas(sheetId: string): Promise<SheetDelta[]> {
  try {
    const db = await getDB();
    return db.getAllFromIndex('sheetDeltas', 'by_sheet', sheetId);
  } catch (err) {
    handleDBError('getSheetDeltas', err);
    return [];
  }
}

// Replay deltas. String payload = full snapshot (reset doc). Array = ChangeSet.
// Stops at the first corrupted delta and returns truncated=true.
// deltaCount counts only ChangeSet entries (strings reset the baseline, not counted).
export async function loadSheetResult(
  sheetId: string,
): Promise<LoadSheetResult> {
  const deltas = await getSheetDeltas(sheetId);
  if (!deltas.length) return { content: '', truncated: false, deltaCount: 0 };
  let doc = Text.of(['']);
  let deltaCount = 0;
  for (let i = 0; i < deltas.length; i++) {
    const { cs } = deltas[i];
    try {
      if (typeof cs === 'string') {
        doc = Text.of(cs.split('\n'));
        deltaCount = 0; // snapshot resets the counter
      } else {
        doc = ChangeSet.fromJSON(cs).apply(doc);
        deltaCount++;
      }
    } catch (err) {
      logError(`loadSheetResult:delta[${i}]`, err);
      return { content: doc.toString(), truncated: true, deltaCount };
    }
  }
  return { content: doc.toString(), truncated: false, deltaCount };
}

export async function loadSheetContent(sheetId: string): Promise<string> {
  const { content } = await loadSheetResult(sheetId);
  return content;
}

// Replace all deltas with a single snapshot in one transaction.
// The snapshot is inserted first so a crash leaves old deltas intact (safe to retry).
export async function replaceSheetContent(
  sheetId: string,
  content: string,
): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction('sheetDeltas', 'readwrite');

    // Step 1: delete all existing deltas for this sheet.
    let cursor = await tx.store
      .index('by_sheet')
      .openCursor(IDBKeyRange.only(sheetId));
    while (cursor) {
      await cursor.delete();
      cursor = await cursor.continue();
    }

    // Step 2: insert the new snapshot (raw string).
    await tx.store.add({ sheetId, cs: content });

    await tx.done;
  } catch (err) {
    handleDBError('replaceSheetContent', err);
  }
}

export async function compactSheet(sheetId: string): Promise<void> {
  const { content, truncated } = await loadSheetResult(sheetId);
  if (truncated) {
    toast.error(
      `Sheet ${sheetId}: some data was corrupted and could not be recovered. Compacting up to the last good point.`,
    );
  }
  await replaceSheetContent(sheetId, content);
}

export async function compactAllSheets(): Promise<void> {
  try {
    const db = await getDB();
    const sheetIds = new Set<string>();
    let cursor = await db
      .transaction('sheetDeltas')
      .store.index('by_sheet')
      .openKeyCursor();
    while (cursor) {
      sheetIds.add(cursor.key as string);
      cursor = await cursor.continue();
    }
    // Sequential: compactSheet opens its own read-write transaction per sheet,
    // so concurrent runs would contend on the same IDB store and silently drop data.
    for (const id of sheetIds) {
      await compactSheet(id);
    }
  } catch (err) {
    handleDBError('compactAllSheets', err);
  }
}

export type DBStats = {
  projects: number;
  sheets: number;
  deltas: number;
};

export async function getDBStats(): Promise<DBStats> {
  const db = await getDB();
  const [projects, sheets, deltas] = await Promise.all([
    db.count('projects'),
    db.count('sheetMetas'),
    db.count('sheetDeltas'),
  ]);
  return { projects, sheets, deltas };
}

export type CleanupResult = {
  orphanSheets: number; // sheetMetas removed (project deleted)
  orphanDeltas: number; // delta-only sheetIds removed (no sheetMeta)
  compacted: number; // sheets compacted (had >1 delta)
};

// Full cleanup: remove orphan sheetMetas/deltas, compact remaining sheets.
export async function cleanupAndCompact(): Promise<CleanupResult> {
  const db = await getDB();
  const result: CleanupResult = {
    orphanSheets: 0,
    orphanDeltas: 0,
    compacted: 0,
  };

  // 1. Collect valid project IDs.
  const projectIds = new Set((await db.getAllKeys('projects')) as string[]);

  // 2. Remove sheetMetas whose project no longer exists, collect valid sheet IDs.
  const allSheetMetas = (await db.getAll('sheetMetas')) as SheetMeta[];
  const validSheetIds = new Set<string>();
  for (const meta of allSheetMetas) {
    if (!projectIds.has(meta.projectId)) {
      logError(
        `cleanup:orphanSheetMeta`,
        `removing orphan sheetMeta ${meta.id} (project ${meta.projectId} gone)`,
      );
      await db.delete('sheetMetas', meta.id);
      result.orphanSheets++;
    } else {
      validSheetIds.add(meta.id);
    }
  }

  // 3. Walk all delta sheetIds; delete any that have no sheetMeta, collect delta counts.
  const deltaCounts = new Map<string, number>();
  {
    const tx = db.transaction('sheetDeltas', 'readwrite');
    let cursor = await tx.store.index('by_sheet').openCursor();
    while (cursor) {
      const sheetId = cursor.value.sheetId as string;
      if (!validSheetIds.has(sheetId)) {
        logError(
          `cleanup:orphanDelta`,
          `deleting delta for orphan sheet ${sheetId}`,
        );
        await cursor.delete();
        result.orphanDeltas++;
      } else {
        deltaCounts.set(sheetId, (deltaCounts.get(sheetId) ?? 0) + 1);
      }
      cursor = await cursor.continue();
    }
    await tx.done;
  }

  // 4. Compact sheets that have more than one delta.
  for (const [sheetId, count] of deltaCounts) {
    if (count > 1) {
      logError(
        `cleanup:compact`,
        `compacting sheet ${sheetId} (${count} deltas)`,
      );
      await compactSheet(sheetId);
      result.compacted++;
    }
  }

  return result;
}

export async function deleteSheetDeltas(sheetId: string): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction('sheetDeltas', 'readwrite');
    let cursor = await tx.store
      .index('by_sheet')
      .openCursor(IDBKeyRange.only(sheetId));
    while (cursor) {
      await cursor.delete();
      cursor = await cursor.continue();
    }
    await tx.done;
  } catch (err) {
    handleDBError('deleteSheetDeltas', err);
  }
}

// ─── SheetStats ───────────────────────────────────────────────

export async function getSheetStats(
  sheetId: string,
): Promise<SheetStats | undefined> {
  try {
    const db = await getDB();
    return db.get('sheetStats', sheetId);
  } catch (err) {
    handleDBError('getSheetStats', err);
    return undefined;
  }
}

export async function putSheetStats(stats: SheetStats): Promise<void> {
  try {
    const db = await getDB();
    await db.put('sheetStats', stats);
  } catch (err) {
    handleDBError('putSheetStats', err);
  }
}

export async function deleteSheetStats(sheetId: string): Promise<void> {
  try {
    const db = await getDB();
    await db.delete('sheetStats', sheetId);
  } catch (err) {
    handleDBError('deleteSheetStats', err);
  }
}

export async function getSheetStatsByProject(
  projectId: string,
): Promise<SheetStats[]> {
  // No index by project — fetch all sheet IDs for the project then batch-get stats.
  try {
    const db = await getDB();
    const metas = await db.getAllFromIndex(
      'sheetMetas',
      'by_project',
      projectId,
    );
    const results = await Promise.all(
      metas.map((m) => db.get('sheetStats', m.id)),
    );
    return results.filter((s): s is SheetStats => s !== undefined);
  } catch (err) {
    handleDBError('getSheetStatsByProject', err);
    return [];
  }
}
