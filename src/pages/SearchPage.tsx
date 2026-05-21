import type { Component } from 'solid-js';
import { createSignal, For, Show, onMount } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { TbOutlineSearch, TbOutlineFileText } from 'solid-icons/tb';
import { liveSheets } from '../state/sheet_list.ts';
import { loadSheetContent } from '../lib/doc/db_v3.ts';
import { s } from '../lib/i18n/index.ts';
import toast from 'solid-toast';
import { logError } from '../state/log.ts';

type SearchResult = {
  id: string;
  tags: string[];
  content: string;
  matches: { start: number; end: number }[];
};

const SearchPage: Component = () => {
  const navigate = useNavigate();
  const [query, setQuery] = createSignal('');
  const [results, setResults] = createSignal<SearchResult[]>([]);
  const [searching, setSearching] = createSignal(false);

  const handleSearch = async () => {
    const q = query().trim().toLowerCase();
    if (!q) {
      setResults([]);
      return;
    }

    setSearching(true);
    const doSearch = async () => {
      const sheets = liveSheets();
      const results = await Promise.all(
        sheets.map(async (sheet) => {
          const text = await loadSheetContent(sheet.id);
          const lowerText = text.toLowerCase();
          const matches: { start: number; end: number }[] = [];
          let pos = lowerText.indexOf(q);
          while (pos !== -1) {
            matches.push({ start: pos, end: pos + q.length });
            pos = lowerText.indexOf(q, pos + q.length);
          }
          if (matches.length > 0) {
            return {
              id: sheet.id,
              tags: sheet.tags,
              content: text,
              matches,
            };
          }
          return null;
        }),
      );
      return results.filter((r): r is SearchResult => r !== null);
    };

    try {
      const newResults = await toast.promise(doSearch(), {
        loading: s('common.searching'),
        success: s('common.search_done'),
        error: s('common.search_error'),
      });
      setResults(newResults);
    } catch (err) {
      logError('SearchPage:handleSearch', err);
    } finally {
      setSearching(false);
    }
  };

  onMount(() => {
    const el = document.getElementById('search-input');
    el?.focus();
  });

  return (
    <div class="page-body">
      <div class="page-header flex items-center gap-4">
        <h1>{s('common.search')}</h1>
      </div>

      <div class="search-panel">
        <div class="search-input-row">
          <input
            id="search-input"
            class="search-input"
            value={query()}
            onInput={(e) => setQuery(e.currentTarget.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder={s('common.search_placeholder')}
          />
          <button class="btn-border" onClick={handleSearch}>
            <span class="icon">
              <TbOutlineSearch />
            </span>
          </button>
        </div>
      </div>

      <div class="search-results-list flex flex-column gap-3">
        <Show when={searching()}>
          <div class="empty-state">{s('common.searching')}</div>
        </Show>

        <Show when={!searching() && results().length === 0 && query()}>
          <div class="empty-state">{s('common.search_no_results')}</div>
        </Show>

        <For each={results()}>
          {(res) => (
            <div
              class="search-result-item flex flex-column gap-2"
              onClick={() => navigate(`/sheets/${res.id}`)}
            >
              <div class="flex items-center gap-2">
                <span class="icon">
                  <TbOutlineFileText />
                </span>
                <div class="tag-list">
                  <For each={res.tags}>
                    {(tag) => <span class="tag">{tag}</span>}
                  </For>
                </div>
              </div>
              <div class="search-result-preview">
                {(() => {
                  const firstMatch = res.matches[0];
                  const start = Math.max(0, firstMatch.start - 40);
                  const end = Math.min(res.content.length, firstMatch.end + 80);
                  const snippet = res.content.slice(start, end);
                  return (
                    <>
                      {start > 0 && '...'}
                      {snippet}
                      {end < res.content.length && '...'}
                    </>
                  );
                })()}
              </div>
            </div>
          )}
        </For>
      </div>
    </div>
  );
};

export default SearchPage;
