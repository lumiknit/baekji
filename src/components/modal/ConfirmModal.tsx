import type { Component } from 'solid-js';
import { s } from '../../lib/i18n';
import { closeModal } from '../../state/modal';

interface Props {
  title: string;
  message: string;
}

const ConfirmModal: Component<Props> = (props) => {
  return (
    <>
      <h3>{props.title}</h3>
      <p>{props.message}</p>
      <div class="modal-actions">
        <button class="btn-secondary" onClick={() => closeModal(false)}>
          {s('common.cancel')}
        </button>
        <button class="btn-primary" onClick={() => closeModal(true)}>
          {s('common.confirm')}
        </button>
      </div>
    </>
  );
};

export default ConfirmModal;
