/**
 * Google Drive auth using Google Identity Services (GIS) popup flow.
 * No redirect or client_secret required.
 * Access token is kept in memory only (expires in ~1hr; re-login needed after page refresh).
 */

import { createSignal } from 'solid-js';
import { getCurrentAccount } from './gdrive';
import type { SyncToken } from './interface';

const SCOPE = 'https://www.googleapis.com/auth/drive.appdata profile email';

interface GisTokenClient {
  requestAccessToken(opts?: { prompt?: string }): void;
}

interface GisOAuth2 {
  initTokenClient(cfg: {
    client_id: string;
    scope: string;
    callback: (resp: GisTokenResponse) => void;
    error_callback?: (err: unknown) => void;
  }): GisTokenClient;
}

interface GisTokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

let _token: SyncToken | null = null;
export const [gdriveTokenSignal, setGdriveTokenSignal] =
  createSignal<SyncToken | null>(null);

async function loadGIS(): Promise<GisOAuth2> {
  const g = (
    window as unknown as { google?: { accounts?: { oauth2?: GisOAuth2 } } }
  ).google;
  if (g?.accounts?.oauth2) return g.accounts.oauth2;
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.onload = () => {
      const oauth2 = (
        window as unknown as { google: { accounts: { oauth2: GisOAuth2 } } }
      ).google.accounts.oauth2;
      resolve(oauth2);
    };
    script.onerror = () =>
      reject(new Error('Failed to load Google Identity Services'));
    document.head.appendChild(script);
  });
}

export function loadToken(): SyncToken | null {
  if (_token && _token.expiresAt > Date.now() + 60_000) return _token;
  return null;
}

export function clearToken(): void {
  _token = null;
  setGdriveTokenSignal(null);
}

export async function beginOAuth(): Promise<void> {
  const clientId = import.meta.env.VITE_GDRIVE_CLIENT_ID as string;
  if (!clientId) throw new Error('VITE_GDRIVE_CLIENT_ID is not set');

  const oauth2 = await loadGIS();

  await new Promise<void>((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: async (resp) => {
        if (resp.error || !resp.access_token) {
          reject(
            new Error(
              resp.error_description ??
                resp.error ??
                'gdrive.error_auth_callback',
            ),
          );
          return;
        }
        const expiresAt = Date.now() + (resp.expires_in ?? 3600) * 1000;
        _token = { accessToken: resp.access_token, expiresAt };
        try {
          const account = await getCurrentAccount(_token);
          _token = {
            ..._token,
            displayName: account.displayName,
            email: account.email,
          };
        } catch {
          /* best-effort */
        }
        setGdriveTokenSignal(_token);
        resolve();
      },
      error_callback: (err) => reject(err),
    });
    client.requestAccessToken();
  });
}

export async function ensureToken(): Promise<SyncToken> {
  const t = loadToken();
  if (t) return t;
  await beginOAuth();
  const t2 = loadToken();
  if (!t2) throw new Error('gdrive.error_auth_callback');
  return t2;
}

// No-op: GIS uses popup, not redirect
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function handleCallback(_code: string): Promise<void> {}
