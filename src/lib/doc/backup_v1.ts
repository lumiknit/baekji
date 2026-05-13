import type { BakV1, BakSheet, SheetMeta, ProjectMeta } from './v1';
import { bakV1Schema } from './v1';
import {
  openProjectDoc,
  closeProjectDoc,
  waitForSync,
  readProjectMeta,
  writeProjectMeta,
} from './ydoc';
import type { ProjectDoc } from './ydoc';
import { getProject, putProject } from './db_v1';
import { genUnorderedId } from '../uuid';

// ─── Export ───────────────────────────────────────────────────

export async function exportProjectAsBakV1(
  projectId: string,
  projectDoc: ProjectDoc,
  appVersion: string,
  deviceId: string,
): Promise<BakV1> {
  const meta = readProjectMeta(projectId, projectDoc.meta);
  const sheetsMap = projectDoc.sheets;
  const sheets = Array.from(sheetsMap.values()).sort(
    (a: SheetMeta, b: SheetMeta) => a.orderKey - b.orderKey,
  );

  const bakSheets: BakSheet[] = [];
  for (const sheet of sheets) {
    const content = await withSheetDoc(sheet.id, async (sd) =>
      sd.content.toString(),
    );
    bakSheets.push({
      id: sheet.id,
      updatedAt: sheet.updatedAt,
      tags: sheet.tags,
      deletedAt: sheet.deletedAt,
      content,
    });
  }

  const exportedAt = new Date().toISOString();

  // Record committedAt locally so merge can use it on next import
  const updatedMeta: ProjectMeta = { ...meta, committedAt: exportedAt };
  writeProjectMeta(projectDoc.meta, updatedMeta);
  await putProject(updatedMeta);

  return {
    $appVersion: appVersion,
    $schemaVersion: 1,
    $projectId: projectId,
    label: meta.label,
    updatedAt: meta.updatedAt,
    exportedAt,
    exportedBy: deviceId,
    tagColors: meta.tagColors,
    sheets: bakSheets,
  };
}

export function parseBakV1(raw: unknown): BakV1 {
  return bakV1Schema.parse(raw);
}

// ─── Import strategies ────────────────────────────────────────

export type ImportStrategy = 'new' | 'overwrite' | 'merge';

export interface ImportResult {
  projectId: string;
  existed: boolean;
  emptiedSheetIds: string[];
}

export async function importBakV1(
  bak: BakV1,
  strategy: ImportStrategy,
): Promise<ImportResult> {
  if (strategy === 'new') return importAsNew(bak);
  if (strategy === 'overwrite') return importOverwrite(bak);
  return importMerge(bak);
}

// ─── New project (clone) ──────────────────────────────────────

async function importAsNew(bak: BakV1): Promise<ImportResult> {
  const newBak: BakV1 = {
    ...bak,
    $projectId: genUnorderedId(),
    sheets: bak.sheets.map((s) => ({ ...s, id: genUnorderedId() })),
  };
  return importOverwrite(newBak);
}

// ─── Overwrite ────────────────────────────────────────────────

async function importOverwrite(bak: BakV1): Promise<ImportResult> {
  const projectId = bak.$projectId;
  const existing = await getProject(projectId);

  const newMeta: ProjectMeta = {
    id: projectId,
    label: bak.label,
    updatedAt: bak.updatedAt,
    committedAt: bak.exportedAt,
    tagColors: bak.tagColors,
  };
  await putProject(newMeta);

  const pd = openProjectDoc(projectId);
  await waitForSync(pd.provider);

  writeProjectMeta(pd.meta, newMeta);

  pd.doc.transact(() => {
    // Clear existing sheets that are not in the backup
    const existingIds = new Set(pd.sheets.keys());
    for (const id of existingIds) {
      if (!bak.sheets.find((s) => s.id === id)) pd.sheets.delete(id);
    }
    for (const bakSheet of bak.sheets) {
      const sheetMeta: SheetMeta = {
        id: bakSheet.id,
        projectId,
        updatedAt: bakSheet.updatedAt,
        orderKey: (bak.sheets.indexOf(bakSheet) + 1) * 1000,
        tags: bakSheet.tags,
        ...(bakSheet.deletedAt ? { deletedAt: bakSheet.deletedAt } : {}),
      };
      pd.sheets.set(bakSheet.id, sheetMeta);
    }
  });

  const emptiedSheetIds: string[] = [];
  for (const bakSheet of bak.sheets) {
    await withSheetDoc(bakSheet.id, async (sd) => {
      sd.doc.transact(() => {
        sd.content.delete(0, sd.content.length);
        sd.content.insert(0, bakSheet.content);
      });
    });
    if (bakSheet.content.trim()) {
      const written = await readSheetContent(bakSheet.id);
      if (!written.trim()) emptiedSheetIds.push(bakSheet.id);
    }
  }

  closeProjectDoc(pd);
  return { projectId, existed: !!existing, emptiedSheetIds };
}

// ─── Merge ────────────────────────────────────────────────────

