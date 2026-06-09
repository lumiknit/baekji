import type { Component } from 'solid-js';
import {
  createSignal,
  createEffect,
  createMemo,
  For,
  Show,
  Index,
} from 'solid-js';
import { createStore } from 'solid-js/store';
import { makePersisted } from '@solid-primitives/storage';
import {
  TbOutlineCopy,
  TbOutlinePlus,
  TbOutlineTrash,
  TbOutlineRefresh,
  TbOutlineCheck,
  TbOutlineX,
  TbOutlineArrowUp,
  TbOutlineArrowDown,
} from 'solid-icons/tb';
import { invalidateSheetPreview } from '../../state/sheet_list.ts';
import { replaceSheetContent } from '../../lib/doc/db_v3.ts';
import toast from 'solid-toast';
import { z } from 'zod/v4';
import { s } from '../../lib/i18n/index.ts';
import {
  BUILTIN_USER_DIRECTION_CRITIC,
  BUILTIN_USER_DIRECTION_GRAMMAR,
  COMMON_DIRECTION,
} from '../../lib/prompt_revise.ts';
import type { QueriedSheet } from './types.ts';

// ─── Types ────────────────────────────────────────────────────────

type ReviseType = 'typo' | 'grammar' | 'revise' | 'comment';

interface ReviseItem {
  sheet?: number;
  line?: number;
  target: string;
  suggestion?: string;
  reason: string;
  type: ReviseType;
}

interface ParsedReviseItem extends ReviseItem {
  _id: number;
  _status: 'pending' | 'accepted' | 'rejected';
  _parseError?: boolean;
}

type SheetData = { id: string; label: string; tags: string[]; text: string };

const reviseTypeSchema = z.enum(['typo', 'grammar', 'revise', 'comment']);
const reviseItemSchema = z.object({
  sheet: z.number().int().nonnegative().optional(),
  line: z.number().int().positive().optional(),
  target: z.string(),
  suggestion: z.string().optional(),
  reason: z.string(),
  type: reviseTypeSchema,
});

// ─── Prompt presets (persisted) ───────────────────────────────────

interface PromptPreset {
  id: string;
  title: string;
  direction: string;
}

const [presetsStore, setPresetsStore] = makePersisted(
  createStore<{ items: PromptPreset[] }>({ items: [] }),
  { name: 'baekji-revise-user-direction-presets' },
);

const BUILTIN_PRESETS: PromptPreset[] = [
  {
    id: '_grammar',
    title: 'Grammar',
    direction: BUILTIN_USER_DIRECTION_GRAMMAR,
  },
  { id: '_critic', title: 'Critic', direction: BUILTIN_USER_DIRECTION_CRITIC },
];

// ─── Prompt builder ───────────────────────────────────────────────

function buildLineNumberedBlock(text: string, index: number): string {
  const lines = text.split('\n');
  const numbered = lines.map((line, i) => `${i + 1}\t${line}`).join('\n');
  return `\`\`\`markdown lined index=${index}\n${numbered}\n\`\`\``;
}

function buildPrompt(sheets: SheetData[], userDirection: string): string {
  const sheetBlocks = sheets
    .map((sh, i) => buildLineNumberedBlock(sh.text, i))
    .join('\n\n');
  return `
# Common Direction

${COMMON_DIRECTION()}

# Sheets (#=${sheetBlocks.length})

${sheetBlocks}

# User Direction

${userDirection}
`.trim();
}

function parseReviseItems(llmResponse: string): ParsedReviseItem[] {
  const match = llmResponse.match(/```jsonl\s*([\s\S]*?)```/);
  if (!match) return [];
  const lines = match[1]
    .trim()
    .split('\n')
    .filter((l) => l.trim());
  let idCounter = 0;
  return lines.map((line) => {
    try {
      const parsed = JSON.parse(line.trim());
      const validated = reviseItemSchema.parse(parsed);
      return { ...validated, _id: idCounter++, _status: 'pending' as const };
    } catch {
      return {
        target: line,
        reason: 'Parse error',
        type: 'comment' as const,
        _id: idCounter++,
        _status: 'pending' as const,
        _parseError: true,
      };
    }
  });
}

