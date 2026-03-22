import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ApiInput } from './input-parser.js';

vi.mock('../api/client.js', () => ({ makeApiRequest: vi.fn() }));
vi.mock('../auth/tokens.js', () => ({
  getValidAccessToken: vi.fn().mockResolvedValue('test-token'),
}));
vi.mock('../config/companies.js', () => ({
  getCurrentCompanyId: vi.fn().mockResolvedValue('12345'),
}));
vi.mock('../openapi/schema-loader.js', () => ({
  validatePathForService: vi.fn().mockReturnValue({
    isValid: true,
    message: 'ok',
    baseUrl: 'https://api.freee.co.jp',
    apiType: 'accounting',
  }),
  API_CONFIGS: {
    accounting: {
      schema: { paths: {} },
      baseUrl: 'https://api.freee.co.jp',
      prefix: 'accounting',
      name: 'freee会計 API',
    },
  },
}));
vi.mock('../config.js', () => ({
  getConfig: vi.fn().mockReturnValue({ freee: { apiUrl: 'https://api.freee.co.jp' } }),
}));

import { executeApiRequest } from './api-exec.js';
import { makeApiRequest } from '../api/client.js';
import { getValidAccessToken } from '../auth/tokens.js';
import { validatePathForService } from '../openapi/schema-loader.js';

const mockedMakeApiRequest = vi.mocked(makeApiRequest);
const mockedGetValidAccessToken = vi.mocked(getValidAccessToken);
const mockedValidatePathForService = vi.mocked(validatePathForService);

describe('executeApiRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetValidAccessToken.mockResolvedValue('test-token');
    mockedValidatePathForService.mockReturnValue({
      isValid: true,
      message: 'ok',
      baseUrl: 'https://api.freee.co.jp',
      apiType: 'accounting',
    });
  });

  it('GET request with query params and company_id injected', async () => {
    mockedMakeApiRequest.mockResolvedValue({ deals: [] });

    const input: ApiInput = {
      path: '/api/1/deals',
      method: undefined,
      query: { limit: '10' },
      body: undefined,
      flags: [],
    };

    const result = await executeApiRequest('accounting', input);

    expect(mockedMakeApiRequest).toHaveBeenCalledWith(
      'GET',
      '/api/1/deals',
      { limit: '10', company_id: '12345' },
      undefined,
      'https://api.freee.co.jp'
    );
    expect(result).toBe(JSON.stringify({ deals: [] }, null, 2));
  });

  it('POST when body present, company_id in both query and body', async () => {
    mockedMakeApiRequest.mockResolvedValue({ id: 1 });

    const input: ApiInput = {
      path: '/api/1/deals',
      method: undefined,
      query: {},
      body: { issue_date: '2026-01-01' },
      flags: [],
    };

    const result = await executeApiRequest('accounting', input);

    expect(mockedMakeApiRequest).toHaveBeenCalledWith(
      'POST',
      '/api/1/deals',
      { company_id: '12345' },
      { issue_date: '2026-01-01', company_id: 12345 },
      'https://api.freee.co.jp'
    );
    expect(result).toBe(JSON.stringify({ id: 1 }, null, 2));
  });

  it('DELETE with explicit method', async () => {
    mockedMakeApiRequest.mockResolvedValue(null);

    const input: ApiInput = {
      path: '/api/1/deals/1',
      method: 'DELETE',
      query: {},
      body: undefined,
      flags: [],
    };

    const result = await executeApiRequest('accounting', input);

    expect(mockedMakeApiRequest).toHaveBeenCalledWith(
      'DELETE',
      '/api/1/deals/1',
      { company_id: '12345' },
      undefined,
      'https://api.freee.co.jp'
    );
    expect(result).toBe('(no content)');
  });

  it('returns error message when not authenticated', async () => {
    mockedGetValidAccessToken.mockResolvedValue(null);

    const input: ApiInput = {
      path: '/api/1/deals',
      method: undefined,
      query: {},
      body: undefined,
      flags: [],
    };

    const result = await executeApiRequest('accounting', input);

    expect(result).toBe('Not authenticated. Run: freee auth login');
    expect(mockedMakeApiRequest).not.toHaveBeenCalled();
  });

  it('returns validation error for invalid path', async () => {
    mockedValidatePathForService.mockReturnValue({
      isValid: false,
      message: 'Path not found: /api/1/invalid',
    });

    const input: ApiInput = {
      path: '/api/1/invalid',
      method: undefined,
      query: {},
      body: undefined,
      flags: [],
    };

    const result = await executeApiRequest('accounting', input);

    expect(result).toBe('Path not found: /api/1/invalid');
    expect(mockedMakeApiRequest).not.toHaveBeenCalled();
  });

  it('returns file path for binary response', async () => {
    mockedMakeApiRequest.mockResolvedValue({
      type: 'binary',
      filePath: '/tmp/download.pdf',
      mimeType: 'application/pdf',
      size: 1024,
    });

    const input: ApiInput = {
      path: '/api/1/receipts/1/download',
      method: undefined,
      query: {},
      body: undefined,
      flags: [],
    };

    const result = await executeApiRequest('accounting', input);

    expect(result).toBe('File saved: /tmp/download.pdf');
  });

  it('formats single resource as key-value pairs', async () => {
    mockedMakeApiRequest.mockResolvedValue({
      deal: {
        id: 123,
        issue_date: '2026-01-15',
        type: 'income',
        amount: 10000,
        company_id: 12345,
        details: [{ id: 1 }],
      },
    });

    const input: ApiInput = {
      path: '/api/1/deals/123',
      method: undefined,
      query: {},
      body: undefined,
      flags: [],
    };

    const result = await executeApiRequest('accounting', input);

    expect(result).toContain('deal:');
    expect(result).toContain('id\t123');
    expect(result).toContain('issue_date\t2026-01-15');
    expect(result).toContain('type\tincome');
    expect(result).not.toContain('details');
  });

  it('returns "(no content)" for null response', async () => {
    mockedMakeApiRequest.mockResolvedValue(null);

    const input: ApiInput = {
      path: '/api/1/deals/1',
      method: 'DELETE',
      query: {},
      body: undefined,
      flags: [],
    };

    const result = await executeApiRequest('accounting', input);

    expect(result).toBe('(no content)');
  });
});
