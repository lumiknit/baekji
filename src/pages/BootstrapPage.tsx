import type { Component } from 'solid-js';
import { onMount } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import localforage from 'localforage';
import { getAllVersionRoots, getNode } from '../lib/doc/db';
import { s } from '../lib/i18n';
import { setActivePjVerId } from '../state/workspace';
import { createProject } from '../lib/doc/db_helper';

const WELCOMED_KEY = 'baekji-welcomed';

const BootstrapPage: Component = () => {
  const navigate = useNavigate();

  onMount(async () => {
    // Resume last opened node directly if it still exists.
    // makePersisted JSON.stringifies values, so the stored value is e.g. '"node-id"' — parse it.
    const lastNodeRaw = await localforage.getItem<string>('baekji-last-node');
    const lastNode = lastNodeRaw ? (JSON.parse(lastNodeRaw) as string) : null;
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
      return;
    }

    // First launch — no projects exist
    const welcomed = await localforage.getItem<boolean>(WELCOMED_KEY);
    let pjVerId: string;

    if (!welcomed) {
      await localforage.setItem(WELCOMED_KEY, true);
      const { createWelcomeProject } = await import('../welcome/loader');
      const { pjVerId: vid, firstSheetId } = await createWelcomeProject();
      setActivePjVerId(vid);
      navigate(`/nodes/${firstSheetId}`, { replace: true });
      return;
    } else {
      const result = await createProject(s('home.default_project_name'));
      pjVerId = result.pjVerId;
    }

    setActivePjVerId(pjVerId);
    navigate(`/nodes/${pjVerId}`, { replace: true });
  });

  return <div class="p-16">Loading...</div>;
};

export default BootstrapPage;
