import type { Component, JSX } from 'solid-js';
import { createSignal, Show, Switch, Match, For } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import toast from 'solid-toast';
import {
  TbOutlineDownload,
  TbOutlineUpload,
  TbOutlineExternalLink,
  TbOutlineBrandDropbox,
  TbOutlineBrandGoogleDrive,
} from 'solid-icons/tb';
import {
  exportProjectAsBakV1,
  parseBakV1,
  type ImportStrategy,
} from '../../lib/doc/backup_v1.ts';
import {
  serializeGzip,
  deserializeGzip,
  toBlob,
} from '../../lib/doc/backup_helper.ts';
import {
  activeProjectId,
  activeProjectLabel,
  activeProjectMeta,
} from '../../state/workspace_v3.ts';
import { deviceId } from '../../state/workspace.ts';
import { closeBackupModal, showConfirm } from '../../state/modal.ts';
import { setLoadTarget } from '../../state/backupLoad.ts';
import { s } from '../../lib/i18n/index.ts';
import { timestampSuffix } from '../../lib/format.ts';
import {
  loadToken as loadDropboxToken,
  beginOAuth as beginDropboxOAuth,
  ensureToken as ensureDropboxToken,
} from '../../lib/sync/dropbox_auth.ts';
import {
  loadToken as loadGDriveToken,
  beginOAuth as beginGDriveOAuth,
  ensureToken as ensureGDriveToken,
} from '../../lib/sync/gdrive_auth.ts';
import { upload as dropboxUpload } from '../../lib/sync/dropbox.ts';
import { upload as gdriveUpload } from '../../lib/sync/gdrive.ts';
import {
  saveDestinations,
  toggleSaveDestination,
  type SaveDestination,
} from '../../state/backupSettings.ts';
import type { BakV1 } from '../../lib/doc/v1.ts';
import DropboxLoadSection from './DropboxLoadSection.tsx';
import GDriveLoadSection from './GDriveLoadSection.tsx';

declare const __APP_VERSION__: string;