function itemsForLine(
  items: ParsedReviseItem[],
  sheetIndex: number,
  lineNumber: number,
): ParsedReviseItem[] {
  return items.filter(
    (item) =>
      item._status !== 'rejected' &&
      item.sheet === sheetIndex &&
      item.line === lineNumber,
  );
}

function itemsWithoutLocation(items: ParsedReviseItem[]): ParsedReviseItem[] {
  return items.filter(
    (item) =>
      item._status !== 'rejected' &&
      (item.sheet === undefined || item.line === undefined),
  );
}

const typeLabels = () => ({
  typo: s('revise.type_typo'),
  grammar: s('revise.type_grammar'),
  revise: s('revise.type_revise'),
  comment: s('revise.type_comment'),
});

// ─── LineWithHighlights ───────────────────────────────────────────

interface LineHighlightProps {
  text: string;
  items: ParsedReviseItem[];
  activeId: number | null;
  onClickItem: (id: number) => void;
}

const LineWithHighlights: Component<LineHighlightProps> = (props) => {
  const segments = () => {
    const text = props.text;
    const items = props.items;
    if (!items.length) return [{ text, item: null as ParsedReviseItem | null }];

    type Seg = { text: string; item: ParsedReviseItem | null };
    const segs: Seg[] = [];
    let pos = 0;

    const positioned = items
      .map((item) => ({ item, idx: text.indexOf(item.target, 0) }))
      .filter((x) => x.idx !== -1)
      .sort((a, b) => a.idx - b.idx);

    for (const { item, idx } of positioned) {
      if (idx < pos) continue;
      if (idx > pos) segs.push({ text: text.slice(pos, idx), item: null });
      segs.push({ text: item.target, item });
      pos = idx + item.target.length;
    }
    if (pos < text.length) segs.push({ text: text.slice(pos), item: null });
    return segs;
  };

  return (
    <>
      <For each={segments()}>
        {(seg) => (
          <Show when={seg.item} fallback={<>{seg.text}</>}>
            {(item) => (
              <span
                class={`revise-item revise-item--${item().type}${props.activeId === item()._id ? ' revise-item--active' : ''}`}
                onClick={() => props.onClickItem(item()._id)}
                title={item().reason}
              >
                {seg.text}
              </span>
            )}
          </Show>
        )}
      </For>
    </>
  );
};

// ─── ReviseTab ────────────────────────────────────────────────────

interface Props {
  sheets: QueriedSheet[];
}

