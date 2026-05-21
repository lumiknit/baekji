import type { Component } from 'solid-js';
import { createMemo, createSignal, For, Show } from 'solid-js';
import { liveSheets, updateSheetTagsBatch } from '../state/sheet_list.ts';
import { matchQuery } from '../lib/tag/query.ts';
import { TagChip } from './editor/TagEditor.tsx';
import { showConfirm } from '../state/modal.ts';
import { s } from '../lib/i18n/index.ts';
import toast from 'solid-toast';

// Match tag against a wildcard pattern; returns captured segments or null if no match.
const matchWildcard = (pattern: string, tag: string): string[] | null => {
  const parts = pattern.split('*');
  if (parts.length === 1) return pattern === tag ? [] : null;

  const captures: string[] = [];
  let rest = tag;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (i === 0) {
      if (!rest.startsWith(part)) return null;
      rest = rest.slice(part.length);
    } else if (i === parts.length - 1) {
      if (!rest.endsWith(part)) return null;
      captures.push(rest.slice(0, rest.length - part.length));
    } else {
      const idx = rest.indexOf(part);
      if (idx === -1) return null;
      captures.push(rest.slice(0, idx));
      rest = rest.slice(idx + part.length);
    }
  }

  return captures;
};

// Build replacement string by substituting captures into the to-pattern's wildcards.
const buildReplacement = (toPattern: string, captures: string[]): string =>
  toPattern
    .split('*')
    .map((p, i) => (i === 0 ? p : (captures[i - 1] ?? '') + p))
    .join('');

type TagRename = { tag: string; newTag: string; sheetIds: string[] };

