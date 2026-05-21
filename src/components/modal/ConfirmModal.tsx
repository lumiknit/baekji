import type { Component } from 'solid-js';
import { onMount } from 'solid-js';
import { s } from '../../lib/i18n/index.ts';
import { closeModal } from '../../state/modal.ts';

interface Props {
  title: string;
  message: string;
}

const ConfirmModal: Component<Props> = (props) => {
  let confirmRef: HTMLButtonElement | undefined;
  onMount(() => confirmRef?.focus());

  return (
    <>
      <h3>{props.title}</h3>
      <p>{props.message}</p>
      <div class="modal-actions">
        <button class="btn-secondary" onClick={() => closeModal(false)}>
          {s('common.cancel')}
        </button>
        <button
          ref={(el) => {
            confirmRef = el;
          }}
          class="btn-primary"
          onClick={() => closeModal(true)}
        >
          {s('common.confirm')}
        </button>
      </div>
    </>
  );
};

export default ConfirmModal;
