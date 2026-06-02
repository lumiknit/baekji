import type { Component } from 'solid-js';
import { createSignal, createEffect, For, Show, Index } from 'solid-js';
import { createStore } from 'solid-js/store';
import { makePersisted } from '@solid-primitives/storage';
import { useParams, useNavigate, useSearchParams } from '@solidjs/router';
import {
  TbOutlineArrowLeft,
  TbOutlineCopy,
  TbOutlinePlus,
  TbOutlineTrash,
  TbOutlineRefresh,
  TbOutlineCheck,
  TbOutlineX,
} from 'solid-icons/tb';
import { activeProjectLabel, openProject } from '../state/workspace_v3.ts';
import {
  liveSheets,
  loadSheetsForProject,
  loadSheetsByQuery,
  type SheetData,
} from '../state/sheet_list.ts';
import toast from 'solid-toast';

// ─── Types ────────────────────────────────────────────────────────

type ReviseType = 'typo' | 'grammar' | 'revise' | 'comment';

interface ReviseItem {
  sheet?: number;
  line?: number;
  target: string;
  revised?: string;
  reason: string;
  type: ReviseType;
}

interface ParsedReviseItem extends ReviseItem {
  _id: number;
  _status: 'pending' | 'accepted' | 'rejected';
  _parseError?: boolean;
}

// ─── Prompt presets (persisted) ───────────────────────────────────

interface PromptPreset {
  id: string;
  title: string;
  direction: string;
}

const [presetsStore, setPresetsStore] = makePersisted(
  createStore<{ items: PromptPreset[] }>({ items: [] }),
  { name: 'baekji-revise-presets' },
);

// ─── Common direction template ────────────────────────────────────

const COMMON_DIRECTION = `You are a writing analyst. Carefully read the provided text and follow the user's direction below.
After your analysis, output ALL revision suggestions as JSONL inside a \`\`\`jsonl code block.
Each line must be a valid JSON object with these fields:
  sheet?: number       (0-based sheet index, if applicable)
  line?: number        (1-based line number, if applicable)
  target: string       (exact text to revise or comment on)
  revised?: string     (corrected text; omit for type "comment")
  reason: string       (brief explanation)
  type: "typo" | "grammar" | "revise" | "comment"

Rules:
- One JSON object per line, no trailing commas.
- "typo": spelling mistake. "grammar": grammatical error. "revise": content/expression improvement. "comment": general feedback (no revised field needed).
- Be thorough. Include typos, grammar errors, and improvement suggestions.`;

// ─── Build prompt text ────────────────────────────────────────────

function buildLineNumberedBlock(text: string, index: number): string {
  const lines = text.split('\n');
  const numbered = lines.map((line, i) => `${i + 1}\t${line}`).join('\n');
  return `\`\`\`markdown lined index=${index}\n${numbered}\n\`\`\``;
}

function buildPrompt(sheets: SheetData[], userDirection: string): string {
  const sheetBlocks = sheets
    .map((sh, i) => buildLineNumberedBlock(sh.text, i))
    .join('\n\n');

  return `<COMMON_DIRECTION>
${COMMON_DIRECTION}
</COMMON_DIRECTION>

<SHEET_CONTENTS>
${sheetBlocks}
</SHEET_CONTENTS>

<USER_DIRECTION>
${userDirection}
</USER_DIRECTION>`;
}

// ─── Parse JSONL from LLM response ───────────────────────────────

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
      const obj = JSON.parse(line.trim()) as ReviseItem;
      return { ...obj, _id: idCounter++, _status: 'pending' as const };
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

// ─── Highlight revise items in content ───────────────────────────

// Find revise items matching a specific line
function itemsForLine(
  items: ParsedReviseItem[],
  sheetIndex: number,
  lineNumber: number,
): ParsedReviseItem[] {
  return items.filter((item) => {
    if (item._status === 'rejected') return false;
    if (item.sheet !== undefined && item.line !== undefined) {
      return item.sheet === sheetIndex && item.line === lineNumber;
    }
    return false;
  });
}

