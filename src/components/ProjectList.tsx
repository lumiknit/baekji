import { useNavigate } from '@solidjs/router';
import {
  TbOutlineDotsVertical,
  TbOutlinePlus,
  TbOutlineCloud,
} from 'solid-icons/tb';
import type { Component } from 'solid-js';
import { createResource, createSignal, For, Show } from 'solid-js';
import { getAllVersionRoots, setActiveVersion } from '../lib/doc/db';
import { createProject as createProjectInDB } from '../lib/doc/db_helper';
import { s } from '../lib/i18n';
import { formatRelativeDate } from '../lib/format_date';
import { showPrompt, showBackup } from '../state/modal';
import { setActivePjVerId, setSidebarView } from '../state/workspace';
import Dropdown from './Dropdown';

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
          triggerAriaLabel={s('common.more_actions')}
          align="right"
          trigger={
            <div class="btn-pad">
              <span class="icon">
                <TbOutlineDotsVertical />
              </span>
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
            <span class="icon">
              <TbOutlinePlus />
            </span>
            {s('project.new_project')}
          </div>
        </button>
        <button class="project-list-new-btn" onClick={() => showBackup()}>
          <div class="btn-pad">
            <span class="icon">
              <TbOutlineCloud />
            </span>
            {s('common.pj_backup')}
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
                role="button"
                tabIndex={0}
                aria-label={p.label}
                onClick={() =>
                  p.active
                    ? openProject(p.id)
                    : activateAndOpen(p.projectId, p.id)
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    p.active
                      ? openProject(p.id)
                      : activateAndOpen(p.projectId, p.id);
                  }
                }}
              >
                <div class="btn-pad">
                  <div class="project-list-item-label">{p.label}</div>
                  <div class="project-list-item-meta">
                    <Show when={!p.active}>
                      <span class="project-list-item-inactive-badge">
                        {s('project.inactive')}
                      </span>
                    </Show>
                    {formatRelativeDate(p.updatedAt)}
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
