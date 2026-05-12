import type { Component } from 'solid-js';
import { onMount } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { restoreLastProject, restoreLastSheet } from '../state/workspace_v1';
import { setSidebarView } from '../state/workspace';

const BootstrapPage: Component = () => {
  const navigate = useNavigate();

  onMount(async () => {
    // V1 프로젝트 복원
    await restoreLastProject();

    // 마지막으로 열었던 시트로 이동
    const lastSheet = await restoreLastSheet();
    if (lastSheet) {
      navigate(`/sheets/${lastSheet}`, { replace: true });
      return;
    }

    // 프로젝트는 열려 있지만 시트가 없으면 사이드바 표시
    setSidebarView('tree');
  });

  return <div class="p-16">Loading…</div>;
};

export default BootstrapPage;
