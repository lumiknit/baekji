/**
 * Google Drive backup helper (PKCE OAuth, drive.file scope)
 *
 * Usage:
 *   const cfg = { clientId: '...', redirectUri: '...', folderId: '...' };
 *
 *   // 1. Start auth (before redirect)
 *   const { url, state } = await startAuth(cfg);
 *   sessionStorage.setItem('gd_pkce', JSON.stringify(state));
 *   location.href = url;
 *
 *   // 2. On callback page, exchange code
 *   const state = JSON.parse(sessionStorage.getItem('gd_pkce')!);
 *   const token = await exchangeCode(cfg, params.get('code')!, state);
 *
 *   // 3. Use
 *   const token2 = await maybeRefresh(cfg, token);
 *   await upload(token2, 'snapshot-2024.gz', blob, cfg.folderId);
 */

import {
  generateCodeVerifier,
  generateCodeChallenge,
  type ListOptions,
  type SyncFile,
  type SyncToken,
} from './interface';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const FILES_URL = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';
const SCOPE = 'https://www.googleapis.com/auth/drive.file';

export interface GoogleConfig {
  clientId: string;
  redirectUri: string;
}

export interface GooglePkceState {
  codeVerifier: string;
}

// --- Auth ---

export async function startAuth(
  cfg: GoogleConfig,
): Promise<{ url: string; state: GooglePkceState }> {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: 'code',
    scope: SCOPE,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    access_type: 'offline',
    prompt: 'consent',
  });

  return { url: `${AUTH_URL}?${params}`, state: { codeVerifier } };
}

export async function exchangeCode(
  cfg: GoogleConfig,
  code: string,
  state: GooglePkceState,
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
  cfg: GoogleConfig,
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
  cfg: GoogleConfig,
  token: SyncToken,
): Promise<SyncToken> {
  if (Date.now() < token.expiresAt - 60_000) return token;
  return refreshToken(cfg, token);
}

// --- File operations ---

/** List files in the folder, optionally filtered by prefix */
export async function list(
  token: SyncToken,
  folderId: string,
  opts: ListOptions = {},
): Promise<SyncFile[]> {
  const conditions = [`'${folderId}' in parents`, 'trashed = false'];
  if (opts.prefix) conditions.push(`name contains '${opts.prefix}'`);

  const params = new URLSearchParams({
    q: conditions.join(' and '),
    fields: 'files(id,name,modifiedTime,size)',
    orderBy: 'name',
    pageSize: String(opts.limit ?? 100),
  });

  const res = await fetch(`${FILES_URL}?${params}`, {
    headers: { Authorization: `Bearer ${token.accessToken}` },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(json.error));
  return (json.files as any[]).map(fileFromJson);
}

/**
 * Upload a Blob to Drive.
 * If a file with the same name already exists in the folder, it is overwritten.
 */
export async function upload(
  token: SyncToken,
  name: string,
  blob: Blob,
  folderId: string,
): Promise<SyncFile> {
  const existing = await findByName(token, name, folderId);

  const metadata: Record<string, unknown> = { name };
  if (!existing) metadata.parents = [folderId];

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', blob);

  const url = existing
    ? `${UPLOAD_URL}/${existing.id}?uploadType=multipart&fields=id,name,modifiedTime,size`
    : `${UPLOAD_URL}?uploadType=multipart&fields=id,name,modifiedTime,size`;

  const res = await fetch(url, {
    method: existing ? 'PATCH' : 'POST',
    headers: { Authorization: `Bearer ${token.accessToken}` },
    body: form,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(json.error));
  return fileFromJson(json);
}

/** Download a file by ID and return as Blob */
export async function download(token: SyncToken, fileId: string): Promise<Blob> {
  const res = await fetch(`${FILES_URL}/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token.accessToken}` },
  });
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  return res.blob();
}

// --- Internal ---

async function findByName(
  token: SyncToken,
  name: string,
  folderId: string,
): Promise<SyncFile | null> {
  const params = new URLSearchParams({
    q: `name = '${name}' and '${folderId}' in parents and trashed = false`,
    fields: 'files(id,name,modifiedTime,size)',
    pageSize: '1',
  });
  const res = await fetch(`${FILES_URL}?${params}`, {
    headers: { Authorization: `Bearer ${token.accessToken}` },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(json.error));
  return json.files.length > 0 ? fileFromJson(json.files[0]) : null;
}

function tokenFromJson(json: any): SyncToken {
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  };
}

function fileFromJson(f: any): SyncFile {
  return {
    id: f.id,
    name: f.name,
    modifiedAt: new Date(f.modifiedTime),
    size: f.size ? Number(f.size) : undefined,
  };
}
