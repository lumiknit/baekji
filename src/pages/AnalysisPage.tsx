import type { Component } from 'solid-js';
import { createSignal, For, Show, onMount } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { TbOutlineArrowLeft } from 'solid-icons/tb';
import { activeProjectId, activeProjectLabel } from '../state/workspace_v1';
import { liveSheets } from '../state/sheet_list';
import { openSheetDoc, closeSheetDoc, waitForSync } from '../lib/doc/ydoc';
import { s } from '../lib/i18n';

function computeStats(text: string) {
  const bytes = new TextEncoder().encode(text).length;
  const chars = text.length;
  const charsNoSpace = text.replace(/\s/g, '').length;
  const charsNoSpecial = text.replace(/[^\p{L}\p{N}]/gu, '').length;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  return { bytes, chars, charsNoSpace, charsNoSpecial, words };
}

type SheetStats = {
  id: string;
  label: string;
  bytes: number;
  chars: number;
  charsNoSpace: number;
  charsNoSpecial: number;
  words: number;
};

const AnalysisPage: Component = () => {
  const navigate = useNavigate();
  const [analyzing, setAnalyzing] = createSignal(false);
  const [stats, setStats] = createSignal<SheetStats[] | null>(null);

  const total = () => {
    const rows = stats();
    if (!rows) return null;
    return rows.reduce(
      (acc, cur) => ({
        bytes: acc.bytes + cur.bytes,
        chars: acc.chars + cur.chars,
        charsNoSpace: acc.charsNoSpace + cur.charsNoSpace,
        charsNoSpecial: acc.charsNoSpecial + cur.charsNoSpecial,
        words: acc.words + cur.words,
      }),
      { bytes: 0, chars: 0, charsNoSpace: 0, charsNoSpecial: 0, words: 0 },
    );
  };

  const run = async () => {
    setAnalyzing(true);
    setStats(null);
    const sheets = liveSheets();
    const results: SheetStats[] = [];
    for (const sheet of sheets) {
      const sd = openSheetDoc(sheet.id);
      await waitForSync(sd.provider);
      const text = sd.content.toString();
      closeSheetDoc(sd);
      results.push({
        id: sheet.id,
        label: sheet.tags[0] ?? sheet.id.slice(0, 8),
        ...computeStats(text),
      });
    }
    setStats(results);
    setAnalyzing(false);
  };

  onMount(run);

  return (
    <div class="page-body">
      <div class="page-header">
        <button
          class="sb-icon-btn"
          onClick={() => navigate(`/project/${activeProjectId()}`)}
        >
          <div class="btn-pad">
            <TbOutlineArrowLeft />
          </div>
        </button>
        <h1 style={{ flex: 1, margin: 0, 'font-size': '1.2rem' }}>
          {activeProjectLabel()} — {s('common.analysis')}
        </h1>
      </div>

      <Show when={analyzing()}>
        <p class="hint">{s('project.analyzing')}</p>
      </Show>

      <Show when={stats()}>
        {(rows) => (
          <div style={{ overflow: 'auto' }}>
            <table class="stats-table">
              <thead>
                <tr>
                  <th>{s('project.stat_sheet')}</th>
                  <th>{s('project.stat_bytes')}</th>
                  <th>{s('project.stat_chars')}</th>
                  <th>{s('project.stat_no_space')}</th>
                  <th>{s('project.stat_no_special')}</th>
                  <th>{s('project.stat_words')}</th>
                </tr>
              </thead>
              <tbody>
                <For each={rows()}>
                  {(r) => (
                    <tr>
                      <td class="stats-table-label">{r.label}</td>
                      <td>{r.bytes.toLocaleString()}</td>
                      <td>{r.chars.toLocaleString()}</td>
                      <td>{r.charsNoSpace.toLocaleString()}</td>
                      <td>{r.charsNoSpecial.toLocaleString()}</td>
                      <td>{r.words.toLocaleString()}</td>
                    </tr>
                  )}
                </For>
                <Show when={rows().length > 1}>
                  <tr class="stats-table-total">
                    <td>{s('project.stat_total')}</td>
                    <td>{total()!.bytes.toLocaleString()}</td>
                    <td>{total()!.chars.toLocaleString()}</td>
                    <td>{total()!.charsNoSpace.toLocaleString()}</td>
                    <td>{total()!.charsNoSpecial.toLocaleString()}</td>
                    <td>{total()!.words.toLocaleString()}</td>
                  </tr>
                </Show>
              </tbody>
            </table>
          </div>
        )}
      </Show>
    </div>
  );
};

export default AnalysisPage;
