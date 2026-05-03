import { useNavigate } from '@solidjs/router';
import {
  TbFillTrash,
  TbOutlineChartBar,
  TbOutlineDeviceFloppy,
  TbOutlineFileExport,
  TbOutlineFileImport,
  TbOutlineFilePlus,
  TbOutlineFolder,
  TbOutlineFolderPlus,
  TbOutlineFolderRoot,
  TbOutlinePencil,
} from 'solid-icons/tb';
import type { Component } from 'solid-js';
import { createMemo, For, Match, Show, Switch } from 'solid-js';
import BreadCrumb from '../components/BreadCrumb';
import { nodeColorToCss } from '../lib/color';
import { parseBak, prepareBakImport } from '../lib/doc/backup';
import { commitBakImport, importTextAsSheet } from '../lib/doc/db_helper';
import { s } from '../lib/i18n';
import {
  showBackup,
  showConfirm,
  showPrompt,
} from '../state/modal';
import type { TreeNodeMeta } from '../state/project_tree';
import {
  createTreeNode,
  deleteCurrentProjectTree,
  fetchProjectTree,
  projectTree,
  renameProjectMeta,
  renameTreeNode,
} from '../state/project_tree';
import { setActivePjVerId, deviceId } from '../state/workspace';

// ─── Utilities ───────────────────────────────────────────────

function countSubtree(
  nodes: Record<string, TreeNodeMeta>,
  id: string,
): { sheets: number; groups: number } {
  const node = nodes[id];
  if (!node) return { sheets: 0, groups: 0 };
  if (node.type === 'sheet') return { sheets: 1, groups: 0 };
  let sheets = 0,
    groups = 0;
  for (const childId of node.children) {
    const sub = countSubtree(nodes, childId);
    sheets += sub.sheets;
    groups += sub.groups;
  }
  return { sheets, groups: groups + 1 };
}

function previewLines(preview?: string): string {
  if (!preview) return '';
  return preview
    .split('\n')
    .filter((l) => l.trim())
    .slice(0, 3)
    .join('\n');
}

// ─── Component ───────────────────────────────────────────────

interface NodeGroupViewProps {
  nodeId: string;
}

