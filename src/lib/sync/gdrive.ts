/**
 * Google Drive App Folder sync helper (PKCE OAuth).
 * Stores files in the app's private appDataFolder — invisible to the user in
 * normal Drive UI, counts against the user's Drive quota (15 GB free).
 */

import { z } from 'zod/v4';
import {
  generateCodeVerifier,
  generateCodeChallenge,
  pkceStateSchema,
  type ListOptions,
  type SyncFile,
  type SyncToken,
} from './interface';
import { logError } from '../../state/log';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API_URL = 'https://www.googleapis.com/drive/v3';
const UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3';
const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';

export interface GDriveConfig {
  clientId: string;
  redirectUri: string;
}

export type GDrivePkceState = z.infer<typeof pkceStateSchema>;

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
  id: z.string(),
  name: z.string(),
  modifiedTime: z.string().optional(),
  size: z.string().optional(),
  quotaBytesUsed: z.string().optional(),
});

const listResponseSchema = z.object({
  files: z.array(z.record(z.string(), z.unknown())),
  nextPageToken: z.string().optional(),
});

const accountResponseSchema = z.object({
  user: z
    .object({
      displayName: z.string().optional(),
      emailAddress: z.string().optional(),
    })
    .optional(),
});

// ─── Helpers ──────────────────────────────────────────────────

function gdriveError(msg: string, cause?: unknown): never {
  logError('GDrive', cause || msg);
  throw new Error(msg);
}

// ─── Auth ─────────────────────────────────────────────────────

export async function startAuth(
  cfg: GDriveConfig,
): Promise<{ url: string; state: GDrivePkceState }> {
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
  cfg: GDriveConfig,
  code: string,
  state: GDrivePkceState,
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
    gdriveError(
      err.success
        ? (err.data.error_description ?? err.data.error ?? 'OAuth error')
        : JSON.stringify(json),
      json,
    );
  }
  const parsed = tokenResponseSchema.safeParse(json);
  if (!parsed.success) gdriveError('Invalid token response', parsed.error);
  return tokenFromParsed(parsed.data);
}

export async function refreshToken(
  cfg: GDriveConfig,
  token: SyncToken,
): Promise<SyncToken> {
  if (!token.refreshToken) gdriveError('No refresh token available');
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
    gdriveError(
      err.success
        ? (err.data.error_description ??
            err.data.error ??
            'Token refresh failed')
        : JSON.stringify(json),
      json,
    );
  }
  const parsed = tokenResponseSchema.safeParse(json);
  if (!parsed.success) gdriveError('Invalid token response', parsed.error);
  return { ...tokenFromParsed(parsed.data), refreshToken: token.refreshToken };
}

// ─── File operations ──────────────────────────────────────────

/** List files in appDataFolder, optionally filtered by name prefix. */
export async function list(
  token: SyncToken,
  opts: ListOptions = {},
): Promise<SyncFile[]> {
  const params = new URLSearchParams({
    spaces: 'appDataFolder',
    fields: 'files(id,name,modifiedTime,size,quotaBytesUsed)',
    orderBy: 'modifiedTime desc',
    pageSize: String(opts.limit ?? 200),
  });
  if (opts.prefix) {
    params.set('q', `name contains '${opts.prefix.replace(/'/g, "\\'")}'`);
  }

  const res = await fetch(`${API_URL}/files?${params}`, {
    headers: { Authorization: `Bearer ${token.accessToken}` },
  });
  const json = await res.json();
  if (!res.ok) gdriveError(`List failed: ${JSON.stringify(json)}`, json);

  const parsed = listResponseSchema.safeParse(json);
  if (!parsed.success) gdriveError('Unexpected list response', parsed.error);

  return parsed.data.files
    .map((e) => {
      const f = fileEntrySchema.safeParse(e);
      if (!f.success) return null;
      return fileFromParsed(f.data);
    })
    .filter((f): f is SyncFile => f !== null);
}

