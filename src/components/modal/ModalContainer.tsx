import type { Component } from 'solid-js';
import { Show, onMount, onCleanup } from 'solid-js';
import { modalState, closeModal } from '../../state/modal';
import ConfirmModal from './ConfirmModal';
import NameInputModal from './NameInputModal';
import LinkModal from './LinkModal';
import ImageModal from './ImageModal';
import ExportModal from './ExportModal';
import BackupModal from './BackupModal';
import ImportCompareModal from './ImportCompareModal';

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
            <Show when={state().type === 'link'}>
              <LinkModal defaultValue={state().defaultValue} />
            </Show>
            <Show when={state().type === 'image'}>
              <ImageModal
                src={state().imageMeta?.src}
                alt={state().imageMeta?.alt}
              />
            </Show>
            <Show when={state().type === 'export'}>
              <ExportModal nodeId={state().nodeId!} />
            </Show>
            <Show when={state().type === 'backup'}>
              <BackupModal projectInfo={state().projectInfo} />
            </Show>
            <Show when={state().type === 'import-compare'}>
              <ImportCompareModal
                existing={state().importCompareMeta!.existing}
                incoming={state().importCompareMeta!.incoming}
              />
            </Show>
          </div>
        </div>
      )}
    </Show>
  );
};

export default ModalContainer;
