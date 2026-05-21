import type { Component } from 'solid-js';
import { createSignal, onMount } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { importBakV1 } from '../lib/doc/backup_v1.ts';
import { openProject } from '../state/workspace_v3.ts';
import { loadSheetsForProject } from '../state/sheet_list.ts';
import { invalidateProjectList } from '../state/workspace.ts';
import { backupLoadTarget, clearLoadTarget } from '../state/backupLoad.ts';
import { s } from '../lib/i18n/index.ts';

const LoadingBackupPage: Component = () => {
  const navigate = useNavigate();
  const [error, setError] = createSignal<string | null>(null);

  const [partialWarning, setPartialWarning] = createSignal(false);

  onMount(async () => {
    const target = backupLoadTarget();
    if (!target) {
      navigate('/');
      return;
    }
    try {
      const result = await importBakV1(target.bak, target.strategy);
      invalidateProjectList();
      await openProject(result.projectId, true);
      await loadSheetsForProject(result.projectId);
      clearLoadTarget();
      if (result.emptiedSheetIds.length > 0) {
        setPartialWarning(true);
      } else {
        navigate('/');
      }
    } catch (err) {
      setError((err as Error).message ?? s('backup.loading_error'));
    }
  });

  return (
    <div class="page-body loading-backup-body flex flex-column items-center justify-center gap-4">
      {error() ? (
        <>
          <p class="text-danger">{error()}</p>
          <button
            class="btn-border"
            onClick={() => {
              clearLoadTarget();
              navigate('/');
            }}
          >
            {s('common.go_back')}
          </button>
        </>
      ) : partialWarning() ? (
        <>
          <p class="text-warning">{s('backup.partial_import_warning')}</p>
          <button class="btn-border" onClick={() => navigate('/')}>
            {s('common.go_back')}
          </button>
        </>
      ) : (
        <p>{s('backup.loading')}</p>
      )}
    </div>
  );
};

export default LoadingBackupPage;
