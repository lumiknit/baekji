import { createRoot, createEffect } from 'solid-js';
import { createStore } from 'solid-js/store';
import { activePjVerId } from './workspace';

export interface SearchResult {
  id: string;
  label: string;
  snippet: string;
}

export interface SearchState {
  query: string;
  useRegex: boolean;
  caseSensitive: boolean;
  results: SearchResult[];
  searching: boolean;
  searched: boolean;
}

const [searchState, setSearchState] = createStore<SearchState>({
  query: '',
  useRegex: false,
  caseSensitive: false,
  results: [],
  searching: false,
  searched: false,
});

// Clear results when the active project changes
createRoot(() => {
  createEffect(() => {
    activePjVerId();
    setSearchState({ results: [], searching: false, searched: false });
  });
});

export { searchState, setSearchState };
