import { createSignal } from 'solid-js';
import { makePersisted } from '@solid-primitives/storage';
import { openProjectDoc, closeProjectDoc, waitForSync } from '../lib/doc/ydoc';
import { acquireSheetDoc, releaseSheetDoc } from '../lib/doc/docCache';
import type { ProjectDoc, SheetDoc } from '../lib/doc/ydoc';
import toast from 'solid-toast';
import { s } from '../lib/i18n';
import { logError } from './log';

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
let _metaUnobserve: (() => void) | null = null;
let _openingProjectId: string | null = null;

const [_activeProjectDoc, setActiveProjectDoc] =
  createSignal<ProjectDoc | null>(null);
const [_activeProjectLabel, setActiveProjectLabel] = createSignal<string>('');

export const activeProjectDoc = _activeProjectDoc;
export const activeProjectId = () => _activeProjectDoc()?.id ?? null;
export const activeProjectLabel = _activeProjectLabel;

export async function openProject(id: string, force = false): Promise<void> {
  if (!force && activeProjectId() === id) return;
  if (!force && _openingProjectId === id) return;

  _openingProjectId = id;
  try {
    if (_metaUnobserve) {
      _metaUnobserve();
      _metaUnobserve = null;
    }
    if (_projectDoc) {
      closeProjectDoc(_projectDoc);
      _projectDoc = null;
    }
    const pd = openProjectDoc(id);
    try {
      await waitForSync(pd.provider);
    } catch (err) {
      closeProjectDoc(pd);
      logError('openProject:waitForSync', err);
      toast.error(s('common.open_project_error'));
      throw err;
    }
    if (_openingProjectId !== id) {
      closeProjectDoc(pd);
      return;
    }
    _projectDoc = pd;
    setActiveProjectDoc(pd);
    setActiveProjectLabel((pd.meta.get('label') as string | undefined) ?? '');
    setLastProjectId(id);
    const handler = () => {
      setActiveProjectLabel((pd.meta.get('label') as string | undefined) ?? '');
    };
    pd.meta.observe(handler);
    _metaUnobserve = () => pd.meta.unobserve(handler);
  } finally {
    if (_openingProjectId === id) _openingProjectId = null;
  }
}

export async function closeProject(): Promise<void> {
  if (_metaUnobserve) {
    _metaUnobserve();
    _metaUnobserve = null;
  }
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
    releaseSheetDoc(_sheetDoc.id);
    _sheetDoc = null;
  }
  const sd = acquireSheetDoc(id);
  try {
    await waitForSync(sd.provider);
  } catch (err) {
    releaseSheetDoc(id);
    throw err;
  }
  _sheetDoc = sd;
  setActiveSheetDoc(sd);
  setLastSheetId(id);
  return sd;
}

export function closeSheet(): void {
  if (_sheetDoc) {
    releaseSheetDoc(_sheetDoc.id);
    _sheetDoc = null;
  }
  setActiveSheetDoc(null);
}
