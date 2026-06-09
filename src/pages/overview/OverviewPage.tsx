import type { Component } from 'solid-js';
import {
  createMemo,
  createEffect,
  createSignal,
  For,
  Show,
  onMount,
  onCleanup,
} from 'solid-js';
import { useParams, useSearchParams } from '@solidjs/router';
import {
  activeProjectId,
  activeProjectLabel,
  openProject,
  updateProjectLabel,
} from '../../state/workspace_v3.ts';
import {
  liveSheets,
  loadSheetsForProject,
  filterQuery,
  setFilterQuery,
  selectedIds,
  setSelectedIds,
  isSelectMode,
  setSelectMode,
} from '../../state/sheet_list.ts';
import { loadSheetContent } from '../../lib/doc/db_v3.ts';
import { matchQuery } from '../../lib/tag/query.ts';
import { s } from '../../lib/i18n/index.ts';
import InfoTab from './InfoTab.tsx';
import AnalysisTab from './AnalysisTab.tsx';
import PreviewTab from './PreviewTab.tsx';
import ReviseTab from './ReviseTab.tsx';
import type { QueriedSheet } from './types.ts';

type TabId = '' | 'analysis' | 'preview' | 'revise';

const TABS: { id: TabId; labelKey: string }[] = [
  { id: '', labelKey: 'overview.tab_info' },
  { id: 'analysis', labelKey: 'overview.tab_analysis' },
  { id: 'preview', labelKey: 'overview.tab_preview' },
  { id: 'revise', labelKey: 'overview.tab_revise' },
];

const OverviewPage: Component = () => {
  const params = useParams<{ pjId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();

  const tab = (): TabId => (searchParams.tab as TabId) || '';
  const setTab = (id: TabId) =>
    setSearchParams({ tab: id || undefined }, { replace: true });

  // Init project + sheets
  createEffect(() => {
    const id = params.pjId;
    if (id) openProject(id).then(() => loadSheetsForProject(id));
  });

  // On mount: apply URL params to sidebar state as initial values
  onMount(() => {
    const urlSheetIds = (() => {
      const val = searchParams.sheetId;
      if (!val) return [] as string[];
      return Array.isArray(val) ? val : [val];
    })();
    const urlQuery = (searchParams.q as string | undefined) ?? '';

    if (urlSheetIds.length > 0) {
      setSelectMode(true);
      setSelectedIds(new Set<string>(urlSheetIds));
    } else if (urlQuery) {
      setFilterQuery(urlQuery);
    }
  });

  // On unmount: clear sidebar selection state
  onCleanup(() => {
    setSelectMode(false);
    setSelectedIds(new Set<string>());
  });

  // Auto-rename on ?new=1
  const [editingLabel, setEditingLabel] = createSignal(false);
  const [labelDraft, setLabelDraft] = createSignal('');

  const startRename = () => {
    setLabelDraft(activeProjectLabel());
    setEditingLabel(true);
  };

  createEffect(() => {
    if (searchParams.new === '1' && activeProjectId()) {
      startRename();
      setSearchParams({ new: undefined }, { replace: true });
    }
  });

  const commitRename = async () => {
    const label = labelDraft().trim();
    setEditingLabel(false);
    if (!label || label === activeProjectLabel()) return;
    await updateProjectLabel(params.pjId, label);
  };

  // Content cache scoped to this page instance
  const contentCache = new Map<string, string>();
  const makeGetContent = (id: string) => async () => {
    if (contentCache.has(id)) return contentCache.get(id)!;
    const content = await loadSheetContent(id);
    contentCache.set(id, content);
    return content;
  };

  // Derive sheet list from sidebar state (filterQuery / selectedIds)
  const queriedSheets = createMemo((): QueriedSheet[] => {
    let sheets = liveSheets();

    if (isSelectMode() && selectedIds().size > 0) {
      const ids = selectedIds();
      sheets = sheets.filter((sh) => ids.has(sh.id));
    } else {
      const q = filterQuery().trim();
      if (q) sheets = sheets.filter((sh) => matchQuery(q, new Set(sh.tags)));
    }

    return sheets.map((meta) => ({
      meta,
      getContent: makeGetContent(meta.id),
    }));
  });

  const allTagCounts = createMemo(() => {
    const counts = new Map<string, number>();
    for (const sheet of liveSheets()) {
      for (const tag of sheet.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
    return counts;
  });

  return (
    <Show
      when={activeProjectId()}
      fallback={<div class="empty-state">{s('project.no_project_open')}</div>}
    >
      <div class="page-body">
        {/* Project name */}
        <div class="page-header flex items-center gap-4">
          <Show
            when={editingLabel()}
            fallback={
              <h1
                class="pj-name-label"
                onClick={startRename}
                title={s('project.rename_title')}
              >
                {activeProjectLabel()}
              </h1>
            }
          >
            <input
              class="pj-name-input"
              value={labelDraft()}
              onChange={(e) => setLabelDraft(e.currentTarget.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') setEditingLabel(false);
              }}
              ref={(el) => setTimeout(() => el?.focus(), 0)}
            />
          </Show>
        </div>

        {/* Stats line */}
        <div class="page-stats flex gap-4">
          <span>
            {s('project.sheet_count', { count: liveSheets().length })}
          </span>
          <span>{s('project.tag_count', { count: allTagCounts().size })}</span>
          <Show when={isSelectMode() && selectedIds().size > 0}>
            <span>
              {s('project.selected_sheets_count', {
                count: selectedIds().size,
              })}
            </span>
          </Show>
          <Show when={!isSelectMode() && filterQuery().trim()}>
            <span>
              {s('project.filter_result', {
                query: filterQuery(),
                filtered: queriedSheets().length,
                total: liveSheets().length,
              })}
            </span>
          </Show>
        </div>

        {/* Tab bar */}
        <div class="flex gap-2 mb-2">
          <For each={TABS}>
            {(t) => (
              <button
                class={tab() === t.id ? 'btn-primary' : 'ghost'}
                onClick={() => setTab(t.id)}
              >
                {s(t.labelKey)}
              </button>
            )}
          </For>
        </div>
        <hr class="separator-line" />

        {/* Tab content */}
        <Show when={tab() === ''}>
          <InfoTab projectId={params.pjId} sheets={queriedSheets()} />
        </Show>
        <Show when={tab() === 'analysis'}>
          <AnalysisTab sheets={queriedSheets()} />
        </Show>
        <Show when={tab() === 'preview'}>
          <PreviewTab sheets={queriedSheets()} />
        </Show>
        <Show when={tab() === 'revise'}>
          <ReviseTab sheets={queriedSheets()} />
        </Show>
      </div>
    </Show>
  );
};

export default OverviewPage;
