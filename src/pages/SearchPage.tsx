import type { Component } from 'solid-js';
import { For, Show } from 'solid-js';
import { useNavigate, A } from '@solidjs/router';
import { getSheetContentAsMarkdown } from '../lib/doc/db_helper';
import { projectTree } from '../state/project_tree';
import type { TreeNodeMeta } from '../state/project_tree';
import { searchState, setSearchState } from '../state/search';
import { s } from '../lib/i18n';

function allSheets(nodes: Record<string, TreeNodeMeta>): string[] {
  return Object.values(nodes)
    .filter((n) => n.type === 'sheet')
    .map((n) => n.id);
}

function buildMatcher(
  q: string,
  caseSensitive: boolean,
  useRegex: boolean,
): (text: string) => string | null {
  if (!q) return () => null;
  try {
    const escaped = useRegex ? q : q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const flags = caseSensitive ? '' : 'i';
    return (text: string) => {
      const m = new RegExp(escaped, flags).exec(text);
      if (!m) return null;
      const start = Math.max(0, m.index - 40);
      const end = Math.min(text.length, m.index + m[0].length + 40);
      return (
        (start > 0 ? '…' : '') +
        text.slice(start, end) +
        (end < text.length ? '…' : '')
      );
    };
  } catch {
    return () => null;
  }
}

const SearchPage: Component = () => {
  const navigate = useNavigate();

  let inputRef: HTMLInputElement | undefined;

  const runSearch = async () => {
    const q = searchState.query.trim();
    if (!q) return;

    setSearchState({ searching: true, results: [], searched: false });

    const matcher = buildMatcher(
      q,
      searchState.caseSensitive,
      searchState.useRegex,
    );
    const sheets = allSheets(projectTree.nodes);
    const found: typeof searchState.results = [];

    for (const id of sheets) {
      const markdown = await getSheetContentAsMarkdown(id);
      const label = projectTree.nodes[id]?.label || s('common.untitled');
      const snippet = matcher(markdown);
      if (snippet !== null) {
        found.push({ id, label, snippet });
        setSearchState('results', [...found]);
      }
    }

    setSearchState({ searching: false, searched: true });
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') runSearch();
  };

  const backHref = () => {
    const pjVerId = projectTree.meta?.pjVerId;
    return pjVerId ? `/nodes/${pjVerId}` : '/';
  };

  return (
    <div class="p-16 mt-32 max-w-800 m-auto overflow-x-hidden">
      <div class="page-header mb-24">
        <A href={backHref()}>←</A>
        <h1>{s('common.search')}</h1>
      </div>

      <div class="flex gap-8 items-center mb-8">
        <input
          ref={inputRef}
          type="text"
          class="search-input flex-1"
          placeholder={s('common.search_placeholder')}
          value={searchState.query}
          onInput={(e) => setSearchState('query', e.currentTarget.value)}
          onKeyDown={handleKeyDown}
          autofocus
        />
        <button
          class="btn-border"
          onClick={runSearch}
          disabled={searchState.searching}
        >
          {searchState.searching ? '…' : s('common.search')}
        </button>
      </div>

      <div class="flex gap-16 mb-24 text-sm">
        <label class="flex items-center gap-4">
          <input
            type="checkbox"
            checked={searchState.caseSensitive}
            onChange={(e) =>
              setSearchState('caseSensitive', e.currentTarget.checked)
            }
          />
          Aa
        </label>
        <label class="flex items-center gap-4">
          <input
            type="checkbox"
            checked={searchState.useRegex}
            onChange={(e) =>
              setSearchState('useRegex', e.currentTarget.checked)
            }
          />
          .*
        </label>
      </div>

      <Show
        when={
          searchState.searched &&
          searchState.results.length === 0 &&
          !searchState.searching
        }
      >
        <div class="opacity-50 italic">{s('common.search_no_results')}</div>
      </Show>

      <For each={searchState.results}>
        {(r) => (
          <div class="search-result" onClick={() => navigate(`/nodes/${r.id}`)}>
            <div class="search-result-label">{r.label}</div>
            <div class="search-result-snippet">{r.snippet}</div>
          </div>
        )}
      </For>
    </div>
  );
};

export default SearchPage;
