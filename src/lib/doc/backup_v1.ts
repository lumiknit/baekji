import type { BakV1, BakSheet, SheetMeta } from './v1';
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

export async function exportProjectAsBakV1(
  projectId: string,
  projectDoc: ProjectDoc,
  appVersion: string,
  deviceId: string,
): Promise<BakV1> {
  const meta = readProjectMeta(projectId, projectDoc.meta);
  const sheetsMap = projectDoc.sheets;
  const sheets = Array.from(sheetsMap.values())
    .filter((s: SheetMeta) => !s.deletedAt)
    .sort((a: SheetMeta, b: SheetMeta) => a.orderKey - b.orderKey);

  const bakSheets: BakSheet[] = [];
  for (const sheet of sheets) {
    const sd = openSheetDoc(sheet.id);
    await waitForSync(sd.provider);
    const content = sd.content.toString();
    closeSheetDoc(sd);
    bakSheets.push({
      id: sheet.id,
      updatedAt: sheet.updatedAt,
      orderKey: sheet.orderKey,
      tags: sheet.tags,
      content,
    });
  }

  return {
    $appVersion: appVersion,
    $schemaVersion: 1,
    $projectId: projectId,
    label: meta.label,
    updatedAt: meta.updatedAt,
    exportedAt: new Date().toISOString(),
    exportedBy: deviceId,
    tagColors: meta.tagColors,
    sheets: bakSheets,
  };
}

export function parseBakV1(raw: unknown): BakV1 {
  return bakV1Schema.parse(raw);
}

export interface ImportResult {
  projectId: string;
  existed: boolean;
}

export async function importBakV1(bak: BakV1): Promise<ImportResult> {
  const projectId = bak.$projectId;
  const existing = await getProject(projectId);

  await putProject({
    id: projectId,
    label: bak.label,
    updatedAt: bak.updatedAt,
    tagColors: bak.tagColors,
  });

  const pd = openProjectDoc(projectId);
  await waitForSync(pd.provider);

  writeProjectMeta(pd.meta, {
    label: bak.label,
    updatedAt: bak.updatedAt,
    tagColors: bak.tagColors,
  });

  pd.doc.transact(() => {
    for (const bakSheet of bak.sheets) {
      const sheetMeta: SheetMeta = {
        id: bakSheet.id,
        projectId,
        updatedAt: bakSheet.updatedAt,
        orderKey: bakSheet.orderKey,
        tags: bakSheet.tags,
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
