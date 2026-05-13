import type { BakV1, BakSheet, SheetMeta, ProjectMeta } from './v1';
import { bakV1Schema } from './v1';
import {
  openProjectDoc,
  closeProjectDoc,
  openSheetDoc,
  closeSheetDoc,
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
    const sd = openSheetDoc(sheet.id);
    await waitForSync(sd.provider);
    const content = sd.content.toString();
    closeSheetDoc(sd);
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

  for (const bakSheet of bak.sheets) {
    const sd = openSheetDoc(bakSheet.id);
    await waitForSync(sd.provider);
    sd.doc.transact(() => {
      sd.content.delete(0, sd.content.length);
      sd.content.insert(0, bakSheet.content);
    });
    closeSheetDoc(sd);
  }

  closeProjectDoc(pd);
  return { projectId, existed: !!existing };
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
): Array<{ id: string; isNew?: true; conflictRemoteFor?: string }> {
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
    conflictRemoteFor?: string;
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
      result.push({ id: newId, isNew: true, conflictRemoteFor: bak.id });
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

  // Classify each snapshot sheet
  const classifications = new Map<string, SheetClassification>();
  for (const bakSheet of bak.sheets) {
    const local = pd.sheets.get(bakSheet.id);
    classifications.set(
      bakSheet.id,
      classifySheet(bakSheet, local, committedAt),
    );
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

  // Assign orderKeys (spaced by 1000 to leave room)
  const orderKeyOf = new Map<string, number>();
  for (let i = 0; i < mergedOrder.length; i++) {
    orderKeyOf.set(mergedOrder[i].id, (i + 1) * 1000);
  }

  // Apply all changes in a transaction
  pd.doc.transact(() => {
    for (const entry of mergedOrder) {
      const cls = entry.conflictRemoteFor
        ? classifications.get(entry.conflictRemoteFor)
        : entry.isNew && !entry.conflictRemoteFor
          ? { kind: 'new' as const }
          : entry.id
            ? classifications.get(
                bak.sheets.find(
                  (s) =>
                    s.id === entry.id &&
                    !entry.isNew &&
                    !entry.conflictRemoteFor,
                )?.id ?? '',
              )
            : undefined;
      void cls; // used below per-case

      const orderKey = orderKeyOf.get(entry.id) ?? 0;

      if (entry.conflictRemoteFor) {
        // conflict:remote — new sheet from snapshot
        const bakSheet = bak.sheets.find(
          (s) => s.id === entry.conflictRemoteFor,
        )!;
        const tags = [...bakSheet.tags, 'conflict:remote'];
        pd.sheets.set(entry.id, {
          id: entry.id,
          projectId,
          updatedAt: bakSheet.updatedAt,
          orderKey,
          tags,
          ...(bakSheet.deletedAt ? { deletedAt: bakSheet.deletedAt } : {}),
        });
      } else if (entry.isNew) {
        // brand new sheet from snapshot
        const bakSheet = bak.sheets.find((s) => s.id === entry.id)!;
        pd.sheets.set(entry.id, {
          id: entry.id,
          projectId,
          updatedAt: bakSheet.updatedAt,
          orderKey,
          tags: bakSheet.tags,
          ...(bakSheet.deletedAt ? { deletedAt: bakSheet.deletedAt } : {}),
        });
      } else {
        const bakSheet = bak.sheets.find((s) => s.id === entry.id);
        const localSheet = pd.sheets.get(entry.id);

        if (!bakSheet) {
          // local-only: update orderKey only
          if (localSheet) {
            pd.sheets.set(entry.id, { ...localSheet, orderKey });
          }
        } else {
          const entryClsRaw = classifications.get(entry.id);
          if (!entryClsRaw || entryClsRaw.kind === 'ignore') {
            // ignore: just update orderKey
            if (localSheet) {
              pd.sheets.set(entry.id, { ...localSheet, orderKey });
            }
          } else if (entryClsRaw.kind === 'ff') {
            // fast-forward: overwrite meta with snapshot values
            // First, save old local content to a trash copy
            // (content copy handled below, outside transaction)
            const tags = [...bakSheet.tags];
            pd.sheets.set(entry.id, {
              id: entry.id,
              projectId,
              updatedAt: bakSheet.updatedAt,
              orderKey,
              tags,
              ...(bakSheet.deletedAt ? { deletedAt: bakSheet.deletedAt } : {}),
            });
          } else if (entryClsRaw.kind === 'conflict') {
            // conflict:local — keep local meta, add tag, update orderKey
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

  // Handle sheet content and trash copies for FF outside the meta transaction
  for (const bakSheet of bak.sheets) {
    const entryClsRaw = classifications.get(bakSheet.id);
    if (!entryClsRaw) continue;

    if (entryClsRaw.kind === 'ff') {
      // Save old content as a trash copy (unless deletedAt means no content to preserve)
      const localMeta = entryClsRaw.local;
      const oldContent = await readSheetContent(localMeta.id);
      if (oldContent.trim()) {
        const trashId = genUnorderedId();
        const trashTags = [...localMeta.tags, 'overwritten'];
        const now = new Date().toISOString();
        pd.doc.transact(() => {
          pd.sheets.set(trashId, {
            id: trashId,
            projectId,
            updatedAt: now,
            orderKey: -1, // will be moved to trash, orderKey doesn't matter
            tags: trashTags,
            deletedAt: now,
          });
        });
        await writeSheetContent(trashId, oldContent);
      }
      // Overwrite the existing sheet content with snapshot
      await writeSheetContent(bakSheet.id, bakSheet.content);
    } else if (entryClsRaw.kind === 'new') {
      await writeSheetContent(bakSheet.id, bakSheet.content);
    } else if (entryClsRaw.kind === 'conflict') {
      // Write conflict:remote content to the new sheet
      const remoteEntry = mergedOrder.find(
        (e) => e.conflictRemoteFor === bakSheet.id,
      );
      if (remoteEntry) {
        await writeSheetContent(remoteEntry.id, bakSheet.content);
      }
    }
    // 'ignore': no content change
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
  return { projectId, existed: !!existing };
}

// ─── Sheet content helpers ────────────────────────────────────

async function readSheetContent(sheetId: string): Promise<string> {
  const sd = openSheetDoc(sheetId);
  await waitForSync(sd.provider);
  const content = sd.content.toString();
  closeSheetDoc(sd);
  return content;
}

async function writeSheetContent(
  sheetId: string,
  content: string,
): Promise<void> {
  const sd = openSheetDoc(sheetId);
  await waitForSync(sd.provider);
  sd.doc.transact(() => {
    sd.content.delete(0, sd.content.length);
    sd.content.insert(0, content);
  });
  closeSheetDoc(sd);
}
