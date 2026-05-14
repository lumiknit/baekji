import type { Component } from 'solid-js';
import { createSignal, Show } from 'solid-js';
import {
  activeProjectDoc,
  activeProjectId,
  activeProjectLabel,
} from '../../state/workspace_v1';
import { readProjectMeta } from '../../lib/doc/ydoc';
import { closeBackupModal, showConfirm } from '../../state/modal';
import { s } from '../../lib/i18n';
import type { ImportStrategy } from '../../lib/doc/backup_v1';
import type { BakV1 } from '../../lib/doc/v1';
import LocalBackupSection from './LocalBackupSection';
import DropboxSection from './DropboxSection';

const BackupModal: Component = () => {
  const [importStrategy, setImportStrategy] =
    createSignal<ImportStrategy>('merge');

  const checkOlderSnapshot = async (bak: BakV1): Promise<boolean> => {
    if (importStrategy() === 'new') return true;
    const pd = activeProjectDoc();
    if (!pd) return true;
    const id = activeProjectId();
    if (!id) return true;
    const localMeta = readProjectMeta(id, pd.meta);
    const committedAt = localMeta.committedAt ?? '';
    if (committedAt && bak.exportedAt <= committedAt) {
      return showConfirm(
        s('backup.import_older_title'),
        s('backup.import_older_desc', {
          exportedAt: new Date(bak.exportedAt).toLocaleString(),
          committedAt: new Date(committedAt).toLocaleString(),
        }),
      );
    }
    return true;
  };

  return (
    <div class="flex flex-column gap-4" style={{ 'min-width': '340px' }}>
      <h3 class="m-0">{s('backup.title')}</h3>
      <Show when={activeProjectLabel()}>
        <p class="m-0 text-sm opacity-60">{activeProjectLabel()}</p>
      </Show>

      <div class="flex flex-column gap-1">
        <label class="text-sm opacity-60">{s('backup.import_strategy')}</label>
        <select
          value={importStrategy()}
          onChange={(e) =>
            setImportStrategy(e.currentTarget.value as ImportStrategy)
          }
        >
          <option value="merge">{s('backup.import_strategy_merge')}</option>
          <option value="overwrite">
            {s('backup.import_strategy_overwrite')}
          </option>
          <option value="new">{s('backup.import_strategy_new')}</option>
        </select>
        <p class="hint m-0">
          {importStrategy() === 'merge'
            ? s('backup.import_strategy_merge_desc')
            : importStrategy() === 'overwrite'
              ? s('backup.import_strategy_overwrite_desc')
              : s('backup.import_strategy_new_desc')}
        </p>
      </div>

      <hr class="separator-line" style={{ margin: '4px 0' }} />

      <LocalBackupSection
        importStrategy={importStrategy}
        checkOlderSnapshot={checkOlderSnapshot}
      />

      <hr class="separator-line" style={{ margin: 'var(--sp-4) 0' }} />

      <DropboxSection
        importStrategy={importStrategy}
        checkOlderSnapshot={checkOlderSnapshot}
      />

      <div class="modal-actions mt-4">
        <button class="btn-secondary" onClick={closeBackupModal}>
          {s('common.cancel')}
        </button>
      </div>
    </div>
  );
};

export default BackupModal;
