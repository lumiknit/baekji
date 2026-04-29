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
  setActiveVersion,
} from '../lib/doc/db';
import { createProject as createProjectInDB } from '../lib/doc/db_helper';
import { s } from '../lib/i18n';
import { showPrompt } from '../state/modal';
import { setActivePjVerId, setSidebarView } from '../state/workspace';
import Dropdown from './Dropdown';
import { openImportBakDialog } from '../lib/import_bak';


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
    openImportBakDialog(navigate, refetch);
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
          triggerClass="sb-icon-btn"
          align="right"
          trigger={
            <div class="btn-pad">
              <span class="icon"><TbOutlineDotsVertical /></span>
            </div>
          }
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
          <div class="btn-pad">
            <span class="icon"><TbOutlinePlus /></span>
            {s('project.new_project')}
          </div>
        </button>
        <button class="project-list-new-btn" onClick={importBackup}>
          <div class="btn-pad">
            <span class="icon"><TbOutlineFileImport /></span>
            {s('home.backup_import')}
          </div>
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
                <div class="btn-pad">
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
              </div>
            )}
          </For>
        </Show>
      </div>
    </div>
  );
};

export default ProjectList;
