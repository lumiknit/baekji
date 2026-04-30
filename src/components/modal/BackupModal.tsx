import type { Component } from 'solid-js';
import {
  createMemo,
  createResource,
  createSignal,
  For,
  Match,
  Show,
  Switch,
} from 'solid-js';
import { useNavigate } from '@solidjs/router';
import toast from 'solid-toast';
import { exportVersionAsBak } from '../../lib/doc/backup';
import { bakToBlob, serializeBak } from '../../lib/doc/backup_helper';
import {
  bakTitleSlug,
  downloadBlob,
  sanitizeFilename,
  timestampSuffix,
} from '../../lib/doc/export';
import { upload, list, download } from '../../lib/sync/dropbox';
import {
  loadToken,
  ensureToken,
  beginOAuth,
  clearToken,
} from '../../lib/sync/dropbox_auth';
import { closeModal } from '../../state/modal';
import { deviceId } from '../../state/workspace';
import { importBakBlob, openImportBakDialog } from '../../lib/import_bak';
import { s } from '../../lib/i18n';
import { formatRelativeDate } from '../../lib/format_date';
import type { SyncFile } from '../../lib/sync/interface';

declare const __APP_VERSION__: string;

const hasDropbox = !!import.meta.env.VITE_DROPBOX_CLIENT_ID;

interface Props {
  pjVerId: string;
  projectId: string;
  projectLabel: string;
}

// ── Local backup section ────────────────────────────────────────────────────

const LocalBackup: Component<Props> = (props) => {
  const navigate = useNavigate();
  const filename = `${sanitizeFilename(props.projectLabel)}_${timestampSuffix()}.gz`;

  const [blob] = createResource(async () => {
    const bak = await exportVersionAsBak(
      props.pjVerId,
      __APP_VERSION__,
      deviceId(),
    );
    const data = await serializeBak(bak);
    return bakToBlob(data);
  });

  const handleShare = async () => {
    const b = blob();
    if (!b) return;
    const file = new File([b], filename, { type: b.type });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
        closeModal(null);
        return;
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          toast.error(`Share failed: ${err?.message ?? String(err)}`);
        }
      }
    }
    downloadBlob(b, filename);
    closeModal(null);
  };

  const handleDownload = () => {
    const b = blob();
    if (!b) return;
    downloadBlob(b, filename);
    closeModal(null);
  };

  const handleImport = () => {
    closeModal(null);
    openImportBakDialog(navigate);
  };

  return (
    <div class="flex flex-column gap-8">
      <h4 class="backup-section-title">{s('common.backup')}</h4>
      <div class="flex gap-8 flex-wrap">
        <button class="btn-border btn-sm" onClick={handleImport}>
          {s('common.backup_import_local')}
        </button>
        <button
          class="btn-border btn-sm"
          disabled={blob.loading}
          onClick={handleDownload}
        >
          <Show when={blob.loading} fallback={s('common.download')}>
            ...
          </Show>
        </button>
        <button
          class="btn-primary btn-sm"
          disabled={blob.loading}
          onClick={handleShare}
        >
          <Show when={blob.loading} fallback={s('common.share')}>
            ...
          </Show>
        </button>
      </div>
    </div>
  );
};

// ── Dropbox backup section ──────────────────────────────────────────────────

function bakFilename(projectId: string, label: string): string {
  return `${projectId}.${timestampSuffix()}.${bakTitleSlug(label)}.gz`;
}

function parseBakFilename(
  name: string,
): { date: string; title: string } | null {
  // format: <projectId>.<YYMMdd_HHmm>.<title>.gz
  const m = name.match(/^[^.]+\.(\d{6}_\d{4})\.(.+)\.gz$/);
  if (!m) return null;
  const [, rawDate, title] = m;
  const y = '20' + rawDate.slice(0, 2);
  const mo = rawDate.slice(2, 4);
  const d = rawDate.slice(4, 6);
  const h = rawDate.slice(7, 9);
  const mi = rawDate.slice(9, 11);
  return {
    date: `${y}-${mo}-${d} ${h}:${mi}`,
    title: title.replace(/_/g, ' '),
  };
}