// Items that have no precise location — match by target string search
function itemsWithoutLocation(items: ParsedReviseItem[]): ParsedReviseItem[] {
  return items.filter(
    (item) =>
      item._status !== 'rejected' &&
      (item.sheet === undefined || item.line === undefined),
  );
}

// ─── Sub-components ───────────────────────────────────────────────

const TYPE_COLORS: Record<ReviseType, string> = {
  typo: 'var(--color-danger, #e74c3c)',
  grammar: 'var(--color-warn, #e67e22)',
  revise: 'var(--color-accent, #3498db)',
  comment: 'var(--color-fg-dim, #888)',
};

const TYPE_LABELS: Record<ReviseType, string> = {
  typo: '오타',
  grammar: '문법',
  revise: '개선',
  comment: '의견',
};

interface PopupProps {
  item: ParsedReviseItem;
  onAccept: () => void;
  onReject: () => void;
}

const RevisePopup: Component<PopupProps> = (props) => {
  return (
    <div class="revise-popup">
      <div
        class="revise-popup-type"
        style={{ color: TYPE_COLORS[props.item.type] }}
      >
        [{TYPE_LABELS[props.item.type]}]
      </div>
      <div class="revise-popup-row">
        <span class="revise-popup-label">원문</span>
        <span class="revise-popup-before">{props.item.target}</span>
      </div>
      <Show when={props.item.revised}>
        <div class="revise-popup-row">
          <span class="revise-popup-label">수정</span>
          <span class="revise-popup-after">{props.item.revised}</span>
        </div>
      </Show>
      <div class="revise-popup-reason">{props.item.reason}</div>
      <div class="revise-popup-actions">
        <button class="btn-primary revise-popup-btn" onClick={props.onAccept}>
          <TbOutlineCheck /> 적용
        </button>
        <button class="btn-border revise-popup-btn" onClick={props.onReject}>
          <TbOutlineX /> 무시
        </button>
      </div>
    </div>
  );
};

// ─── Main Page ────────────────────────────────────────────────────

