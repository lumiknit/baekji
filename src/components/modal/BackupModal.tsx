import type { Component } from 'solid-js';
import { createSignal, Show, For } from 'solid-js';
import toast from 'solid-toast';
import {
  TbOutlineDownload,
  TbOutlineUpload,
  TbOutlineLogin,
  TbOutlineLogout,
  TbOutlineRefresh,
  TbOutlineExternalLink,
  TbOutlineBrandDropbox,
} from 'solid-icons/tb';
import {
  exportProjectAsBakV1,
  importBakV1,
  parseBakV1,
} from '../../lib/doc/backup_v1';
import {
  serializeGzip,
  deserializeGzip,
  toBlob,
} from '../../lib/doc/backup_helper';
import {
  activeProjectDoc,
  activeProjectId,
  activeProjectLabel,
  openProject,
} from '../../state/workspace_v1';
import { deviceId } from '../../state/workspace';
import { closeBackupModal } from '../../state/modal';
import { s } from '../../lib/i18n';
import { genOrderedId } from '../../lib/uuid';
import {
  loadToken,
  clearToken,
  beginOAuth,
  ensureToken,
} from '../../lib/sync/dropbox_auth';
import { list, upload, download, type SyncFile } from '../../lib/sync/dropbox';
import type { BakV1 } from '../../lib/doc/v1';

declare const __APP_VERSION__: string;

