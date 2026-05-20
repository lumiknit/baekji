import { useNavigate } from '@solidjs/router';
import { TbOutlineDotsVertical, TbOutlinePlus } from 'solid-icons/tb';
import type { Component } from 'solid-js';
import { createEffect, createResource, createSignal, For } from 'solid-js';
import { listProjects, putProjectMeta } from '../lib/doc/db_v3';
import { s } from '../lib/i18n';
import { formatRelativeDate } from '../lib/format';
import { setSidebarView, projectListVersion } from '../state/workspace';
import { openProject } from '../state/workspace_v3';
import { loadSheetsForProject } from '../state/sheet_list';
import { genUnorderedId } from '../lib/uuid';
import Dropdown from './Dropdown';

const ProjectList: Component = () => {
  const navigate = useNavigate();
  const [filter, setFilter] = createSignal('');
  const [showInactive, setShowInactive] = createSignal(false);

  const [projects, { refetch }] = createResource(async () => {
    return listProjects();
  });

  createEffect(() => {
    projectListVersion(); // subscribe
    refetch();
  });

  const handleOpenProject = async (id: string) => {
    await openProject(id);
    await loadSheetsForProject(id);
    setSidebarView('tree');
    navigate(`/project/${id}`);
  };

  const createProject = async () => {
    const label = s('home.default_project_name');
    const id = genUnorderedId();
    const now = new Date().toISOString();
    await putProjectMeta({
      id,
      label,
      updatedAt: now,
      committedAt: '',
      tagColors: {},
    });
    await openProject(id);
    await loadSheetsForProject(id);
    refetch();
    setSidebarView('tree');
    navigate(`/project/${id}?new=1`);
  };

  const filteredProjects = () => {
    const q = filter().toLowerCase();
    const list = projects() ?? [];
    return q ? list.filter((p) => p.label.toLowerCase().includes(q)) : list;
  };

  return (
    <div class="project-list">
      <div class="sb-header project-list-header">
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

        <For each={filteredProjects()}>
          {(p) => (
            <div
              class="project-list-item"
              role="button"
              tabIndex={0}
              onClick={() => handleOpenProject(p.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') handleOpenProject(p.id);
              }}
            >
              <div class="btn-pad">
                <div class="project-list-item-label">{p.label}</div>
                <div class="project-list-item-meta">
                  {formatRelativeDate(p.updatedAt)}
                </div>
              </div>
            </div>
          )}
        </For>
      </div>
    </div>
  );
};

export default ProjectList;
