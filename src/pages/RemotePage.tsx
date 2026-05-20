import type { Component } from 'solid-js';
import { createSignal, createMemo, onMount, Show, For, batch } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import toast from 'solid-toast';
import {
  TbOutlineLogin,
  TbOutlineLogout,
  TbOutlineRefresh,
  TbOutlineTrash,
  TbOutlineDownload,
  TbOutlineChevronLeft,
} from 'solid-icons/tb';
import { s } from '../lib/i18n';
import { remoteService, setRemoteService } from '../state/remoteService';
import type { SyncFile } from '../lib/sync/interface';
import { deserializeGzip } from '../lib/doc/backup_helper';
import { parseBakV1 } from '../lib/doc/backup_v1';
import { listProjects } from '../lib/doc/db_v3';
import {
  loadToken as loadDropboxToken,
  clearToken as clearDropboxToken,
  beginOAuth as beginDropboxOAuth,
  ensureToken as ensureDropboxToken,
} from '../lib/sync/dropbox_auth';
import {
  list as dropboxList,
  remove as dropboxRemove,
  download as dropboxDownload,
} from '../lib/sync/dropbox';
import {
  clearToken as clearGDriveToken,
  beginOAuth as beginGDriveOAuth,
  ensureToken as ensureGDriveToken,
  gdriveTokenSignal,
} from '../lib/sync/gdrive_auth';
import {
  list as gdriveList,
  remove as gdriveRemove,
  download as gdriveDownload,
} from '../lib/sync/gdrive';

// ─── Per-project grouping helpers ────────────────────────────

function parseProjectId(filename: string): string {
  const idx = filename.indexOf('_');
  return idx >= 0 ? filename.slice(0, idx) : filename;
}

interface ProjectGroup {
  projectId: string;
  files: SyncFile[];
  totalSize: number;
}

