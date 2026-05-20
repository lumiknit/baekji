import type { Component } from 'solid-js';
import { Show, onMount, onCleanup } from 'solid-js';
import {
  modalState,
  closeModal,
  backupModalOpen,
  closeBackupModal,
  projectSearchModalOpen,
  closeProjectSearchModal,
  goalModalSheetId,
  closeGoalModal,
} from '../../state/modal';
import ConfirmModal from './ConfirmModal';
import NameInputModal from './NameInputModal';
import BackupModal from './BackupModal';
import ProjectSearchModal from './ProjectSearchModal';
import TagEditModal from './TagEditModal';
import GoalModal from './GoalModal';

const ModalContainer: Component = () => {
  onMount(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (goalModalSheetId()) closeGoalModal();
        else if (modalState()) closeModal(null);
        else if (backupModalOpen()) closeBackupModal();
        else if (projectSearchModalOpen()) closeProjectSearchModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    onCleanup(() => window.removeEventListener('keydown', handleKeyDown));
  });

  return (
    <>
      <Show when={goalModalSheetId()}>
        {(sheetId) => (
          <div class="modal-overlay" onClick={closeGoalModal}>
            <div class="modal-body" onClick={(e) => e.stopPropagation()}>
              <GoalModal sheetId={sheetId()} />
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
      <Show when={projectSearchModalOpen()}>
        <div class="modal-overlay" onClick={closeProjectSearchModal}>
          <div
            class="modal-body"
            style={{ width: 'min(90vw, 800px)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <ProjectSearchModal />
          </div>
        </div>
      </Show>
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
              <Show when={state().type === 'tagEdit'}>
                <TagEditModal
                  title={state().title}
                  initialTags={state().tags ?? []}
                />
              </Show>
            </div>
          </div>
        )}
      </Show>
    </>
  );
};

export default ModalContainer;
