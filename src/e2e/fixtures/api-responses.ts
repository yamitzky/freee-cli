/**
 * Mock API responses for E2E testing
 * These fixtures simulate freee API responses
 */

// Companies list response
export const mockCompaniesResponse = {
  companies: [
    {
      id: 12345,
      name: 'テスト株式会社',
      name_kana: 'テストカブシキガイシャ',
      display_name: 'テスト株式会社',
      role: 'admin',
    },
    {
      id: 67890,
      name: 'サンプル合同会社',
      name_kana: 'サンプルゴウドウガイシャ',
      display_name: 'サンプル合同会社',
      role: 'member',
    },
  ],
};

// Companies list response with nullable name fields
export const mockCompaniesWithNullNameResponse = {
  companies: [
    {
      id: 12345,
      name: 'テスト株式会社',
      name_kana: 'テストカブシキガイシャ',
      display_name: 'テスト株式会社',
      role: 'admin',
    },
    {
      id: 34567,
      name: null,
      name_kana: null,
      display_name: 'テスト事業所',
      role: 'admin',
    },
  ],
};

// HR users/me response (for company listing fallback)
export const mockHrUsersMeResponse = {
  id: 1,
  companies: [
    {
      id: 12345,
      name: 'テスト株式会社',
      name_kana: 'テストカブシキガイシャ',
      display_name: '山田 太郎',
      role: 'company_admin',
      external_cid: '0000000001',
      employee_id: 501,
    },
    {
      id: 67890,
      name: 'サンプル合同会社',
      name_kana: 'サンプルゴウドウガイシャ',
      display_name: '山田 太郎',
      role: 'self_only',
      external_cid: '0000000002',
      employee_id: 502,
    },
  ],
};

// Token responses for OAuth
export const mockTokenResponse = {
  access_token: 'mock-access-token-12345',
  refresh_token: 'mock-refresh-token-67890',
  token_type: 'Bearer',
  expires_in: 3600,
  scope: 'read write',
  created_at: Math.floor(Date.now() / 1000),
};
