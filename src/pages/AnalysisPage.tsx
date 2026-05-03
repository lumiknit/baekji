import type { Component } from 'solid-js';
import {
  createSignal,
  createEffect,
  For,
  Show,
  Switch,
  Match,
  untrack,
} from 'solid-js';
import { useParams, A } from '@solidjs/router';
import { loadMarkdownSheetState } from '../lib/doc/db_helper';
import { projectTree } from '../state/project_tree';
import type { TreeNodeMeta } from '../state/project_tree';
import { s } from '../lib/i18n';
import { logError } from '../state/log';
import toast from 'solid-toast';
import { TbFillFolderOpen, TbOutlineFile } from 'solid-icons/tb';
import { getNode } from '../lib/doc/db';
import { setActivePjVerId } from '../state/workspace';

interface RowStats {
  id: string;
  label: string;
  type: 'group' | 'sheet';
  depth: number;
  chars: number;
  charsNoSpace: number;
  words: number;
}

function calcText(
  text: string,
  includeSpace: boolean,
): { chars: number; charsNoSpace: number; words: number } {
  const noSpace = text.replace(/\s/g, '');
  // Filter out markdown symbols and punctuation for word count
  // We match sequences of letters and numbers
  const wordsMatch = text.match(/[\p{L}\p{N}]+/gu);
  return {
    chars: includeSpace ? text.length : noSpace.length,
    charsNoSpace: noSpace.length,
    words: wordsMatch?.length ?? 0,
  };
}

function collectNodes(
  nodes: Record<string, TreeNodeMeta>,
  id: string,
  depth: number,
  visited: Set<string> = new Set(),
): { id: string; type: 'group' | 'sheet'; depth: number }[] {
  const node = nodes[id];
  if (!node || visited.has(id)) return [];
  visited.add(id);

  if (node.type === 'sheet') return [{ id, type: 'sheet', depth }];
  const result: { id: string; type: 'group' | 'sheet'; depth: number }[] = [
    { id, type: 'group', depth },
  ];
  for (const childId of node.children) {
    result.push(...collectNodes(nodes, childId, depth + 1, visited));
  }
  return result;
}

const AnalysisPage: Component = () => {
  const params = useParams();
  const nodeId = () => params.id ?? '';

  const [includeSpace, setIncludeSpace] = createSignal(true);
  const [rows, setRows] = createSignal<RowStats[]>([]);
  const [loading, setLoading] = createSignal(false);
  let currentRunId = 0;

  const rootNode = () => projectTree.nodes[nodeId()];
  const rootLabel = () => rootNode()?.label || s('common.untitled');

  const runAnalysis = async () => {
    const nodes = projectTree.nodes;
    const targetId = nodeId();
    if (!nodes[targetId]) return;

    const runId = ++currentRunId;
    setLoading(true);
    setRows([]);

    try {
      const flat = collectNodes(nodes, targetId, 0);
      const statsMap: Record<
        string,
        { chars: number; charsNoSpace: number; words: number }
      > = {};

      const sheetItems = flat.filter((item) => item.type === 'sheet');

      // Fetch in small chunks to avoid overwhelming IndexedDB on mobile
      const chunkSize = 5;
      for (let i = 0; i < sheetItems.length; i += chunkSize) {
        const chunk = sheetItems.slice(i, i + chunkSize);
        await Promise.all(
          chunk.map(async (item) => {
            const state = await loadMarkdownSheetState(item.id);
            statsMap[item.id] = calcText(state.markdown, includeSpace());
          }),
        );
      }

      // Bottom-up aggregation for groups
      for (let i = flat.length - 1; i >= 0; i--) {
        const item = flat[i];
        if (item.type === 'group') {
          const node = nodes[item.id];
          let chars = 0,
            charsNoSpace = 0,
            words = 0;
          for (const childId of node?.children ?? []) {
            const cs = statsMap[childId];
            if (cs) {
              chars += cs.chars;
              charsNoSpace += cs.charsNoSpace;
              words += cs.words;
            }
          }
          statsMap[item.id] = { chars, charsNoSpace, words };
        }
      }

      if (runId !== currentRunId) return;

      setRows(
        flat.map((item) => ({
          id: item.id,
          label: nodes[item.id]?.label || s('common.untitled'),
          type: item.type,
          depth: item.depth,
          ...(statsMap[item.id] ?? {
            chars: 0,
            charsNoSpace: 0,
            words: 0,
          }),
        })),
      );
    } catch (err) {
      if (runId !== currentRunId) return;
      logError('AnalysisPage:runAnalysis', err);
      toast.error(String(err));
    } finally {
      if (runId === currentRunId) {
        setLoading(false);
      }
    }
  };

  createEffect(async () => {
    const node = await getNode(nodeId());
    if (node.type === 'versionRoot') setActivePjVerId(node.id);
    else setActivePjVerId(node.pjVerId);
  });

  createEffect(() => {
    // Track dependencies
    const id = nodeId();
    const isReady = !projectTree.loading && !!projectTree.nodes[id];
    includeSpace();

    if (isReady) {
      // Use untrack to prevent runAnalysis internal signal reads/writes
      // from causing an infinite loop in this effect.
      untrack(() => runAnalysis());
    }
  });

  const backHref = () => `/nodes/${nodeId()}`;

  const total = () => rows().find((r) => r.id === nodeId());

  const manuscriptPapers = (chars: number) =>
    (chars / 200).toLocaleString(undefined, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });

  const readingTime = (chars: number, words: number) => {
    const minByChars = Math.ceil(chars / 700);
    const minByWords = Math.ceil(words / 225);
    return { minByChars, minByWords };
  };

  return (
    <div class="p-16 mt-32 max-w-720 m-auto w-full">
      <A href={backHref()}>←</A>
      <div class="analysis-header">
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
          <div class="analysis-summary-grid">
            <div class="summary-item btn-border">
              <span class="label">{s('stats.characters')}</span>
              <span class="value">{t().chars.toLocaleString()}</span>
            </div>
            <div class="summary-item btn-border">
              <span class="label">{s('stats.words')}</span>
              <span class="value">{t().words.toLocaleString()}</span>
            </div>
            <div class="summary-item btn-border">
              <span class="label">{s('stats.manuscript_papers')}</span>
              <span class="value">{manuscriptPapers(t().charsNoSpace)}</span>
            </div>
            <div class="summary-item btn-border">
              <span class="label">{s('stats.reading_time')}</span>
              <span class="value-group">
                <span>
                  {readingTime(t().chars, t().words).minByChars}m (char)
                </span>
                <span>
                  {readingTime(t().chars, t().words).minByWords}m (word)
                </span>
              </span>
            </div>
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
                      <span class="label-text">{row.label}</span>
                    </td>
                    <td>{row.chars.toLocaleString()}</td>
                    <td>{row.words.toLocaleString()}</td>
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
