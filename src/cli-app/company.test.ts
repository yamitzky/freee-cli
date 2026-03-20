import { describe, expect, it, vi, beforeEach } from 'vitest';
import { handleCompany } from './company.js';

vi.mock('../config/companies.js', () => ({
  getCurrentCompanyId: vi.fn(),
  setCurrentCompany: vi.fn(),
  getCompanyInfo: vi.fn(),
  loadFullConfig: vi.fn(),
}));
vi.mock('../auth/tokens.js', () => ({
  getValidAccessToken: vi.fn(),
}));
vi.mock('../api/client.js', () => ({
  makeApiRequest: vi.fn(),
}));
vi.mock('../config.js', () => ({
  getConfig: vi.fn().mockReturnValue({ freee: { apiUrl: 'https://api.freee.co.jp' } }),
}));

import { getCurrentCompanyId, setCurrentCompany, getCompanyInfo } from '../config/companies.js';
import { getValidAccessToken } from '../auth/tokens.js';
import { makeApiRequest } from '../api/client.js';

describe('handleCompany', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('current with company set → shows company name and ID', async () => {
    vi.mocked(getCurrentCompanyId).mockResolvedValue('12345');
    vi.mocked(getCompanyInfo).mockResolvedValue({
      id: '12345',
      name: 'Test Company',
      addedAt: Date.now(),
    });

    const result = await handleCompany('current', []);
    expect(result).toContain('Test Company');
    expect(result).toContain('12345');
  });

  it('current with no company → shows "No company set"', async () => {
    vi.mocked(getCurrentCompanyId).mockResolvedValue('0');

    const result = await handleCompany('current', []);
    expect(result).toContain('No company set');
  });

  it('set 99999 → calls setCurrentCompany, confirms', async () => {
    vi.mocked(setCurrentCompany).mockResolvedValue(undefined);

    const result = await handleCompany('set', ['99999']);
    expect(setCurrentCompany).toHaveBeenCalledWith('99999');
    expect(result).toContain('99999');
  });

  it('set (no args) → shows usage', async () => {
    const result = await handleCompany('set', []);
    expect(result).toContain('Usage');
    expect(setCurrentCompany).not.toHaveBeenCalled();
  });

  it('ls with token → shows company list', async () => {
    vi.mocked(getValidAccessToken).mockResolvedValue('test-token');
    vi.mocked(makeApiRequest).mockResolvedValue({
      companies: [
        { id: 1, name: 'Company A', role: 'admin' },
        { id: 2, name: 'Company B', role: 'member' },
      ],
    });

    const result = await handleCompany('ls', []);
    expect(result).toContain('Company A');
    expect(result).toContain('Company B');
    expect(result).toContain('admin');
    expect(result).toContain('member');
  });

  it('ls without token → shows not authenticated', async () => {
    vi.mocked(getValidAccessToken).mockResolvedValue(null);

    const result = await handleCompany('ls', []);
    expect(result.toLowerCase()).toContain('not authenticated');
  });

  it('unknown command → usage', async () => {
    const result = await handleCompany('unknown', []);
    expect(result).toContain('Usage');
  });
});
