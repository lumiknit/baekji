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
import type { SyncFile } from '../../lib/sync/interface';

declare const __APP_VERSION__: string;

const hasDropbox = !!import.meta.env.VITE_DROPBOX_CLIENT_ID;

interface Props {
  pjVerId: string;
  projectLabel: string;
}

// ── Local backup section ────────────────────────────────────────────────────

const LocalBackup: Component<Props> = (props) => {
  const navigate = useNavigate();
  const filename = `${sanitizeFilename(props.projectLabel)}_${timestampSuffix()}.gz`;

  const [blob] = createResource(async () => {
    const bak = await exportVersionAsBak(props.pjVerId, __APP_VERSION__, deviceId());
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
      } catch {}
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
      <h4 style={{ margin: 0 }}>{s('common.backup')}</h4>
      <div class="flex gap-8 flex-wrap">
        <button class="btn-border btn-sm" onClick={handleImport}>
          {s('common.backup_import_local')}
        </button>
        <button
          class="btn-border btn-sm"
          disabled={blob.loading}
          onClick={handleDownload}
        >
          <Show when={blob.loading} fallback={s('common.download')}>...</Show>
        </button>
        <button
          class="btn-primary btn-sm"
          disabled={blob.loading}
          onClick={handleShare}
        >
          <Show when={blob.loading} fallback={s('common.share')}>...</Show>
        </button>
      </div>
    </div>
  );
};

// ── Dropbox backup section ──────────────────────────────────────────────────

function bakFilename(pjVerId: string): string {
  return `${pjVerId}.${timestampSuffix()}.gz`;
}