function sanitizeFilename(name: string): string {
  return name.slice(0, 64).replace(/[ \\/:"*?<>|]/g, '_');
}

type LoadSource = 'local' | 'dropbox' | 'gdrive';

type Destination = {
  id: SaveDestination;
  label: () => string;
  icon?: () => JSX.Element;
};

const BackupModal: Component = () => {
  const DESTINATIONS: Destination[] = [
    { id: 'local', label: () => s('backup.dest_local') },
    {
      id: 'dropbox',
      label: () => 'Dropbox',
      icon: () => <TbOutlineBrandDropbox />,
    },
    {
      id: 'gdrive',
      label: () => 'Google Drive',
      icon: () => <TbOutlineBrandGoogleDrive />,
    },
  ];
  const navigate = useNavigate();
  const [saving, setSaving] = createSignal(false);
  const [loadSource, setLoadSource] = createSignal<LoadSource>('local');
  const [importStrategy, setImportStrategy] =
    createSignal<ImportStrategy>('merge');

  const checkOlderSnapshot = async (bak: BakV1): Promise<boolean> => {
    if (importStrategy() === 'new') return true;
    const meta = activeProjectMeta();
    if (!meta) return true;
    const committedAt = meta.committedAt ?? '';
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

  // Warning messages for checked-but-not-logged-in destinations
  const authWarnings = () => {
    const dests = saveDestinations();
    const warnings: string[] = [];
    if (dests.includes('dropbox') && !loadDropboxToken())
      warnings.push(s('backup.warn_login_required', { service: 'Dropbox' }));
    if (dests.includes('gdrive') && !loadGDriveToken())
      warnings.push(
        s('backup.warn_login_required', { service: 'Google Drive' }),
      );
    return warnings;
  };

  const handleSave = async () => {
    const dests = saveDestinations();
    if (dests.length === 0) return;

    // If any cloud dest needs login, trigger OAuth for the first one and stop
    if (dests.includes('dropbox') && !loadDropboxToken()) {
      await beginDropboxOAuth();
      return;
    }
    if (dests.includes('gdrive') && !loadGDriveToken()) {
      await beginGDriveOAuth();
      return;
    }

    const id = activeProjectId();
    if (!id) return;

    setSaving(true);
    try {
      const bak = await exportProjectAsBakV1(id, __APP_VERSION__, deviceId());
      const data = await serializeGzip(bak);
      const blob = toBlob(data);
      const cloudFilename = `${id}_${timestampSuffix()}.bak.gz`;

      await Promise.all(
        dests.map(async (dest) => {
          if (dest === 'local') {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${sanitizeFilename(activeProjectLabel())}_${timestampSuffix()}.bak.gz`;
            a.click();
            URL.revokeObjectURL(url);
          } else if (dest === 'dropbox') {
            const t = await ensureDropboxToken();
            await dropboxUpload(t, cloudFilename, blob);
          } else if (dest === 'gdrive') {
            const t = await ensureGDriveToken();
            await gdriveUpload(t, cloudFilename, blob);
          }
        }),
      );

      toast.success(s('backup.exported'));
      closeBackupModal();
    } catch (err) {
      toast.error(s('backup.export_error') + ': ' + (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleLocalImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.gz,.bak';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const raw = await deserializeGzip(file);
        const bak = parseBakV1(raw);
        if (!(await checkOlderSnapshot(bak))) return;
        setLoadTarget({ bak, strategy: importStrategy() });
        closeBackupModal();
        navigate('/loading-backup');
      } catch {
        toast.error(s('backup.import_error'));
      }
    };
    input.click();
  };

  return (
    <div class="flex flex-column gap-1 min-w-340">
      <h3 class="m-0">{s('backup.title')}</h3>
      <Show when={activeProjectLabel()}>
        <p class="m-0 text-sm opacity-60">{activeProjectLabel()}</p>
      </Show>

      <hr class="separator-line" />

      {/* ── Save ── */}
      <div class="flex flex-column gap-2">
        <h4 class="m-0">{s('backup.save_title')}</h4>
        <div class="flex flex-wrap gap-3">
          <For each={DESTINATIONS}>
            {(dest) => (
              <label class="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={saveDestinations().includes(dest.id)}
                  onChange={() => toggleSaveDestination(dest.id)}
                />
                <Show when={dest.icon}>
                  {(icon) => <span class="icon">{icon()()}</span>}
                </Show>
                <span>{dest.label()}</span>
              </label>
            )}
          </For>
        </div>
        <For each={authWarnings()}>
          {(msg) => <p class="hint m-0 text-warn">{msg}</p>}
        </For>
        <button
          class="btn-primary btn-sm"
          disabled={
            saving() || saveDestinations().length === 0 || !activeProjectId()
          }
          onClick={handleSave}
        >
          <span class="icon">
            <TbOutlineDownload />
          </span>
          {saving() ? s('backup.exporting') : s('backup.save_title')}
        </button>
      </div>

      <hr class="separator-line" />

      {/* ── Load ── */}
      <div class="flex flex-column gap-2">
        <h4 class="m-0">{s('backup.load_title')}</h4>
        <select
          value={loadSource()}
          onChange={(e) => setLoadSource(e.currentTarget.value as LoadSource)}
        >
          <option value="local">{s('backup.source_local')}</option>
          <option value="dropbox">Dropbox</option>
          <option value="gdrive">Google Drive</option>
        </select>

        <Switch>
          <Match when={loadSource() === 'local'}>
            <p class="hint m-0">{s('backup.import_desc')}</p>
            <button class="btn-border btn-sm" onClick={handleLocalImport}>
              <span class="icon">
                <TbOutlineUpload />
              </span>
              {s('backup.import_btn')}
            </button>
          </Match>
          <Match when={loadSource() === 'dropbox'}>
            <DropboxLoadSection
              importStrategy={importStrategy}
              checkOlderSnapshot={checkOlderSnapshot}
            />
          </Match>
          <Match when={loadSource() === 'gdrive'}>
            <GDriveLoadSection
              importStrategy={importStrategy}
              checkOlderSnapshot={checkOlderSnapshot}
            />
          </Match>
        </Switch>

        <a
          class="btn-ghost btn-sm mt-2"
          style={{ cursor: 'pointer' }}
          onClick={() => {
            closeBackupModal();
            navigate('/remote');
          }}
        >
          <span class="icon">
            <TbOutlineExternalLink />
          </span>
          {s('remote.details')}
        </a>

        <div class="flex flex-column gap-1 mt-4">
          <label class="text-sm opacity-60">
            {s('backup.import_strategy')}
          </label>
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
      </div>

      <div class="modal-actions mt-2">
        <button class="btn-secondary" onClick={closeBackupModal}>
          {s('common.cancel')}
        </button>
      </div>
    </div>
  );
};

export default BackupModal;
