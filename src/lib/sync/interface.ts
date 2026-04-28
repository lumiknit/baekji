export interface SyncToken {
  accessToken: string;
  refreshToken?: string;
  /** ms timestamp */
  expiresAt: number;
}

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
