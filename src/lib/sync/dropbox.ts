/**
 * Dropbox backup helper (PKCE OAuth, app folder)
 */

import { z } from 'zod/v4';
import {
  generateCodeVerifier,
  generateCodeChallenge,
  dropboxPkceStateSchema,
  type ListOptions,
  type SyncFile,
  type SyncToken,
} from './interface';
import { logError } from '../../state/log';

const AUTH_URL = 'https://www.dropbox.com/oauth2/authorize';
const TOKEN_URL = 'https://api.dropboxapi.com/oauth2/token';
const CONTENT_URL = 'https://content.dropboxapi.com/2';
const API_URL = 'https://api.dropboxapi.com/2';

export interface DropboxConfig {
  clientId: string;
  redirectUri: string;
}

export type DropboxPkceState = import('zod/v4').infer<
  typeof dropboxPkceStateSchema
>;

// ─── Zod schemas ──────────────────────────────────────────────

const tokenResponseSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string().optional(),
  expires_in: z.number().optional(),
});

const oauthErrorSchema = z.object({
  error: z.string().optional(),
  error_description: z.string().optional(),
});

const fileEntrySchema = z.object({
  '.tag': z.string().optional(),
  id: z.string().optional(),
  name: z.string(),
  path_lower: z.string().optional(),
  client_modified: z.string().optional(),
  server_modified: z.string().optional(),
  size: z.number().optional(),
});

const listFolderResponseSchema = z.object({
  entries: z.array(z.record(z.string(), z.unknown())),
  cursor: z.string(),
  has_more: z.boolean(),
});

const accountResponseSchema = z.object({
  name: z.object({ display_name: z.string() }),
  email: z.string(),
});

const apiErrorSchema = z.object({
  error_summary: z.string().optional(),
  error: z.unknown().optional(),
});

// ─── Helpers ──────────────────────────────────────────────────

/** JSON.stringify that escapes non-ASCII as \uXXXX, safe for HTTP headers. */
function headerJson(obj: unknown): string {
  return JSON.stringify(obj).replace(
    /[\x80-\uffff]/g,
    (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );
}

// ─── Error helper ─────────────────────────────────────────────

function dbxError(msg: string, cause?: unknown): never {
  logError('Dropbox', cause || msg);
  throw new Error(msg);
}

function parseApiError(json: unknown): string {
  const parsed = apiErrorSchema.safeParse(json);
  if (parsed.success) {
    return (
      parsed.data.error_summary ?? JSON.stringify(parsed.data.error ?? json)
    );
  }
  return JSON.stringify(json);
}

// ─── Auth ─────────────────────────────────────────────────────

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
  if (!res.ok) {
    const err = oauthErrorSchema.safeParse(json);
    dbxError(
      err.success
        ? (err.data.error_description ?? err.data.error ?? 'OAuth error')
        : JSON.stringify(json),
      json,
    );
  }
  const parsed = tokenResponseSchema.safeParse(json);
  if (!parsed.success) dbxError('Invalid token response', parsed.error);
  return tokenFromParsed(parsed.data);
}

export async function refreshToken(
  cfg: DropboxConfig,
  token: SyncToken,
): Promise<SyncToken> {
  if (!token.refreshToken) dbxError('No refresh token available');
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: cfg.clientId,
      grant_type: 'refresh_token',
      refresh_token: token.refreshToken!,
    }),
  });
  const json = await res.json();
  if (!res.ok) {
    const err = oauthErrorSchema.safeParse(json);
    dbxError(
      err.success
        ? (err.data.error_description ??
            err.data.error ??
            'Token refresh failed')
        : JSON.stringify(json),
      json,
    );
  }
  const parsed = tokenResponseSchema.safeParse(json);
  if (!parsed.success) dbxError('Invalid token response', parsed.error);
  return { ...tokenFromParsed(parsed.data), refreshToken: token.refreshToken };
}

/** Refresh only if within 60 s of expiry */
export async function maybeRefresh(
  cfg: DropboxConfig,
  token: SyncToken,
): Promise<SyncToken> {
  if (Date.now() < token.expiresAt - 60_000) return token;
  return refreshToken(cfg, token);
}

// ─── File operations ──────────────────────────────────────────

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
  if (!res.ok) dbxError(`List failed: ${parseApiError(json)}`, json);

  const parsed = listFolderResponseSchema.safeParse(json);
  if (!parsed.success)
    dbxError('Unexpected list_folder response', parsed.error);

  let entries = parsed.data.entries;
  if (opts.prefix) {
    entries = entries.filter(
      (e) =>
        typeof e['name'] === 'string' &&
        (e['name'] as string).startsWith(opts.prefix!),
    );
  }

  return entries
    .filter((e) => e['.tag'] === 'file')
    .map((e) => {
      const f = fileEntrySchema.safeParse(e);
      if (!f.success) dbxError('Unexpected file entry shape', f.error);
      return fileFromParsed(f.data);
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function upload(
  token: SyncToken,
  name: string,
  blob: Blob,
): Promise<SyncFile> {
  const res = await fetch(`${CONTENT_URL}/files/upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token.accessToken}`,
      'Content-Type': 'application/octet-stream',
      'Dropbox-API-Arg': headerJson({
        path: `/${name}`,
        mode: 'overwrite',
        autorename: false,
        mute: true,
      }),
    },
    body: blob,
  });
  const json = await res.json();
  if (!res.ok) dbxError(`Upload failed: ${parseApiError(json)}`, json);

  const parsed = fileEntrySchema.safeParse(json);
  if (!parsed.success) dbxError('Unexpected upload response', parsed.error);
  return fileFromParsed(parsed.data);
}

/** Download a file by name and return as Blob */
export async function download(token: SyncToken, name: string): Promise<Blob> {
  const res = await fetch(`${CONTENT_URL}/files/download`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token.accessToken}`,
      'Dropbox-API-Arg': headerJson({ path: `/${name}` }),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    dbxError(`Download failed: ${parseApiError(err)}`, err);
  }
  return res.blob();
}

// ─── Account ──────────────────────────────────────────────────

export interface DropboxAccount {
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
  if (!res.ok) dbxError(`Get account failed: ${parseApiError(json)}`, json);

  const parsed = accountResponseSchema.safeParse(json);
  if (!parsed.success) dbxError('Unexpected account response', parsed.error);
  return {
    displayName: parsed.data.name.display_name,
    email: parsed.data.email,
  };
}

// ─── Internal ─────────────────────────────────────────────────

type TokenParsed = z.infer<typeof tokenResponseSchema>;
type FileParsed = z.infer<typeof fileEntrySchema>;

function tokenFromParsed(d: TokenParsed): SyncToken {
  return {
    accessToken: d.access_token,
    refreshToken: d.refresh_token,
    expiresAt: Date.now() + (d.expires_in ?? 14400) * 1000,
  };
}

function fileFromParsed(f: FileParsed): SyncFile {
  return {
    id: f.id ?? f.path_lower ?? f.name,
    name: f.name,
    modifiedAt: new Date(f.client_modified ?? f.server_modified ?? 0),
    size: f.size,
  };
}
