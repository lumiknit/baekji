import type { Component } from 'solid-js';
import { onMount } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import localforage from 'localforage';
import { getAllVersionRoots, getNode } from '../lib/doc/db';
import { createProject } from '../lib/doc/db_helper';
import { s } from '../lib/i18n';
import { setActivePjVerId } from '../state/workspace';

const BootstrapPage: Component = () => {
  const navigate = useNavigate();

  onMount(async () => {
    // Resume last opened node directly if it still exists
    const lastNode = await localforage.getItem<string>('baekji-last-node');
    if (lastNode && (await getNode(lastNode))) {
      navigate(`/nodes/${lastNode}`, { replace: true });
      return;
    }

    const roots = await getAllVersionRoots();
    const active = roots.filter((r) => r.active);

    if (active.length > 0) {
      const latest = [...active].sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt),
      )[0];
      setActivePjVerId(latest.id);
      navigate(`/nodes/${latest.id}`, { replace: true });
    } else {
      const { pjVerId } = await createProject(s('home.default_project_name'));
      setActivePjVerId(pjVerId);
      navigate(`/nodes/${pjVerId}`, { replace: true });
    }
  });

  return <div class="p-16">Loading...</div>;
};

export default BootstrapPage;
