import type { BakV1, BakSheet, SheetMeta, ProjectMeta } from './v1';
import { bakV1Schema } from './v1';
import { genUnorderedId } from '../uuid';
import {
  getProjectMeta,
  putProjectMeta,
  getSheetMetasByProject,
  putSheetMeta,
  deleteSheetMeta,
  deleteSheetDeltas,
  loadSheetContent,
  replaceSheetContent,
  appendSheetDelta,
  getSheetStats,
  putSheetStats,
} from './db_v3';

// ─── Export ───────────────────────────────────────────────────

export async function exportProjectAsBakV1(
  projectId: string,
  appVersion: string,
  deviceId: string,
): Promise<BakV1> {
  const meta = await getProjectMeta(projectId);
  if (!meta) throw new Error(`Project ${projectId} not found`);

  const sheetMetas = await getSheetMetasByProject(projectId);
  const sheets = sheetMetas.sort((a, b) => a.orderKey - b.orderKey);

  const bakSheets: BakSheet[] = [];
  for (const sheet of sheets) {
    const [content, stats] = await Promise.all([
      loadSheetContent(sheet.id),
      getSheetStats(sheet.id),
    ]);
    bakSheets.push({
      id: sheet.id,
      updatedAt: stats?.updatedAt ?? new Date().toISOString(),
      tags: sheet.tags,
      deletedAt: sheet.deletedAt,
      writingSeconds: stats?.writingSeconds ?? 0,
      goal: sheet.goal,
      content,
    });
  }

  const exportedAt = new Date().toISOString();
  const updatedMeta: ProjectMeta = { ...meta, committedAt: exportedAt };
  await putProjectMeta(updatedMeta);

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
  const existing = await getProjectMeta(projectId);

  const newMeta: ProjectMeta = {
    id: projectId,
    label: bak.label,
    updatedAt: bak.updatedAt,
    committedAt: bak.exportedAt,
    tagColors: bak.tagColors,
  };
  await putProjectMeta(newMeta);

  // Remove sheets not in backup
  const localSheets = await getSheetMetasByProject(projectId);
  const bakIds = new Set(bak.sheets.map((s) => s.id));
  for (const local of localSheets) {
    if (!bakIds.has(local.id)) {
      await deleteSheetDeltas(local.id);
      await deleteSheetMeta(local.id);
    }
  }

  // Write all sheets from backup
  const emptiedSheetIds: string[] = [];
  for (let i = 0; i < bak.sheets.length; i++) {
    const bakSheet = bak.sheets[i];
    const sheetMeta: SheetMeta = {
      id: bakSheet.id,
      projectId,
      orderKey: (i + 1) * 1000,
      tags: bakSheet.tags,
      ...(bakSheet.deletedAt ? { deletedAt: bakSheet.deletedAt } : {}),
      ...(bakSheet.goal ? { goal: bakSheet.goal } : {}),
    };
    await putSheetMeta(sheetMeta);
    await putSheetStats({
      sheetId: bakSheet.id,
      updatedAt: bakSheet.updatedAt,
      writingSeconds: bakSheet.writingSeconds,
    });
    await replaceSheetContent(bakSheet.id, bakSheet.content);

    if (bakSheet.content.trim()) {
      const written = await loadSheetContent(bakSheet.id);
      if (!written.trim()) emptiedSheetIds.push(bakSheet.id);
    }
  }

  return { projectId, existed: !!existing, emptiedSheetIds };
}

// ─── Merge ────────────────────────────────────────────────────

type SheetClassification =
  | { kind: 'ignore'; local: SheetMeta }
  | { kind: 'new' }
  | { kind: 'ff'; local: SheetMeta }
  | { kind: 'conflict'; local: SheetMeta };

function classifySheet(
  bak: BakSheet,
  local: SheetMeta | undefined,
  localUpdatedAt: string | undefined,
  committedAt: string,
): SheetClassification {
  if (!local) return { kind: 'new' };
  if (bak.updatedAt <= committedAt) return { kind: 'ignore', local };
  if ((localUpdatedAt ?? '') <= committedAt) return { kind: 'ff', local };
  return { kind: 'conflict', local };
}

