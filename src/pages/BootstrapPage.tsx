import type { Component } from 'solid-js';
import { onMount } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { lastProjectId, lastSheetId, openProject } from '../state/workspace_v1';
import { setSidebarView } from '../state/workspace';
import { logError } from '../state/log';

const BootstrapPage: Component = () => {
  const navigate = useNavigate();

  onMount(async () => {
    const projectId = lastProjectId();
    if (projectId) {
      try {
        await openProject(projectId);
      } catch (err) {
        logError('BootstrapPage:openProject', err);
        navigate('/', { replace: true });
        return;
      }
    }

    const sheetId = lastSheetId();
    if (sheetId) {
      navigate(`/sheets/${sheetId}`, { replace: true });
      return;
    }

    setSidebarView('tree');
  });

  return <div class="p-16">Loading…</div>;
};

export default BootstrapPage;