const NodeGroupView: Component<NodeGroupViewProps> = (props) => {
  const navigate = useNavigate();

  const meta = () => projectTree.meta;
  const isRoot = () => props.nodeId === meta()?.pjVerId;

  const node = () => projectTree.nodes[props.nodeId];
  const label = () =>
    isRoot() ? (meta()?.label ?? '') : (node()?.label ?? '');

  const children = () => node()?.children ?? [];
  const subtreeCount = createMemo(() =>
    countSubtree(projectTree.nodes, props.nodeId),
  );

  const handleRename = async () => {
    const newName = await showPrompt(
      s('modal.rename_title'),
      s('modal.rename_prompt'),
      label(),
    );
    if (!newName || newName === label()) return;
    if (isRoot()) await renameProjectMeta(newName);
    else await renameTreeNode(props.nodeId, newName);
  };

  const handleDelete = async () => {
    if (
      await showConfirm(
        s('modal.delete_project_title'),
        s('modal.delete_project_confirm'),
      )
    ) {
      await deleteCurrentProjectTree();
      setActivePjVerId(null);
      navigate('/');
    }
  };

  const addChild = async (type: 'group' | 'sheet') => {
    if (type === 'sheet') {
      const newId = await createTreeNode('sheet', props.nodeId, '');
      if (newId) navigate(`/nodes/${newId}`);
      return;
    }
    const name = await showPrompt(
      s('common.ok'),
      s('modal.rename_prompt'),
      s('common.new_group'),
    );
    if (!name) return;
    await createTreeNode('group', props.nodeId, name);
  };

  const importFile = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.md,.txt,.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const text = await file.text();
      if (file.name.endsWith('.json')) {
        try {
          const bak = parseBak(JSON.parse(text));
          const result = await prepareBakImport(bak);
          await commitBakImport(result);
        } catch (err) {
          await showConfirm('Import failed', String(err));
          return;
        }
      } else {
        const pjVerId = meta()?.pjVerId ?? '';
        await importTextAsSheet(text, file.name, pjVerId, props.nodeId);
      }
      await fetchProjectTree(meta()?.pjVerId ?? '');
    };
    input.click();
  };

  return (
    <div class="p-16 mt-32 max-w-720 m-auto">
      <Show when={!projectTree.loading}>
        <div class="page-header">
          <h1 class="flex items-center gap-8">
            <Switch>
              <Match when={isRoot()}>
                <span class="icon">
                  <TbOutlineFolderRoot />
                </span>
              </Match>
              <Match when={!isRoot()}>
                <span class="icon">
                  <TbOutlineFolder />
                </span>
              </Match>
            </Switch>
            <span>{label() || s('common.untitled')}</span>
          </h1>
        </div>

        <BreadCrumb nodeId={props.nodeId} />

        <div class="page-toolbar">
          <button class="btn-border" onClick={handleRename}>
            <span class="icon">
              <TbOutlinePencil />
            </span>{' '}
            {s('common.rename')}
          </button>
          <button class="btn-border" onClick={() => navigate(`/nodes/${props.nodeId}/export`)}>
            <span class="icon">
              <TbOutlineDeviceFloppy />
            </span>{' '}
            {s('common.export')}
          </button>
          <button
            class="btn-border"
            onClick={() => navigate(`/nodes/${props.nodeId}/analysis`)}
          >
            <span class="icon">
              <TbOutlineChartBar />
            </span>{' '}
            {s('common.analysis')}
          </button>
          <Show when={isRoot()}>
            <button
              class="btn-border"
              onClick={() =>
                showBackup({
                  id: meta()?.projectId ?? '',
                  pjVerNodeId: meta()?.pjVerId ?? '',
                  label: meta()?.label ?? '',
                })
              }
            >
              <span class="icon">
                <TbOutlineFileExport />
              </span>{' '}
              {s('common.backup_download')}
            </button>
            <button class="btn-border btn-danger" onClick={handleDelete}>
              <span class="icon">
                <TbFillTrash />
              </span>{' '}
              {s('common.delete')}
            </button>
          </Show>
        </div>

        <div class="page-stats">
          <span>
            {subtreeCount().sheets} {s('stats.sheets')}
          </span>
          <Show when={subtreeCount().groups - 1 > 0}>
            <span>
              {subtreeCount().groups - 1} {s('stats.groups')}
            </span>
          </Show>
        </div>

        <div class="card-grid">
          <For each={children()}>
            {(childId) => {
              const child = (): TreeNodeMeta | undefined =>
                projectTree.nodes[childId];
              return (
                <Show when={child()}>
                  {(c) => (
                    <div
                      class="card btn-border btn-border--color-left"
                      style={{
                        'border-left-color':
                          nodeColorToCss(c().color) ?? undefined,
                      }}
                      onClick={() => navigate(`/nodes/${c().id}`)}
                    >
                      <div class="card-title">
                        <Show when={c().type === 'group'}>
                          <span class="icon">
                            <TbOutlineFolder />
                          </span>
                        </Show>
                        <span
                          class="card-label"
                          style={{ color: nodeColorToCss(c().color) }}
                        >
                          {c().label || s('common.untitled')}
                        </span>
                      </div>
                      <Show when={c().type === 'sheet'}>
                        <div
                          class="card-preview"
                          classList={{ italic: !c().preview }}
                        >
                          {previewLines(c().preview) || s('common.untitled')}
                        </div>
                      </Show>
                    </div>
                  )}
                </Show>
              );
            }}
          </For>

          <button class="card card-add" onClick={() => addChild('sheet')}>
            <span class="icon">
              <TbOutlineFilePlus />
            </span>
            <span>{s('common.add_sheet')}</span>
          </button>

          <button class="card card-add" onClick={() => addChild('group')}>
            <span class="icon">
              <TbOutlineFolderPlus />
            </span>
            <span>{s('common.add_group')}</span>
          </button>

          <button class="card card-add" onClick={importFile}>
            <span class="icon">
              <TbOutlineFileImport />
            </span>
            <span>{s('common.import_file')}</span>
          </button>
        </div>

        <Show when={isRoot()}>
          <div class="version-meta mt-32">
            <div class="version-meta-title">{s('project.version_info')}</div>
            <div class="version-meta-row">
              <span class="version-meta-key">{s('project.updated_at')}</span>
              <span>
                {meta()?.updatedAt
                  ? new Date(meta()!.updatedAt).toLocaleString()
                  : '—'}
              </span>
            </div>
            <div class="version-meta-row">
              <span class="version-meta-key">Project ID</span>
              <span
                style={{ 'font-family': 'monospace', 'font-size': '0.85em' }}
              >
                {meta()?.projectId ?? '—'}
              </span>
            </div>
            <div class="version-meta-row">
              <span class="version-meta-key">Node ID</span>
              <span
                style={{ 'font-family': 'monospace', 'font-size': '0.85em' }}
              >
                {props.nodeId}
              </span>
            </div>
            <Show when={meta()?.exportedAt}>
              <div class="version-meta-row">
                <span class="version-meta-key">{s('project.exported_at')}</span>
                <span>{new Date(meta()!.exportedAt!).toLocaleString()}</span>
              </div>
            </Show>
            <Show when={meta()?.exportedBy}>
              <div class="version-meta-row">
                <span class="version-meta-key">{s('project.exported_by')}</span>
                <span>
                  {meta()!.exportedBy!.slice(0, 8)}…
                  <Show when={meta()!.exportedBy === deviceId()}>
                    {' '}
                    ({s('project.this_device')})
                  </Show>
                </span>
              </div>
            </Show>
          </div>
        </Show>
      </Show>
    </div>
  );
};

export default NodeGroupView;
