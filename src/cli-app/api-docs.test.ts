import { describe, it, expect } from 'vitest';
import { generateHelp, generateDocs, generateSpec } from './api-docs.js';

describe('generateHelp', () => {
  it('shows endpoint summary and available methods', () => {
    const output = generateHelp('accounting', '/api/1/deals');
    expect(output).toContain('/api/1/deals');
    expect(output).toContain('GET');
    expect(output).toContain('POST');
  });

  it('shows help for parameterized paths', () => {
    const output = generateHelp('accounting', '/api/1/deals/123');
    expect(output).toContain('/api/1/deals/{id}');
  });

  it('returns error message for unknown path', () => {
    const output = generateHelp('accounting', '/api/1/nonexistent');
    expect(output).toContain('見つかりません');
  });
});

describe('generateDocs', () => {
  it('generates docs with parameter table', () => {
    const output = generateDocs('accounting', '/api/1/deals', 'GET');
    expect(output).toContain('company_id');
    expect(output).toContain('query');
    expect(output).toContain('パラメータ');
  });

  it('generates docs for POST with request body', () => {
    const output = generateDocs('accounting', '/api/1/deals', 'POST');
    expect(output).toContain('リクエストボディ');
    expect(output).toContain('issue_date');
  });

  it('includes response schema', () => {
    const output = generateDocs('accounting', '/api/1/deals', 'GET');
    expect(output).toContain('レスポンス');
  });

  it('shows all methods when method is not specified', () => {
    const output = generateDocs('accounting', '/api/1/deals');
    expect(output).toContain('GET');
    expect(output).toContain('POST');
  });

  it('resolves parameterized paths', () => {
    const output = generateDocs('accounting', '/api/1/deals/123', 'GET');
    expect(output).toContain('/api/1/deals/{id}');
  });

  it('returns error for unknown path', () => {
    const output = generateDocs('accounting', '/api/1/nonexistent');
    expect(output).toContain('見つかりません');
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
