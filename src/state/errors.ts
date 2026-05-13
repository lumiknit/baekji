import { createSignal } from 'solid-js';

export type AppError =
  | { kind: 'quota_exceeded' }
  | { kind: 'idb_write_failed'; detail: string };

const [_appErrors, setAppErrors] = createSignal<AppError[]>([]);
export const appErrors = _appErrors;

export const pushAppError = (e: AppError) =>
  setAppErrors((prev) => [...prev.filter((x) => x.kind !== e.kind), e]);

export const dismissAppError = (kind: AppError['kind']) =>
  setAppErrors((prev) => prev.filter((e) => e.kind !== kind));
