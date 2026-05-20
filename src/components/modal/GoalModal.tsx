import type { Component } from 'solid-js';
import { createSignal, onMount, Show } from 'solid-js';
import {
  sheetsStore,
  sheetStatsStore,
  startGoal,
  clearGoal,
  achieveGoal,
} from '../../state/sheet_list';
import { closeGoalModal, showConfirm } from '../../state/modal';
import { s } from '../../lib/i18n';

interface Props {
  sheetId: string;
}

const GoalModal: Component<Props> = (props) => {
  const goal = () => sheetsStore[props.sheetId]?.goal;
  const writingSeconds = () =>
    sheetStatsStore[props.sheetId]?.writingSeconds ?? 0;

  const [draftChars, setDraftChars] = createSignal(
    String(goal()?.goalChars ?? ''),
  );
  const [draftDue, setDraftDue] = createSignal(
    goal()?.dueAt?.slice(0, 10) ?? '',
  );

  let inputRef: HTMLInputElement | undefined;
  onMount(() => inputRef?.focus());

  const handleConfirm = () => {
    const chars = parseInt(draftChars(), 10);
    if (isNaN(chars) || chars <= 0) return;
    startGoal(props.sheetId, chars, draftDue() || undefined);
    closeGoalModal();
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') handleConfirm();
    if (e.key === 'Escape') closeGoalModal();
  };

  return (
    <>
      <h3>{s('goal.set_goal')}</h3>

      <Show when={goal() && !goal()?.achievedAt}>
        <p class="hint">{s('goal.delete_confirm')}</p>
      </Show>

      <div class="modal-form-row">
        <label>{s('goal.goal_chars')}</label>
        <input
          ref={(el) => (inputRef = el)}
          type="number"
          min="1"
          value={draftChars()}
          onInput={(e) => setDraftChars(e.currentTarget.value)}
          onKeyDown={handleKeyDown}
          placeholder="3000"
          style={{ width: '100%' }}
        />
      </div>

      <div class="modal-form-row">
        <label>{s('goal.due_date')}</label>
        <input
          type="date"
          value={draftDue()}
          onInput={(e) => setDraftDue(e.currentTarget.value)}
          onKeyDown={handleKeyDown}
          style={{ width: '100%' }}
        />
      </div>

      <p class="hint" style={{ 'font-size': 'var(--fs-xs)', opacity: '0.6' }}>
        {s('goal.writing_time')}: {Math.floor(writingSeconds() / 60)}m{' '}
        {Math.floor(writingSeconds() % 60)}s
      </p>

      <div class="modal-actions">
        <Show when={goal() && !goal()?.achievedAt}>
          <button
            class="btn-border"
            onClick={async () => {
              const ok = await showConfirm(
                s('goal.achieve_manual'),
                s('goal.achieve_confirm'),
              );
              if (ok) {
                achieveGoal(props.sheetId);
                closeGoalModal();
              }
            }}
          >
            {s('goal.achieve_manual')}
          </button>
        </Show>
        <Show when={goal()}>
          <button
            class="btn-border"
            style={{ color: 'var(--danger, #e00)' }}
            onClick={async () => {
              const ok = await showConfirm(
                s('goal.edit_goal'),
                s('goal.delete_confirm'),
              );
              if (ok) {
                clearGoal(props.sheetId);
                closeGoalModal();
              }
            }}
          >
            {s('common.delete')}
          </button>
        </Show>
        <span style={{ flex: '1' }} />
        <button class="btn-border" onClick={closeGoalModal}>
          {s('common.cancel')}
        </button>
        <button
          class="btn-primary"
          onClick={handleConfirm}
          disabled={!draftChars() || parseInt(draftChars(), 10) <= 0}
        >
          {s('common.save')}
        </button>
      </div>
    </>
  );
};

export default GoalModal;
