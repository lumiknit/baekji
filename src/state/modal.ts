import { createSignal } from 'solid-js';

export type ModalType = 'confirm' | 'prompt' | 'tagEdit' | null;

interface ModalState {
  type: ModalType;
  title: string;
  message: string;
  defaultValue?: string;
  tags?: string[];
  resolve: (value: unknown) => void;
}

export const [modalState, setModalState] = createSignal<ModalState | null>(
  null,
);

export const showConfirm = (
  title: string,
  message: string,
): Promise<boolean> => {
  return new Promise((resolve) => {
    setModalState({ type: 'confirm', title, message, resolve });
  });
};

export const showPrompt = (
  title: string,
  message: string,
  defaultValue = '',
): Promise<string | null> => {
  return new Promise((resolve) => {
    setModalState({ type: 'prompt', title, message, defaultValue, resolve });
  });
};

export const showTagEdit = (
  title: string,
  tags: string[],
): Promise<string[] | null> => {
  return new Promise((resolve) => {
    setModalState({
      type: 'tagEdit',
      title,
      message: '',
      tags,
      resolve: resolve as (value: unknown) => void,
    });
  });
};

export const closeModal = (value: unknown = null) => {
  const state = modalState();
  if (state) {
    state.resolve(value);
  }
  setModalState(null);
};

export const [backupModalOpen, setBackupModalOpen] = createSignal(false);
export const openBackupModal = () => setBackupModalOpen(true);
export const closeBackupModal = () => setBackupModalOpen(false);

export const [projectSearchModalOpen, setProjectSearchModalOpen] =
  createSignal(false);
export const openProjectSearchModal = () => setProjectSearchModalOpen(true);
export const closeProjectSearchModal = () => setProjectSearchModalOpen(false);
