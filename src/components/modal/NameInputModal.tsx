import type { Component } from 'solid-js';
import { createSignal, onMount, Show } from 'solid-js';
import { closeModal } from '../../state/modal';
import { s } from '../../lib/i18n';

interface Props {
  title: string;
  message: string;
  defaultValue?: string;
}

const NameInputModal: Component<Props> = (props) => {
  const [value, setValue] = createSignal(props.defaultValue || '');
  let inputRef: HTMLInputElement | undefined;

  onMount(() => {
    inputRef?.focus();
    inputRef?.select();
  });

  const handleConfirm = () => {
    if (value().trim()) closeModal(value().trim());
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') handleConfirm();
    if (e.key === 'Escape') closeModal(null);
  };

  return (
    <>
      <h3>{props.title}</h3>
      <p>{props.message}</p>
      <input
        ref={inputRef}
        class="modal-input"
        type="text"
        value={value()}
        onInput={(e) => setValue(e.currentTarget.value)}
        onKeyDown={handleKeyDown}
      />
      <Show when={value().startsWith('.')}>
        <p class="hint">{s('modal.hidden_hint')}</p>
      </Show>
      <div class="modal-actions">
        <button class="btn-secondary" onClick={() => closeModal(null)}>
          {s('common.cancel')}
        </button>
        <button class="btn-primary" onClick={handleConfirm}>
          {s('common.ok')}
        </button>
      </div>
    </>
  );
};

export default NameInputModal;
