import type { Component } from 'solid-js';
import { createSignal, onMount } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { importBakV1 } from '../lib/doc/backup_v1';
import { openProject } from '../state/workspace_v1';
import { invalidateProjectList } from '../state/workspace';
import { backupLoadTarget, clearLoadTarget } from '../state/backupLoad';
import { s } from '../lib/i18n';

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
    <div
      class="page-body"
      style={{
        display: 'flex',
        'flex-direction': 'column',
        'align-items': 'center',
        'justify-content': 'center',
        gap: '1rem',
        'min-height': '60vh',
      }}
    >
      {error() ? (
        <>
          <p style={{ color: 'var(--color-danger)' }}>{error()}</p>
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
          <p style={{ color: 'var(--color-warning)' }}>
            {s('backup.partial_import_warning')}
          </p>
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
