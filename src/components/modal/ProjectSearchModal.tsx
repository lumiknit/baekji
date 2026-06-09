import type { Component } from 'solid-js';
import { createSignal, For, Show, onMount } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { TbOutlineSearch, TbOutlineFileText, TbOutlineX } from 'solid-icons/tb';
import { liveSheets } from '../../state/sheet_list.ts';
import { loadSheetContent } from '../../lib/doc/db_v3.ts';
import { s } from '../../lib/i18n/index.ts';
import { closeProjectSearchModal } from '../../state/modal.ts';

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
  const [progress, setProgress] = createSignal<{
    done: number;
    total: number;
  } | null>(null);
  let inputRef: HTMLInputElement | undefined;
  let searchId = 0;

  const handleSearch = async () => {
    const q = query().trim().toLowerCase();
    if (!q) {
      setResults([]);
      return;
    }

    const myId = ++searchId;
    setResults([]);
    const sheets = liveSheets();
    setProgress({ done: 0, total: sheets.length });

    for (let i = 0; i < sheets.length; i++) {
      if (searchId !== myId) return; // superseded by a newer search
      const sheet = sheets[i];
      const text = await loadSheetContent(sheet.id);
      const lowerText = text.toLowerCase();
      const matches: { start: number; end: number }[] = [];
      let pos = lowerText.indexOf(q);
      while (pos !== -1) {
        matches.push({ start: pos, end: pos + q.length });
        pos = lowerText.indexOf(q, pos + q.length);
      }
      if (matches.length > 0) {
        setResults((prev) => [
          ...prev,
          { id: sheet.id, tags: sheet.tags, content: text, matches },
        ]);
      }
      setProgress({ done: i + 1, total: sheets.length });
    }

    if (searchId === myId) setProgress(null);
  };

  onMount(() => {
    inputRef?.focus();
  });

  const handleGoToSheet = (id: string) => {
    navigate(`/sheets/${id}`);
    closeProjectSearchModal();
  };

  return (
    <div class="flex flex-column gap-3" style={{ 'max-height': '80vh' }}>
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
        class="search-results-list flex flex-column gap-3"
        style={{ overflow: 'auto', flex: 1, 'min-height': '200px' }}
      >
        <Show when={progress()}>
          {(p) => (
            <div class="empty-state">
              {s('common.searching')} ({p().done} / {p().total})
            </div>
          )}
        </Show>

        <Show when={!progress() && results().length === 0 && query()}>
          <div class="empty-state">{s('common.search_no_results')}</div>
        </Show>

        <For each={results()}>
          {(res) => (
            <div
              class="search-result-item flex flex-column gap-2"
              onClick={() => handleGoToSheet(res.id)}
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

export default ProjectSearchModal;