export async function upload(
  token: SyncToken,
  name: string,
  blob: Blob,
): Promise<SyncFile> {
  const boundary = `boundary_${crypto.randomUUID().replace(/-/g, '')}`;
  const metadata = JSON.stringify({ name, parents: ['appDataFolder'] });
  const body = [
    `--${boundary}\r\n`,
    `Content-Type: application/json; charset=UTF-8\r\n\r\n`,
    `${metadata}\r\n`,
    `--${boundary}\r\n`,
    `Content-Type: application/octet-stream\r\n\r\n`,
  ];
  const bodyBlob = new Blob([
    ...body.map((s) => new Blob([s])),
    blob,
    new Blob([`\r\n--${boundary}--`]),
  ]);

  const res = await fetch(
    `${UPLOAD_URL}/files?uploadType=multipart&fields=id,name,modifiedTime,size`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: bodyBlob,
    },
  );
  const json = await res.json();
  if (!res.ok) gdriveError(`Upload failed: ${JSON.stringify(json)}`, json);

  const parsed = fileEntrySchema.safeParse(json);
  if (!parsed.success) gdriveError('Unexpected upload response', parsed.error);
  return fileFromParsed(parsed.data);
}

export async function download(token: SyncToken, id: string): Promise<Blob> {
  const res = await fetch(
    `${API_URL}/files/${encodeURIComponent(id)}?alt=media`,
    {
      headers: { Authorization: `Bearer ${token.accessToken}` },
    },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    gdriveError(`Download failed: ${JSON.stringify(err)}`, err);
  }
  return res.blob();
}

/** Delete files by their Drive file IDs in parallel. */
export async function remove(
  token: SyncToken,
  files: SyncFile[],
): Promise<void> {
  await Promise.all(
    files.map(async (f) => {
      const res = await fetch(`${API_URL}/files/${encodeURIComponent(f.id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token.accessToken}` },
      });
      if (!res.ok && res.status !== 204) {
        const err = await res.json().catch(() => ({}));
        gdriveError(`Delete failed (${f.name}): ${JSON.stringify(err)}`, err);
      }
    }),
  );
}

// ─── Account ──────────────────────────────────────────────────

export interface GDriveAccount {
  displayName: string;
  email: string;
}

export async function getCurrentAccount(
  token: SyncToken,
): Promise<GDriveAccount> {
  const res = await fetch(
    `${API_URL.replace('/drive/v3', '/oauth2/v3/userinfo')}`,
    { headers: { Authorization: `Bearer ${token.accessToken}` } },
  );
  const json = await res.json();
  if (!res.ok) gdriveError(`Get account failed: ${JSON.stringify(json)}`, json);

  // userinfo endpoint returns { name, email } directly
  const name = (json as Record<string, unknown>)['name'];
  const email = (json as Record<string, unknown>)['email'];

  // Fallback: try about endpoint
  if (!name && !email) {
    const aboutRes = await fetch(`${API_URL}/about?fields=user`, {
      headers: { Authorization: `Bearer ${token.accessToken}` },
    });
    const aboutJson = await aboutRes.json();
    const about = accountResponseSchema.safeParse(aboutJson);
    return {
      displayName: about.success ? (about.data.user?.displayName ?? '') : '',
      email: about.success ? (about.data.user?.emailAddress ?? '') : '',
    };
  }

  return {
    displayName: typeof name === 'string' ? name : '',
    email: typeof email === 'string' ? email : '',
  };
}

// ─── Internal ─────────────────────────────────────────────────

type TokenParsed = z.infer<typeof tokenResponseSchema>;
type FileParsed = z.infer<typeof fileEntrySchema>;

function tokenFromParsed(d: TokenParsed): SyncToken {
  return {
    accessToken: d.access_token,
    refreshToken: d.refresh_token,
    expiresAt: Date.now() + (d.expires_in ?? 3600) * 1000,
  };
}

function fileFromParsed(f: FileParsed): SyncFile {
  return {
    id: f.id,
    name: f.name,
    modifiedAt: new Date(f.modifiedTime ?? 0),
    size:
      f.size !== undefined
        ? Number(f.size)
        : f.quotaBytesUsed !== undefined
          ? Number(f.quotaBytesUsed)
          : undefined,
  };
}