const DropboxBackup: Component<Props> = (props) => {
  const navigate = useNavigate();

  const [tokenVersion, setTokenVersion] = createSignal(0);
  const token = createMemo(() => { tokenVersion(); return loadToken(); });
  const isLoggedIn = () => !!token();

  const [uploadStatus, setUploadStatus] = createSignal<'idle' | 'busy' | 'done' | 'error'>('idle');
  const [listTrigger, setListTrigger] = createSignal(0);
  const [files] = createResource(listTrigger, async (n) => {
    if (n === 0) return null;
    try {
      const tok = await ensureToken();
      const all = await list(tok, { prefix: props.pjVerId + '.' });
      all.sort((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime());
      return all.slice(0, 5);
    } catch (err: any) {
      toast.error(s('dropbox.error_list', { msg: err?.message ?? String(err) }));
      throw err;
    }
  });
  const [downloadingId, setDownloadingId] = createSignal<string | null>(null);

  const handleLogin = () => beginOAuth();
  const handleLogout = () => { clearToken(); setListTrigger(0); setTokenVersion((v) => v + 1); };

  const handleUpload = async () => {
    setUploadStatus('busy');
    try {
      const bak = await exportVersionAsBak(props.pjVerId, __APP_VERSION__, deviceId());
      const data = await serializeBak(bak);
      const blob = bakToBlob(data);
      const tok = await ensureToken();
      await upload(tok, bakFilename(props.pjVerId), blob);
      setUploadStatus('done');
      setTimeout(() => setUploadStatus('idle'), 1500);
    } catch (err: any) {
      setUploadStatus('error');
      toast.error(s('dropbox.error_upload', { msg: err?.message ?? String(err) }));
    }
  };

  const handleLoadFile = async (file: SyncFile) => {
    setDownloadingId(file.id);
    try {
      const tok = await ensureToken();
      const blob = await download(tok, file.name);
      closeModal(null);
      await importBakBlob(blob, file.name, navigate);
    } catch (err: any) {
      setDownloadingId(null);
      toast.error(s('dropbox.error_download', { msg: err?.message ?? String(err) }));
    }
  };

  const formatExpiry = (expiresAt: number) => {
    const diff = expiresAt - Date.now();
    if (diff <= 0) return s('dropbox.expiry_expired');
    const h = Math.floor(diff / 3_600_000);
    const m = Math.floor((diff % 3_600_000) / 60_000);
    return h > 0 ? s('dropbox.expiry_hours', { h, m }) : s('dropbox.expiry_minutes', { m });
  };

  const formatDate = (d: Date) => {
    const diff = Date.now() - d.getTime();
    if (diff < 60_000) return s('time.just_now');
    if (diff < 3_600_000) return s('time.minutes_ago', { n: Math.floor(diff / 60_000) });
    if (diff < 86_400_000) return s('time.hours_ago', { n: Math.floor(diff / 3_600_000) });
    return d.toLocaleDateString();
  };

  const expiryWarning = createMemo(() => {
    const t = token();
    return t ? t.expiresAt - Date.now() < 600_000 : false;
  });

  return (
    <div class="flex flex-column gap-8">
      <h4 style={{ margin: 0 }}>Dropbox</h4>

      <Show when={!isLoggedIn()}>
        <p class="text-base opacity-60">{s('dropbox.not_connected')}</p>
        <button class="btn-primary btn-sm" onClick={handleLogin}>
          {s('dropbox.login')}
        </button>
      </Show>

      <Show when={isLoggedIn()}>
        <div
          style={{
            padding: 'var(--sp-2) var(--sp-3)',
            border: '1px solid var(--border)',
            'border-radius': 'var(--r)',
            'font-size': 'var(--fs-sm)',
            display: 'flex',
            'flex-direction': 'column',
            gap: 'var(--sp-1)',
          }}
        >
          <div class="flex items-center gap-8">
            <div class="flex-1 overflow-hidden">
              <Show
                when={token()?.displayName || token()?.email}
                fallback={<span class="opacity-60">{s('dropbox.no_account_info')}</span>}
              >
                <Show when={token()?.displayName}>
                  <div class="bold">{token()!.displayName}</div>
                </Show>
                <Show when={token()?.email}>
                  <div class="opacity-60">{token()!.email}</div>
                </Show>
              </Show>
            </div>
            <div class="flex gap-4" style={{ 'flex-shrink': '0' }}>
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
            class="opacity-60"
            style={{
              'font-size': 'var(--fs-xs, 0.75em)',
              color: expiryWarning() ? 'var(--accent, #e07)' : undefined,
            }}
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
              <Match when={uploadStatus() === 'busy'}>{s('dropbox.saving')}</Match>
              <Match when={uploadStatus() === 'done'}>{s('dropbox.save_done')}</Match>
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

        <Show when={files() !== null && !files.loading && !files.error}>
          <div class="flex flex-column gap-4">
            <Show
              when={(files() ?? []).length > 0}
              fallback={
                <p class="opacity-60 text-base" style={{ margin: '0' }}>
                  {s('dropbox.no_files')}
                </p>
              }
            >
              <p class="opacity-60" style={{ 'font-size': 'var(--fs-sm)', margin: '0' }}>
                {s('dropbox.list_hint')}
              </p>
              <For each={files() ?? []}>
                {(file) => (
                  <button
                    class="btn-border"
                    style={{ 'text-align': 'left', width: '100%' }}
                    disabled={!!downloadingId()}
                    onClick={() => handleLoadFile(file)}
                  >
                    <Show
                      when={downloadingId() === file.id}
                      fallback={
                        <>
                          <div style={{ 'font-size': 'var(--fs-sm)' }}>
                            {formatDate(file.modifiedAt)}
                          </div>
                          <div class="opacity-60" style={{ 'font-size': 'var(--fs-xs, 0.75em)' }}>
                            {file.name}
                          </div>
                        </>
                      }
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
      <h3 style={{ margin: '0 0 var(--sp-3)' }}>{props.projectLabel}</h3>
      <LocalBackup pjVerId={props.pjVerId} projectLabel={props.projectLabel} />
      <Show when={hasDropbox}>
        <hr style={{ margin: 'var(--sp-4) 0', border: 'none', 'border-top': '1px solid var(--border)' }} />
        <DropboxBackup pjVerId={props.pjVerId} projectLabel={props.projectLabel} />
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
