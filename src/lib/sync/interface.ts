import { z } from 'zod/v4';

export const syncTokenSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string().optional(),
  expiresAt: z.number(),
  displayName: z.string().optional(),
  email: z.string().optional(),
});

export type SyncToken = z.infer<typeof syncTokenSchema>;

export const persistedTokenSchema = z.object({
  refreshToken: z.string(),
  displayName: z.string().optional(),
  email: z.string().optional(),
});

export type PersistedToken = z.infer<typeof persistedTokenSchema>;

export const dropboxPkceStateSchema = z.object({
  codeVerifier: z.string(),
});

export const pkceStateSchema = z.object({
  codeVerifier: z.string(),
});

export type PkceState = z.infer<typeof pkceStateSchema>;

export type SyncProvider = 'dropbox' | 'gdrive';

/** localStorage key written before OAuth redirect so handleRedirect knows which provider to call. */
export const PENDING_PROVIDER_KEY = 'sync_pending_provider';

export interface SyncFile {
  id: string;
  name: string;
  modifiedAt: Date;
  size?: number;
}

export interface ListOptions {
  prefix?: string;
  limit?: number;
}

// --- PKCE helpers ---

export function generateCodeVerifier(): string {
  const arr = new Uint8Array(48);
  crypto.getRandomValues(arr);
  return base64url(arr);
}

export async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoded = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return base64url(new Uint8Array(digest));
}

function base64url(buf: Uint8Array): string {
  let str = '';
  for (const b of buf) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
