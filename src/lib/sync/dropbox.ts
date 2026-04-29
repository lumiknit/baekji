/**
 * Dropbox backup helper (PKCE OAuth, app folder)
 *
 * Usage:
 *   const cfg = { clientId: '...', redirectUri: '...' };
 *
 *   // 1. Start auth
 *   const { url, state } = await startAuth(cfg);
 *   sessionStorage.setItem('dbx_pkce', JSON.stringify(state));
 *   location.href = url;
 *
 *   // 2. On callback page, exchange code
 *   const state = JSON.parse(sessionStorage.getItem('dbx_pkce')!);
 *   const token = await exchangeCode(cfg, params.get('code')!, state);
 *
 *   // 3. Use
 *   const token2 = await maybeRefresh(cfg, token);
 *   await upload(token2, 'snapshot-2024.gz', blob);
 */

import {
  generateCodeVerifier,
  generateCodeChallenge,
  type ListOptions,
  type SyncFile,
  type SyncToken,
} from './interface';

const AUTH_URL = 'https://www.dropbox.com/oauth2/authorize';
const TOKEN_URL = 'https://api.dropboxapi.com/oauth2/token';
const CONTENT_URL = 'https://content.dropboxapi.com/2';
const API_URL = 'https://api.dropboxapi.com/2';

export interface DropboxConfig {
  clientId: string;
  redirectUri: string;
}

export interface DropboxPkceState {
  codeVerifier: string;
}

// --- Auth ---

export async function startAuth(
  cfg: DropboxConfig,
): Promise<{ url: string; state: DropboxPkceState }> {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: 'code',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    token_access_type: 'offline',
  });

  return { url: `${AUTH_URL}?${params}`, state: { codeVerifier } };
}

export async function exchangeCode(
  cfg: DropboxConfig,
  code: string,
  state: DropboxPkceState,
): Promise<SyncToken> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: cfg.clientId,
      redirect_uri: cfg.redirectUri,
      grant_type: 'authorization_code',
      code,
      code_verifier: state.codeVerifier,
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error_description ?? json.error);
  return tokenFromJson(json);
}

export async function refreshToken(
  cfg: DropboxConfig,
  token: SyncToken,
): Promise<SyncToken> {
  if (!token.refreshToken) throw new Error('No refresh token');
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: cfg.clientId,
      grant_type: 'refresh_token',
      refresh_token: token.refreshToken,
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error_description ?? json.error);
  return { ...tokenFromJson(json), refreshToken: token.refreshToken };
}

/** Refresh only if within 60 s of expiry */
export async function maybeRefresh(
  cfg: DropboxConfig,
  token: SyncToken,
): Promise<SyncToken> {
  if (Date.now() < token.expiresAt - 60_000) return token;
  return refreshToken(cfg, token);
}

// --- File operations ---

/** List files in the app folder root, optionally filtered by prefix */
export async function list(
  token: SyncToken,
  opts: ListOptions = {},
): Promise<SyncFile[]> {
  const res = await fetch(`${API_URL}/files/list_folder`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ path: '', limit: opts.limit ?? 100 }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(json.error));

  let entries: any[] = json.entries;
  if (opts.prefix) {
    entries = entries.filter((e: any) => (e.name as string).startsWith(opts.prefix!));
  }

  return entries
    .filter((e: any) => e['.tag'] === 'file')
    .sort((a: any, b: any) => a.name.localeCompare(b.name))
    .map(fileFromJson);
}

/** Allowed filename pattern: alphanumeric, hyphens, underscores, dots only. No path separators. */
const SAFE_FILENAME_RE = /^[A-Za-z0-9_.\-]+$/;

function assertSafeFilename(name: string): void {
  if (!SAFE_FILENAME_RE.test(name) || name.startsWith('.') || name.includes('..')) {
    throw new Error(`Invalid filename: "${name}"`);
  }
}

/**
 * Upload a Blob to the app folder.
 * @param name filename, e.g. 'snapshot-2024.gz'
 */
export async function upload(
  token: SyncToken,
  name: string,
  blob: Blob,
): Promise<SyncFile> {
  assertSafeFilename(name);
  const res = await fetch(`${CONTENT_URL}/files/upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token.accessToken}`,
      'Content-Type': 'application/octet-stream',
      'Dropbox-API-Arg': JSON.stringify({
        path: `/${name}`,
        mode: 'overwrite',
        autorename: false,
        mute: true,
      }),
    },
    body: blob,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(json.error));
  return fileFromJson(json);
}

/** Download a file by name and return as Blob */
export async function download(token: SyncToken, name: string): Promise<Blob> {
  const res = await fetch(`${CONTENT_URL}/files/download`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token.accessToken}`,
      'Dropbox-API-Arg': JSON.stringify({ path: `/${name}` }),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Download failed: ${JSON.stringify(err)}`);
  }
  return res.blob();
}

// --- Account ---

interface DropboxAccount {
  displayName: string;
  email: string;
}

export async function getCurrentAccount(
  token: SyncToken,
): Promise<DropboxAccount> {
  const res = await fetch(`${API_URL}/users/get_current_account`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: 'null',
  });
  const json = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(json.error));
  return {
    displayName: json.name?.display_name ?? '',
    email: json.email ?? '',
  };
}

// --- Internal ---

function tokenFromJson(json: any): SyncToken {
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: Date.now() + (json.expires_in ?? 14400) * 1000,
  };
}

function fileFromJson(f: any): SyncFile {
  return {
    id: f.id ?? f.path_lower,
    name: f.name,
    modifiedAt: new Date(f.client_modified ?? f.server_modified),
    size: f.size,
  };
}
