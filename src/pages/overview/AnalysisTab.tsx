import type { Component } from 'solid-js';
import { createSignal, createEffect, createMemo, For, Show } from 'solid-js';
import { sheetStatsStore } from '../../state/sheet_list.ts';
import { formatDuration } from '../../lib/format.ts';
import { s } from '../../lib/i18n/index.ts';
import toast from 'solid-toast';
import type { QueriedSheet } from './types.ts';

const WORDS_PER_MINUTE = 200;
const encoder = new TextEncoder();

function formatReadingTime(minutes: number): string {
  if (minutes < 1) return '< 1 min';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m} min`;
  return `${h}h ${m}m`;
}

function computeStats(text: string) {
  const bytes = encoder.encode(text).length;
  const chars = text.length;
  const charsNoSpace = text.replace(/\s/g, '').length;
  const charsNoSpecial = text.replace(/[^\p{L}\p{N}]/gu, '').length;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const readingMinutes = words / WORDS_PER_MINUTE;
  return { bytes, chars, charsNoSpace, charsNoSpecial, words, readingMinutes };
}

type SheetStat = {
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

type CharMode = 'all' | 'no_space' | 'no_special';

interface Props {
  sheets: QueriedSheet[];
}

const AnalysisTab: Component<Props> = (props) => {
  const [analyzing, setAnalyzing] = createSignal(false);
  const [stats, setStats] = createSignal<SheetStat[] | null>(null);
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
      const results = await Promise.all(
        props.sheets.map(async (qs) => {
          const text = await qs.getContent();
          const preview = text.trim().slice(0, 16).replace(/\n/g, ' ');
          return {
            id: qs.meta.id,
            label: preview || s('sheet.empty'),
            writingSeconds: sheetStatsStore[qs.meta.id]?.writingSeconds ?? 0,
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
    void props.sheets; // track: re-run whenever sheet list changes
    run();
  });

  return (
    <div>
      <Show when={analyzing()}>
        <p class="hint">{s('project.analyzing')}</p>
      </Show>

      <Show when={stats()}>
        {(rows) => (
          <div class="overflow-y-auto">
            <div class="page-toolbar flex flex-wrap gap-2">
              <select
                value={charMode()}
                onChange={(e) => setCharMode(e.currentTarget.value as CharMode)}
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
                <Show when={rows().length > 1 && total()}>
                  {(t) => (
                    <tr class="stats-table-total">
                      <td>{s('project.stat_total')}</td>
                      <td>{t().bytes.toLocaleString()}</td>
                      <td>{charCount(t()).toLocaleString()}</td>
                      <td>{t().words.toLocaleString()}</td>
                      <td>{formatReadingTime(t().readingMinutes)}</td>
                      <td>
                        {t().writingSeconds > 0
                          ? formatDuration(t().writingSeconds)
                          : '—'}
                      </td>
                    </tr>
                  )}
                </Show>
              </tbody>
            </table>
          </div>
        )}
      </Show>
    </div>
  );
};

export default AnalysisTab;
