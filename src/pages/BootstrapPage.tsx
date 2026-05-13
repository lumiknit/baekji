import type { Component } from 'solid-js';
import { onMount } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import {
  lastProjectId,
  lastSheetId,
  openProject,
} from '../state/workspace_v1';
import { setSidebarView } from '../state/workspace';

const BootstrapPage: Component = () => {
  const navigate = useNavigate();

  onMount(async () => {
    const projectId = lastProjectId();
    if (projectId) await openProject(projectId);

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
