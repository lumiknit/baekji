/**
 * Dropbox token persistence + OAuth flow helpers.
 * Only the refresh token is persisted in localStorage ('dbx_token').
 * The access token is kept in memory only to reduce XSS exposure.
 * PKCE state is stored in sessionStorage under 'dbx_pkce'.
 */

import {
  startAuth,
  exchangeCode,
  refreshToken as doRefresh,
  getCurrentAccount,
  type DropboxConfig,
} from './dropbox';
import {
  persistedTokenSchema,
  syncTokenSchema,
  dropboxPkceStateSchema,
} from './interface';
import type { SyncToken, PersistedToken } from './interface';

const TOKEN_KEY = 'dbx_token';
const PKCE_KEY = 'dbx_pkce';

// Access token kept only in memory
let _accessToken: string | null = null;
let _accessTokenExpiresAt: number = 0;

function getRedirectUri(): string {
  return `${location.origin}${location.pathname}`;
}

function getDropboxConfig(): DropboxConfig {
  const clientId = import.meta.env.VITE_DROPBOX_CLIENT_ID as string;
  if (!clientId) throw new Error('VITE_DROPBOX_CLIENT_ID is not set');
  return { clientId, redirectUri: getRedirectUri() };
}

function loadPersisted(): PersistedToken | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    const json = JSON.parse(raw);

    // Try new format first
    const newFormat = persistedTokenSchema.safeParse(json);
    if (newFormat.success) return newFormat.data;

    // Migration: old format stored full SyncToken
    const oldFormat = syncTokenSchema.safeParse(json);
    if (oldFormat.success && oldFormat.data.refreshToken) {
      const migrated: PersistedToken = {
        refreshToken: oldFormat.data.refreshToken,
        displayName: oldFormat.data.displayName,
        email: oldFormat.data.email,
      };
      localStorage.setItem(TOKEN_KEY, JSON.stringify(migrated));
      return migrated;
    }
    return null;
  } catch {
    return null;
  }
}

function savePersisted(p: PersistedToken): void {
  localStorage.setItem(TOKEN_KEY, JSON.stringify(p));
}

/** Returns a lightweight token descriptor for UI (no access token). */
export function loadToken(): (PersistedToken & { expiresAt?: number }) | null {
  const p = loadPersisted();
  if (!p) return null;
  return { ...p, expiresAt: _accessTokenExpiresAt || undefined };
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  _accessToken = null;
  _accessTokenExpiresAt = 0;
}

export async function ensureToken(): Promise<SyncToken> {
  const cfg = getDropboxConfig();
  const persisted = loadPersisted();
  if (!persisted) throw new Error('Not authenticated with Dropbox');

  const TEN_MIN = 600_000;
  if (_accessToken && Date.now() < _accessTokenExpiresAt - TEN_MIN) {
    return {
      accessToken: _accessToken,
      refreshToken: persisted.refreshToken,
      expiresAt: _accessTokenExpiresAt,
      displayName: persisted.displayName,
      email: persisted.email,
    };
  }

  // Refresh
  const stale: SyncToken = {
    accessToken: _accessToken ?? '',
    refreshToken: persisted.refreshToken,
    expiresAt: _accessTokenExpiresAt,
  };
  const refreshed = await doRefresh(cfg, stale);
  _accessToken = refreshed.accessToken;
  _accessTokenExpiresAt = refreshed.expiresAt;

  return {
    accessToken: _accessToken,
    refreshToken: persisted.refreshToken,
    expiresAt: _accessTokenExpiresAt,
    displayName: persisted.displayName,
    email: persisted.email,
  };
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

  const token = await exchangeCode(cfg, code, pkceState.data);
  if (!token.refreshToken) throw new Error('dropbox.error_no_refresh_token'); // i18n key resolved in App.tsx toast handler

  _accessToken = token.accessToken;
  _accessTokenExpiresAt = token.expiresAt;

  const persisted: PersistedToken = { refreshToken: token.refreshToken };
  try {
    const account = await getCurrentAccount(token);
    persisted.displayName = account.displayName;
    persisted.email = account.email;
  } catch {
    // account info is best-effort
  }
  savePersisted(persisted);
}
