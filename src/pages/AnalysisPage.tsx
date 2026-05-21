import type { Component } from 'solid-js';
import { createSignal, For, Show, createEffect, createMemo } from 'solid-js';
import { useParams, useNavigate, useSearchParams } from '@solidjs/router';
import { TbOutlineArrowLeft } from 'solid-icons/tb';
import { activeProjectLabel, openProject } from '../state/workspace_v3.ts';
import {
  liveSheets,
  loadSheetsForProject,
  sheetStatsStore,
} from '../state/sheet_list.ts';
import { loadSheetContent } from '../lib/doc/db_v3.ts';
import { formatDuration } from '../lib/format.ts';
import { matchQuery } from '../lib/tag/query.ts';
import { s } from '../lib/i18n/index.ts';
import toast from 'solid-toast';

const WORDS_PER_MINUTE = 200;

function formatReadingTime(minutes: number): string {
  if (minutes < 1) return '< 1 min';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m} min`;
  return `${h}h ${m}m`;
}

function computeStats(text: string) {
  const bytes = new TextEncoder().encode(text).length;
  const chars = text.length;
  const charsNoSpace = text.replace(/\s/g, '').length;
  const charsNoSpecial = text.replace(/[^\p{L}\p{N}]/gu, '').length;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const readingMinutes = words / WORDS_PER_MINUTE;
  return { bytes, chars, charsNoSpace, charsNoSpecial, words, readingMinutes };
}

type SheetStats = {
  id: string;
  label: string;
  bytes: number;
  chars: number;
  charsNoSpace: number;
  charsNoSpecial: number;
  words: number;
  readingMinutes: number;
  writingSeconds: number;
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

  type CharMode = 'all' | 'no_space' | 'no_special';
  const [analyzing, setAnalyzing] = createSignal(false);
  const [stats, setStats] = createSignal<SheetStats[] | null>(null);
  const [charMode, setCharMode] = createSignal<CharMode>('all');

  const charLabel = createMemo(() => {
    const mode = charMode();
    if (mode === 'no_space') return s('project.stat_no_space');
    if (mode === 'no_special') return s('project.stat_no_special');
    return s('project.stat_chars');
  });

  const charCount = (r: {
    chars: number;
    charsNoSpace: number;
    charsNoSpecial: number;
  }) => {
    const mode = charMode();
    if (mode === 'no_space') return r.charsNoSpace;
    if (mode === 'no_special') return r.charsNoSpecial;
    return r.chars;
  };

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
        readingMinutes: acc.readingMinutes + cur.readingMinutes,
        writingSeconds: acc.writingSeconds + cur.writingSeconds,
      }),
      {
        bytes: 0,
        chars: 0,
        charsNoSpace: 0,
        charsNoSpecial: 0,
        words: 0,
        readingMinutes: 0,
        writingSeconds: 0,
      },
    );
  };

  const run = async () => {
    setAnalyzing(true);
    setStats(null);

    const doRun = async () => {
      await openProject(params.pjId!);
      await loadSheetsForProject(params.pjId!);

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

      const results = await Promise.all(
        sheets.map(async (sheet) => {
          const text = await loadSheetContent(sheet.id);
          const preview = text.trim().slice(0, 16).replace(/\n/g, ' ');
          return {
            id: sheet.id,
            label: preview || s('sheet.empty'),
            writingSeconds: sheetStatsStore[sheet.id]?.writingSeconds ?? 0,
            ...computeStats(text),
          };
        }),
      );
      return results;
    };

    try {
      const results = await toast.promise(doRun(), {
        loading: s('common.analyzing'),
        success: s('common.analyze_done'),
        error: s('common.analyze_error'),
      });
      setStats(results);
    } finally {
      setAnalyzing(false);
    }
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
      <div class="page-header flex items-center gap-4">
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
        <div class="page-stats flex gap-4">
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
        <div class="page-stats flex gap-4">
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
            <div class="page-toolbar flex flex-wrap gap-2">
              <select
                value={charMode()}
                onChange={(e) =>
                  setCharMode(
                    e.currentTarget.value as 'all' | 'no_space' | 'no_special',
                  )
                }
              >
                <option value="all">{s('project.stat_chars')}</option>
                <option value="no_space">{s('project.stat_no_space')}</option>
                <option value="no_special">
                  {s('project.stat_no_special')}
                </option>
              </select>
            </div>
            <table class="stats-table">
              <thead>
                <tr>
                  <th>{s('project.stat_sheet')}</th>
                  <th>{s('project.stat_bytes')}</th>
                  <th>{charLabel()}</th>
                  <th>{s('project.stat_words')}</th>
                  <th>{s('stats.reading_time')}</th>
                  <th>{s('goal.writing_time')}</th>
                </tr>
              </thead>
              <tbody>
                <For each={rows()}>
                  {(r) => (
                    <tr>
                      <td class="stats-table-label">{r.label}</td>
                      <td>{r.bytes.toLocaleString()}</td>
                      <td>{charCount(r).toLocaleString()}</td>
                      <td>{r.words.toLocaleString()}</td>
                      <td>{formatReadingTime(r.readingMinutes)}</td>
                      <td>
                        {r.writingSeconds > 0
                          ? formatDuration(r.writingSeconds)
                          : '—'}
                      </td>
                    </tr>
                  )}
                </For>
                <Show when={rows().length > 1}>
                  <tr class="stats-table-total">
                    <td>{s('project.stat_total')}</td>
                    <td>{total()!.bytes.toLocaleString()}</td>
                    <td>{charCount(total()!).toLocaleString()}</td>
                    <td>{total()!.words.toLocaleString()}</td>
                    <td>{formatReadingTime(total()!.readingMinutes)}</td>
                    <td>
                      {total()!.writingSeconds > 0
                        ? formatDuration(total()!.writingSeconds)
                        : '—'}
                    </td>
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
