import type { Component } from 'solid-js';
import { For } from 'solid-js';
import { activeProjectDoc } from '../../state/workspace_v1';
import { sheetsStore, liveSortedIds, trashSortedIds } from '../../state/sheet_list';
import type { SheetMeta } from '../../lib/doc/v1';

const ProjectDebug: Component = () => {
  const pd = activeProjectDoc;

  const metaEntries = () => {
    const p = pd();
    if (!p) return [];
    return Array.from(p.meta.entries());
  };

  const sheetLine = (sh: SheetMeta) => {
    const parts = [
      `id=${sh.id}`,
      `orderKey=${sh.orderKey}`,
      `updatedAt=${sh.updatedAt}`,
    ];
    if (sh.tags.length) parts.push(`tags=[${sh.tags.join(',')}]`);
    if (sh.deletedAt) parts.push(`deletedAt=${sh.deletedAt}`);
    return parts.join('  ');
  };

  return (
    <pre
      style={{
        'font-size': '11px',
        'line-height': '1.5',
        overflow: 'auto',
        padding: '8px',
        background: 'var(--bg)',
        border: '1px solid var(--border-dark)',
      }}
    >
      {'=== ProjectDoc meta ===\n'}
      <For each={metaEntries()}>
        {([k, v]) => `${k}: ${JSON.stringify(v)}\n`}
      </For>
      {'\n=== live sheets ===\n'}
      <For each={liveSortedIds()}>{(id) => `${sheetLine(sheetsStore[id])}\n`}</For>
      <For each={trashSortedIds()}>{(id) => `[DELETED] ${sheetLine(sheetsStore[id])}\n`}</For>
    </pre>
  );
};

export default ProjectDebug;
