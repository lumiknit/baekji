import { createSignal } from 'solid-js';

export type ModalType = 'confirm' | 'prompt' | null;

interface ModalState {
  type: ModalType;
  title: string;
  message: string;
  defaultValue?: string;
  resolve: (value: any) => void;
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

export const closeModal = (value: any = null) => {
  const state = modalState();
  if (state) {
    state.resolve(value);
  }
  setModalState(null);
};

export const [backupModalOpen, setBackupModalOpen] = createSignal(false);
export const openBackupModal = () => setBackupModalOpen(true);
export const closeBackupModal = () => setBackupModalOpen(false);