function buildMergedOrder(
  localOrdered: SheetMeta[],
  bakSheets: BakSheet[],
  classifications: Map<string, SheetClassification>,
): Array<{ id: string; isNew?: true; remoteCloneOf?: string }> {
  const snapshotIds = new Set(bakSheets.map((s) => s.id));
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

  const result: Array<{ id: string; isNew?: true; remoteCloneOf?: string }> =
    [];

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
      result.push({ id: bak.id });
    } else {
      result.push({ id: bak.id });
      const newId = genUnorderedId();
      result.push({ id: newId, isNew: true, remoteCloneOf: bak.id });
    }

    for (const s of localOnlyAfter.get(bak.id) ?? []) {
      result.push({ id: s.id });
    }
  }

  return result;
}

async function importMerge(bak: BakV1): Promise<ImportResult> {
  const projectId = bak.$projectId;
  const existing = await getProjectMeta(projectId);
  const localMeta = existing ?? {
    id: projectId,
    label: bak.label,
    updatedAt: '',
    committedAt: '',
    tagColors: bak.tagColors,
  };
  const committedAt = localMeta.committedAt ?? '';

  const localSheets = await getSheetMetasByProject(projectId);
  const localSheetMap = new Map(localSheets.map((s) => [s.id, s]));
  const bakSheetMap = new Map(bak.sheets.map((s) => [s.id, s]));

  // Load local stats for updatedAt (used for merge classification).
  const localStatsEntries = await Promise.all(
    localSheets.map((s) => getSheetStats(s.id)),
  );
  const localStatsMap = new Map(
    localSheets.map((s, i) => [s.id, localStatsEntries[i]?.updatedAt]),
  );

  const classifications = new Map<string, SheetClassification>();
  for (const bakSheet of bak.sheets) {
    classifications.set(
      bakSheet.id,
      classifySheet(
        bakSheet,
        localSheetMap.get(bakSheet.id),
        localStatsMap.get(bakSheet.id),
        committedAt,
      ),
    );
  }

  const cachedLocalContent = new Map<string, string>();
  for (const bakSheet of bak.sheets) {
    const cls = classifications.get(bakSheet.id);
    if (cls?.kind === 'conflict') {
      const localContent = await loadSheetContent(bakSheet.id);
      cachedLocalContent.set(bakSheet.id, localContent);
      if (localContent === bakSheet.content) {
        classifications.set(bakSheet.id, { kind: 'ff', local: cls.local });
      }
    }
  }

  const localOrdered = localSheets.sort((a, b) => a.orderKey - b.orderKey);
  const mergedOrder = buildMergedOrder(
    localOrdered,
    bak.sheets,
    classifications,
  );

  const remoteCloneIdOf = new Map<string, string>();
  for (const entry of mergedOrder) {
    if (entry.remoteCloneOf) remoteCloneIdOf.set(entry.remoteCloneOf, entry.id);
  }

  const orderKeyOf = new Map<string, number>();
  for (let i = 0; i < mergedOrder.length; i++) {
    orderKeyOf.set(mergedOrder[i].id, (i + 1) * 1000);
  }

  // Apply meta changes
  for (const entry of mergedOrder) {
    const orderKey = orderKeyOf.get(entry.id) ?? 0;

    if (entry.remoteCloneOf) {
      const bakSheet = bakSheetMap.get(entry.remoteCloneOf)!;
      await putSheetMeta({
        id: entry.id,
        projectId,
        orderKey,
        tags: [...bakSheet.tags, 'conflict:remote'],
        ...(bakSheet.deletedAt ? { deletedAt: bakSheet.deletedAt } : {}),
        ...(bakSheet.goal ? { goal: bakSheet.goal } : {}),
      });
      await putSheetStats({
        sheetId: entry.id,
        updatedAt: bakSheet.updatedAt,
        writingSeconds: bakSheet.writingSeconds,
      });
    } else if (entry.isNew) {
      const bakSheet = bakSheetMap.get(entry.id)!;
      await putSheetMeta({
        id: entry.id,
        projectId,
        orderKey,
        tags: bakSheet.tags,
        ...(bakSheet.deletedAt ? { deletedAt: bakSheet.deletedAt } : {}),
        ...(bakSheet.goal ? { goal: bakSheet.goal } : {}),
      });
      await putSheetStats({
        sheetId: entry.id,
        updatedAt: bakSheet.updatedAt,
        writingSeconds: bakSheet.writingSeconds,
      });
    } else {
      const bakSheet = bakSheetMap.get(entry.id);
      const localSheet = localSheetMap.get(entry.id);

      if (!bakSheet) {
        if (localSheet) await putSheetMeta({ ...localSheet, orderKey });
      } else {
        const cls = classifications.get(entry.id);
        if (!cls || cls.kind === 'ignore') {
          if (localSheet) await putSheetMeta({ ...localSheet, orderKey });
        } else if (cls.kind === 'ff') {
          const localWs = localStatsMap.get(entry.id);
          // fast-forward: take the remote stats (updatedAt), keep max writingSeconds
          const localStatsEntry =
            localStatsEntries[localSheets.findIndex((s) => s.id === entry.id)];
          await putSheetMeta({
            id: entry.id,
            projectId,
            orderKey,
            tags: [...bakSheet.tags],
            ...(bakSheet.deletedAt ? { deletedAt: bakSheet.deletedAt } : {}),
            ...(bakSheet.goal ? { goal: bakSheet.goal } : {}),
          });
          await putSheetStats({
            sheetId: entry.id,
            updatedAt: bakSheet.updatedAt,
            writingSeconds: Math.max(
              bakSheet.writingSeconds,
              localStatsEntry?.writingSeconds ?? 0,
            ),
          });
          void localWs; // suppress unused warning
        } else if (cls.kind === 'conflict') {
          if (localSheet) {
            const tags = localSheet.tags.includes('conflict:local')
              ? localSheet.tags
              : [...localSheet.tags, 'conflict:local'];
            await putSheetMeta({ ...localSheet, orderKey, tags });
          }
        }
      }
    }
  }

  // Handle content
  const writtenSheets: string[] = [];
  for (const bakSheet of bak.sheets) {
    const cls = classifications.get(bakSheet.id);
    if (!cls) continue;

    if (cls.kind === 'ff') {
      const oldContent =
        cachedLocalContent.get(bakSheet.id) ??
        (await loadSheetContent(bakSheet.id));
      if (oldContent !== bakSheet.content) {
        if (oldContent.trim()) {
          const trashId = genUnorderedId();
          const now = new Date().toISOString();
          await putSheetMeta({
            id: trashId,
            projectId,
            orderKey: -1,
            tags: [...cls.local.tags, 'overwritten'],
            deletedAt: now,
          });
          await putSheetStats({
            sheetId: trashId,
            updatedAt: now,
            writingSeconds: 0,
          });
          await appendSheetDelta(trashId, oldContent);
        }
        await replaceSheetContent(bakSheet.id, bakSheet.content);
        if (bakSheet.content.trim()) writtenSheets.push(bakSheet.id);
      }
    } else if (cls.kind === 'new') {
      await replaceSheetContent(bakSheet.id, bakSheet.content);
      if (bakSheet.content.trim()) writtenSheets.push(bakSheet.id);
    } else if (cls.kind === 'conflict') {
      const remoteId = remoteCloneIdOf.get(bakSheet.id);
      if (remoteId) {
        await replaceSheetContent(remoteId, bakSheet.content);
        if (bakSheet.content.trim()) writtenSheets.push(remoteId);
      }
    }
  }

  const emptiedSheetIds: string[] = [];
  for (const id of writtenSheets) {
    const actual = await loadSheetContent(id);
    if (!actual.trim()) emptiedSheetIds.push(id);
  }

  const updatedMeta: ProjectMeta = {
    ...localMeta,
    label: bak.label,
    tagColors: bak.tagColors,
    committedAt: bak.exportedAt,
  };
  await putProjectMeta(updatedMeta);

  return { projectId, existed: !!existing, emptiedSheetIds };
}
