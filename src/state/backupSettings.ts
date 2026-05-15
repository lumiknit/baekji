import { createSignal } from 'solid-js';
import { makePersisted } from '@solid-primitives/storage';

export type SaveDestination = 'local' | 'dropbox' | 'gdrive';

export const [saveDestinations, setSaveDestinations] = makePersisted(
  createSignal<SaveDestination[]>(['local']),
  { name: 'baekji-save-destinations', storage: localStorage },
);

export function toggleSaveDestination(dest: SaveDestination): void {
  setSaveDestinations((prev) =>
    prev.includes(dest) ? prev.filter((d) => d !== dest) : [...prev, dest],
  );
}
