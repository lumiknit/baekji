import { useNavigate } from '@solidjs/router';
import { TbOutlineDotsVertical, TbOutlinePlus } from 'solid-icons/tb';
import type { Component } from 'solid-js';
import {
  createEffect,
  createResource,
  createSignal,
  For,
  Show,
} from 'solid-js';
import { getAllVersionRoots } from '../lib/doc/db';
import { getAllProjects, putProject } from '../lib/doc/db_v1';
import { s } from '../lib/i18n';
import { formatRelativeDate } from '../lib/format';
import { showPrompt } from '../state/modal';
import { setSidebarView, projectListVersion } from '../state/workspace';
import { openProject, activeProjectDoc } from '../state/workspace_v1';
import { genUnorderedId } from '../lib/uuid';
import Dropdown from './Dropdown';

const ProjectList: Component = () => {
  const navigate = useNavigate();
  const [filter, setFilter] = createSignal('');
  const [showInactive, setShowInactive] = createSignal(false);

  const [v0Projects] = createResource(async () => {
    const all = await getAllVersionRoots();
    return all.filter((r) => r.active);
  });

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
    navigate('/');
  };

  const createV1Project = async () => {
    const label = await showPrompt(
      s('home.create_project'),
      s('home.project_name_prompt'),
      s('home.default_project_name'),
    );
    if (!label) return;
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
    navigate('/');
  };

  const filteredV1 = () => {
    const q = filter().toLowerCase();
    const list = v1Projects() ?? [];
    return q ? list.filter((p) => p.label.toLowerCase().includes(q)) : list;
  };

  const filteredV0 = () => {
    const q = filter().toLowerCase();
    const list = (v0Projects() ?? []).sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    );
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
            새 프로젝트
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

        <Show when={filteredV0().length > 0}>
          <div
            style={{ padding: '4px 8px', opacity: 0.4, 'font-size': '0.75em' }}
          >
            {s('project.legacy_label')}
          </div>
          <For each={filteredV0()}>
            {(p) => (
              <div
                class="project-list-item project-list-item--inactive"
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/v0-project/${p.projectId}`)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ')
                    navigate(`/v0-project/${p.projectId}`);
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
        </Show>
      </div>
    </div>
  );
};

export default ProjectList;
