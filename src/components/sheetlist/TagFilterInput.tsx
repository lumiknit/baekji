import type { Component } from 'solid-js';
import { createSignal, onCleanup, Show } from 'solid-js';
import { TbOutlineX, TbOutlineSearch } from 'solid-icons/tb';
import { useNavigate } from '@solidjs/router';
import {
  filterQuery,
  setFilterQuery,
  filteredSheets,
  liveSheets,
} from '../../state/sheet_list';
import { activeProjectId } from '../../state/workspace_v1';
import { s } from '../../lib/i18n';

const TagFilterInput: Component = () => {
  const navigate = useNavigate();
  const [inputValue, setInputValue] = createSignal(filterQuery());
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  const handleInput = (val: string) => {
    setInputValue(val);
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => setFilterQuery(val), 500);
  };

  const handleClear = () => {
    setInputValue('');
    clearTimeout(debounceTimer);
    setFilterQuery('');
  };

  onCleanup(() => clearTimeout(debounceTimer));

  const handleSearch = () => {
    clearTimeout(debounceTimer);
    setFilterQuery(inputValue());
    const q = inputValue().trim();
    const id = activeProjectId();
    if (!id) return;
    navigate(`/project/${id}${q ? `?q=${encodeURIComponent(q)}` : ''}`);
  };

  const showCount = () => filterQuery().trim() !== '';

  return (
    <div class="sl-filter-container">
      <div class="sl-filter-wrap">
        <input
          class="sl-filter-input"
          type="text"
          placeholder={s('sidebar.filter_placeholder')}
          value={inputValue()}
          onInput={(e) => handleInput(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSearch();
          }}
        />
        <Show when={inputValue()}>
          <button
            class="sl-filter-btn"
            onClick={handleClear}
            title={s('sidebar.filter_clear')}
          >
            <TbOutlineX />
          </button>
        </Show>
        <button
          class="sl-filter-btn"
          onClick={handleSearch}
          title={s('sidebar.filter_search')}
        >
          <TbOutlineSearch />
        </button>
      </div>
      <Show when={showCount()}>
        <div class="sl-filter-count">
          {filteredSheets().length} / {liveSheets().length}
        </div>
      </Show>
    </div>
  );
};

export default TagFilterInput;
