import type { Component } from 'solid-js';
import { createSignal, Show, For } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import toast from 'solid-toast';
import {
  TbOutlineLogin,
  TbOutlineLogout,
  TbOutlineRefresh,
  TbOutlineBrandGoogleDrive,
} from 'solid-icons/tb';
import { parseBakV1, type ImportStrategy } from '../../lib/doc/backup_v1';
import { deserializeGzip } from '../../lib/doc/backup_helper';
import { activeProjectId } from '../../state/workspace_v3';
import { closeBackupModal } from '../../state/modal';
import { setLoadTarget } from '../../state/backupLoad';
import { s } from '../../lib/i18n';
import { formatExpiry } from '../../lib/format';
import {
  loadToken,
  clearToken,
  beginOAuth,
  ensureToken,
} from '../../lib/sync/gdrive_auth';
import { list, download } from '../../lib/sync/gdrive';
import type { SyncFile } from '../../lib/sync/interface';
import type { BakV1 } from '../../lib/doc/v1';

interface Props {
  importStrategy: () => ImportStrategy;
  checkOlderSnapshot: (bak: BakV1) => Promise<boolean>;
}

const GDriveLoadSection: Component<Props> = (props) => {
  const navigate = useNavigate();
  const [token, setToken] = createSignal(loadToken());
  const [files, setFiles] = createSignal<SyncFile[]>([]);
  const [status, setStatus] = createSignal<'idle' | 'loading' | 'loaded'>(
    'idle',
  );
  const [showAll, setShowAll] = createSignal(false);

  const fetchFiles = async () => {
    if (!token()) return;
    setStatus('loading');
    try {
      const t = await ensureToken();
      setToken(loadToken());
      const prefix = showAll() ? undefined : (activeProjectId() ?? undefined);
      const fetched = await list(t, { prefix, limit: 100 });
      setFiles(fetched.slice(0, 10));
      setStatus('loaded');
    } catch (err) {
      toast.error(s('gdrive.error_list', { msg: (err as Error).message }));
      setStatus('idle');
    }
  };

  const handleRestore = async (file: SyncFile) => {
    setStatus('loading');
    try {
      const t = await ensureToken();
      const blob = await download(t, file.id);
      const raw = await deserializeGzip(blob);
      const bak = parseBakV1(raw);
      if (!(await props.checkOlderSnapshot(bak))) return;
      setLoadTarget({ bak, strategy: props.importStrategy() });
      closeBackupModal();
      navigate('/loading-backup');
    } catch (err) {
      toast.error(s('gdrive.error_download', { msg: (err as Error).message }));
      setStatus('loaded');
    }
  };

  return (
    <div class="flex flex-column gap-2">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <TbOutlineBrandGoogleDrive />
          <span class="font-bold">Google Drive</span>
        </div>
        <Show
          when={token()}
          fallback={
            <button class="btn-sm btn-border" onClick={beginOAuth}>
              <TbOutlineLogin /> {s('gdrive.login')}
            </button>
          }
        >
          <button
            class="btn-sm btn-ghost"
            onClick={() => {
              clearToken();
              setToken(null);
              setFiles([]);
            }}
          >
            <TbOutlineLogout /> {s('gdrive.logout')}
          </button>
        </Show>
      </div>

      <Show
        when={token()}
        fallback={<p class="hint m-0">{s('gdrive.not_connected')}</p>}
      >
        {(tok) => (
          <div class="backup-token-box">
            <div class="flex items-center justify-between">
              <div class="flex flex-column">
                <span class="font-bold">
                  {tok().displayName || s('gdrive.no_account_info')}
                </span>
                <span class="backup-expiry">
                  {formatExpiry(tok().expiresAt)}
                </span>
              </div>
              <div class="backup-token-actions">
                <button
                  class="sb-icon-btn"
                  title={s('gdrive.load_list')}
                  onClick={fetchFiles}
                  disabled={status() === 'loading'}
                >
                  <div class="btn-pad">
                    <TbOutlineRefresh
                      class={status() === 'loading' ? 'animate-spin' : ''}
                    />
                  </div>
                </button>
              </div>
            </div>
            <div class="flex items-center justify-between mt-1">
              <span class="backup-list-hint">{s('gdrive.list_hint')}</span>
              <label class="backup-show-all-label">
                <input
                  type="checkbox"
                  checked={showAll()}
                  onChange={(e) => {
                    setShowAll(e.currentTarget.checked);
                    fetchFiles();
                  }}
                />
                {s('gdrive.show_all')}
              </label>
            </div>
            <div class="flex flex-column gap-1 mt-1">
              <For
                each={files()}
                fallback={
                  <p class="hint text-center py-2">
                    {status() === 'loading'
                      ? s('gdrive.loading_list')
                      : status() === 'idle'
                        ? s('backup.load_hint_refresh')
                        : s('gdrive.no_files')}
                  </p>
                }
              >
                {(file) => (
                  <button
                    class="btn-ghost btn-sm backup-file-btn"
                    onClick={() => handleRestore(file)}
                    disabled={status() === 'loading'}
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

export default GDriveLoadSection;