const ReviseTab: Component<Props> = (props) => {
  const [loading, setLoading] = createSignal(false);
  const [sheets, setSheets] = createSignal<SheetData[]>([]);
  const [currentStep, setCurrentStep] = createSignal<1 | 2>(1);

  let directionTextareaRef!: HTMLTextAreaElement;
  let llmResponseRef!: HTMLTextAreaElement;

  const [selectedPresetId, setSelectedPresetId] = createSignal('');
  const [editingTitle, setEditingTitle] = createSignal('');
  const [userDirection, setUserDirection] = createSignal('');
  const [reviseItems, setReviseItems] = createSignal<ParsedReviseItem[]>([]);
  const [activeItemId, setActiveItemId] = createSignal<number | null>(null);

  const presets = createMemo(() => [...BUILTIN_PRESETS, ...presetsStore.items]);
  const activeItem = () => {
    const id = activeItemId();
    return id === null
      ? null
      : (reviseItems().find((it) => it._id === id) ?? null);
  };

  const pendingItems = createMemo(() =>
    reviseItems().filter((it) => it._status === 'pending'),
  );

  const navigatePrev = () => {
    const pending = pendingItems();
    if (!pending.length) return;
    const id = activeItemId();
    const idx = id === null ? 0 : pending.findIndex((it) => it._id === id);
    setActiveItemId(pending[(idx - 1 + pending.length) % pending.length]._id);
  };

  const navigateNext = () => {
    const pending = pendingItems();
    if (!pending.length) return;
    const id = activeItemId();
    const idx = id === null ? -1 : pending.findIndex((it) => it._id === id);
    setActiveItemId(pending[(idx + 1) % pending.length]._id);
  };

  const load = async () => {
    setLoading(true);
    try {
      const result = await Promise.all(
        props.sheets.map(async (qs) => ({
          id: qs.meta.id,
          label: qs.meta.tags[0] ?? qs.meta.id.slice(0, 8),
          tags: qs.meta.tags,
          text: await qs.getContent(),
        })),
      );
      setSheets(result);
    } catch {
      toast.error(s('revise.load_failed'));
    } finally {
      setLoading(false);
    }
  };

  // Only reload when sheets change and no review is in progress.
  // Mid-review reloads would shift sheet/line indices and corrupt highlights.
  createEffect(() => {
    void props.sheets;
    if (reviseItems().length === 0) load();
  });

  const savePreset = () => {
    const title = editingTitle().trim();
    const dir = directionTextareaRef?.value.trim() ?? '';
    if (!title) {
      toast.error(s('revise.preset_title_required'));
      return;
    }
    const existing = selectedPresetId();
    if (existing) {
      setPresetsStore('items', (items) =>
        items.map((it) =>
          it.id === existing ? { ...it, title, direction: dir } : it,
        ),
      );
      toast.success(s('revise.saved'));
    } else {
      const newId = crypto.randomUUID();
      setPresetsStore('items', (items) => [
        ...items,
        { id: newId, title, direction: dir },
      ]);
      setSelectedPresetId(newId);
      toast.success(s('revise.preset_added'));
    }
  };

  const deletePreset = () => {
    const id = selectedPresetId();
    if (!id) return;
    setPresetsStore('items', (items) => items.filter((it) => it.id !== id));
    setSelectedPresetId('');
    setEditingTitle('');
    setUserDirection('');
  };

  const selectPreset = (id: string) => {
    setSelectedPresetId(id);
    if (!id) {
      setEditingTitle('');
      setUserDirection('');
      return;
    }
    const preset = presets().find((it) => it.id === id);
    if (preset) {
      setEditingTitle(preset.title);
      setUserDirection(preset.direction);
    }
  };

  const handleCopy = async () => {
    const sh = sheets();
    if (!sh.length) {
      toast.error(s('revise.no_sheets'));
      return;
    }
    const dir = directionTextareaRef.value ?? '';
    const prompt = buildPrompt(sh, dir);
    try {
      await navigator.clipboard.writeText(prompt);
      toast.success(s('revise.copied_to_clipboard'));
      setCurrentStep(2);
    } catch {
      toast.error(s('revise.copy_failed'));
    }
  };

  const handleLoadRevise = () => {
    const resp = llmResponseRef.value ?? '';
    if (!resp.trim()) {
      toast.error(s('revise.input_llm_response'));
      return;
    }
    const items = parseReviseItems(resp);
    if (!items.length) {
      toast.error(s('revise.jsonl_not_found'));
      return;
    }
    setReviseItems(items);
    setActiveItemId(null);
    toast.success(s('revise.items_loaded', { count: items.length }));
  };

  const updateItemStatus = async (
    id: number,
    status: 'accepted' | 'rejected',
  ) => {
    const item = reviseItems().find((it) => it._id === id);
    if (!item) return;

    if (status === 'accepted') {
      const { sheet: sheetIndex, line: lineNum } = item;
      if (sheetIndex !== undefined && lineNum !== undefined) {
        const targetSheet = sheets()[sheetIndex];
        if (targetSheet) {
          const lines = targetSheet.text.split('\n');
          const lineIndex = lineNum - 1;
          const lineText = lines[lineIndex];
          if (lineText !== undefined && lineText.includes(item.target)) {
            lines[lineIndex] = lineText.replace(
              item.target,
              item.suggestion ?? '',
            );
            const newText = lines.join('\n');
            try {
              await replaceSheetContent(targetSheet.id, newText);
              invalidateSheetPreview();
              setSheets((prev) =>
                prev.map((s, idx) =>
                  idx === sheetIndex ? { ...s, text: newText } : s,
                ),
              );
              toast.success(s('revise.saved'));
            } catch {
              toast.error(s('revise.copy_failed'));
              return;
            }
          } else {
            toast.error(s('revise.copy_failed'));
            return;
          }
        }
      }
    }

    // Determine next pending item before updating status
    const currentPending = pendingItems();
    const currentIdx = currentPending.findIndex((it) => it._id === id);
    const nextPending = currentPending.filter((it) => it._id !== id);
    const nextId =
      nextPending.length > 0
        ? nextPending[Math.min(currentIdx, nextPending.length - 1)]._id
        : null;

    setReviseItems((prev) =>
      prev.map((it) => (it._id === id ? { ...it, _status: status } : it)),
    );
    setActiveItemId(nextId);
  };

  const unlocatedItems = () => itemsWithoutLocation(reviseItems());

  return (
    <div>
      <Show when={reviseItems().length > 0}>
        <div class="revise-popup-overlay">
          <div class="revise-popup">
            <div class="flex items-center gap-2">
              <span style="flex:1;font-size:var(--fs-sm)">
                {pendingItems().length} / {reviseItems().length}
              </span>
              <button
                class="btn-border btn-sm"
                disabled={!pendingItems().length}
                onClick={navigatePrev}
              >
                <TbOutlineArrowUp />
              </button>
              <button
                class="btn-border btn-sm"
                disabled={!pendingItems().length}
                onClick={navigateNext}
              >
                <TbOutlineArrowDown />
              </button>
            </div>
            <Show when={activeItem()}>
              {(item) => (
                <>
                  <div class={`revise-popup-type revise-item--${item().type}`}>
                    [{typeLabels()[item().type]}]
                  </div>
                  <div class="revise-popup-row">
                    <span class="revise-popup-label">
                      {s('revise.original')}
                    </span>
                    <span class="revise-popup-before">{item().target}</span>
                  </div>
                  <Show when={item().suggestion}>
                    <div class="revise-popup-row">
                      <span class="revise-popup-label">
                        {s('revise.correction')}
                      </span>
                      <span class="revise-popup-after">
                        {item().suggestion}
                      </span>
                    </div>
                  </Show>
                  <div class="revise-popup-reason">{item().reason}</div>
                  <div class="revise-popup-actions">
                    <button
                      class="btn-primary revise-popup-btn"
                      onClick={() => updateItemStatus(item()._id, 'accepted')}
                    >
                      <TbOutlineCheck /> {s('revise.accept')}
                    </button>
                    <button
                      class="btn-border revise-popup-btn"
                      onClick={() => updateItemStatus(item()._id, 'rejected')}
                    >
                      <TbOutlineX /> {s('revise.reject')}
                    </button>
                  </div>
                </>
              )}
            </Show>
          </div>
        </div>
      </Show>

      <div class="flex gap-2 my-4">
        <button
          class={currentStep() === 1 ? 'btn-primary' : 'ghost'}
          onClick={() => setCurrentStep(1)}
        >
          {s('revise.step1')}
        </button>
        <button
          class={currentStep() === 2 ? 'btn-primary' : 'ghost'}
          onClick={() => setCurrentStep(2)}
        >
          {s('revise.step2')}
        </button>
      </div>

      <Show when={currentStep() === 1}>
        <div class="revise-step-label">{s('revise.step1_label')}</div>
        <div class="revise-preset-row flex gap-2 items-center">
          <select
            value={selectedPresetId()}
            onChange={(e) => selectPreset(e.currentTarget.value)}
          >
            <option value="">{s('revise.preset_new')}</option>
            <For each={presets()}>
              {(preset) => <option value={preset.id}>{preset.title}</option>}
            </For>
          </select>
          <button
            class="btn-border"
            onClick={savePreset}
            title={s('common.save')}
          >
            <TbOutlinePlus />
          </button>
          <Show when={selectedPresetId()}>
            <button
              class="btn-border"
              onClick={deletePreset}
              title={s('common.delete')}
            >
              <TbOutlineTrash />
            </button>
          </Show>
        </div>
        <input
          type="text"
          class="revise-title-input"
          placeholder={s('revise.preset_title')}
          value={editingTitle()}
          onInput={(e) => setEditingTitle(e.currentTarget.value)}
        />
        <textarea
          ref={(r) => (directionTextareaRef = r)}
          class="revise-direction-textarea"
          placeholder={s('revise.direction_placeholder')}
          value={userDirection()}
          rows={4}
        />
        <div class="flex gap-2 mt-2">
          <button
            class="btn-primary"
            disabled={loading() || !sheets().length}
            onClick={handleCopy}
          >
            <TbOutlineCopy /> {s('revise.prompt_copy')}
          </button>
        </div>
      </Show>

      <Show when={currentStep() === 2}>
        <div class="revise-step-label">{s('revise.step2_label')}</div>
        <textarea
          ref={(r) => (llmResponseRef = r)}
          class="revise-direction-textarea"
          placeholder={s('revise.llm_response_placeholder')}
          rows={6}
        />
        <div class="flex gap-2 mt-2">
          <button class="btn-primary" onClick={handleLoadRevise}>
            <TbOutlineRefresh /> {s('revise.apply_revise')}
          </button>
        </div>
      </Show>

      <Show when={sheets().length > 0}>
        <hr class="revise-divider" />
        <Show when={unlocatedItems().length > 0}>
          <div class="revise-unlocated">
            <div class="revise-unlocated-title">
              {s('revise.unlocated_title')}
            </div>
            <For each={unlocatedItems()}>
              {(item) => (
                <span
                  class={`revise-item revise-item--${item.type}${activeItemId() === item._id ? ' revise-item--active' : ''}`}
                  onClick={() =>
                    setActiveItemId(
                      activeItemId() === item._id ? null : item._id,
                    )
                  }
                  title={item.reason}
                >
                  {item.target}
                </span>
              )}
            </For>
          </div>
        </Show>
        <div class="revise-content">
          <Index each={sheets()}>
            {(sheet, si) => (
              <div class="revise-sheet">
                <div class="revise-sheet-label">
                  [{si}] {sheet().label}
                </div>
                <div class="revise-sheet-body">
                  <For each={sheet().text.split('\n')}>
                    {(lineText, li) => {
                      const lineNum = li() + 1;
                      const lineItems = () =>
                        itemsForLine(reviseItems(), si, lineNum);
                      return (
                        <div class="revise-line">
                          <span class="revise-line-num">{lineNum}</span>
                          <span class="revise-line-content">
                            <LineWithHighlights
                              text={lineText}
                              items={lineItems()}
                              activeId={activeItemId()}
                              onClickItem={(id) =>
                                setActiveItemId(
                                  activeItemId() === id ? null : id,
                                )
                              }
                            />
                          </span>
                        </div>
                      );
                    }}
                  </For>
                </div>
              </div>
            )}
          </Index>
        </div>
      </Show>

      <Show when={loading()}>
        <p class="hint">{s('revise.loading')}</p>
      </Show>
    </div>
  );
};

export default ReviseTab;
