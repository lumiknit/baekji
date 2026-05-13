import type { Component } from 'solid-js';
import { createSignal, onCleanup, Show } from 'solid-js';
import { TbOutlineX, TbOutlineChevronDown } from 'solid-icons/tb';
import { useNavigate } from '@solidjs/router';
import {
  filterQuery,
  setFilterQuery,
  filteredSheets,
  liveSheets,
  allTags,
} from '../../state/sheet_list';
import { activeProjectId } from '../../state/workspace_v1';
import { s } from '../../lib/i18n';
import TagList from '../tag/TagList';

const TagFilterInput: Component = () => {
  const navigate = useNavigate();
  const [inputValue, setInputValue] = createSignal(filterQuery());
  const [tagMenuOpen, setTagMenuOpen] = createSignal(false);
  let dropdownRef: HTMLDivElement | undefined;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  const handleOutsideClick = (e: MouseEvent) => {
    if (
      tagMenuOpen() &&
      dropdownRef &&
      !dropdownRef.contains(e.target as Node)
    ) {
      setTagMenuOpen(false);
    }
  };
  document.addEventListener('mousedown', handleOutsideClick, { capture: true });
  onCleanup(() =>
    document.removeEventListener('mousedown', handleOutsideClick, {
      capture: true,
    }),
  );

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

  const handleTagToggle = (tag: string) => {
    const q = filterQuery().trim();
    const parts = q ? q.split('&').map((p) => p.trim()) : [];
    const idx = parts.indexOf(tag);
    if (idx !== -1) {
      parts.splice(idx, 1);
    } else {
      parts.push(tag);
    }
    const newQ = parts.join(' & ');
    setInputValue(newQ);
    setFilterQuery(newQ);
  };

  const showCount = () => filterQuery().trim() !== '';

  return (
    <div class="sl-filter-container">
      <div class="sl-filter-wrap">
        <div class="dropdown" ref={(el) => (dropdownRef = el)}>
          <button
            class="sl-filter-btn"
            aria-label={s('sidebar.tag_list')}
            onClick={() => setTagMenuOpen((v) => !v)}
          >
            <TbOutlineChevronDown />
          </button>
          <Show when={tagMenuOpen()}>
            <div class="dropdown-menu sl-tag-dropdown">
              <TagList tags={allTags} onTagClick={handleTagToggle} max={0} />
            </div>
          </Show>
        </div>
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
