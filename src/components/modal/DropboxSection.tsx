import type { Component } from 'solid-js';
import { createSignal, Show, For } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import toast from 'solid-toast';
import {
  TbOutlineUpload,
  TbOutlineLogin,
  TbOutlineLogout,
  TbOutlineRefresh,
  TbOutlineExternalLink,
  TbOutlineBrandDropbox,
} from 'solid-icons/tb';
import {
  exportProjectAsBakV1,
  parseBakV1,
  type ImportStrategy,
} from '../../lib/doc/backup_v1';
import {
  serializeGzip,
  deserializeGzip,
  toBlob,
} from '../../lib/doc/backup_helper';
import { activeProjectDoc, activeProjectId } from '../../state/workspace_v1';
import { deviceId } from '../../state/workspace';
import { closeBackupModal } from '../../state/modal';
import { setLoadTarget } from '../../state/backupLoad';
import { s } from '../../lib/i18n';
import { timestampSuffix, formatExpiry } from '../../lib/format';
import {
  loadToken,
  clearToken,
  beginOAuth,
  ensureToken,
} from '../../lib/sync/dropbox_auth';
import { list, upload, download } from '../../lib/sync/dropbox';
import type { SyncFile } from '../../lib/sync/interface';
import type { BakV1 } from '../../lib/doc/v1';

declare const __APP_VERSION__: string;

interface Props {
  importStrategy: () => ImportStrategy;
  checkOlderSnapshot: (bak: BakV1) => Promise<boolean>;
}

const DropboxSection: Component<Props> = (props) => {
  const navigate = useNavigate();
  const [exporting, setExporting] = createSignal(false);
  const [dbxFiles, setDbxFiles] = createSignal<SyncFile[]>([]);
  const [loadingDbx, setLoadingDbx] = createSignal(false);
  const [showAll, setShowAll] = createSignal(false);
  const [dbxToken, setDbxToken] = createSignal(loadToken());

  const fetchDbxFiles = async () => {
    if (!dbxToken()) return;
    setLoadingDbx(true);
    try {
      const validToken = await ensureToken();
      setDbxToken(loadToken());
      const prefix = showAll() ? undefined : (activeProjectId() ?? undefined);
      const files = await list(validToken, { prefix, limit: 100 });
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
      setDbxToken(loadToken());
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
    if (!dbxToken()) return;
    setLoadingDbx(true);
    try {
      const validToken = await ensureToken();
      setDbxToken(loadToken());
      const blob = await download(validToken, file.name);
      const raw = await deserializeGzip(blob);
      const bak = parseBakV1(raw);
      if (!(await props.checkOlderSnapshot(bak))) return;
      setLoadTarget({ bak, strategy: props.importStrategy() });
      closeBackupModal();
      navigate('/loading-backup');
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

  return (
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
  );
};

export default DropboxSection;
