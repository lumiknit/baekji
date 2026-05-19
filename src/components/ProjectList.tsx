import { useNavigate } from '@solidjs/router';
import { TbOutlineDotsVertical, TbOutlinePlus } from 'solid-icons/tb';
import type { Component } from 'solid-js';
import { createEffect, createResource, createSignal, For } from 'solid-js';
import { getAllProjects, putProject } from '../lib/doc/db_v1';
import { s } from '../lib/i18n';
import { formatRelativeDate } from '../lib/format';
import { setSidebarView, projectListVersion } from '../state/workspace';
import { openProject, activeProjectDoc } from '../state/workspace_v1';
import { genUnorderedId } from '../lib/uuid';
import Dropdown from './Dropdown';

const ProjectList: Component = () => {
  const navigate = useNavigate();
  const [filter, setFilter] = createSignal('');
  const [showInactive, setShowInactive] = createSignal(false);

  const [v1Projects, { refetch: refetchV1 }] = createResource(async () => {
    return getAllProjects();
  });

  createEffect(() => {
    projectListVersion(); // subscribe
    refetchV1();
  });

  const openV1Project = async (id: string) => {
    await openProject(id);
    setSidebarView('tree');
    navigate(`/project/${id}`);
  };

  const createV1Project = async () => {
    const label = s('home.default_project_name');
    const id = genUnorderedId();
    const now = new Date().toISOString();
    putProject({ id, label, updatedAt: now, committedAt: '', tagColors: {} });
    await openProject(id);
    const pd = activeProjectDoc();
    if (pd) {
      pd.meta.set('id', id);
      pd.meta.set('label', label);
      pd.meta.set('updatedAt', now);
    }
    refetchV1();
    setSidebarView('tree');
    navigate(`/project/${id}?new=1`);
  };

  const filteredV1 = () => {
    const q = filter().toLowerCase();
    const list = v1Projects() ?? [];
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
        <button class="project-list-new-btn" onClick={createV1Project}>
          <div class="btn-pad">
            <span class="icon">
              <TbOutlinePlus />
            </span>
            {s('project.new_project')}
          </div>
        </button>

        <For each={filteredV1()}>
          {(p) => (
            <div
              class="project-list-item"
              role="button"
              tabIndex={0}
              onClick={() => openV1Project(p.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') openV1Project(p.id);
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