const DropboxBackup: Component<Props> = (props) => {
  const navigate = useNavigate();

  const [tokenVersion, setTokenVersion] = createSignal(0);
  const token = createMemo(() => {
    tokenVersion();
    return loadToken();
  });
  const isLoggedIn = () => !!token();

  const [uploadStatus, setUploadStatus] = createSignal<
    'idle' | 'busy' | 'done' | 'error'
  >('idle');
  const [listTrigger, setListTrigger] = createSignal(0);
  const [showAll, setShowAll] = createSignal(false);
  const [files] = createResource(
    () => ({ trigger: listTrigger(), showAll: showAll() }),
    async ({ trigger: n, showAll }) => {
      if (n === 0) return null;
      try {
        const tok = await ensureToken();
        const all = await list(tok, {
          prefix: showAll ? undefined : props.projectId + '.',
        });
        all.sort((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime());
        return all.slice(0, 10);
      } catch (err) {
        console.error('[BackupModal] list failed', err);
        toast.error(s('dropbox.error_list', { msg: String(err) }));
        throw err;
      }
    },
  );
  const [downloadingId, setDownloadingId] = createSignal<string | null>(null);

  const handleLogin = () => beginOAuth();
  const handleLogout = () => {
    clearToken();
    setListTrigger(0);
    setTokenVersion((v) => v + 1);
  };

  const handleUpload = async () => {
    setUploadStatus('busy');
    try {
      const bak = await exportVersionAsBak(
        props.pjVerId,
        __APP_VERSION__,
        deviceId(),
      );
      const data = await serializeBak(bak);
      const blob = bakToBlob(data);
      const tok = await ensureToken();
      await upload(tok, bakFilename(props.projectId, props.projectLabel), blob);
      setUploadStatus('done');
      setTimeout(() => setUploadStatus('idle'), 1500);
    } catch (err) {
      console.error('[BackupModal] upload failed', err);
      toast.error(s('dropbox.error_upload', { msg: String(err) }));
      setUploadStatus('error');
    }
  };

  const handleLoadFile = async (file: SyncFile) => {
    setDownloadingId(file.id);
    try {
      const tok = await ensureToken();
      const blob = await download(tok, file.name);
      closeModal(null);
      await importBakBlob(blob, file.name, navigate);
    } catch (err) {
      console.error('[BackupModal] download failed', err);
      toast.error(s('dropbox.error_download', { msg: String(err) }));
      setDownloadingId(null);
    }
  };

  const formatExpiry = (expiresAt: number) => {
    const diff = expiresAt - Date.now();
    if (diff <= 0) return s('dropbox.expiry_expired');
    const h = Math.floor(diff / 3_600_000);
    const m = Math.floor((diff % 3_600_000) / 60_000);
    return h > 0
      ? s('dropbox.expiry_hours', { h, m })
      : s('dropbox.expiry_minutes', { m });
  };

  const expiryWarning = createMemo(() => {
    const t = token();
    return t ? t.expiresAt - Date.now() < 600_000 : false;
  });

  return (
    <div class="flex flex-column gap-8">
      <h4 class="backup-section-title">Dropbox</h4>

      <Show when={!isLoggedIn()}>
        <p class="text-base opacity-60">{s('dropbox.not_connected')}</p>
        <button class="btn-primary btn-sm" onClick={handleLogin}>
          {s('dropbox.login')}
        </button>
      </Show>

      <Show when={isLoggedIn()}>
        <div class="backup-token-box">
          <div class="backup-token-row">
            <div class="flex-1 overflow-hidden">
              <Show
                when={token()?.displayName || token()?.email}
                fallback={
                  <span class="opacity-60">{s('dropbox.no_account_info')}</span>
                }
              >
                <Show when={token()?.displayName}>
                  <div class="bold">{token()!.displayName}</div>
                </Show>
                <Show when={token()?.email}>
                  <div class="opacity-60">{token()!.email}</div>
                </Show>
              </Show>
            </div>
            <div class="backup-token-actions">
              <a
                href="https://www.dropbox.com/home"
                target="_blank"
                rel="noopener noreferrer"
                class="btn-border btn-sm"
                title={s('dropbox.open_link')}
              >
                ↗
              </a>
              <button class="btn-border btn-sm" onClick={handleLogout}>
                {s('dropbox.logout')}
              </button>
            </div>
          </div>
          <div
            class={`backup-expiry${expiryWarning() ? ' backup-expiry-warn' : ''}`}
          >
            {token() ? formatExpiry(token()!.expiresAt) : ''}
          </div>
        </div>

        <div class="flex gap-8">
          <button
            class="btn-border btn-sm flex-1"
            disabled={uploadStatus() === 'busy'}
            onClick={handleUpload}
          >
            <Switch>
              <Match when={uploadStatus() === 'busy'}>
                {s('dropbox.saving')}
              </Match>
              <Match when={uploadStatus() === 'done'}>
                {s('dropbox.save_done')}
              </Match>
              <Match when={true}>{s('dropbox.save_project')}</Match>
            </Switch>
          </button>
          <button
            class="btn-border btn-sm flex-1"
            disabled={files.loading}
            onClick={() => setListTrigger((n) => n + 1)}
          >
            <Show when={files.loading} fallback={s('dropbox.load_list')}>
              {s('dropbox.loading_list')}
            </Show>
          </button>
        </div>

        <label class="backup-show-all-label">
          <input
            type="checkbox"
            checked={showAll()}
            onChange={(e) => setShowAll(e.currentTarget.checked)}
          />
          <span class="opacity-60">{s('dropbox.show_all')}</span>
        </label>

        <Show when={files() !== null && !files.loading && !files.error}>
          <div class="flex flex-column gap-4">
            <Show
              when={(files() ?? []).length > 0}
              fallback={
                <p class="opacity-60 text-base backup-list-hint">
                  {s('dropbox.no_files')}
                </p>
              }
            >
              <p class="backup-list-hint">{s('dropbox.list_hint')}</p>
              <For each={files() ?? []}>
                {(file) => (
                  <button
                    class="btn-border backup-file-btn"
                    disabled={!!downloadingId()}
                    onClick={() => handleLoadFile(file)}
                  >
                    <Show
                      when={downloadingId() === file.id}
                      fallback={(() => {
                        const parsed = parseBakFilename(file.name);
                        return (
                          <>
                            <div class="backup-file-title">
                              {parsed
                                ? parsed.title
                                : formatRelativeDate(file.modifiedAt)}
                            </div>
                            <div class="backup-file-meta">
                              {parsed ? parsed.date : ''}
                            </div>
                            <div class="backup-file-meta backup-file-name">
                              {file.name}
                            </div>
                          </>
                        );
                      })()}
                    >
                      {s('dropbox.downloading')}
                    </Show>
                  </button>
                )}
              </For>
            </Show>
          </div>
        </Show>
      </Show>
    </div>
  );
};

// ── Merged modal ────────────────────────────────────────────────────────────

const BackupModal: Component<Props> = (props) => {
  return (
    <>
      <h3>{props.projectLabel}</h3>
      <LocalBackup
        pjVerId={props.pjVerId}
        projectId={props.projectId}
        projectLabel={props.projectLabel}
      />
      <Show when={hasDropbox}>
        <hr class="backup-divider" />
        <DropboxBackup
          pjVerId={props.pjVerId}
          projectId={props.projectId}
          projectLabel={props.projectLabel}
        />
      </Show>
      <div class="modal-actions">
        <button class="btn-secondary" onClick={() => closeModal(null)}>
          {s('common.cancel')}
        </button>
      </div>
    </>
  );
};

export default BackupModal;
