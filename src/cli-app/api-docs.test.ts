import { describe, it, expect } from 'vitest';
import { generateMethodList, generateDocs, generateSpec } from './api-docs.js';

describe('generateMethodList', () => {
  it('shows endpoint summary and available methods', () => {
    const output = generateMethodList('accounting', '/api/1/deals');
    expect(output).toContain('/api/1/deals');
    expect(output).toContain('GET');
    expect(output).toContain('POST');
  });

  it('shows help for parameterized paths', () => {
    const output = generateMethodList('accounting', '/api/1/deals/123');
    expect(output).toContain('/api/1/deals/{id}');
  });

  it('returns error message for unknown path', () => {
    const output = generateMethodList('accounting', '/api/1/nonexistent');
    expect(output).toContain('見つかりません');
  });

  it('shows CLI-style hints', () => {
    const output = generateMethodList('accounting', '/api/1/deals');
    expect(output).toContain('freee accounting get');
    expect(output).toContain('--help');
  });
});

describe('generateDocs', () => {
  it('generates docs with parameter list', () => {
    const output = generateDocs('accounting', '/api/1/deals', 'GET');
    expect(output).not.toContain('company_id');
    expect(output).toContain('パラメータ');
    expect(output).toContain('使い方');
  });

  it('generates docs for POST with request body', () => {
    const output = generateDocs('accounting', '/api/1/deals', 'POST');
    expect(output).toContain('リクエストボディ');
    expect(output).toContain('issue_date');
  });

  it('does not include response by default', () => {
    const output = generateDocs('accounting', '/api/1/deals', 'GET');
    expect(output).not.toContain('レスポンス');
  });

  it('includes response when includeResponse is true', () => {
    const output = generateDocs('accounting', '/api/1/deals', 'GET', { includeResponse: true });
    expect(output).toContain('レスポンス');
  });

  it('resolves parameterized paths', () => {
    const output = generateDocs('accounting', '/api/1/deals/123', 'GET');
    expect(output).toContain('deals/123');
  });

  it('returns error for unknown path', () => {
    const output = generateDocs('accounting', '/api/1/nonexistent', 'GET');
    expect(output).toContain('見つかりません');
  });

  it('returns error for invalid method', () => {
    const output = generateDocs('accounting', '/api/1/deals', 'PATCH');
    expect(output).toContain('ありません');
  });
});

describe('generateSpec', () => {
  it('returns raw OpenAPI JSON fragment', () => {
    const output = generateSpec('accounting', '/api/1/deals');
    const parsed = JSON.parse(output);
    expect(parsed).toHaveProperty('get');
  });

  it('resolves parameterized paths', () => {
    const output = generateSpec('accounting', '/api/1/deals/123');
    const parsed = JSON.parse(output);
    expect(parsed).toHaveProperty('get');
  });

  it('returns error JSON for unknown path', () => {
    const output = generateSpec('accounting', '/api/1/nonexistent');
    expect(output).toContain('error');
  });
});
