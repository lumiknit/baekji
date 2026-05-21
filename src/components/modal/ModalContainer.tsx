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
} from '../../state/modal.ts';
import ConfirmModal from './ConfirmModal.tsx';
import NameInputModal from './NameInputModal.tsx';
import BackupModal from './BackupModal.tsx';
import ProjectSearchModal from './ProjectSearchModal.tsx';
import TagEditModal from './TagEditModal.tsx';
import GoalModal from './GoalModal.tsx';

const ModalContainer: Component = () => {
  onMount(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const state = modalState();
      if (e.key === 'Escape') {
        if (goalModalSheetId()) {
          closeGoalModal();
        } else if (state) {
          // confirm: Escape = cancel (false), others = dismiss (null)
          closeModal(state.type === 'confirm' ? false : null);
        } else if (backupModalOpen()) {
          closeBackupModal();
        } else if (projectSearchModalOpen()) {
          closeProjectSearchModal();
        } else {
          return;
        }
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };
    globalThis.addEventListener('keydown', handleKeyDown, { capture: true });
    onCleanup(() =>
      globalThis.removeEventListener('keydown', handleKeyDown, {
        capture: true,
      }),
    );
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
