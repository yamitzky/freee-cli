import { describe, expect, it, vi, beforeEach } from 'vitest';
import { handleAuth } from './auth.js';

vi.mock('../auth/tokens.js', () => ({
  loadTokens: vi.fn(),
  clearTokens: vi.fn(),
  isTokenValid: vi.fn(),
}));
vi.mock('../cli/oauth-flow.js', () => ({
  performOAuth: vi.fn(),
}));
vi.mock('../auth/server.js', () => ({
  stopCallbackServer: vi.fn(),
}));

import { loadTokens, clearTokens, isTokenValid } from '../auth/tokens.js';
import { performOAuth } from '../cli/oauth-flow.js';

describe('handleAuth', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('status when token valid → output contains "authenticated"', async () => {
    vi.mocked(loadTokens).mockResolvedValue({
      access_token: 'test-token',
      refresh_token: 'test-refresh',
      expires_at: Date.now() + 3600000,
      token_type: 'bearer',
      scope: 'read write',
    });
    vi.mocked(isTokenValid).mockReturnValue(true);

    const result = await handleAuth('status');
    expect(result.toLowerCase()).toContain('authenticated');
  });

  it('status when no tokens → output contains "Not authenticated"', async () => {
    vi.mocked(loadTokens).mockResolvedValue(null);

    const result = await handleAuth('status');
    expect(result).toContain('Not authenticated');
  });

  it('status when token expired → output contains "expired"', async () => {
    vi.mocked(loadTokens).mockResolvedValue({
      access_token: 'test-token',
      refresh_token: 'test-refresh',
      expires_at: Date.now() - 3600000,
      token_type: 'bearer',
      scope: 'read write',
    });
    vi.mocked(isTokenValid).mockReturnValue(false);

    const result = await handleAuth('status');
    expect(result.toLowerCase()).toContain('expired');
  });

  it('logout → clearTokens called, output contains confirmation', async () => {
    const result = await handleAuth('logout');
    expect(clearTokens).toHaveBeenCalled();
    expect(result.toLowerCase()).toContain('logged out');
  });

  it('login → performOAuth called, output contains success', async () => {
    vi.mocked(performOAuth).mockResolvedValue({
      accessToken: 'new-token',
      refreshToken: 'new-refresh',
    });

    const result = await handleAuth('login');
    expect(performOAuth).toHaveBeenCalled();
    expect(result.toLowerCase()).toContain('success');
  });

  it('login handles auth failure', async () => {
    vi.mocked(performOAuth).mockRejectedValue(new Error('auth failed'));

    const result = await handleAuth('login');
    expect(result.toLowerCase()).toContain('failed');
  });

  it('unknown command → usage message', async () => {
    const result = await handleAuth('unknown');
    expect(result).toContain('Usage');
    expect(result).toContain('login');
    expect(result).toContain('status');
    expect(result).toContain('logout');
  });
});
