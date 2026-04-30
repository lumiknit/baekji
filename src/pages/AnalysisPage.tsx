import type { Component } from 'solid-js';
import { createSignal, createEffect, For, Show, Switch, Match } from 'solid-js';
import { useParams, A } from '@solidjs/router';
import {
  loadMarkdownSheetState,
  saveMarkdownSheet,
} from '../lib/doc/db_helper';
import { projectTree } from '../state/project_tree';
import type { TreeNodeMeta } from '../state/project_tree';
import { s } from '../lib/i18n';
import { TbFillFolderOpen, TbOutlineFile } from 'solid-icons/tb';

interface RowStats {
  id: string;
  label: string;
  type: 'group' | 'sheet';
  depth: number;
  bytes: number;
  chars: number;
  charsNoSpace: number;
  words: number;
}

function calcText(
  text: string,
  includeSpace: boolean,
): { bytes: number; chars: number; charsNoSpace: number; words: number } {
  const noSpace = text.replace(/\s/g, '');
  return {
    bytes: new TextEncoder().encode(text).length,
    chars: includeSpace ? text.length : noSpace.length,
    charsNoSpace: noSpace.length,
    words: text.trim() === '' ? 0 : text.trim().split(/\s+/).length,
  };
}

function collectNodes(
  nodes: Record<string, TreeNodeMeta>,
  id: string,
  depth: number,
): { id: string; type: 'group' | 'sheet'; depth: number }[] {
  const node = nodes[id];
  if (!node) return [];
  if (node.type === 'sheet') return [{ id, type: 'sheet', depth }];
  const result: { id: string; type: 'group' | 'sheet'; depth: number }[] = [
    { id, type: 'group', depth },
  ];
  for (const childId of node.children) {
    result.push(...collectNodes(nodes, childId, depth + 1));
  }
  return result;
}

const AnalysisPage: Component = () => {
  const params = useParams();
  const nodeId = () => params.id ?? '';

  const [includeSpace, setIncludeSpace] = createSignal(true);
  const [rows, setRows] = createSignal<RowStats[]>([]);
  const [loading, setLoading] = createSignal(false);

  const rootNode = () => projectTree.nodes[nodeId()];
  const rootLabel = () => rootNode()?.label || s('common.untitled');

  const runAnalysis = async () => {
    const nodes = projectTree.nodes;
    if (!nodes[nodeId()]) return;

    setLoading(true);
    setRows([]);

    const flat = collectNodes(nodes, nodeId(), 0);
    const statsMap: Record<
      string,
      { bytes: number; chars: number; charsNoSpace: number; words: number }
    > = {};

    for (const item of flat) {
      if (item.type === 'sheet') {
        const state = await loadMarkdownSheetState(item.id);
        if (state.nextDeltaSeq > 0) {
          await saveMarkdownSheet(item.id, state.markdown, state.selection);
        }
        statsMap[item.id] = calcText(state.markdown, includeSpace());
      }
    }

    for (const item of [...flat].reverse()) {
      if (item.type === 'group') {
        const node = nodes[item.id];
        let bytes = 0,
          chars = 0,
          charsNoSpace = 0,
          words = 0;
        for (const childId of node?.children ?? []) {
          const cs = statsMap[childId];
          if (cs) {
            bytes += cs.bytes;
            chars += cs.chars;
            charsNoSpace += cs.charsNoSpace;
            words += cs.words;
          }
        }
        statsMap[item.id] = { bytes, chars, charsNoSpace, words };
      }
    }

    setRows(
      flat.map((item) => ({
        id: item.id,
        label: nodes[item.id]?.label || s('common.untitled'),
        type: item.type,
        depth: item.depth,
        ...(statsMap[item.id] ?? {
          bytes: 0,
          chars: 0,
          charsNoSpace: 0,
          words: 0,
        }),
      })),
    );
    setLoading(false);
  };

  createEffect(() => {
    includeSpace();
    if (!projectTree.loading && projectTree.nodes[nodeId()]) {
      runAnalysis();
    }
  });

  const backHref = () => `/nodes/${nodeId()}`;

  const total = () => rows().find((r) => r.id === nodeId());

  return (
    <div class="p-16 mt-32 max-w-800 m-auto">
      <div class="analysis-header">
        <A href={backHref()}>←</A>
        <h1>
          {rootLabel()} — {s('common.analysis')}
        </h1>
      </div>

      <div class="analysis-options">
        <label class="flex items-center gap-8">
          <input
            type="checkbox"
            checked={includeSpace()}
            onChange={(e) => setIncludeSpace(e.currentTarget.checked)}
          />
          {s('analysis.include_spaces')}
        </label>
      </div>

      <Show when={total()}>
        {(t) => (
          <div class="analysis-summary btn-border">
            <span>
              <b>{t().bytes}</b> bytes
            </span>
            <span>
              <b>{t().chars}</b> {s('stats.characters')}
            </span>
            <span>
              <b>{t().words}</b> {s('stats.words')}
            </span>
          </div>
        )}
      </Show>

      <Show when={loading()}>
        <div class="analysis-loading">{s('analysis.loading')}</div>
      </Show>

      <Show when={!loading() && rows().length > 0}>
        <div class="analysis-table-wrap">
          <table class="analysis-table">
            <thead>
              <tr>
                <th>{s('analysis.col_name')}</th>
                <th>bytes</th>
                <th>{s('stats.characters')}</th>
                <th>{s('stats.words')}</th>
              </tr>
            </thead>
            <tbody>
              <For each={rows()}>
                {(row) => (
                  <tr class={row.type === 'group' ? 'is-group' : ''}>
                    <td
                      class="cell-name"
                      style={{ 'padding-left': `${8 + row.depth * 16}px` }}
                    >
                      <Switch>
                        <Match when={row.type === 'group'}>
                          <span class="icon">
                            <TbFillFolderOpen />
                          </span>
                        </Match>
                        <Match when={row.type === 'sheet'}>
                          <span class="icon">
                            <TbOutlineFile />
                          </span>
                        </Match>
                      </Switch>
                      {row.label}
                    </td>
                    <td>{row.bytes}</td>
                    <td>{row.chars}</td>
                    <td>{row.words}</td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </Show>
    </div>
  );
};

export default AnalysisPage;
