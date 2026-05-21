import type { Component } from 'solid-js';
import { onMount } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import {
  lastProjectId,
  lastSheetId,
  openProject,
} from '../state/workspace_v3.ts';
import { loadSheetsForProject } from '../state/sheet_list.ts';
import { setSidebarView } from '../state/workspace.ts';
import { logError } from '../state/log.ts';

const BootstrapPage: Component = () => {
  const navigate = useNavigate();

  onMount(async () => {
    const projectId = lastProjectId();
    if (projectId) {
      try {
        await openProject(projectId);
        await loadSheetsForProject(projectId);
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

  return <div class="p-4">Loading…</div>;
};

export default BootstrapPage;