type SheetClassification =
  | { kind: 'ignore'; local: SheetMeta }
  | { kind: 'new' }
  | { kind: 'ff'; local: SheetMeta } // fast-forward
  | { kind: 'conflict'; local: SheetMeta };

function classifySheet(
  bak: BakSheet,
  local: SheetMeta | undefined,
  committedAt: string,
): SheetClassification {
  if (!local) return { kind: 'new' };
  // Use updatedAt as the remote modification time (softDeleteSheet also updates it)
  if (bak.updatedAt <= committedAt) return { kind: 'ignore', local };
  if (local.updatedAt <= committedAt) return { kind: 'ff', local };
  return { kind: 'conflict', local };
}

/**
 * Build the merged order of sheet IDs.
 *
 * Algorithm:
 * 1. Walk local order to assign each local-only sheet to its "preceding snapshot sheet"
 * 2. Walk snapshot order, emit: snapshot sheet → its local-only followers
 * 3. Conflict sheets expand to [local, newRemote] in place
 */
function buildMergedOrder(
  localOrdered: SheetMeta[],
  bakSheets: BakSheet[],
  classifications: Map<string, SheetClassification>,
): Array<{ id: string; isNew?: true; remoteCloneOf?: string }> {
  const snapshotIds = new Set(bakSheets.map((s) => s.id));

  // Map each local-only sheet to the last snapshot sheet preceding it in local order
  const localOnlyAfter = new Map<string | null, SheetMeta[]>();
  let lastSnapshotId: string | null = null;
  for (const local of localOrdered) {
    if (snapshotIds.has(local.id)) {
      lastSnapshotId = local.id;
    } else {
      const bucket = localOnlyAfter.get(lastSnapshotId) ?? [];
      bucket.push(local);
      localOnlyAfter.set(lastSnapshotId, bucket);
    }
  }

  const result: Array<{
    id: string;
    isNew?: true;
    remoteCloneOf?: string;
  }> = [];

  // Local-only sheets before any snapshot sheet
  for (const s of localOnlyAfter.get(null) ?? []) {
    result.push({ id: s.id });
  }

  for (const bak of bakSheets) {
    const cls = classifications.get(bak.id) ?? { kind: 'new' };
    if (cls.kind === 'ignore') {
      result.push({ id: bak.id });
    } else if (cls.kind === 'new') {
      result.push({ id: bak.id, isNew: true });
    } else if (cls.kind === 'ff') {
      result.push({ id: bak.id }); // same ID, content overwritten
    } else {
      // conflict: local first, then remote copy
      result.push({ id: bak.id }); // local (conflict:local tag)
      const newId = genUnorderedId();
      result.push({ id: newId, isNew: true, remoteCloneOf: bak.id });
    }

    // Local-only sheets that follow this snapshot sheet in local order
    for (const s of localOnlyAfter.get(bak.id) ?? []) {
      result.push({ id: s.id });
    }
  }

  return result;
}

