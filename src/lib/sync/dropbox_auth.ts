/**
 * Dropbox token persistence + OAuth flow helpers.
 * Token is stored in localStorage under 'dbx_token'.
 * PKCE state is stored in sessionStorage under 'dbx_pkce'.
 */

import {
  startAuth,
  exchangeCode,
  maybeRefresh,
  getCurrentAccount,
  type DropboxConfig,
} from './dropbox';
import { syncTokenSchema, dropboxPkceStateSchema } from './interface';
import type { SyncToken } from './interface';

const TOKEN_KEY = 'dbx_token';
const PKCE_KEY = 'dbx_pkce';

function getRedirectUri(): string {
  // Fragment is not allowed in OAuth redirect URIs, so use origin + pathname only.
  // The callback is detected via ?code= query param on app load.
  return `${location.origin}${location.pathname}`;
}

function getDropboxConfig(): DropboxConfig {
  const clientId = import.meta.env.VITE_DROPBOX_CLIENT_ID as string;
  if (!clientId) throw new Error('VITE_DROPBOX_CLIENT_ID is not set');
  return { clientId, redirectUri: getRedirectUri() };
}

export function loadToken(): SyncToken | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    const parsed = syncTokenSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function saveToken(token: SyncToken): void {
  localStorage.setItem(TOKEN_KEY, JSON.stringify(token));
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export async function ensureToken(): Promise<SyncToken> {
  const cfg = getDropboxConfig();
  const existing = loadToken();
  if (!existing) throw new Error('Not authenticated with Dropbox');
  const refreshed = await maybeRefresh(cfg, existing);
  // Preserve account metadata across refreshes
  const token: SyncToken = {
    ...refreshed,
    displayName: existing.displayName,
    email: existing.email,
  };
  saveToken(token);
  return token;
}

/** Redirect the browser to Dropbox OAuth consent screen. */
export async function beginOAuth(): Promise<void> {
  const cfg = getDropboxConfig();
  const { url, state } = await startAuth(cfg);
  sessionStorage.setItem(PKCE_KEY, JSON.stringify(state));
  location.href = url;
}

/** Called on the callback page. Exchanges the code, fetches account info, and saves the token. */
export async function handleCallback(code: string): Promise<void> {
  const cfg = getDropboxConfig();
  const raw = sessionStorage.getItem(PKCE_KEY);
  if (!raw) throw new Error('dropbox.error_pkce_missing');
  const pkceState = dropboxPkceStateSchema.safeParse(JSON.parse(raw));
  if (!pkceState.success) throw new Error('dropbox.error_pkce_missing');
  sessionStorage.removeItem(PKCE_KEY);
  let token = await exchangeCode(cfg, code, pkceState.data);
  try {
    const account = await getCurrentAccount(token);
    token = {
      ...token,
      displayName: account.displayName,
      email: account.email,
    };
  } catch {
    // account info is best-effort; don't fail the whole login
  }
  saveToken(token);
}
