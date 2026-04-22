import { useNavigate } from '@solidjs/router';
import {
  TbOutlineDotsVertical,
  TbOutlineFileImport,
  TbOutlinePlus,
} from 'solid-icons/tb';
import type { Component } from 'solid-js';
import { createResource, createSignal, For, Show } from 'solid-js';
import {
  getAllVersionRoots,
  getAllNodesInVersion,
  getActiveVersionRoot,
  setActiveVersion,
} from '../lib/doc/db';
import { parseBak, prepareBakImport } from '../lib/doc/backup';
import {
  commitBakImport,
  createProject as createProjectInDB,
} from '../lib/doc/db_helper';
import { schemaVersion } from '../lib/doc/v0';
import { s } from '../lib/i18n';
import { showConfirm, showImportCompare, showPrompt } from '../state/modal';
import type { VersionCompareMeta } from '../state/modal';
import { setActivePjVerId, setSidebarView } from '../state/workspace';
import Dropdown from './Dropdown';
import { deserializeBak } from '../lib/doc/backup_helper';

declare const __APP_VERSION__: string;

const ProjectList: Component = () => {
  const navigate = useNavigate();
  const [filter, setFilter] = createSignal('');
  const [showInactive, setShowInactive] = createSignal(false);

  const [allVersions, { refetch }] = createResource(async () => {
    return getAllVersionRoots();
  });

  const filtered = () => {
    const q = filter().toLowerCase();
    const all = allVersions() ?? [];
    const list = showInactive() ? [...all] : all.filter((r) => r.active);
    list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    if (!q) return list;
    return list.filter((p) => p.label.toLowerCase().includes(q));
  };

  const openProject = (versionId: string) => {
    setActivePjVerId(versionId);
    setSidebarView('tree');
    navigate(`/nodes/${versionId}`);
  };

  const activateAndOpen = async (projectId: string, versionId: string) => {
    await setActiveVersion(projectId, versionId);
    refetch();
    openProject(versionId);
  };

  const createProject = async () => {
    const label = await showPrompt(
      s('home.create_project'),
      s('home.project_name_prompt'),
      s('home.default_project_name'),
    );
    if (!label) return;
    const { pjVerId } = await createProjectInDB(label);
    refetch();
    openProject(pjVerId);
  };

  const importBackup = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.gz';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        let raw: unknown;
        if (file.name.endsWith('.gz')) {
          const bak = await deserializeBak(
            await file.arrayBuffer().then((b) => new Uint8Array(b)),
          );
          raw = bak;
        } else {
          raw = JSON.parse(await file.text());
        }
        const bak = parseBak(raw);
        const result = await prepareBakImport(bak);

        if (result.projectExists) {
          const existingRoot = await getActiveVersionRoot(result.projectId);
          const existingNodes = existingRoot
            ? await getAllNodesInVersion(existingRoot.id)
            : [];

          const existing: VersionCompareMeta = {
            label: existingRoot?.label ?? '',
            updatedAt: existingRoot?.updatedAt ?? '',
            exportedAt: existingRoot?.exportedAt,
            exportedBy: existingRoot?.exportedBy,
            appVersion: __APP_VERSION__,
            schemaVersion,
            sheetCount: existingNodes.filter((n) => n.type === 'sheet').length,
            groupCount: existingNodes.filter((n) => n.type === 'group').length,
          };

          const incomingNodes = bak.nodes;
          const incoming: VersionCompareMeta = {
            label: bak.label,
            updatedAt: bak.updatedAt,
            exportedAt: bak.exportedAt,
            exportedBy: bak.exportedBy,
            appVersion: bak.$appVersion,
            schemaVersion: bak.$schemaVersion,
            sheetCount: incomingNodes.filter((n) => n.type === 'sheet').length,
            groupCount: incomingNodes.filter(
              (n) => n.type === 'group' && n.id !== bak.rootNodeId,
            ).length,
          };

          const choice = await showImportCompare(existing, incoming);
          if (choice === 'cancel') return;

          await commitBakImport(result);
          if (choice === 'overwrite') {
            await setActiveVersion(result.projectId, result.versionRoot.id);
            refetch();
            openProject(result.versionRoot.id);
          } else {
            // 'separate': import as inactive version, stay on current project
            refetch();
          }
          return;
        }

        await commitBakImport(result);
        await setActiveVersion(result.projectId, result.versionRoot.id);
        refetch();
        openProject(result.versionRoot.id);
      } catch (err) {
        await showConfirm(s('common.import_file'), String(err));
      }
    };
    input.click();
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60_000) return s('time.just_now');
    if (diff < 3600_000)
      return s('time.minutes_ago', { n: Math.floor(diff / 60_000) });
    if (diff < 86400_000)
      return s('time.hours_ago', { n: Math.floor(diff / 3600_000) });
    return d.toLocaleDateString();
  };

  return (
    <div class="project-list">
      <div class="project-list-header">
        <input
          class="project-list-filter"
          type="text"
          placeholder={s('project.search_placeholder')}
          value={filter()}
          onInput={(e) => setFilter(e.currentTarget.value)}
        />
        <Dropdown
          align="right"
          trigger={<TbOutlineDotsVertical />}
          items={[
            {
              label: showInactive()
                ? s('project.hide_inactive')
                : s('project.show_inactive'),
              onSelect: () => setShowInactive((v) => !v),
            },
          ]}
        />
      </div>
      <div class="project-list-items">
        <button class="project-list-new-btn" onClick={createProject}>
          <TbOutlinePlus /> {s('project.new_project')}
        </button>
        <button class="project-list-new-btn" onClick={importBackup}>
          <TbOutlineFileImport /> {s('home.backup_import')}
        </button>
        <Show
          when={!allVersions.loading}
          fallback={<div class="p-16">Loading...</div>}
        >
          <For each={filtered()}>
            {(p) => (
              <div
                class="project-list-item"
                classList={{ 'project-list-item--inactive': !p.active }}
                title={`project: ${p.projectId}\nversion: ${p.id}`}
                onClick={() =>
                  p.active
                    ? openProject(p.id)
                    : activateAndOpen(p.projectId, p.id)
                }
              >
                <div class="project-list-item-label">{p.label}</div>
                <div class="project-list-item-meta">
                  <Show when={!p.active}>
                    <span class="project-list-item-inactive-badge">
                      {s('project.inactive')}
                    </span>
                  </Show>
                  {formatDate(p.updatedAt)}
                </div>
              </div>
            )}
          </For>
        </Show>
      </div>
    </div>
  );
};

export default ProjectList;
