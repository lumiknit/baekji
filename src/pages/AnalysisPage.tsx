import type { Component } from 'solid-js';
import { createSignal, For, Show, createEffect } from 'solid-js';
import { useParams, useNavigate, useSearchParams } from '@solidjs/router';
import { TbOutlineArrowLeft } from 'solid-icons/tb';
import { activeProjectLabel, openProject } from '../state/workspace_v1';
import { liveSheets } from '../state/sheet_list';
import { openSheetDoc, closeSheetDoc, waitForSync } from '../lib/doc/ydoc';
import { matchQuery } from '../lib/tag/query';
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
  const params = useParams();
  const [searchParams] = useSearchParams();
  const query = () => (searchParams.q as string | undefined) ?? '';
  const sheetIds = () => {
    const val = searchParams.sheetId;
    if (!val) return [];
    return Array.isArray(val) ? val : [val];
  };

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
    await openProject(params.pjId);

    const ids = sheetIds();
    let sheets = liveSheets();
    if (ids.length > 0) {
      sheets = sheets.filter((sh) => ids.includes(sh.id));
    } else {
      const q = query().trim();
      if (q) {
        sheets = sheets.filter((sh) => matchQuery(q, new Set(sh.tags)));
      }
    }

    const results: SheetStats[] = [];
    for (const sheet of sheets) {
      const sd = openSheetDoc(sheet.id);
      await waitForSync(sd.provider);
      const text = sd.content.toString();
      closeSheetDoc(sd);

      const preview = text.trim().slice(0, 16).replace(/\n/g, ' ');

      results.push({
        id: sheet.id,
        label: preview || s('sheet.empty'),
        ...computeStats(text),
      });
    }
    setStats(results);
    setAnalyzing(false);
  };

  createEffect(() => {
    if (params.pjId) run();
  });

  const handleBack = () => {
    const ids = sheetIds();
    if (ids.length === 1) {
      navigate(`/sheets/${ids[0]}`);
    } else {
      const q = query();
      navigate(
        `/project/${params.pjId}${q ? `?q=${encodeURIComponent(q)}` : ''}`,
      );
    }
  };

  return (
    <div class="page-body">
      <div class="page-header">
        <button class="sb-icon-btn" onClick={handleBack}>
          <div class="btn-pad">
            <TbOutlineArrowLeft />
          </div>
        </button>
        <h1 class="page-header-title">
          {activeProjectLabel()} — {s('common.analysis')}
        </h1>
      </div>

      <Show when={query() && sheetIds().length === 0}>
        <div class="page-stats">
          <span>
            {s('project.filter_result', {
              query: query(),
              filtered: stats()?.length ?? 0,
              total: liveSheets().length,
            })}
          </span>
        </div>
      </Show>

      <Show when={sheetIds().length > 0}>
        <div class="page-stats">
          <span>
            {s('project.selected_sheets_count', {
              count: sheetIds().length,
            })}
          </span>
        </div>
      </Show>

      <Show when={analyzing()}>
        <p class="hint">{s('project.analyzing')}</p>
      </Show>

      <Show when={stats()}>
        {(rows) => (
          <div class="overflow-y-auto">
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
