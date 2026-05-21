import type { Component } from 'solid-js';
import { createMemo, createSignal, createEffect, Show } from 'solid-js';
import { useParams, useNavigate, useSearchParams } from '@solidjs/router';
import {
  TbFillTrash,
  TbOutlineReportAnalytics,
  TbOutlineFileExport,
  TbOutlineDatabaseExport,
  TbOutlineRefresh,
} from 'solid-icons/tb';
import {
  activeProjectId,
  activeProjectLabel,
  closeProject,
  openProject,
  updateProjectLabel,
} from '../state/workspace_v3.ts';
import {
  liveSheets,
  reindexOrderKeys,
  loadSheetsForProject,
} from '../state/sheet_list.ts';
import { compactSheetDoc } from '../lib/doc/storage.ts';
import { deleteProjectMeta } from '../lib/doc/db_v3.ts';
import ProjectTagEdit from '../components/ProjectTagEdit.tsx';
import { matchQuery } from '../lib/tag/query.ts';
import { showConfirm, openBackupModal } from '../state/modal.ts';
import { setSidebarView } from '../state/workspace.ts';
import { s } from '../lib/i18n/index.ts';
import toast from 'solid-toast';
import { logError } from '../state/log.ts';
import ProjectDebug from '../components/debug/ProjectDebug.tsx';

const ProjectPage: Component = () => {
  const navigate = useNavigate();
  const params = useParams();
  const [searchParams] = useSearchParams();

  createEffect(() => {
    const id = params.pjId;
    if (id) {
      openProject(id).then(() => loadSheetsForProject(id));
    }
  });

  const projectLabel = activeProjectLabel;

  const query = () => (searchParams.q as string | undefined) ?? '';

  const displaySheets = createMemo(() => {
    const q = query().trim();
    if (!q) return liveSheets();
    return liveSheets().filter((sh) => matchQuery(q, new Set(sh.tags)));
  });

  const [showDebug, setShowDebug] = createSignal(false);
  const [editingLabel, setEditingLabel] = createSignal(false);
  const [labelDraft, setLabelDraft] = createSignal('');

  const startRename = () => {
    setLabelDraft(projectLabel());
    setEditingLabel(true);
  };

  createEffect(() => {
    if (searchParams.new === '1' && activeProjectId()) {
      startRename();
    }
  });

  const commitRename = async () => {
    const label = labelDraft().trim();
    setEditingLabel(false);
    if (!label || label === projectLabel()) return;
    const id = params.pjId;
    if (id) await updateProjectLabel(id, label);
  };

  const allTags = createMemo(() => {
    const counts = new Map<string, number>();
    for (const sheet of liveSheets()) {
      for (const tag of sheet.tags) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  });

  const [cleaning, setCleaning] = createSignal(false);
  const handleCleanup = async () => {
    setCleaning(true);
    const doCleanup = async () => {
      await reindexOrderKeys();
      for (const sheet of liveSheets()) {
        await compactSheetDoc(sheet.id);
      }
    };
    try {
      await toast.promise(doCleanup(), {
        loading: s('common.compact_loading'),
        success: s('common.compact_done'),
        error: s('common.compact_error'),
      });
    } catch (err) {
      logError('ProjectPage:handleCleanup', err);
    } finally {
      setCleaning(false);
    }
  };

  const handleDeleteProject = async () => {
    const confirmed = await showConfirm(
      s('project.danger_title'),
      s('project.danger_desc'),
    );
    if (!confirmed) return;
    const id = params.pjId;
    if (id) await deleteProjectMeta(id);
    await closeProject();
    setSidebarView('projects');
    navigate('/');
  };

  return (
    <Show
      when={activeProjectId()}
      fallback={<div class="empty-state">{s('project.no_project_open')}</div>}
    >
      <div class="page-body">
        <div class="page-header flex items-center gap-4">
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
              onChange={(e) => setLabelDraft(e.currentTarget.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') setEditingLabel(false);
              }}
              ref={(el) => setTimeout(() => el?.focus(), 0)}
            />
          </Show>
        </div>

        <div class="page-stats flex gap-4">
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

        <div class="page-toolbar flex flex-wrap gap-2">
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
            {s('common.preview_export')}
          </button>
          <button class="btn-border" onClick={openBackupModal}>
            <span class="icon">
              <TbOutlineDatabaseExport />
            </span>
            {s('backup.title')}
          </button>

          <button
            class="btn-border"
            onClick={handleCleanup}
            disabled={cleaning()}
          >
            <span class="icon">
              <TbOutlineRefresh />
            </span>
            {cleaning() ? s('common.loading') : s('project.cleanup')}
          </button>

          <button class="btn-danger" onClick={handleDeleteProject}>
            <span class="icon">
              <TbFillTrash />
            </span>
            {s('project.delete')}
          </button>
        </div>

        <Show when={allTags().length > 0}>
          <ProjectTagEdit allTags={allTags()} />
        </Show>

        <div class="mt-section">
          <button
            class="btn-border btn-sm"
            onClick={() => setShowDebug((v) => !v)}
          >
            {showDebug() ? 'Hide debug' : 'Show debug'}
          </button>
          <Show when={showDebug()}>
            <ProjectDebug />
          </Show>
        </div>
      </div>
    </Show>
  );
};

export default ProjectPage;