async function importMerge(bak: BakV1): Promise<ImportResult> {
  const projectId = bak.$projectId;
  const existing = await getProject(projectId);

  const pd = openProjectDoc(projectId);
  await waitForSync(pd.provider);

  const localMeta = readProjectMeta(projectId, pd.meta);
  const committedAt = localMeta.committedAt ?? '';

  // Build lookup maps
  const bakSheetMap = new Map(bak.sheets.map((s) => [s.id, s]));

  // Classify each snapshot sheet
  const classifications = new Map<string, SheetClassification>();
  for (const bakSheet of bak.sheets) {
    const local = pd.sheets.get(bakSheet.id);
    classifications.set(
      bakSheet.id,
      classifySheet(bakSheet, local, committedAt),
    );
  }

  // Downgrade conflict→ff when content is identical (read once, reuse below)
  const cachedLocalContent = new Map<string, string>();
  for (const bakSheet of bak.sheets) {
    const cls = classifications.get(bakSheet.id);
    if (cls?.kind === 'conflict') {
      const localContent = await readSheetContent(bakSheet.id);
      cachedLocalContent.set(bakSheet.id, localContent);
      if (localContent === bakSheet.content) {
        classifications.set(bakSheet.id, { kind: 'ff', local: cls.local });
      }
    }
  }

  // All local sheets ordered
  const localOrdered = Array.from(pd.sheets.values()).sort(
    (a, b) => a.orderKey - b.orderKey,
  );

  // Build merged order
  const mergedOrder = buildMergedOrder(
    localOrdered,
    bak.sheets,
    classifications,
  );

  // conflict:remote entries keyed by the original sheet id
  const remoteCloneIdOf = new Map<string, string>();
  for (const entry of mergedOrder) {
    if (entry.remoteCloneOf) remoteCloneIdOf.set(entry.remoteCloneOf, entry.id);
  }

  // Assign orderKeys (spaced by 1000 to leave room)
  const orderKeyOf = new Map<string, number>();
  for (let i = 0; i < mergedOrder.length; i++) {
    orderKeyOf.set(mergedOrder[i].id, (i + 1) * 1000);
  }

  // Apply all meta changes in a transaction
  pd.doc.transact(() => {
    for (const entry of mergedOrder) {
      const orderKey = orderKeyOf.get(entry.id) ?? 0;

      if (entry.remoteCloneOf) {
        // conflict:remote — new sheet cloned from snapshot
        const bakSheet = bakSheetMap.get(entry.remoteCloneOf)!;
        pd.sheets.set(entry.id, {
          id: entry.id,
          projectId,
          updatedAt: bakSheet.updatedAt,
          orderKey,
          tags: [...bakSheet.tags, 'conflict:remote'],
          ...(bakSheet.deletedAt ? { deletedAt: bakSheet.deletedAt } : {}),
        });
      } else if (entry.isNew) {
        // brand new sheet from snapshot
        const bakSheet = bakSheetMap.get(entry.id)!;
        pd.sheets.set(entry.id, {
          id: entry.id,
          projectId,
          updatedAt: bakSheet.updatedAt,
          orderKey,
          tags: bakSheet.tags,
          ...(bakSheet.deletedAt ? { deletedAt: bakSheet.deletedAt } : {}),
        });
      } else {
        const bakSheet = bakSheetMap.get(entry.id);
        const localSheet = pd.sheets.get(entry.id);

        if (!bakSheet) {
          // local-only: update orderKey only
          if (localSheet) pd.sheets.set(entry.id, { ...localSheet, orderKey });
        } else {
          const cls = classifications.get(entry.id);
          if (!cls || cls.kind === 'ignore') {
            if (localSheet)
              pd.sheets.set(entry.id, { ...localSheet, orderKey });
          } else if (cls.kind === 'ff') {
            pd.sheets.set(entry.id, {
              id: entry.id,
              projectId,
              updatedAt: bakSheet.updatedAt,
              orderKey,
              tags: [...bakSheet.tags],
              ...(bakSheet.deletedAt ? { deletedAt: bakSheet.deletedAt } : {}),
            });
          } else if (cls.kind === 'conflict') {
            if (localSheet) {
              const tags = localSheet.tags.includes('conflict:local')
                ? localSheet.tags
                : [...localSheet.tags, 'conflict:local'];
              pd.sheets.set(entry.id, { ...localSheet, orderKey, tags });
            }
          }
        }
      }
    }
  });

  // Handle sheet content outside the meta transaction
  const writtenSheets: Array<{ id: string; expectedContent: string }> = [];
  for (const bakSheet of bak.sheets) {
    const cls = classifications.get(bakSheet.id);
    if (!cls) continue;

    if (cls.kind === 'ff') {
      const oldContent =
        cachedLocalContent.get(bakSheet.id) ??
        (await readSheetContent(bakSheet.id));
      if (oldContent !== bakSheet.content) {
        if (oldContent.trim()) {
          const trashId = genUnorderedId();
          const now = new Date().toISOString();
          pd.doc.transact(() => {
            pd.sheets.set(trashId, {
              id: trashId,
              projectId,
              updatedAt: now,
              orderKey: -1,
              tags: [...cls.local.tags, 'overwritten'],
              deletedAt: now,
            });
          });
          await writeSheetContent(trashId, oldContent);
        }
        await writeSheetContent(bakSheet.id, bakSheet.content);
        if (bakSheet.content.trim())
          writtenSheets.push({
            id: bakSheet.id,
            expectedContent: bakSheet.content,
          });
      }
    } else if (cls.kind === 'new') {
      await writeSheetContent(bakSheet.id, bakSheet.content);
      if (bakSheet.content.trim())
        writtenSheets.push({
          id: bakSheet.id,
          expectedContent: bakSheet.content,
        });
    } else if (cls.kind === 'conflict') {
      const remoteId = remoteCloneIdOf.get(bakSheet.id);
      if (remoteId) {
        await writeSheetContent(remoteId, bakSheet.content);
        if (bakSheet.content.trim())
          writtenSheets.push({
            id: remoteId,
            expectedContent: bakSheet.content,
          });
      }
    }
    // 'ignore': no content change
  }

  // Verify written sheets are not empty
  const emptiedSheetIds: string[] = [];
  for (const { id } of writtenSheets) {
    const actual = await readSheetContent(id);
    if (!actual.trim()) emptiedSheetIds.push(id);
  }

  // Update project meta
  const updatedMeta: ProjectMeta = {
    ...localMeta,
    label: bak.label,
    tagColors: bak.tagColors,
    committedAt: bak.exportedAt,
  };
  writeProjectMeta(pd.meta, updatedMeta);
  await putProject(updatedMeta);

  closeProjectDoc(pd);
  return { projectId, existed: !!existing, emptiedSheetIds };
}

// ─── Sheet content helpers ────────────────────────────────────

import { withSheetDoc } from './docCache';

async function readSheetContent(sheetId: string): Promise<string> {
  return withSheetDoc(sheetId, async (sd) => sd.content.toString());
}

async function writeSheetContent(
  sheetId: string,
  content: string,
): Promise<void> {
  await withSheetDoc(sheetId, async (sd) => {
    sd.doc.transact(() => {
      sd.content.delete(0, sd.content.length);
      sd.content.insert(0, content);
    });
  });
}
