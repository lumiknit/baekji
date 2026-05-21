import type { Component } from 'solid-js';
import {
  createEffect,
  createMemo,
  createSignal,
  Match,
  onCleanup,
  Show,
  Switch,
} from 'solid-js';
import {
  TbOutlineRefresh,
  TbOutlinePencil,
  TbOutlineChevronUp,
} from 'solid-icons/tb';
import {
  sheetsStore,
  sheetStatsStore,
  resetSheetWritingSeconds,
} from '../../state/sheet_list.ts';
import { openGoalModal, showConfirm } from '../../state/modal.ts';
import { s } from '../../lib/i18n/index.ts';
import { formatDuration } from '../../lib/format.ts';
import { setSettings } from '../../state/settings.ts';

interface Props {
  sheetId: string;
  charCount: () => number;
}

const EditorGoalOverlay: Component<Props> = (props) => {
  const goal = () => sheetsStore[props.sheetId]?.goal;
  const stats = () => sheetStatsStore[props.sheetId];

  const [now, setNow] = createSignal(Date.now());
  createEffect(() => {
    if (!goal()?.dueAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    onCleanup(() => clearInterval(id));
  });

  const writingSeconds = () => stats()?.writingSeconds ?? 0;

  const goalWritingSeconds = createMemo(() => {
    const g = goal();
    if (!g) return writingSeconds();
    return Math.max(0, writingSeconds() - g.startedWritingSeconds);
  });

  const charsPerHour = createMemo(() => {
    const ws = goalWritingSeconds();
    if (ws <= 0) return 0;
    return Math.round((props.charCount() / ws) * 3600);
  });

  const progress = createMemo(() => {
    const g = goal();
    if (!g) return 0;
    return Math.min(1, props.charCount() / g.goalChars);
  });

  const dueDateLabel = createMemo(() => {
    const dueAt = goal()?.dueAt;
    if (!dueAt) return null;
    const due = new Date(dueAt);
    const diffMs = due.getTime() - now();
    const absDiffMs = Math.abs(diffMs);
    const past = diffMs < 0;
    const sign = past ? '+' : '-';

    if (absDiffMs < 86_400_000) {
      const totalSec = Math.ceil(absDiffMs / 1000);
      const h = Math.floor(totalSec / 3600);
      const m = Math.floor((totalSec % 3600) / 60);
      const sec = totalSec % 60;
      const hms =
        h > 0
          ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
          : `${m}:${String(sec).padStart(2, '0')}`;
      return past ? `+${hms}` : hms;
    }
    const days = Math.ceil(absDiffMs / 86_400_000);
    const mmdd = `${due.getMonth() + 1}/${due.getDate()}`;
    return `D${sign}${days} (${mmdd})`;
  });

  const handleResetTime = async () => {
    const ok = await showConfirm(
      s('goal.reset_time'),
      s('goal.reset_time_confirm'),
    );
    if (ok) resetSheetWritingSeconds(props.sheetId);
  };

  return (
    <div
      class="goal-overlay"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div class="goal-header">
        <span class="goal-title">{s('goal.title')}</span>
        <Switch>
          <Match when={goal()?.achievedAt}>
            <span class="goal-achieved-badge">✓</span>
          </Match>
          <Match when>
            <span class="goal-stat goal-stat--highlight">
              {Math.round(progress() * 100)}%
            </span>
          </Match>
        </Switch>
      </div>

      <Show when={goal()}>
        {(g) => (
          <>
            <progress class="goal-progress" value={progress()} max={1} />

            <div class="goal-stat">
              {props.charCount().toLocaleString()} /{' '}
              {s('editor.chars', { count: g().goalChars.toLocaleString() })}
            </div>

            <Switch>
              <Match when={g().achievedAt}>
                <div class="goal-stat goal-stat--achieved">
                  {new Date(g().achievedAt!).toLocaleDateString()}{' '}
                  {s('goal.achieved')}
                </div>
              </Match>
              <Match when>
                <Show when={g().dueAt}>
                  <div class="goal-stat goal-stat--due">{dueDateLabel()}</div>
                </Show>
              </Match>
            </Switch>
          </>
        )}
      </Show>

      <Show when={!goal()}>
        <button
          class="goal-set-btn"
          onClick={() => openGoalModal(props.sheetId)}
        >
          + {s('goal.set_goal')}
        </button>
      </Show>

      <div class="goal-stat">
        {s('goal.writing_time')}: {formatDuration(goalWritingSeconds())}
      </div>

      <Show when={charsPerHour() > 0}>
        <div class="goal-stat">
          {s('editor.chars', { count: charsPerHour().toLocaleString() })}/h
        </div>
      </Show>

      <div class="goal-actions">
        <Show when={goal()}>
          <button
            class="btn-sm"
            title={s('goal.edit_goal')}
            onClick={() => openGoalModal(props.sheetId)}
          >
            <TbOutlinePencil size={12} />
          </button>
          <button
            class="btn-sm"
            title={s('goal.reset_time')}
            onClick={handleResetTime}
          >
            <TbOutlineRefresh size={12} />
          </button>
        </Show>
        <button
          class="btn-sm"
          title={s('goal.collapse')}
          onClick={() => setSettings('showGoalOverlay', false)}
        >
          <TbOutlineChevronUp size={12} />
        </button>
      </div>
    </div>
  );
};

export default EditorGoalOverlay;
