import { loadTokens, clearTokens, isTokenValid } from '../auth/tokens.js';
import { performOAuth } from '../cli/oauth-flow.js';
import { stopCallbackServer } from '../auth/server.js';

export async function handleAuth(command: string): Promise<string> {
  switch (command) {
    case 'login':
      return await authLogin();
    case 'status':
      return await authStatus();
    case 'logout':
      return await authLogout();
    default:
      return 'Usage: freee auth [login|status|logout]';
  }
}

async function authLogin(): Promise<string> {
  try {
    await performOAuth();
    return 'Authentication successful.';
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `Authentication failed: ${message}`;
  } finally {
    stopCallbackServer();
  }
}

async function authStatus(): Promise<string> {
  const tokens = await loadTokens();
  if (!tokens) {
    return 'Not authenticated. Run `freee auth login` to authenticate.';
  }

  if (isTokenValid(tokens)) {
    const expiresAt = new Date(tokens.expires_at);
    return `Authenticated. Token expires at ${expiresAt.toISOString()}.`;
  }

  return 'Token expired. Run `freee auth login` to re-authenticate.';
}

async function authLogout(): Promise<string> {
  await clearTokens();
  return 'Logged out. Tokens have been cleared.';
}
