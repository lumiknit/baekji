import type { Component } from 'solid-js';
import { createEffect, createMemo, createResource, Show } from 'solid-js';
import { useParams, useNavigate } from '@solidjs/router';
import { getNode } from '../lib/doc/db';
import { projectTree } from '../state/project_tree';
import {
  activePjVerId,
  setActivePjVerId,
  setLastGlobalNodeId,
} from '../state/workspace';
import NodeGroupView from './NodeGroupView';
import NodeEditView from './NodeEditView';

const NodePage: Component = () => {
  const params = useParams();
  const navigate = useNavigate();
  const nodeId = () => params.id ?? '';

  // Restore project context when visiting a URL directly (e.g. after page refresh)
  createResource(nodeId, async (id) => {
    if (!id || activePjVerId()) return;
    const node = await getNode(id);
    if (!node) return;
    if (node.type === 'versionRoot') setActivePjVerId(node.id);
    else setActivePjVerId(node.pjVerId);
  });

  createEffect(() => {
    const id = nodeId();
    const vid = projectTree.meta?.pjVerId;
    if (id && vid) {
      setLastGlobalNodeId(id);
    }
  });

  const nodeType = () => {
    const id = nodeId();
    if (!id) return undefined;
    return (
      projectTree.nodes[id]?.type ??
      (projectTree.meta?.pjVerId === id ? 'group' : undefined)
    );
  };

  // Redirect to home when node is not found after tree finishes loading
  const notFound = createMemo(
    () =>
      !projectTree.loading &&
      projectTree.meta !== null &&
      nodeType() === undefined,
  );
  createEffect(() => {
    if (notFound()) navigate('/', { replace: true });
  });

  return (
    <Show when={nodeType()}>
      {(type) => (
        <Show
          when={type() === 'sheet'}
          fallback={<NodeGroupView nodeId={nodeId()} />}
        >
          <NodeEditView sheetId={nodeId()} />
        </Show>
      )}
    </Show>
  );
};

export default NodePage;
