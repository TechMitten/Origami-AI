/**
 * "Sign in with Pollinations" OAuth 2.1 (PKCE, public client).
 *
 * Endpoints below mirror https://enter.pollinations.ai/.well-known/oauth-authorization-server,
 * hardcoded rather than fetched at runtime — they're a stable public contract and the
 * authorize redirect is a critical path where an extra network hop buys no real resilience.
 *
 * `pk_G6XTM4qa0vHMI0vl` is the app's registered publishable App Key. Using it as
 * `client_id` attributes usage from every user who connects through this app to the
 * app owner's Pollinations developer-earnings balance — it is meant to be public and
 * embedded in client code, unlike an `sk_` secret key.
 */

export const POLLINATIONS_CLIENT_ID = 'pk_G6XTM4qa0vHMI0vl';
export const POLLINATIONS_AUTH_ENDPOINT = 'https://enter.pollinations.ai/authorize';
export const POLLINATIONS_TOKEN_ENDPOINT = 'https://enter.pollinations.ai/api/oauth/token';
export const POLLINATIONS_USERINFO_ENDPOINT = 'https://enter.pollinations.ai/api/oauth/userinfo';
export const POLLINATIONS_OAUTH_SCOPE = 'profile';
export const POLLINATIONS_CALLBACK_PATH = '/pollinations-callback';

const STORAGE_KEY_STATE = 'pollinations_oauth_state';
const STORAGE_KEY_VERIFIER = 'pollinations_oauth_verifier';
const STORAGE_KEY_RETURN_TO = 'pollinations_oauth_return_to';

export class PollinationsAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PollinationsAuthError';
  }
}

const base64UrlEncode = (bytes: Uint8Array): string => {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const randomBase64Url = (byteLength: number): string => base64UrlEncode(crypto.getRandomValues(new Uint8Array(byteLength)));

/** 43-char verifier, within PKCE's (RFC 7636) 43-128 char range. */
export const generateCodeVerifier = (): string => randomBase64Url(32);

export const generateCodeChallenge = async (verifier: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64UrlEncode(new Uint8Array(digest));
};

export const generateState = (): string => randomBase64Url(24);

/** True once `expiresAt` has passed; unset (legacy pasted key) is treated as non-expiring. */
export const isPollinationsTokenExpired = (expiresAt?: number | null): boolean =>
  !!expiresAt && Date.now() >= expiresAt;

/**
 * Kicks off the OAuth redirect. Stashes the PKCE verifier, CSRF state, and the path to
 * return to in sessionStorage — tab-scoped, which is exactly the lifetime a single
 * in-flight redirect needs.
 */
export const startPollinationsOAuth = async (returnTo: string): Promise<void> => {
  const verifier = generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);
  const state = generateState();

  sessionStorage.setItem(STORAGE_KEY_VERIFIER, verifier);
  sessionStorage.setItem(STORAGE_KEY_STATE, state);
  sessionStorage.setItem(STORAGE_KEY_RETURN_TO, returnTo);

  const url = new URL(POLLINATIONS_AUTH_ENDPOINT);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', POLLINATIONS_CLIENT_ID);
  url.searchParams.set('redirect_uri', window.location.origin + POLLINATIONS_CALLBACK_PATH);
  url.searchParams.set('scope', POLLINATIONS_OAUTH_SCOPE);
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');

  window.location.href = url.toString();
};

export interface PollinationsOAuthPending {
  state: string;
  verifier: string;
  returnTo: string;
}

/** Reads back (and clears) the state stashed by `startPollinationsOAuth`. */
export const consumePendingPollinationsOAuth = (): PollinationsOAuthPending | null => {
  const state = sessionStorage.getItem(STORAGE_KEY_STATE);
  const verifier = sessionStorage.getItem(STORAGE_KEY_VERIFIER);
  const returnTo = sessionStorage.getItem(STORAGE_KEY_RETURN_TO);

  sessionStorage.removeItem(STORAGE_KEY_STATE);
  sessionStorage.removeItem(STORAGE_KEY_VERIFIER);
  sessionStorage.removeItem(STORAGE_KEY_RETURN_TO);

  if (!state || !verifier) return null;
  return { state, verifier, returnTo: returnTo || '/' };
};

export interface PollinationsTokenResult {
  accessToken: string;
  expiresAt: number;
  scope: string;
}

interface TokenErrorBody {
  error?: string;
  error_description?: string;
}

export const exchangeCodeForToken = async (code: string, verifier: string): Promise<PollinationsTokenResult> => {
  const response = await fetch(POLLINATIONS_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: POLLINATIONS_CLIENT_ID,
      redirect_uri: window.location.origin + POLLINATIONS_CALLBACK_PATH,
      code_verifier: verifier,
    }),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as TokenErrorBody | null;
    const detail = body?.error_description || body?.error;
    throw new PollinationsAuthError(
      detail ? `Pollinations sign-in failed: ${detail}` : `Pollinations sign-in failed (${response.status}).`,
    );
  }

  const data = (await response.json()) as { access_token: string; expires_in: number; scope: string };
  return {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
    scope: data.scope,
  };
};

export interface PollinationsUserinfo {
  preferredUsername?: string;
  name?: string;
}

/** Best-effort — purely cosmetic ("Connected as X"), must never block saving a working token. */
export const fetchPollinationsUserinfo = async (accessToken: string): Promise<PollinationsUserinfo | null> => {
  try {
    const response = await fetch(POLLINATIONS_USERINFO_ENDPOINT, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) return null;

    const data = (await response.json()) as { preferred_username?: string; name?: string };
    return { preferredUsername: data.preferred_username, name: data.name };
  } catch {
    return null;
  }
};
