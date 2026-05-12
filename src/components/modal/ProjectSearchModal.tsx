import type { Component } from 'solid-js';
import { createSignal, For, Show, onMount } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { TbOutlineSearch, TbOutlineFileText, TbOutlineX } from 'solid-icons/tb';
import { liveSheets } from '../../state/sheet_list';
import { openSheetDoc, closeSheetDoc, waitForSync } from '../../lib/doc/ydoc';
import { s } from '../../lib/i18n';
import { closeProjectSearchModal } from '../../state/modal';

type SearchResult = {
  id: string;
  tags: string[];
  content: string;
  matches: { start: number; end: number }[];
};

const ProjectSearchModal: Component = () => {
  const navigate = useNavigate();
  const [query, setQuery] = createSignal('');
  const [results, setResults] = createSignal<SearchResult[]>([]);
  const [searching, setSearching] = createSignal(false);
  let inputRef: HTMLInputElement | undefined;

  const handleSearch = async () => {
    const q = query().trim().toLowerCase();
    if (!q) {
      setResults([]);
      return;
    }

    setSearching(true);
    const sheets = liveSheets();
    const newResults: SearchResult[] = [];

    for (const sheet of sheets) {
      const sd = openSheetDoc(sheet.id);
      await waitForSync(sd.provider);
      const text = sd.content.toString();
      const lowerText = text.toLowerCase();

      const matches: { start: number; end: number }[] = [];
      let pos = lowerText.indexOf(q);
      while (pos !== -1) {
        matches.push({ start: pos, end: pos + q.length });
        pos = lowerText.indexOf(q, pos + q.length);
      }

      if (matches.length > 0) {
        newResults.push({
          id: sheet.id,
          tags: sheet.tags,
          content: text,
          matches,
        });
      }
      closeSheetDoc(sd);
    }

    setResults(newResults);
    setSearching(false);
  };

  onMount(() => {
    inputRef?.focus();
  });

  const handleGoToSheet = (id: string) => {
    navigate(`/sheets/${id}`);
    closeProjectSearchModal();
  };

  return (
    <div class="flex flex-column gap-12" style={{ 'max-height': '80vh' }}>
      <div class="flex items-center justify-between">
        <h3 class="m-0">{s('common.search')}</h3>
        <button class="sb-icon-btn" onClick={closeProjectSearchModal}>
          <div class="btn-pad">
            <TbOutlineX />
          </div>
        </button>
      </div>

      <div class="search-input-row">
        <input
          ref={(el) => (inputRef = el)}
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

      <div
        class="search-results-list"
        style={{ overflow: 'auto', flex: 1, 'min-height': '200px' }}
      >
        <Show when={searching()}>
          <div class="empty-state">{s('common.searching')}</div>
        </Show>

        <Show when={!searching() && results().length === 0 && query()}>
          <div class="empty-state">{s('common.search_no_results')}</div>
        </Show>

        <For each={results()}>
          {(res) => (
            <div
              class="search-result-item"
              onClick={() => handleGoToSheet(res.id)}
            >
              <div class="search-result-header">
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

export default ProjectSearchModal;
