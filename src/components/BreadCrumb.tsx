import { A } from '@solidjs/router';
import type { Component } from 'solid-js';
import { createMemo, For } from 'solid-js';
import { s } from '../lib/i18n';
import { findParentId, projectTree } from '../state/project_tree';

interface BreadCrumbProps {
  nodeId: string;
}

const BreadCrumb: Component<BreadCrumbProps> = (props) => {
  const crumbs = createMemo(() => {
    const meta = projectTree.meta;
    if (!meta || meta.pjVerId === props.nodeId) return [];

    const rootId = meta.pjVerId;

    const path: string[] = [];
    let current = props.nodeId;
    while (current !== rootId) {
      const parentId = findParentId(current);
      if (!parentId) break;
      path.unshift(parentId);
      current = parentId;
    }

    return path.map((id) => ({
      id,
      label:
        id === rootId
          ? meta.label
          : projectTree.nodes[id]?.label || s('common.untitled'),
      href: `/nodes/${id}`,
    }));
  });

  return (
    <div class="page-breadcrumb">
      <For each={crumbs()}>
        {(crumb) => (
          <>
            <A href={crumb.href}>{crumb.label}</A>
            <span>❯</span>
          </>
        )}
      </For>
      <span class="text-bold">
        {projectTree.nodes[props.nodeId]?.label || s('common.untitled')}
      </span>
    </div>
  );
};

export default BreadCrumb;
