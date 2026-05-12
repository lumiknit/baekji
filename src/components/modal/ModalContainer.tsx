import type { Component } from 'solid-js';
import { Show, onMount, onCleanup } from 'solid-js';
import {
  modalState,
  closeModal,
  backupModalOpen,
  closeBackupModal,
} from '../../state/modal';
import ConfirmModal from './ConfirmModal';
import NameInputModal from './NameInputModal';
import BackupModal from './BackupModal';

const ModalContainer: Component = () => {
  onMount(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && modalState()) {
        closeModal(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    onCleanup(() => window.removeEventListener('keydown', handleKeyDown));
  });

  return (
    <>
      <Show when={modalState()}>
        {(state) => (
          <div class="modal-overlay" onClick={() => closeModal(null)}>
            <div class="modal-body" onClick={(e) => e.stopPropagation()}>
              <Show when={state().type === 'confirm'}>
                <ConfirmModal title={state().title} message={state().message} />
              </Show>
              <Show when={state().type === 'prompt'}>
                <NameInputModal
                  title={state().title}
                  message={state().message}
                  defaultValue={state().defaultValue}
                />
              </Show>
            </div>
          </div>
        )}
      </Show>
      <Show when={backupModalOpen()}>
        <div class="modal-overlay" onClick={closeBackupModal}>
          <div class="modal-body" onClick={(e) => e.stopPropagation()}>
            <BackupModal />
          </div>
        </div>
      </Show>
    </>
  );
};

export default ModalContainer;
