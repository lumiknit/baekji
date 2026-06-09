import type { Component } from 'solid-js';
import { createMemo, createSignal, onMount, Show } from 'solid-js';
import {
  sheetsStore,
  sheetStatsStore,
  startGoal,
  clearGoal,
  achieveGoal,
} from '../../state/sheet_list.ts';
import { closeGoalModal, showConfirm } from '../../state/modal.ts';
import { s } from '../../lib/i18n/index.ts';
import { settings, setSettings } from '../../state/settings.ts';

interface Props {
  sheetId: string;
}

const toDatetimeLocal = (iso: string) => iso.slice(0, 16);

const GoalModal: Component<Props> = (props) => {
  const goal = () => sheetsStore[props.sheetId]?.goal;
  const writingSeconds = () =>
    sheetStatsStore[props.sheetId]?.writingSeconds ?? 0;

  const [draftChars, setDraftChars] = createSignal(
    String(goal()?.goalChars ?? ''),
  );

  // Due mode: absolute or relative
  const [dueMode, setDueMode] = createSignal<'absolute' | 'relative'>(
    settings.goalDueMode ?? 'relative',
  );

  // Absolute: datetime-local string
  const [draftAbsolute, setDraftAbsolute] = createSignal(
    goal()?.dueAt ? toDatetimeLocal(goal()!.dueAt!) : '',
  );

  // Relative: duration value + unit
  const [draftUnit, setDraftUnit] = createSignal<'minutes' | 'hours'>(
    settings.goalDueDurationUnit ?? 'minutes',
  );
  const [draftDuration, setDraftDuration] = createSignal(
    String(settings.goalDueDurationMinutes ?? 120),
  );

  const draftTotalMinutes = createMemo(() => {
    const v = parseFloat(draftDuration());
    if (isNaN(v) || v <= 0) return 0;
    return draftUnit() === 'hours' ? Math.round(v * 60) : Math.round(v);
  });

  // Preview of the other mode
  const absolutePreview = createMemo(() => {
    const mins = draftTotalMinutes();
    if (mins <= 0) return '';
    const d = new Date(Date.now() + mins * 60_000);
    return toDatetimeLocal(d.toISOString());
  });

  const relativePreview = createMemo(() => {
    const abs = draftAbsolute();
    if (!abs) return '';
    const diffMs = new Date(abs).getTime() - Date.now();
    if (diffMs <= 0) return s('goal.due_past');
    const totalMins = Math.round(diffMs / 60_000);
    const h = Math.floor(totalMins / 60);
    const m = totalMins % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  });

  let inputRef: HTMLInputElement | undefined;
  onMount(() => inputRef?.focus());

  const handleConfirm = () => {
    const chars = parseInt(draftChars(), 10);
    if (isNaN(chars) || chars <= 0) return;

    // Resolve dueAt as absolute ISO string at confirm time
    let dueAt: string | undefined;
    if (dueMode() === 'absolute') {
      dueAt = draftAbsolute()
        ? new Date(draftAbsolute()).toISOString()
        : undefined;
    } else {
      const mins = draftTotalMinutes();
      dueAt =
        mins > 0
          ? new Date(Date.now() + mins * 60_000).toISOString()
          : undefined;
      if (mins > 0) {
        setSettings('goalDueDurationMinutes', mins);
        setSettings('goalDueDurationUnit', draftUnit());
      }
    }
    setSettings('goalDueMode', dueMode());

    startGoal(props.sheetId, chars, dueAt);
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
          ref={(el) => {
            inputRef = el;
          }}
          type="number"
          min="100"
          step="100"
          value={draftChars()}
          onChange={(e) => setDraftChars(e.currentTarget.value)}
          onKeyDown={handleKeyDown}
          placeholder="3000"
        />
      </div>

      <div class="modal-due-mode-row">
        <label class="modal-due-mode-label">{s('goal.due_date')}</label>
        <div class="modal-due-mode-options">
          <label class="modal-due-mode-option">
            <input
              type="radio"
              name="due-mode"
              checked={dueMode() === 'relative'}
              onChange={() => setDueMode('relative')}
            />
            {s('goal.due_relative')}
          </label>
          <label class="modal-due-mode-option">
            <input
              type="radio"
              name="due-mode"
              checked={dueMode() === 'absolute'}
              onChange={() => setDueMode('absolute')}
            />
            {s('goal.due_absolute')}
          </label>
        </div>
      </div>

      <Show when={dueMode() === 'relative'}>
        <div class="modal-form-row">
          <label>{s('goal.due_duration')}</label>
          <div class="flex gap-1">
            <input
              type="number"
              min="0.5"
              step="0.5"
              value={draftDuration()}
              onChange={(e) => setDraftDuration(e.currentTarget.value)}
              onKeyDown={handleKeyDown}
              placeholder="2"
              class="flex-1"
            />
            <select
              value={draftUnit()}
              onChange={(e) =>
                setDraftUnit(e.currentTarget.value as 'minutes' | 'hours')
              }
            >
              <option value="minutes">{s('goal.unit_minutes')}</option>
              <option value="hours">{s('goal.unit_hours')}</option>
            </select>
          </div>
        </div>
        <Show when={absolutePreview()}>
          <p class="hint--preview">→ {absolutePreview()}</p>
        </Show>
      </Show>

      <Show when={dueMode() === 'absolute'}>
        <div class="modal-form-row">
          <input
            type="datetime-local"
            value={draftAbsolute()}
            onChange={(e) => setDraftAbsolute(e.currentTarget.value)}
            onKeyDown={handleKeyDown}
          />
        </div>
        <Show when={relativePreview()}>
          <p class="hint--preview">→ {relativePreview()}</p>
        </Show>
      </Show>

      <p class="hint--preview">
        {s('goal.writing_time')}: {Math.floor(writingSeconds() / 60)}m{' '}
        {Math.floor(writingSeconds() % 60)}s
      </p>

      <div class="modal-actions">
        <Show when={goal() && !goal()?.achievedAt}>
          <button
            type="button"
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
            type="button"
            class="btn-border btn-danger"
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
        <span class="flex-1" />
        <button type="button" class="btn-border" onClick={closeGoalModal}>
          {s('common.cancel')}
        </button>
        <button
          type="button"
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
