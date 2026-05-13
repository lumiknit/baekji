import { createSignal } from 'solid-js';
import {
  openProjectDoc,
  closeProjectDoc,
  openSheetDoc,
  closeSheetDoc,
  waitForSync,
} from '../lib/doc/ydoc';
import type { ProjectDoc, SheetDoc } from '../lib/doc/ydoc';
import { getAppState, setAppState } from '../lib/doc/db_v1';

// ─── Active Project ──────────────────────────────────────────────

let _projectDoc: ProjectDoc | null = null;

const [_activeProjectDoc, setActiveProjectDoc] =
  createSignal<ProjectDoc | null>(null);
const [_activeProjectLabel, setActiveProjectLabel] = createSignal<string>('');

export const activeProjectDoc = _activeProjectDoc;
export const activeProjectId = () => _activeProjectDoc()?.id ?? null;
export const activeProjectLabel = _activeProjectLabel;

export async function openProject(id: string): Promise<void> {
  if (activeProjectId() === id) {
    return;
  }
  if (_projectDoc) {
    closeProjectDoc(_projectDoc);
    _projectDoc = null;
  }
  const pd = openProjectDoc(id);
  await waitForSync(pd.provider);
  _projectDoc = pd;
  setActiveProjectDoc(pd);
  setActiveProjectLabel((pd.meta.get('label') as string | undefined) ?? '');
  // Y.Map 변경 시 label 신호 동기화
  pd.meta.observe(() => {
    setActiveProjectLabel((pd.meta.get('label') as string | undefined) ?? '');
  });
  await setAppState('global', '', 'activeProjectId', id);
}

export async function closeProject(): Promise<void> {
  if (_projectDoc) {
    closeProjectDoc(_projectDoc);
    _projectDoc = null;
  }
  setActiveProjectDoc(null);
  await setAppState('global', '', 'activeProjectId', null);
}

export async function restoreLastProject(): Promise<void> {
  const id = (await getAppState('global', '', 'activeProjectId')) as
    | string
    | null;
  if (id) await openProject(id);
}

export async function restoreLastSheet(): Promise<string | null> {
  return (await getAppState('global', '', 'activeSheetId')) as string | null;
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
  await setAppState('global', '', 'activeSheetId', id);
  return sd;
}

export function closeSheet(): void {
  if (_sheetDoc) {
    closeSheetDoc(_sheetDoc);
    _sheetDoc = null;
  }
  setActiveSheetDoc(null);
}
