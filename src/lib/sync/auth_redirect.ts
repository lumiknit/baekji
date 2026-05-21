/**
 * Shared OAuth redirect handler.
 * Before redirecting to any provider, store the provider name in localStorage
 * under PENDING_PROVIDER_KEY. On return, this function reads that key and
 * dispatches to the correct handleCallback implementation.
 *
 * Optimistic: assumes at most one OAuth flow is in progress at a time.
 */

import { PENDING_PROVIDER_KEY } from './interface.ts';
import { handleCallback as dropboxCallback } from './dropbox_auth.ts';
import { handleCallback as gdriveCallback } from './gdrive_auth.ts';

export async function handleRedirect(code: string): Promise<void> {
  const provider = localStorage.getItem(PENDING_PROVIDER_KEY) ?? 'dropbox';
  localStorage.removeItem(PENDING_PROVIDER_KEY);
  if (provider === 'gdrive') {
    await gdriveCallback(code);
  } else {
    await dropboxCallback(code);
  }
}
