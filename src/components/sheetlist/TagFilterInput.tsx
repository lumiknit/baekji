import type { Component } from 'solid-js';
import { TbOutlineX } from 'solid-icons/tb';
import { filterQuery, setFilterQuery } from '../../state/sheet_list';

const TagFilterInput: Component = () => {
  return (
    <div class="sl-filter-wrap">
      <span class="sl-filter-icon">🏷</span>
      <input
        class="sl-filter-input"
        type="text"
        placeholder="태그 필터 (예: 초안 & 소설)"
        value={filterQuery()}
        onInput={(e) => setFilterQuery(e.currentTarget.value)}
      />
      {filterQuery() && (
        <button
          class="sl-filter-clear sb-icon-btn"
          onClick={() => setFilterQuery('')}
          title="필터 지우기"
        >
          <TbOutlineX />
        </button>
      )}
    </div>
  );
};

export default TagFilterInput;
