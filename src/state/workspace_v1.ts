import { createSignal } from 'solid-js';
import { makePersisted } from '@solid-primitives/storage';
import {
  openProjectDoc,
  closeProjectDoc,
  openSheetDoc,
  closeSheetDoc,
  waitForSync,
} from '../lib/doc/ydoc';
import type { ProjectDoc, SheetDoc } from '../lib/doc/ydoc';

// ─── Persistent last-location signals ────────────────────────────

export const [lastProjectId, setLastProjectId] = makePersisted(
  createSignal<string | null>(null),
  { name: 'baekji.lastProjectId' },
);

export const [lastSheetId, setLastSheetId] = makePersisted(
  createSignal<string | null>(null),
  { name: 'baekji.lastSheetId' },
);

// ─── Active Project ──────────────────────────────────────────────

let _projectDoc: ProjectDoc | null = null;

const [_activeProjectDoc, setActiveProjectDoc] =
  createSignal<ProjectDoc | null>(null);
const [_activeProjectLabel, setActiveProjectLabel] = createSignal<string>('');

export const activeProjectDoc = _activeProjectDoc;
export const activeProjectId = () => _activeProjectDoc()?.id ?? null;
export const activeProjectLabel = _activeProjectLabel;

export async function openProject(id: string, force = false): Promise<void> {
  if (!force && activeProjectId() === id) return;
  if (_projectDoc) {
    closeProjectDoc(_projectDoc);
    _projectDoc = null;
  }
  const pd = openProjectDoc(id);
  await waitForSync(pd.provider);
  _projectDoc = pd;
  setActiveProjectDoc(pd);
  setActiveProjectLabel((pd.meta.get('label') as string | undefined) ?? '');
  setLastProjectId(id);
  pd.meta.observe(() => {
    setActiveProjectLabel((pd.meta.get('label') as string | undefined) ?? '');
  });
}

export async function closeProject(): Promise<void> {
  if (_projectDoc) {
    closeProjectDoc(_projectDoc);
    _projectDoc = null;
  }
  setActiveProjectDoc(null);
  setLastProjectId(null);
}

// ─── Active Sheet ────────────────────────────────────────────────

let _sheetDoc: SheetDoc | null = null;

const [_activeSheetDoc, setActiveSheetDoc] = createSignal<SheetDoc | null>(
  null,
);

export const activeSheetDoc = _activeSheetDoc;
export const activeSheetId = () => _activeSheetDoc()?.id ?? null;

export async function openSheet(id: string): Promise<SheetDoc> {
  if (_sheetDoc) {
    closeSheetDoc(_sheetDoc);
    _sheetDoc = null;
  }
  const sd = openSheetDoc(id);
  await waitForSync(sd.provider);
  _sheetDoc = sd;
  setActiveSheetDoc(sd);
  setLastSheetId(id);
  return sd;
}

export function closeSheet(): void {
  if (_sheetDoc) {
    closeSheetDoc(_sheetDoc);
    _sheetDoc = null;
  }
  setActiveSheetDoc(null);
}