function groupByProject(files: SyncFile[]): ProjectGroup[] {
  const map = new Map<string, SyncFile[]>();
  for (const f of files) {
    const pid = parseProjectId(f.name);
    if (!map.has(pid)) map.set(pid, []);
    map.get(pid)!.push(f);
  }
  const groups: ProjectGroup[] = [];
  for (const [projectId, fs] of map) {
    const sorted = [...fs].sort(
      (a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime(),
    );
    groups.push({
      projectId,
      files: sorted,
      totalSize: sorted.reduce((acc, f) => acc + (f.size ?? 0), 0),
    });
  }
  return groups.sort((a, b) => a.projectId.localeCompare(b.projectId));
}

function selectOldFiles(groups: ProjectGroup[], keep: number): Set<string> {
  const ids = new Set<string>();
  for (const g of groups) {
    g.files.slice(keep).forEach((f) => ids.add(f.id));
  }
  return ids;
}

// ─── Component ───────────────────────────────────────────────

const RemotePage: Component = () => {
  const navigate = useNavigate();

  const [dropboxToken, setDropboxToken] = createSignal(loadDropboxToken());
  const [files, setFiles] = createSignal<SyncFile[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [deleting, setDeleting] = createSignal(false);
  const [selected, setSelected] = createSignal<Set<string>>(new Set<string>());

  // projectId -> label 맵. 로컬 DB에서 알 수 있는 것 + 다운로드로 발견한 것.
  const [labelMap, setLabelMap] = createSignal<Map<string, string>>(new Map());

  const addLabel = (id: string, label: string) =>
    setLabelMap((prev) => new Map(prev).set(id, label));

  onMount(async () => {
    try {
      const projects = await listProjects();
      const map = new Map<string, string>();
      for (const p of projects) map.set(p.id, p.label);
      setLabelMap(map);
    } catch {
      // best-effort
    }
  });

  const token = createMemo(() =>
    remoteService() === 'gdrive' ? gdriveTokenSignal() : dropboxToken(),
  );

  const groups = createMemo(() => groupByProject(files()));
  const selectedCount = createMemo(() => selected().size);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(files().map((f) => f.id)));
  const deselectAll = () => setSelected(new Set<string>());
  const selectOldExcept = (keep: number) =>
    setSelected(selectOldFiles(groups(), keep));

  const fetchFiles = async () => {
    setLoading(true);
    try {
      let result: SyncFile[];
      if (remoteService() === 'gdrive') {
        const t = await ensureGDriveToken();
        result = await gdriveList(t, { limit: 1000 });
      } else {
        const t = await ensureDropboxToken();
        setDropboxToken(loadDropboxToken());
        result = await dropboxList(t, { limit: 1000 });
      }
      batch(() => {
        setFiles(result);
        setSelected(new Set<string>());
      });
    } catch (err) {
      toast.error(s('remote.service') + ': ' + (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    const ids = selected();
    if (ids.size === 0) return;
    const toDelete = files().filter((f) => ids.has(f.id));
    if (
      !confirm(s('remote.confirm_delete', { count: String(toDelete.length) }))
    )
      return;
    setDeleting(true);
    try {
      if (remoteService() === 'gdrive') {
        const t = await ensureGDriveToken();
        await gdriveRemove(t, toDelete);
      } else {
        const t = await ensureDropboxToken();
        await dropboxRemove(t, toDelete);
      }
      toast.success(
        s('remote.delete_done', { count: String(toDelete.length) }),
      );
      await fetchFiles();
    } catch (err) {
      toast.error(s('remote.delete_error', { msg: (err as Error).message }));
    } finally {
      setDeleting(false);
    }
  };

  const handleDownload = async (file: SyncFile) => {
    try {
      let blob: Blob;
      if (remoteService() === 'gdrive') {
        const t = await ensureGDriveToken();
        blob = await gdriveDownload(t, file.id);
      } else {
        const t = await ensureDropboxToken();
        blob = await dropboxDownload(t, file.name);
      }

      // 다운로드 기회에 파일을 파싱해서 프로젝트 이름 캐시
      try {
        const raw = await deserializeGzip(blob);
        const bak = parseBakV1(raw);
        const pid = parseProjectId(file.name);
        if (bak.label) addLabel(pid, bak.label);
      } catch {
        // 파싱 실패해도 다운로드는 계속
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleLogin = async () => {
    if (remoteService() === 'gdrive') {
      try {
        await beginGDriveOAuth();
      } catch (err) {
        toast.error((err as Error).message);
      }
    } else {
      beginDropboxOAuth();
    }
  };

  const handleLogout = () => {
    if (remoteService() === 'gdrive') {
      clearGDriveToken();
    } else {
      clearDropboxToken();
      setDropboxToken(null);
    }
    batch(() => {
      setFiles([]);
      setSelected(new Set<string>());
    });
  };

  return (
    <div
      class="page-container flex flex-column gap-3"
      style={{ padding: '1rem' }}
    >
      {/* Header */}
      <div class="flex items-center gap-2">
        <button class="btn-sm btn-ghost" onClick={() => navigate(-1)}>
          <TbOutlineChevronLeft />
          {s('common.go_back')}
        </button>
        <h2 class="m-0" style={{ flex: 1 }}>
          {s('remote.title')}
        </h2>
      </div>

      {/* Service + auth row */}
      <div class="flex items-center gap-2 flex-wrap">
        <select
          value={remoteService()}
          onChange={(e) => {
            setRemoteService(e.currentTarget.value as 'dropbox' | 'gdrive');
            batch(() => {
              setFiles([]);
              setSelected(new Set<string>());
            });
          }}
        >
          <option value="dropbox">{s('remote.service_dropbox')}</option>
          <option value="gdrive">{s('remote.service_gdrive')}</option>
        </select>

        <Show
          when={token()}
          fallback={
            <button class="btn-sm btn-border" onClick={handleLogin}>
              <TbOutlineLogin />
              {s('gdrive.login')}
            </button>
          }
        >
          {(tok) => (
            <>
              <span class="text-sm opacity-60">
                {tok().displayName || tok().email || ''}
              </span>
              <button class="btn-sm btn-ghost" onClick={handleLogout}>
                <TbOutlineLogout />
              </button>
              <button
                class="btn-sm btn-ghost"
                onClick={fetchFiles}
                disabled={loading()}
              >
                <TbOutlineRefresh class={loading() ? 'animate-spin' : ''} />
                {s('remote.all_files')}
              </button>
            </>
          )}
        </Show>
      </div>

      {/* Bulk actions */}
      <Show when={files().length > 0}>
        <div class="flex items-center gap-2 flex-wrap">
          <button class="btn-sm btn-ghost" onClick={selectAll}>
            {s('remote.select_all')}
          </button>
          <button class="btn-sm btn-ghost" onClick={deselectAll}>
            {s('remote.deselect_all')}
          </button>
          <button class="btn-sm btn-ghost" onClick={() => selectOldExcept(1)}>
            {s('remote.keep_1')}
          </button>
          <button class="btn-sm btn-ghost" onClick={() => selectOldExcept(3)}>
            {s('remote.keep_3')}
          </button>
          <button class="btn-sm btn-ghost" onClick={() => selectOldExcept(5)}>
            {s('remote.keep_5')}
          </button>
          <Show when={selectedCount() > 0}>
            <button
              class="btn-sm btn-danger"
              onClick={handleDelete}
              disabled={deleting()}
            >
              <TbOutlineTrash />
              {deleting()
                ? s('remote.deleting')
                : s('remote.delete_selected', {
                    count: String(selectedCount()),
                  })}
            </button>
          </Show>
        </div>
      </Show>

      {/* File list grouped by project */}
      <Show
        when={!loading()}
        fallback={<p class="hint text-center">{s('remote.loading')}</p>}
      >
        <Show
          when={files().length > 0}
          fallback={
            <Show when={token()}>
              <p class="hint text-center">{s('remote.no_files')}</p>
            </Show>
          }
        >
          <div class="flex flex-column gap-4">
            <For each={groups()}>
              {(group) => (
                <div class="flex flex-column gap-1">
                  {/* Project header */}
                  <div
                    class="flex items-baseline gap-2"
                    style={{
                      'padding-bottom': '2px',
                      'border-bottom': '1px solid var(--c-border)',
                    }}
                  >
                    <span class="font-bold">
                      {labelMap().get(group.projectId) ?? group.projectId}
                    </span>
                    <Show when={labelMap().has(group.projectId)}>
                      <span class="hint text-sm opacity-50">
                        {group.projectId}
                      </span>
                    </Show>
                    <span
                      class="hint text-sm"
                      style={{ 'margin-left': 'auto' }}
                    >
                      {s('remote.project_size', {
                        size: String(Math.round(group.totalSize / 1024)),
                      })}
                    </span>
                  </div>
                  {/* File rows */}
                  <For each={group.files}>
                    {(file) => (
                      <div
                        class="flex flex-wrap items-center gap-1"
                        style={{ padding: '2px 4px' }}
                      >
                        <input
                          type="checkbox"
                          checked={selected().has(file.id)}
                          onChange={() => toggleSelect(file.id)}
                          style={{ 'flex-shrink': '0' }}
                        />
                        <span
                          class="text-sm"
                          style={{
                            flex: '1',
                            'min-width': '8rem',
                            overflow: 'hidden',
                            'text-overflow': 'ellipsis',
                            'white-space': 'nowrap',
                          }}
                        >
                          {file.name}
                        </span>
                        <div
                          class="flex items-center gap-1"
                          style={{ 'flex-shrink': '0', 'margin-left': 'auto' }}
                        >
                          <span
                            class="hint text-sm"
                            style={{ 'white-space': 'nowrap' }}
                          >
                            {file.modifiedAt.toLocaleString()}
                            {file.size !== undefined
                              ? ` · ${Math.round(file.size / 1024)} KB`
                              : ''}
                          </span>
                          <button
                            class="sb-icon-btn"
                            title={s('remote.download')}
                            onClick={() => handleDownload(file)}
                          >
                            <div class="btn-pad">
                              <TbOutlineDownload />
                            </div>
                          </button>
                        </div>
                      </div>
                    )}
                  </For>
                </div>
              )}
            </For>
          </div>
        </Show>
      </Show>
    </div>
  );
};

export default RemotePage;