const ProjectTagEdit: Component<{ allTags: [string, number][] }> = (props) => {
  const [filter, setFilter] = createSignal('');
  const [showRename, setShowRename] = createSignal(false);
  const [toPattern, setToPattern] = createSignal('');
  const [applying, setApplying] = createSignal(false);

  // Filter using the general query system for display
  const filteredTags = createMemo(() => {
    const f = filter().trim();
    if (!f) return props.allTags;
    return props.allTags.filter(([tag]) => matchQuery(f, new Set([tag])));
  });

  // Wildcard captures per tag from filter pattern (for rename)
  const tagCaptures = createMemo((): Map<string, string[]> => {
    const f = filter().trim();
    const map = new Map<string, string[]>();
    for (const [tag] of filteredTags()) {
      const caps = f ? (matchWildcard(f, tag) ?? []) : [];
      map.set(tag, caps);
    }
    return map;
  });

  // Sheet id lookup map
  const tagToSheets = createMemo(() => {
    const m = new Map<string, string[]>();
    for (const sheet of liveSheets()) {
      for (const tag of sheet.tags) {
        if (!m.has(tag)) m.set(tag, []);
        m.get(tag)!.push(sheet.id);
      }
    }
    return m;
  });

  // Preview renames: filtered tags + toPattern + captures
  const preview = createMemo((): TagRename[] => {
    const to = toPattern().trim();
    if (!to) return [];
    const captures = tagCaptures();
    const sheetMap = tagToSheets();
    const results: TagRename[] = [];
    for (const [tag] of filteredTags()) {
      const caps = captures.get(tag) ?? [];
      const newTag = buildReplacement(to, caps);
      if (newTag === tag) continue;
      results.push({ tag, newTag, sheetIds: sheetMap.get(tag) ?? [] });
    }
    return results;
  });

  const applyRename = async () => {
    const changes = preview();
    if (changes.length === 0) return;

    const lines = changes
      .map(
        (c) =>
          `  ${c.tag} → ${c.newTag} (${s('project.tag_item_count', { count: c.sheetIds.length })})`,
      )
      .join('\n');
    const confirmed = await showConfirm(
      s('project.tag_rename_confirm_title'),
      s('project.tag_rename_confirm_desc', { count: changes.length }) +
        '\n\n' +
        lines,
    );
    if (!confirmed) return;

    setApplying(true);
    const apply = async () => {
      const sheetUpdates = new Map<string, string[]>();
      const sheets = liveSheets();
      for (const sheet of sheets) sheetUpdates.set(sheet.id, [...sheet.tags]);

      for (const { tag, newTag, sheetIds } of changes) {
        for (const sheetId of sheetIds) {
          const tags = sheetUpdates.get(sheetId);
          if (!tags) continue;
          const idx = tags.indexOf(tag);
          if (idx === -1) continue;
          if (!tags.includes(newTag)) tags[idx] = newTag;
          else tags.splice(idx, 1);
        }
      }

      const batchUpdates = new Map<string, string[]>();
      for (const [sheetId, tags] of sheetUpdates) {
        const sheet = sheets.find((sh) => sh.id === sheetId);
        if (!sheet) continue;
        const orig = sheet.tags;
        const changed =
          orig.length !== tags.length || orig.some((t, i) => t !== tags[i]);
        if (changed) batchUpdates.set(sheetId, tags);
      }

      await updateSheetTagsBatch(batchUpdates);
      setToPattern('');
    };

    toast
      .promise(
        apply().finally(() => setApplying(false)),
        {
          loading: s('common.loading'),
          success: s('project.tag_rename_apply', { count: changes.length }),
          error: (err: unknown) =>
            err instanceof Error ? err.message : String(err),
        },
      )
      .catch(() => {});
  };

  const isFiltered = () => filter().trim() !== '';
  const countLabel = () =>
    isFiltered()
      ? `${filteredTags().length}/${props.allTags.length}`
      : `${props.allTags.length}`;

  return (
    <div class="pj-tag-edit">
      <h2 class="pj-section-title">
        {s('project.tag_colors_title')}{' '}
        <span class="pj-section-count">({countLabel()})</span>
      </h2>

      <div class="pj-tag-cloud flex flex-wrap">
        <For each={filteredTags()}>
          {([tag, count]) => (
            <span class="pj-tag-cloud-item">
              <TagChip tag={tag} />
              <span class="pj-tag-cloud-count">{count}</span>
            </span>
          )}
        </For>
      </div>

      <div class="pj-tag-filter-row">
        <input
          type="text"
          class="pj-tag-filter-input"
          placeholder={s('project.tag_filter_placeholder')}
          value={filter()}
          onChange={(e) => setFilter(e.currentTarget.value)}
        />
        <button
          class={`btn-border btn-sm${showRename() ? ' btn-active' : ''}`}
          onClick={() => setShowRename((v) => !v)}
          title={s('project.tag_rename_title')}
        >
          &amp;
        </button>
      </div>

      <Show when={showRename()}>
        <div class="pj-tag-rename-section">
          <div class="pj-tag-rename-row">
            <span class="pj-tag-rename-arrow">→</span>
            <input
              type="text"
              class="pj-tag-rename-input"
              placeholder={s('project.tag_rename_to_placeholder')}
              value={toPattern()}
              onChange={(e) => setToPattern(e.currentTarget.value)}
            />
            <button
              class="btn-border btn-sm"
              onClick={applyRename}
              disabled={applying() || preview().length === 0}
            >
              {applying()
                ? s('common.loading')
                : s('project.tag_rename_apply', { count: preview().length })}
            </button>
          </div>

          <Show when={preview().length > 0}>
            <div class="pj-tag-rename-preview">
              <For each={preview()}>
                {({ tag, newTag, sheetIds }) => (
                  <div class="pj-tag-rename-preview-row">
                    <span class="pj-tag-rename-from">{tag}</span>
                    <span class="pj-tag-rename-arrow">→</span>
                    <span class="pj-tag-rename-to">{newTag}</span>
                    <span class="pj-tag-count">
                      {s('project.tag_item_count', { count: sheetIds.length })}
                    </span>
                  </div>
                )}
              </For>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
};

export default ProjectTagEdit;
