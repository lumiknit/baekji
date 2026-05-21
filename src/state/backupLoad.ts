import { createSignal } from 'solid-js';
import type { BakV1 } from '../lib/doc/v1.ts';
import type { ImportStrategy } from '../lib/doc/backup_v1.ts';

export type BackupLoadTarget = {
  bak: BakV1;
  strategy: ImportStrategy;
};

const [_backupLoadTarget, setBackupLoadTarget] =
  createSignal<BackupLoadTarget | null>(null);

export const backupLoadTarget = _backupLoadTarget;
export const setLoadTarget = (t: BackupLoadTarget) => setBackupLoadTarget(t);
export const clearLoadTarget = () => setBackupLoadTarget(null);
