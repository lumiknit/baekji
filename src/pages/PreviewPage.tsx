import type { Component } from 'solid-js';
import { createResource, For, Show } from 'solid-js';
import { useParams, A } from '@solidjs/router';
import { getNode, getAllNodesInVersion, getSheetContent } from '../lib/doc/db';
import MarkdownIt from 'markdown-it';

const mdit = new MarkdownIt({ html: false, linkify: true, typographer: true });
import { s } from '../lib/i18n';

interface PreviewNodeData {
  id: string;
  type: 'group' | 'sheet';
  children: string[];
  content: string;
}

const PreviewNode: Component<{
  id: string;
  nodeMap: Record<string, PreviewNodeData>;
}> = (props) => {
  const node = () => props.nodeMap[props.id];

  return (
    <Show when={node()}>
      {(n) => {
        const item = n();
        if (item.type === 'sheet') {
          return (
            <div
              class="typo typo--preview"
              innerHTML={mdit.render(item.content || '')}
            />
          );
        }
        return (
          <For each={item.children}>
            {(childId: string) => (
              <PreviewNode id={childId} nodeMap={props.nodeMap} />
            )}
          </For>
        );
      }}
    </Show>
  );
};

const PreviewPage: Component = () => {
  const params = useParams();
  const nodeId = () => params.id ?? '';

  const [nodeMap] = createResource(nodeId, async (id) => {
    const node = await getNode(id);
    if (!node) return {};
    const rootId = node.type !== 'versionRoot' ? node.pjVerId : node.id;
    const root = await getNode(rootId);
    if (!root || root.type !== 'versionRoot') return {};

    const dataNodes = await getAllNodesInVersion(rootId);

    const childrenMap = new Map<string, string[]>();
    for (const n of dataNodes) {
      const siblings = childrenMap.get(n.parentId) ?? [];
      siblings.push(n.id);
      childrenMap.set(n.parentId, siblings);
    }
    for (const [pid, children] of childrenMap) {
      children.sort((a, b) => {
        const na = dataNodes.find((n) => n.id === a);
        const nb = dataNodes.find((n) => n.id === b);
        return (na?.orderKey ?? 0) - (nb?.orderKey ?? 0);
      });
      childrenMap.set(pid, children);
    }

    const map: Record<string, PreviewNodeData> = {};

    map[root.id] = {
      id: root.id,
      type: 'group',
      children: childrenMap.get(root.id) ?? [],
      content: '',
    };

    for (const n of dataNodes) {
      if (n.type === 'sheet') {
        const sc = await getSheetContent(n.id);
        map[n.id] = {
          id: n.id,
          type: 'sheet',
          children: [],
          content: sc?.content ?? '',
        };
      } else {
        map[n.id] = {
          id: n.id,
          type: 'group',
          children: childrenMap.get(n.id) ?? [],
          content: '',
        };
      }
    }

    return map;
  });

  return (
    <div class="p-16 mt-32 max-w-800 m-auto">
      <div class="flex items-center gap-16" style={{ 'margin-bottom': '32px' }}>
        <A href={`/nodes/${nodeId()}`}>←</A>
        <span style={{ opacity: '0.5', 'font-size': '14px' }}>
          {s('stats.preview')}
        </span>
      </div>
      <Show when={nodeMap()}>
        {(map) => <PreviewNode id={nodeId()} nodeMap={map()} />}
      </Show>
    </div>
  );
};

export default PreviewPage;