function sanitizeFilename(name: string): string {
  // eslint-disable-next-line no-control-regex
  return name.slice(0, 64).replace(/[\u0000-\u001f\\/:"*?<>|]/g, '_');
}

function timestampSuffix(): string {
  const now = new Date();
  const y = now.getFullYear().toString().slice(2);
  const mo = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  return `${y}${mo}${d}_${h}${m}`;
}

const BackupModal: Component = () => {
  const [exporting, setExporting] = createSignal(false);
  const [dbxFiles, setDbxFiles] = createSignal<SyncFile[]>([]);
  const [loadingDbx, setLoadingDbx] = createSignal(false);
  const [showAll, setShowAll] = createSignal(false);
  const [dbxToken, setDbxToken] = createSignal(loadToken());
  const [cloneMode, setCloneMode] = createSignal(false);

  const applyCloneMode = (bak: BakV1): BakV1 => {
    if (!cloneMode()) return bak;
    return {
      ...bak,
      $projectId: genOrderedId(),
      sheets: bak.sheets.map((s) => ({ ...s, id: genOrderedId() })),
    };
  };

  const handleDownload = async () => {
    const pd = activeProjectDoc();
    const id = activeProjectId();
    if (!pd || !id) return;
    setExporting(true);
    try {
      const bak = await exportProjectAsBakV1(
        id,
        pd,
        __APP_VERSION__,
        deviceId(),
      );
      const data = await serializeGzip(bak);
      const blob = toBlob(data);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${sanitizeFilename(activeProjectLabel())}_${timestampSuffix()}.bak.gz`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(s('backup.exported'));
      closeBackupModal();
    } catch {
      toast.error(s('backup.export_error'));
    } finally {
      setExporting(false);
    }
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.gz,.bak';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const raw = await deserializeGzip(file);
        let bak = parseBakV1(raw);
        bak = applyCloneMode(bak);
        const result = await importBakV1(bak);
        await openProject(result.projectId);
        toast.success(s('backup.imported'));
        closeBackupModal();
      } catch {
        toast.error(s('backup.import_error'));
      }
    };
    input.click();
  };

  const fetchDbxFiles = async () => {
    const token = dbxToken();
    if (!token) return;
    setLoadingDbx(true);
    try {
      const validToken = await ensureToken();
      setDbxToken(validToken);
      const prefix = showAll() ? undefined : activeProjectId();
      const files = await list(validToken, { prefix, limit: 100 });
      // Sort by name descending (newest first)
      setDbxFiles(files.reverse().slice(0, 10));
    } catch (err) {
      toast.error(s('dropbox.error_list', { msg: (err as Error).message }));
    } finally {
      setLoadingDbx(false);
    }
  };

  const handleDbxBackup = async () => {
    const pd = activeProjectDoc();
    const id = activeProjectId();
    if (!pd || !id) return;
    setExporting(true);
    try {
      const validToken = await ensureToken();
      setDbxToken(validToken);
      const bak = await exportProjectAsBakV1(
        id,
        pd,
        __APP_VERSION__,
        deviceId(),
      );
      const data = await serializeGzip(bak);
      const blob = toBlob(data);
      const filename = `${id}_${timestampSuffix()}.bak.gz`;
      await upload(validToken, filename, blob);
      toast.success(s('dropbox.save_done'));
      await fetchDbxFiles();
    } catch (err) {
      toast.error(s('dropbox.error_upload', { msg: (err as Error).message }));
    } finally {
      setExporting(false);
    }
  };

  const handleDbxRestore = async (file: SyncFile) => {
    const token = dbxToken();
    if (!token) return;
    setLoadingDbx(true);
    try {
      const validToken = await ensureToken();
      setDbxToken(validToken);
      const blob = await download(validToken, file.name);
      const raw = await deserializeGzip(blob);
      let bak = parseBakV1(raw);
      bak = applyCloneMode(bak);
      const result = await importBakV1(bak);
      await openProject(result.projectId);
      toast.success(s('backup.imported'));
      closeBackupModal();
    } catch (err) {
      toast.error(s('dropbox.error_download', { msg: (err as Error).message }));
    } finally {
      setLoadingDbx(false);
    }
  };

  const handleLogin = () => beginOAuth();
  const handleLogout = () => {
    clearToken();
    setDbxToken(null);
    setDbxFiles([]);
  };

  const formatExpiry = (expiresAt: number) => {
    const diff = expiresAt - Date.now();
    if (diff <= 0) return s('dropbox.expiry_expired');
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    if (h > 0) return s('dropbox.expiry_hours', { h, m });
    return s('dropbox.expiry_minutes', { m });
  };

  return (
    <div class="flex flex-column gap-4" style={{ 'min-width': '340px' }}>
      <h3 class="m-0">{s('backup.title')}</h3>

      <label class="backup-show-all-label">
        <input
          type="checkbox"
          checked={cloneMode()}
          onChange={(e) => setCloneMode(e.currentTarget.checked)}
        />
        {s('backup.import_clone')}
      </label>

      <hr class="separator-line" style={{ margin: '4px 0' }} />

      {/* --- Local Section --- */}
      <div class="flex flex-column gap-2">
        <div class="flex items-center gap-2">
          <TbOutlineDownload />
          <h4 class="m-0">Local</h4>
        </div>
        <p class="hint m-0">{s('backup.export_desc')}</p>
        <div class="flex gap-2">
          <button
            class="btn-primary btn-sm flex-1"
            disabled={exporting() || !activeProjectDoc()}
            onClick={handleDownload}
          >
            <span class="icon">
              <TbOutlineDownload />
            </span>
            {exporting() ? s('backup.exporting') : s('backup.export_btn')}
          </button>
          <button class="btn-border btn-sm flex-1" onClick={handleImport}>
            <span class="icon">
              <TbOutlineUpload />
            </span>
            {s('backup.import_btn')}
          </button>
        </div>
      </div>

      <hr class="backup-divider" />

      {/* --- Dropbox Section --- */}
      <div class="flex flex-column gap-2">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <TbOutlineBrandDropbox />
            <h4 class="m-0">Dropbox</h4>
          </div>
          <Show
            when={dbxToken()}
            fallback={
              <button class="btn-sm btn-border" onClick={handleLogin}>
                <span class="icon">
                  <TbOutlineLogin />
                </span>
                {s('dropbox.login')}
              </button>
            }
          >
            <button class="btn-sm btn-ghost" onClick={handleLogout}>
              <span class="icon">
                <TbOutlineLogout />
              </span>
              {s('dropbox.logout')}
            </button>
          </Show>
        </div>

        <Show
          when={dbxToken()}
          fallback={<p class="hint m-0">{s('dropbox.not_connected')}</p>}
        >
          {(token) => (
            <div class="backup-token-box">
              <div class="flex items-center justify-between">
                <div class="flex flex-column">
                  <span class="font-bold">
                    {token().displayName || s('dropbox.no_account_info')}
                  </span>
                  <span class="backup-expiry">
                    {formatExpiry(token().expiresAt)}
                  </span>
                </div>
                <div class="backup-token-actions">
                  <button
                    class="sb-icon-btn"
                    title={s('dropbox.load_list')}
                    onClick={fetchDbxFiles}
                    disabled={loadingDbx()}
                  >
                    <div class="btn-pad">
                      <TbOutlineRefresh
                        class={loadingDbx() ? 'animate-spin' : ''}
                      />
                    </div>
                  </button>
                  <a
                    href="https://www.dropbox.com/home/Apps/Baekji"
                    target="_blank"
                    class="sb-icon-btn"
                    title={s('dropbox.open_link')}
                  >
                    <div class="btn-pad">
                      <TbOutlineExternalLink />
                    </div>
                  </a>
                </div>
              </div>

              <hr class="separator-line" style={{ margin: '4px 0' }} />

              <button
                class="btn-primary btn-sm"
                disabled={exporting() || !activeProjectDoc()}
                onClick={handleDbxBackup}
              >
                <span class="icon">
                  <TbOutlineUpload />
                </span>
                {exporting() ? s('dropbox.saving') : s('dropbox.save_project')}
              </button>

              <div class="flex items-center justify-between mt-1">
                <span class="backup-list-hint">{s('dropbox.list_hint')}</span>
                <label class="backup-show-all-label">
                  <input
                    type="checkbox"
                    checked={showAll()}
                    onChange={(e) => {
                      setShowAll(e.currentTarget.checked);
                      fetchDbxFiles();
                    }}
                  />
                  {s('dropbox.show_all')}
                </label>
              </div>

              <div class="flex flex-column gap-1 mt-1">
                <For
                  each={dbxFiles()}
                  fallback={
                    <p class="hint text-center py-2">
                      {loadingDbx()
                        ? s('dropbox.loading_list')
                        : s('dropbox.no_files')}
                    </p>
                  }
                >
                  {(file) => (
                    <button
                      class="btn-ghost btn-sm backup-file-btn"
                      onClick={() => handleDbxRestore(file)}
                      disabled={loadingDbx()}
                    >
                      <span class="backup-file-name">{file.name}</span>
                      <span class="backup-file-meta">
                        {file.modifiedAt.toLocaleString()} (
                        {Math.round((file.size || 0) / 1024)} KB)
                      </span>
                    </button>
                  )}
                </For>
              </div>
            </div>
          )}
        </Show>
      </div>

      <div class="modal-actions mt-4">
        <button class="btn-secondary" onClick={closeBackupModal}>
          {s('common.cancel')}
        </button>
      </div>
    </div>
  );
};

export default BackupModal;
