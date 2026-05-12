import type { Component } from 'solid-js';
import { createMemo, createSignal, For, createEffect, Show } from 'solid-js';
import { useParams, useNavigate, useSearchParams } from '@solidjs/router';
import {
  TbFillTrash,
  TbOutlineReportAnalytics,
  TbOutlineFileExport,
  TbOutlineDatabaseExport,
} from 'solid-icons/tb';
import {
  activeProjectDoc,
  activeProjectLabel,
  closeProject,
  openProject,
} from '../state/workspace_v1';
import { liveSheets } from '../state/sheet_list';
import { putProject, deleteProject } from '../lib/doc/db_v1';
import { tagToHsl } from '../lib/tag/color';
import { matchQuery } from '../lib/tag/query';
import { showConfirm, openBackupModal } from '../state/modal';
import { setSidebarView } from '../state/workspace';
import { s } from '../lib/i18n';

const ProjectPage: Component = () => {
  const navigate = useNavigate();
  const params = useParams();
  const [searchParams] = useSearchParams();

  createEffect(() => {
    if (params.pjId) openProject(params.pjId);
  });

  const pd = () => activeProjectDoc();
  const projectLabel = activeProjectLabel;

  const query = () => (searchParams.q as string | undefined) ?? '';

  const displaySheets = createMemo(() => {
    const q = query().trim();
    if (!q) return liveSheets();
    return liveSheets().filter((sh) => matchQuery(q, new Set(sh.tags)));
  });

  // ── Inline rename ──────────────────────────────────────────────────
  const [editingLabel, setEditingLabel] = createSignal(false);
  const [labelDraft, setLabelDraft] = createSignal('');

  const startRename = () => {
    setLabelDraft(projectLabel());
    setEditingLabel(true);
  };

  const commitRename = () => {
    const label = labelDraft().trim();
    setEditingLabel(false);
    if (!label || label === projectLabel()) return;
    const p = pd();
    if (!p) return;
    const now = new Date().toISOString();
    p.meta.set('label', label);
    p.meta.set('updatedAt', now);
    const id = params.pjId;
    if (id) putProject({ id, label, updatedAt: now, tagColors: tagColors() });
  };

  // ── Tag stats ──────────────────────────────────────────────────────
  const allTags = createMemo(() => {
    const counts = new Map<string, number>();
    for (const sheet of liveSheets()) {
      for (const tag of sheet.tags) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  });

  const tagColors = () => {
    const p = pd();
    if (!p) return {} as Record<string, { h: number; s: number }>;
    return (
      (p.meta.get('tagColors') as
        | Record<string, { h: number; s: number }>
        | undefined) ?? {}
    );
  };

  const setTagColorOverride = (tag: string, h: number, sv: number) => {
    const p = pd();
    if (!p) return;
    const colors = { ...tagColors(), [tag]: { h, s: sv } };
    p.meta.set('tagColors', colors);
    const id = params.pjId;
    if (id)
      putProject({
        id,
        label: projectLabel(),
        updatedAt: new Date().toISOString(),
        tagColors: colors,
      });
  };

  const clearTagColorOverride = (tag: string) => {
    const p = pd();
    if (!p) return;
    const colors = { ...tagColors() };
    delete colors[tag];
    p.meta.set('tagColors', colors);
    const id = params.pjId;
    if (id)
      putProject({
        id,
        label: projectLabel(),
        updatedAt: new Date().toISOString(),
        tagColors: colors,
      });
  };

  // ── Delete project ─────────────────────────────────────────────────
  const handleDeleteProject = async () => {
    const confirmed = await showConfirm(
      s('project.danger_title'),
      s('project.danger_desc'),
    );
    if (!confirmed) return;
    const id = params.pjId;
    if (id) await deleteProject(id);
    await closeProject();
    setSidebarView('projects');
    navigate('/');
  };

  return (
    <Show
      when={pd()}
      fallback={<div class="empty-state">{s('project.no_project_open')}</div>}
    >
      <div class="page-body">
        {/* ── Project name (inline edit) ── */}
        <div class="page-header">
          <Show
            when={editingLabel()}
            fallback={
              <h1
                class="pj-name-label"
                onClick={startRename}
                title={s('project.rename_title')}
              >
                {projectLabel()}
              </h1>
            }
          >
            <input
              class="pj-name-input"
              value={labelDraft()}
              onInput={(e) => setLabelDraft(e.currentTarget.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') setEditingLabel(false);
              }}
              ref={(el) => setTimeout(() => el?.focus(), 0)}
            />
          </Show>
        </div>

        {/* ── Page stats ── */}
        <div class="page-stats">
          <span>
            {s('project.sheet_count', { count: liveSheets().length })}
          </span>
          <span>{s('project.tag_count', { count: allTags().length })}</span>
          <Show when={query()}>
            <span>
              {s('project.filter_result', {
                query: query(),
                filtered: displaySheets().length,
                total: liveSheets().length,
              })}
            </span>
          </Show>
        </div>

        {/* ── Toolbar: Analysis / Export / Backup ── */}
        <div class="page-toolbar">
          <button
            class="btn-border"
            onClick={() =>
              navigate(
                `/project/${params.pjId}/analysis${query() ? `?q=${encodeURIComponent(query())}` : ''}`,
              )
            }
          >
            <span class="icon">
              <TbOutlineReportAnalytics />
            </span>
            {s('common.analysis')}
          </button>
          <button
            class="btn-border"
            onClick={() =>
              navigate(
                `/project/${params.pjId}/export${query() ? `?q=${encodeURIComponent(query())}` : ''}`,
              )
            }
          >
            <span class="icon">
              <TbOutlineFileExport />
            </span>
            {s('common.export')}
          </button>
          <button class="btn-border" onClick={openBackupModal}>
            <span class="icon">
              <TbOutlineDatabaseExport />
            </span>
            {s('backup.title')}
          </button>

          <button class="btn-danger" onClick={handleDeleteProject}>
            <span class="icon">
              <TbFillTrash />
            </span>
            {s('project.delete')}
          </button>
        </div>

        {/* ── Tag colors ── */}
        <Show when={allTags().length > 0}>
          <h2 class="pj-section-title">
            {s('project.tag_colors_title')}{' '}
            <span class="pj-section-count">({allTags().length})</span>
          </h2>
          <div class="pj-tag-list">
            <For each={allTags()}>
              {([tag, count]) => {
                const override = () => tagColors()[tag];
                const { h: ah, s: as_ } = tagToHsl(tag);
                const eff = () => override() ?? { h: ah, s: as_ };

                return (
                  <div class="pj-tag-row">
                    <span
                      class="tag"
                      style={{
                        background: `hsl(${eff().h}deg ${eff().s}% var(--color-l) / 0.25)`,
                        color: `hsl(${eff().h}deg ${eff().s}% var(--color-l))`,
                      }}
                    >
                      {tag}
                    </span>
                    <span class="pj-tag-count">
                      {s('project.tag_item_count', { count })}
                    </span>
                    <div class="pj-tag-actions">
                      <input
                        type="color"
                        class="tree-color-input"
                        title={s('project.tag_color_set')}
                        onInput={(e) => {
                          const hex = e.currentTarget.value;
                          const r = parseInt(hex.slice(1, 3), 16) / 255;
                          const g = parseInt(hex.slice(3, 5), 16) / 255;
                          const b = parseInt(hex.slice(5, 7), 16) / 255;
                          const max = Math.max(r, g, b),
                            min = Math.min(r, g, b);
                          const d = max - min;
                          let h = 0;
                          if (d !== 0) {
                            if (max === r) h = ((g - b) / d + 6) % 6;
                            else if (max === g) h = (b - r) / d + 2;
                            else h = (r - g) / d + 4;
                            h = Math.round(h * 60);
                          }
                          const sv =
                            max === 0 ? 0 : Math.round((d / max) * 100);
                          setTagColorOverride(tag, h, sv);
                        }}
                      />
                      <Show when={override()}>
                        <button
                          class="tree-color-clear"
                          title={s('project.tag_color_reset')}
                          onClick={() => clearTagColorOverride(tag)}
                        >
                          ✕
                        </button>
                      </Show>
                    </div>
                  </div>
                );
              }}
            </For>
          </div>
        </Show>
      </div>
    </Show>
  );
};

export default ProjectPage;
