import { createSignal } from 'solid-js';

export type ModalType =
  | 'confirm'
  | 'prompt'
  | 'link'
  | 'image'
  | 'export'
  | 'backup'
  | 'import-compare'
  | null;

export interface VersionCompareMeta {
  label: string;
  updatedAt: string;
  exportedAt?: string;
  exportedBy?: string;
  appVersion?: string;
  schemaVersion?: number;
  sheetCount: number;
  groupCount: number;
}

interface ModalState {
  type: ModalType;
  title: string;
  message: string;
  defaultValue?: string;
  imageMeta?: { src: string; alt: string };
  nodeId?: string;
  pjVerId?: string;
  projectLabel?: string;
  importCompareMeta?: {
    existing: VersionCompareMeta;
    incoming: VersionCompareMeta;
  };
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

export const showExport = (nodeId: string): Promise<null> => {
  return new Promise((resolve) => {
    setModalState({ type: 'export', title: '', message: '', nodeId, resolve });
  });
};

export const showBackup = (
  pjVerId: string,
  projectLabel: string,
): Promise<null> => {
  return new Promise((resolve) => {
    setModalState({
      type: 'backup',
      title: '',
      message: '',
      pjVerId,
      projectLabel,
      resolve,
    });
  });
};

export type ImportCompareResult = 'cancel' | 'separate' | 'overwrite';

export const showImportCompare = (
  existing: VersionCompareMeta,
  incoming: VersionCompareMeta,
): Promise<ImportCompareResult> => {
  return new Promise((resolve) => {
    setModalState({
      type: 'import-compare',
      title: '',
      message: '',
      importCompareMeta: { existing, incoming },
      resolve,
    });
  });
};

export function normalizeUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (/^[a-zA-Z][a-zA-Z0-9+\-.]*:\/\//.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export const showImage = (
  meta: { src: string; alt: string } = { src: '', alt: '' },
): Promise<{ src: string; alt: string } | null> => {
  return new Promise((resolve) => {
    setModalState({
      type: 'image',
      title: '',
      message: '',
      imageMeta: meta,
      resolve,
    });
  });
};

export const showLink = (defaultValue = ''): Promise<string | null> => {
  return new Promise((resolve) => {
    setModalState({
      type: 'link',
      title: '',
      message: '',
      defaultValue,
      resolve,
    });
  });
};

export const closeModal = (value: any = null) => {
  const state = modalState();
  if (state) {
    state.resolve(value);
  }
  setModalState(null);
};
