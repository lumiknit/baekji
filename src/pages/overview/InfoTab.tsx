import type { Component } from 'solid-js';
import { createMemo, createSignal, Show } from 'solid-js';
import {
  TbFillTrash,
  TbOutlineDatabaseExport,
  TbOutlineRefresh,
} from 'solid-icons/tb';
import { closeProject } from '../../state/workspace_v3.ts';
import { liveSheets, reindexOrderKeys } from '../../state/sheet_list.ts';
import { compactSheetDoc } from '../../lib/doc/storage.ts';
import { deleteProjectMeta } from '../../lib/doc/db_v3.ts';
import ProjectTagEdit from '../../components/ProjectTagEdit.tsx';
import { showConfirm, openBackupModal } from '../../state/modal.ts';
import { setSidebarView } from '../../state/workspace.ts';
import { s } from '../../lib/i18n/index.ts';
import toast from 'solid-toast';
import { logError } from '../../state/log.ts';
import ProjectDebug from '../../components/debug/ProjectDebug.tsx';
import { useNavigate } from '@solidjs/router';
import BulkTagEditor from './BulkTagEditor.tsx';
import type { QueriedSheet } from './types.ts';

interface Props {
  projectId: string;
  sheets: QueriedSheet[];
}

const InfoTab: Component<Props> = (props) => {
  const navigate = useNavigate();

  const allTags = createMemo(() => {
    const counts = new Map<string, number>();
    for (const qs of props.sheets) {
      for (const tag of qs.meta.tags) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  });

  const [cleaning, setCleaning] = createSignal(false);
  const [showDebug, setShowDebug] = createSignal(false);

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
      logError('InfoTab:handleCleanup', err);
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
    await deleteProjectMeta(props.projectId);
    await closeProject();
    setSidebarView('projects');
    navigate('/');
  };

  return (
    <div>
      <div class="page-toolbar flex flex-wrap gap-2">
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

      <Show when={props.sheets.length >= 2}>
        <BulkTagEditor sheets={props.sheets} />
      </Show>

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
  );
};

export default InfoTab;
