import { createSignal } from 'solid-js';
import { makePersisted } from '@solid-primitives/storage';
import type { SyncProvider } from '../lib/sync/interface';

export const [remoteService, setRemoteService] = makePersisted(
  createSignal<SyncProvider>('dropbox'),
  { name: 'baekji-remote-service', storage: localStorage },
);
