import { A } from '@solidjs/router';
import type { Component } from 'solid-js';
import { createMemo, For } from 'solid-js';
import { s } from '../lib/i18n';
import { findParentId, projectTree } from '../state/project_tree';

interface BreadCrumbProps {
  nodeId: string;
}

type CrumbItem = {
  id: string;
  label: string;
  href: string;
};

const BreadCrumb: Component<BreadCrumbProps> = (props) => {
  const crumbs = createMemo(() => {
    const meta = projectTree.meta;
    if (meta === null) {
      return [{ id: '', label: s('common.untitled'), href: '/' }, []] as [
        CrumbItem,
        CrumbItem[],
      ];
    }

    const rootId = meta.pjVerId;
    const visited = new Set<string>();

    let current = props.nodeId;
    const path: string[] = [];

    while (current !== rootId) {
      if (visited.has(current)) {
        console.warn('BreadCrumb: cycle detected at node', current);
        break;
      }
      visited.add(current);

      const parentId = findParentId(current);
      if (!parentId) break;
      path.push(parentId);
      current = parentId;
    }

    const labelMapper = (label?: string | null) => {
      if (!label) return s('common.untitled');
      if (label.length > 20) return `${label.slice(0, 17)}…`;
      return label;
    };

    const mapper = (id: string): CrumbItem => ({
      id,
      label: labelMapper(
        id === rootId ? meta.label : projectTree.nodes[id]?.label,
      ),
      href: `/nodes/${id}`,
    });

    return [mapper(props.nodeId), path.reverse().map(mapper)] as [
      CrumbItem,
      CrumbItem[],
    ];
  });

  return (
    <div class="page-breadcrumb">
      <For each={crumbs()[1]}>
        {(crumb) => (
          <>
            <A href={crumb.href}>{crumb.label}</A>
            <span>❯</span>
          </>
        )}
      </For>
      <span class="text-bold">{crumbs()[0].label}</span>
    </div>
  );
};

export default BreadCrumb;
