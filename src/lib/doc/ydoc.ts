import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import type { ProjectMeta, SheetMeta } from './v1';

export type ProjectDoc = {
  doc: Y.Doc;
  provider: IndexeddbPersistence;
  meta: Y.Map<unknown>;
  sheets: Y.Map<SheetMeta>;
};

export type SheetDoc = {
  doc: Y.Doc;
  provider: IndexeddbPersistence;
  content: Y.Text;
};

// ─── Project Doc ──────────────────────────────────────────────

export function openProjectDoc(projectId: string): ProjectDoc {
  const doc = new Y.Doc();
  const provider = new IndexeddbPersistence(
    `baekji-v2-project-${projectId}`,
    doc,
  );
  const meta = doc.getMap<unknown>('meta');
  const sheets = doc.getMap<SheetMeta>('sheets');
  return { doc, provider, meta, sheets };
}

export function closeProjectDoc(pd: ProjectDoc): void {
  pd.provider.destroy();
  pd.doc.destroy();
}

/** Read ProjectMeta from Y.Map. */
export function readProjectMeta(
  projectId: string,
  meta: Y.Map<unknown>,
): ProjectMeta {
  return {
    id: projectId,
    label: (meta.get('label') as string) ?? '',
    updatedAt: (meta.get('updatedAt') as string) ?? new Date().toISOString(),
    tagColors:
      (meta.get('tagColors') as ProjectMeta['tagColors']) ?? {},
  };
}

/** Write ProjectMeta into Y.Map transactionally. */
export function writeProjectMeta(
  meta: Y.Map<unknown>,
  data: Omit<ProjectMeta, 'id'>,
): void {
  meta.doc!.transact(() => {
    meta.set('label', data.label);
    meta.set('updatedAt', data.updatedAt);
    meta.set('tagColors', data.tagColors);
  });
}

// ─── Sheet Doc ────────────────────────────────────────────────

export function openSheetDoc(sheetId: string): SheetDoc {
  const doc = new Y.Doc();
  const provider = new IndexeddbPersistence(`baekji-v2-sheet-${sheetId}`, doc);
  const content = doc.getText('content');
  return { doc, provider, content };
}

export function closeSheetDoc(sd: SheetDoc): void {
  sd.provider.destroy();
  sd.doc.destroy();
}

// ─── Utility ──────────────────────────────────────────────────

/** Wait for the IndexedDB provider to finish loading persisted data. */
export function waitForSync(provider: IndexeddbPersistence): Promise<void> {
  return provider.whenSynced.then(() => {});
}
