import type { Component } from 'solid-js';
import { createMemo, Match, Show, Switch } from 'solid-js';
import {
  TbOutlineRefresh,
  TbOutlinePencil,
  TbOutlineChevronUp,
} from 'solid-icons/tb';
import {
  sheetsStore,
  sheetStatsStore,
  resetSheetWritingSeconds,
} from '../../state/sheet_list';
import { openGoalModal, showConfirm } from '../../state/modal';
import { s } from '../../lib/i18n';
import { formatDuration } from '../../lib/format';
import { setSettings } from '../../state/settings';

interface Props {
  sheetId: string;
  charCount: () => number;
}

const EditorGoalOverlay: Component<Props> = (props) => {
  const goal = () => sheetsStore[props.sheetId]?.goal;
  const stats = () => sheetStatsStore[props.sheetId];

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
    const diff = Math.ceil((due.getTime() - Date.now()) / 86_400_000);
    const mmdd = `${due.getMonth() + 1}/${due.getDate()}`;
    if (diff > 0) return `D-${diff} (${mmdd})`;
    if (diff === 0) return `D-Day (${mmdd})`;
    return `D+${-diff} (${mmdd})`;
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
            <span
              class="goal-stat"
              style={{ opacity: '1', 'font-weight': '600' }}
            >
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
            class="goal-action-btn"
            title={s('goal.edit_goal')}
            onClick={() => openGoalModal(props.sheetId)}
          >
            <TbOutlinePencil size={12} />
          </button>
          <button
            class="goal-action-btn"
            title={s('goal.reset_time')}
            onClick={handleResetTime}
          >
            <TbOutlineRefresh size={12} />
          </button>
        </Show>
        <button
          class="goal-action-btn"
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
