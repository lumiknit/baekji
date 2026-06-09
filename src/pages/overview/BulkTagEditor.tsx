import type { Component } from 'solid-js';
import { createSignal, createMemo, createEffect, For, Show } from 'solid-js';
import { updateSheetTagsBatch } from '../../state/sheet_list.ts';
import { tagToHsl } from '../../lib/tag/color.ts';
import { s } from '../../lib/i18n/index.ts';
import toast from 'solid-toast';
import type { QueriedSheet } from './types.ts';

// Three states for each tag across selected sheets:
//   'all'    — every sheet has it (show as checked)
//   'partial' — some sheets have it (show as indeterminate)
//   'none'   — no sheet has it (not shown unless manually added)
//
// User actions cycle per-tag through an override:
//   undefined (keep current) → 'add' (force-add to all) → 'remove' (force-remove from all) → undefined
// For 'none' base tags (newly entered), only 'add' / undefined makes sense.

type BaseState = 'all' | 'partial' | 'none';
type Override = 'add' | 'remove' | undefined;

interface TagEntry {
  tag: string;
  base: BaseState;
  override: Override;
}

function nextOverride(base: BaseState, current: Override): Override {
  if (base === 'all') {
    // all → keep → remove → add → keep ...
    if (current === undefined) return 'remove';
    if (current === 'remove') return 'add';
    return undefined;
  } else {
    // partial/none → keep → add → remove → keep ...
    if (current === undefined) return 'add';
    if (current === 'add') return 'remove';
    return undefined;
  }
}

interface Props {
  sheets: QueriedSheet[];
}

const BulkTagEditor: Component<Props> = (props) => {
  const [overrides, setOverrides] = createSignal<Map<string, Override>>(
    new Map(),
  );
  const [newTagInput, setNewTagInput] = createSignal('');
  const [applying, setApplying] = createSignal(false);

  // Reset pending overrides when the sheet set changes to avoid applying
  // stale tag changes to a completely different selection.
  createEffect(() => {
    void props.sheets;
    setOverrides(new Map());
  });

  // Compute per-tag base state from sheet metas
  const tagEntries = createMemo((): TagEntry[] => {
    const sheets = props.sheets;
    const n = sheets.length;
    const counts = new Map<string, number>();
    for (const qs of sheets) {
      for (const tag of qs.meta.tags) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    const ov = overrides();
    const entries: TagEntry[] = [];
    for (const [tag, count] of counts) {
      entries.push({
        tag,
        base: count === n ? 'all' : 'partial',
        override: ov.get(tag),
      });
    }
    // Also show tags that were manually added (override='add') but aren't in sheets
    for (const [tag, ov2] of ov) {
      if (!counts.has(tag) && ov2 === 'add') {
        entries.push({ tag, base: 'none', override: 'add' });
      }
    }
    entries.sort((a, b) => a.tag.localeCompare(b.tag));
    return entries;
  });

  const hasChanges = createMemo(() => {
    const ov = overrides();
    return ov.size > 0 && [...ov.values()].some((v) => v !== undefined);
  });

  const toggleTag = (tag: string, base: BaseState) => {
    setOverrides((prev) => {
      const next = new Map(prev);
      next.set(tag, nextOverride(base, prev.get(tag)));
      return next;
    });
  };

  const addNewTag = () => {
    const tag = newTagInput().trim();
    if (!tag) return;
    setNewTagInput('');
    setOverrides((prev) => {
      const next = new Map(prev);
      next.set(tag, 'add');
      return next;
    });
  };

  const apply = async () => {
    if (!hasChanges()) return;
    const ov = overrides();
    setApplying(true);

    const doApply = async () => {
      const updates = new Map<string, string[]>();
      for (const qs of props.sheets) {
        const tags = new Set(qs.meta.tags);
        for (const [tag, action] of ov) {
          if (action === 'add') tags.add(tag);
          else if (action === 'remove') tags.delete(tag);
        }
        updates.set(qs.meta.id, [...tags]);
      }
      await updateSheetTagsBatch(updates);
      setOverrides(new Map());
    };

    try {
      await doApply();
      toast.success(s('overview.bulk_tag_apply'));
    } catch {
      // DB layer (handleDBError) already showed the error toast
    } finally {
      setApplying(false);
    }
  };

  const tagStyle = (entry: TagEntry) => {
    const { h, s: sat } = tagToHsl(entry.tag);
    const effective =
      entry.override ?? (entry.base === 'all' ? 'add' : undefined);
    if (effective === 'remove') {
      return {
        background: 'transparent',
        color: `hsl(${h}deg ${sat}% var(--color-l))`,
        border: `1px solid hsl(${h}deg ${sat}% var(--color-l))`,
        opacity: '0.4',
        'text-decoration': 'line-through',
      };
    }
    if (effective === 'add') {
      return {
        background: `hsl(${h}deg ${sat}% 60% / 0.25)`,
        color: `hsl(${h}deg ${sat}% var(--color-l))`,
        outline:
          entry.override === 'add'
            ? `2px solid hsl(${h}deg ${sat}% var(--color-l))`
            : 'none',
        'outline-offset': '1px',
      };
    }
    // partial / no override
    return {
      background: `hsl(${h}deg ${sat}% 60% / 0.12)`,
      color: `hsl(${h}deg ${sat}% var(--color-l))`,
      border: `1px dashed hsl(${h}deg ${sat}% var(--color-l) / 0.5)`,
    };
  };

  return (
    <div class="mt-4">
      <h2 class="pj-section-title">{s('overview.bulk_tag_title')}</h2>

      <div class="tag-list flex flex-wrap gap-1 mb-2">
        <For each={tagEntries()}>
          {(entry) => (
            <span
              class="tag"
              style={tagStyle(entry)}
              onClick={() => toggleTag(entry.tag, entry.base)}
              title={
                entry.override === 'add'
                  ? '+add'
                  : entry.override === 'remove'
                    ? '−remove'
                    : entry.base === 'partial'
                      ? 'partial'
                      : 'all'
              }
            >
              {entry.tag}
            </span>
          )}
        </For>
      </div>

      <div class="flex gap-1 items-center">
        <input
          type="text"
          class="tag-input flex-1 min-w-0"
          placeholder={s('overview.bulk_tag_new_placeholder')}
          value={newTagInput()}
          onInput={(e) => setNewTagInput(e.currentTarget.value)}
          onKeyDown={(e) => e.key === 'Enter' && addNewTag()}
        />
        <button class="btn-border" onClick={addNewTag}>
          +
        </button>
        <Show when={hasChanges()}>
          <button
            class="btn-primary btn-sm"
            disabled={applying()}
            onClick={apply}
          >
            {s('overview.bulk_tag_apply')}
          </button>
        </Show>
      </div>
    </div>
  );
};

export default BulkTagEditor;
