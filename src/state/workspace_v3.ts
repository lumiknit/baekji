import { createSignal } from 'solid-js';
import { makePersisted } from '@solid-primitives/storage';
import type { ProjectMeta } from '../lib/doc/v1';
import { getProjectMeta, putProjectMeta } from '../lib/doc/db_v3';

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

const [_activeProjectId, setActiveProjectId] = createSignal<string | null>(
  null,
);
const [_activeProjectLabel, setActiveProjectLabel] = createSignal<string>('');
const [_activeProjectMeta, setActiveProjectMeta] =
  createSignal<ProjectMeta | null>(null);

export const activeProjectId = _activeProjectId;
export const activeProjectLabel = _activeProjectLabel;
export const activeProjectMeta = _activeProjectMeta;

export async function openProject(id: string, force = false): Promise<void> {
  if (!force && _activeProjectId() === id) return;

  const meta = await getProjectMeta(id);
  setActiveProjectMeta(meta ?? null);
  setActiveProjectId(id);
  setActiveProjectLabel(meta?.label ?? '');
  setLastProjectId(id);
}

export async function closeProject(): Promise<void> {
  setActiveProjectId(null);
  setActiveProjectLabel('');
  setActiveProjectMeta(null);
  setLastProjectId(null);
}

export async function updateProjectLabel(
  id: string,
  label: string,
): Promise<void> {
  const existing = await getProjectMeta(id);
  if (!existing) return;
  const updated: ProjectMeta = {
    ...existing,
    label,
    updatedAt: new Date().toISOString(),
  };
  await putProjectMeta(updated);
  if (_activeProjectId() === id) {
    setActiveProjectLabel(label);
    setActiveProjectMeta(updated);
  }
}

// ─── Active Sheet ────────────────────────────────────────────────

const [_activeSheetId, setActiveSheetId] = createSignal<string | null>(null);

export const activeSheetId = _activeSheetId;

export function openSheet(id: string): void {
  setActiveSheetId(id);
  setLastSheetId(id);
}

export function closeSheet(): void {
  setActiveSheetId(null);
}