const RevisePage: Component = () => {
  const navigate = useNavigate();
  const params = useParams();
  const [searchParams] = useSearchParams();

  const query = () => (searchParams.q as string | undefined) ?? '';
  const sheetIds = () => {
    const val = searchParams.sheetId;
    if (!val) return [] as string[];
    return Array.isArray(val) ? val : [val];
  };

  const [loading, setLoading] = createSignal(false);
  const [sheets, setSheets] = createSignal<SheetData[]>([]);

  // Preset management
  const [selectedPresetId, setSelectedPresetId] = createSignal<string>('');
  const [editingTitle, setEditingTitle] = createSignal('');
  const [userDirection, setUserDirection] = createSignal('');

  // LLM response
  const [llmResponse, setLlmResponse] = createSignal('');
  const [reviseItems, setReviseItems] = createSignal<ParsedReviseItem[]>([]);
  const [activeItemId, setActiveItemId] = createSignal<number | null>(null);

  const activeItem = () => {
    const id = activeItemId();
    if (id === null) return null;
    return reviseItems().find((it) => it._id === id) ?? null;
  };

  // Load project and sheets
  const load = async () => {
    setLoading(true);
    try {
      await openProject(params.pjId!);
      await loadSheetsForProject(params.pjId!);
      const result = await loadSheetsByQuery({
        sheetIds: sheetIds(),
        query: query(),
      });
      setSheets(result);
    } catch {
      toast.error('불러오기 실패');
    } finally {
      setLoading(false);
    }
  };

  createEffect(() => {
    if (params.pjId) load();
  });

  // Preset helpers
  const savePreset = () => {
    const title = editingTitle().trim();
    const dir = userDirection().trim();
    if (!title) {
      toast.error('프리셋 제목을 입력해주세요.');
      return;
    }
    const existing = selectedPresetId();
    if (existing) {
      setPresetsStore('items', (items) =>
        items.map((it) =>
          it.id === existing ? { ...it, title, direction: dir } : it,
        ),
      );
      toast.success('저장됨');
    } else {
      const newId = crypto.randomUUID();
      setPresetsStore('items', (items) => [
        ...items,
        { id: newId, title, direction: dir },
      ]);
      setSelectedPresetId(newId);
      toast.success('프리셋 추가됨');
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
    const preset = presetsStore.items.find((it) => it.id === id);
    if (preset) {
      setEditingTitle(preset.title);
      setUserDirection(preset.direction);
    }
  };

  // Copy prompt to clipboard
  const handleCopy = async () => {
    const sh = sheets();
    if (!sh.length) {
      toast.error('불러올 시트가 없습니다.');
      return;
    }
    const prompt = buildPrompt(sh, userDirection());
    try {
      await navigator.clipboard.writeText(prompt);
      toast.success('클립보드에 복사됨');
    } catch {
      toast.error('복사 실패');
    }
  };

  // Load revise items from LLM response
  const handleLoadRevise = () => {
    const resp = llmResponse();
    if (!resp.trim()) {
      toast.error('LLM 응답을 입력해주세요.');
      return;
    }
    const items = parseReviseItems(resp);
    if (!items.length) {
      toast.error('```jsonl 블록을 찾을 수 없습니다.');
      return;
    }
    setReviseItems(items);
    setActiveItemId(null);
    toast.success(`${items.length}개의 수정 항목 로드됨`);
  };

  // Accept/reject revise item
  const updateItemStatus = (id: number, status: 'accepted' | 'rejected') => {
    setReviseItems((prev) =>
      prev.map((it) => (it._id === id ? { ...it, _status: status } : it)),
    );
    setActiveItemId(null);
  };

  // Build re-prompt for items that failed (rejected + parse errors)
  const buildRetryPrompt = async () => {
    const failed = reviseItems().filter(
      (it) => it._status === 'rejected' || it._parseError,
    );
    if (!failed.length) {
      toast.error('재전송할 항목이 없습니다.');
      return;
    }
    const lines = failed.map((it) => {
      if (it._parseError) return `- 파싱 실패: ${it.target}`;
      return `- [${TYPE_LABELS[it.type]}] "${it.target}" → 거절됨 (${it.reason})`;
    });
    const msg = `아래 항목들이 부적절하거나 잘못 파싱되었습니다. 수정해서 다시 JSONL로 출력해주세요:\n\n${lines.join('\n')}`;
    try {
      await navigator.clipboard.writeText(msg);
      toast.success('재전송 메시지가 클립보드에 복사됨');
    } catch {
      toast.error('복사 실패');
    }
  };

  const handleBack = () => {
    const ids = sheetIds();
    const q = query();
    if (ids.length === 1) {
      navigate(`/sheets/${ids[0]}`);
    } else {
      navigate(
        `/project/${params.pjId}${q ? `?q=${encodeURIComponent(q)}` : ''}`,
      );
    }
  };

  const unlocatedItems = () => itemsWithoutLocation(reviseItems());

  return (
    <div class="page-body">
      {/* Sticky popup for active item */}
      <Show when={activeItem()}>
        {(item) => (
          <div class="revise-popup-overlay">
            <RevisePopup
              item={item()}
              onAccept={() => updateItemStatus(item()._id, 'accepted')}
              onReject={() => updateItemStatus(item()._id, 'rejected')}
            />
          </div>
        )}
      </Show>

      {/* Header */}
      <div class="page-header flex items-center gap-4">
        <button class="sb-icon-btn" onClick={handleBack}>
          <div class="btn-pad">
            <TbOutlineArrowLeft />
          </div>
        </button>
        <h1 class="page-header-title">{activeProjectLabel()} — 교정</h1>
      </div>

      {/* Filter info */}
      <Show when={!loading()}>
        <div class="page-stats">
          <Show when={sheetIds().length > 0}>
            <span>선택된 시트 {sheetIds().length}개</span>
          </Show>
          <Show when={sheetIds().length === 0 && query()}>
            <span>
              쿼리 "{query()}" — {sheets().length} / {liveSheets().length}개
            </span>
          </Show>
          <Show when={sheetIds().length === 0 && !query()}>
            <span>전체 {sheets().length}개 시트</span>
          </Show>
        </div>
      </Show>

      {/* ── Step 1: Prompt 설정 ── */}
      <div class="revise-step-label">Step 1. 프롬프트 설정 및 복사</div>

      <div class="revise-preset-row flex gap-2 items-center">
        <select
          class="pj-format-select"
          value={selectedPresetId()}
          onChange={(e) => selectPreset(e.currentTarget.value)}
        >
          <option value="">-- 새 프리셋 --</option>
          <For each={presetsStore.items}>
            {(preset) => <option value={preset.id}>{preset.title}</option>}
          </For>
        </select>
        <button class="btn-border" onClick={savePreset} title="저장">
          <TbOutlinePlus />
        </button>
        <Show when={selectedPresetId()}>
          <button class="btn-border" onClick={deletePreset} title="삭제">
            <TbOutlineTrash />
          </button>
        </Show>
      </div>

      <input
        class="revise-title-input"
        placeholder="프리셋 제목"
        value={editingTitle()}
        onInput={(e) => setEditingTitle(e.currentTarget.value)}
      />

      <textarea
        class="revise-direction-textarea"
        placeholder="교정 방향을 입력하세요 (예: 여러 사람이 평가하는 것처럼 해달라, 맞춤법을 검사해달라)"
        value={userDirection()}
        onInput={(e) => setUserDirection(e.currentTarget.value)}
        rows={4}
      />

      <div class="flex gap-2 mt-2">
        <button
          class="btn-primary"
          disabled={loading() || !sheets().length}
          onClick={handleCopy}
        >
          <TbOutlineCopy /> 프롬프트 복사
        </button>
      </div>

      {/* ── Step 2: LLM 응답 입력 ── */}
      <div class="revise-step-label">Step 2. LLM 응답 붙여넣기</div>

      <textarea
        class="revise-direction-textarea"
        placeholder="LLM 응답 전체를 여기에 붙여넣으세요 (```jsonl 블록 포함)"
        value={llmResponse()}
        onInput={(e) => setLlmResponse(e.currentTarget.value)}
        rows={6}
      />

      <div class="flex gap-2 mt-2">
        <button
          class="btn-primary"
          disabled={!llmResponse().trim()}
          onClick={handleLoadRevise}
        >
          <TbOutlineRefresh /> 교정 적용
        </button>
        <Show
          when={reviseItems().some(
            (it) => it._status === 'rejected' || it._parseError,
          )}
        >
          <button class="btn-border" onClick={buildRetryPrompt}>
            <TbOutlineCopy /> 거절 항목 재전송
          </button>
        </Show>
      </div>

      {/* ── Content ── */}
      <Show when={sheets().length > 0}>
        <hr class="revise-divider" />

        {/* Unlocated items (no sheet/line) */}
        <Show when={unlocatedItems().length > 0}>
          <div class="revise-unlocated">
            <div class="revise-unlocated-title">위치 미지정 항목</div>
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

        {/* Sheet contents with inline highlights */}
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
        <p class="hint">불러오는 중...</p>
      </Show>
    </div>
  );
};

// ─── Line with inline highlights ─────────────────────────────────

interface LineHighlightProps {
  text: string;
  items: ParsedReviseItem[];
  activeId: number | null;
  onClickItem: (id: number) => void;
}

const LineWithHighlights: Component<LineHighlightProps> = (props) => {
  // Build segments: split text by each item's target occurrence
  const segments = () => {
    const text = props.text;
    const items = props.items;
    if (!items.length) return [{ text, item: null as ParsedReviseItem | null }];

    type Seg = { text: string; item: ParsedReviseItem | null };
    const segs: Seg[] = [];
    let pos = 0;

    // Sort items by first occurrence of their target in the text
    const positioned = items
      .map((item) => ({ item, idx: text.indexOf(item.target, 0) }))
      .filter((x) => x.idx !== -1)
      .sort((a, b) => a.idx - b.idx);

    for (const { item, idx } of positioned) {
      if (idx < pos) continue; // already consumed
      if (idx > pos) {
        segs.push({ text: text.slice(pos, idx), item: null });
      }
      segs.push({ text: item.target, item });
      pos = idx + item.target.length;
    }
    if (pos < text.length) {
      segs.push({ text: text.slice(pos), item: null });
    }
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
                style={{ 'border-bottom-color': TYPE_COLORS[item().type] }}
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

export default RevisePage;
