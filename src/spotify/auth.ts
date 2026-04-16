import http from 'node:http';
import crypto from 'node:crypto';
import { URL, URLSearchParams } from 'node:url';
import open from 'open';
import * as logger from '../utils/logger.js';
import {
  getSpotifyClientId,
  setSpotifyClientId,
  getSpotifyTokens,
  setSpotifyTokens,
} from '../utils/config.js';
import type { SpotifyTokens } from './types.js';

const SPOTIFY_AUTH_URL = 'https://accounts.spotify.com/authorize';
const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
const REDIRECT_PORT = 8901;
const REDIRECT_URI = `http://127.0.0.1:${REDIRECT_PORT}/callback`;
const SCOPES = [
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-library-read',
];

function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString('base64url');
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const hash = crypto.createHash('sha256').update(verifier).digest();
  return hash.toString('base64url');
}

export async function authenticateSpotify(clientId?: string): Promise<SpotifyTokens> {
  const resolvedClientId = clientId ?? getSpotifyClientId();
  if (!resolvedClientId) {
    throw new Error(
      'Spotify Client ID not set. Pass it as an argument or run: spyt auth spotify',
    );
  }

  setSpotifyClientId(resolvedClientId);

  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const state = crypto.randomBytes(16).toString('hex');

  const authUrl = new URL(SPOTIFY_AUTH_URL);
  authUrl.searchParams.set('client_id', resolvedClientId);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.set('scope', SCOPES.join(' '));
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('code_challenge', codeChallenge);

  const code = await listenForCallback(state, authUrl.toString());
  const tokens = await exchangeCode(resolvedClientId, code, codeVerifier);
  setSpotifyTokens(tokens);
  return tokens;
}

function listenForCallback(expectedState: string, authUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', `http://localhost:${REDIRECT_PORT}`);
      if (url.pathname !== '/callback') {
        res.writeHead(404);
        res.end();
        return;
      }

      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      const error = url.searchParams.get('error');

      if (error) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<h1>Authentication failed</h1><p>You can close this window.</p>');
        server.close();
        reject(new Error(`Spotify auth error: ${error}`));
        return;
      }

      if (state !== expectedState) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<h1>State mismatch</h1><p>Please try again.</p>');
        server.close();
        reject(new Error('State mismatch in OAuth callback'));
        return;
      }

      if (!code) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<h1>No code received</h1><p>Please try again.</p>');
        server.close();
        reject(new Error('No authorization code received'));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html', 'Connection': 'close' });
      res.end('<h1>Authenticated!</h1><p>You can close this window and return to the terminal.</p>');
      server.close();
      server.closeAllConnections();
      resolve(code);
    });

    server.listen(REDIRECT_PORT, '127.0.0.1', () => {
      logger.info('Opening browser for Spotify authentication...');
      open(authUrl).then(cp => cp.unref()).catch(() => {
        logger.warn(`Could not open browser. Visit this URL manually:\n${authUrl}`);
      });
    });

    server.on('error', reject);

    setTimeout(() => {
      server.close();
      reject(new Error('Authentication timed out after 2 minutes'));
    }, 120_000);
  });
}

async function exchangeCode(
  clientId: string,
  code: string,
  codeVerifier: string,
): Promise<SpotifyTokens> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
    client_id: clientId,
    code_verifier: codeVerifier,
  });

  const response = await fetch(SPOTIFY_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token exchange failed: ${response.status} ${text}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

export async function refreshSpotifyTokens(): Promise<SpotifyTokens> {
  const tokens = getSpotifyTokens();
  const clientId = getSpotifyClientId();

  if (!tokens || !clientId) {
    throw new Error('Not authenticated with Spotify. Run: spyt auth spotify');
  }

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: tokens.refreshToken,
    client_id: clientId,
  });

  const response = await fetch(SPOTIFY_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    throw new Error(`Token refresh failed: ${response.status}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  const newTokens: SpotifyTokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? tokens.refreshToken,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  setSpotifyTokens(newTokens);
  return newTokens;
}

export async function getValidSpotifyToken(): Promise<string> {
  const tokens = getSpotifyTokens();
  if (!tokens) {
    throw new Error('Not authenticated with Spotify. Run: spyt auth spotify');
  }

  if (Date.now() >= tokens.expiresAt - 60_000) {
    const refreshed = await refreshSpotifyTokens();
    return refreshed.accessToken;
  }

  return tokens.accessToken;
}
