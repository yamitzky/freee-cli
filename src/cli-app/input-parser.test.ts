import { describe, expect, it } from 'vitest';
import { parseApiInput } from './input-parser.js';

describe('parseApiInput', () => {
  it('should parse query parameters with ==', () => {
    const result = parseApiInput(['/api/1/deals', 'company_id==123', 'type==income']);
    expect(result).toEqual({
      path: '/api/1/deals',
      method: undefined,
      query: { company_id: '123', type: 'income' },
      body: undefined,
      flags: [],
    });
  });

  it('should parse body string fields with =', () => {
    const result = parseApiInput(['/api/1/deals', 'type=income', 'issue_date=2025-01-01']);
    expect(result).toEqual({
      path: '/api/1/deals',
      method: undefined,
      query: {},
      body: { type: 'income', issue_date: '2025-01-01' },
      flags: [],
    });
  });

  it('should parse bracket notation for nested body fields', () => {
    const result = parseApiInput(['/api/1/deals', 'details[0][amount]=1000']);
    expect(result).toEqual({
      path: '/api/1/deals',
      method: undefined,
      query: {},
      body: { details: [{ amount: '1000' }] },
      flags: [],
    });
  });

  it('should parse := for typed JSON body fields', () => {
    const result = parseApiInput([
      '/api/1/deals',
      'amount:=5000',
      'details:=[{"tax_code":1}]',
    ]);
    expect(result).toEqual({
      path: '/api/1/deals',
      method: undefined,
      query: {},
      body: { amount: 5000, details: [{ tax_code: 1 }] },
      flags: [],
    });
  });

  it('should parse -d for full JSON body', () => {
    const result = parseApiInput(['/api/1/deals', '-d', '{"type":"income"}']);
    expect(result).toEqual({
      path: '/api/1/deals',
      method: undefined,
      query: {},
      body: { type: 'income' },
      flags: [],
    });
  });

  it('should parse -X for method override', () => {
    const result = parseApiInput(['/api/1/deals/1', '-X', 'DELETE']);
    expect(result).toEqual({
      path: '/api/1/deals/1',
      method: 'DELETE',
      query: {},
      body: undefined,
      flags: [],
    });
  });

  it('should uppercase -X method', () => {
    const result = parseApiInput(['/api/1/deals/1', '-X', 'delete']);
    expect(result).toEqual({
      path: '/api/1/deals/1',
      method: 'DELETE',
      query: {},
      body: undefined,
      flags: [],
    });
  });

  it('should parse flags like --help, --docs, --spec', () => {
    const result = parseApiInput(['/api/1/deals', '--help']);
    expect(result).toEqual({
      path: '/api/1/deals',
      method: undefined,
      query: {},
      body: undefined,
      flags: ['--help'],
    });
  });

  it('should collect multiple flags', () => {
    const result = parseApiInput(['/api/1/deals', '--help', '--docs']);
    expect(result).toEqual({
      path: '/api/1/deals',
      method: undefined,
      query: {},
      body: undefined,
      flags: ['--help', '--docs'],
    });
  });

  it('should handle mixed query and body params', () => {
    const result = parseApiInput([
      '/api/1/deals',
      'company_id==123',
      'type=income',
      'amount:=5000',
    ]);
    expect(result).toEqual({
      path: '/api/1/deals',
      method: undefined,
      query: { company_id: '123' },
      body: { type: 'income', amount: 5000 },
      flags: [],
    });
  });

  it('should handle empty args gracefully', () => {
    const result = parseApiInput([]);
    expect(result).toEqual({
      path: '',
      method: undefined,
      query: {},
      body: undefined,
      flags: [],
    });
  });

  it('should handle deeply nested bracket notation', () => {
    const result = parseApiInput([
      '/api/1/deals',
      'details[0][account_items][0][id]=1',
      'details[0][account_items][0][amount]=1000',
    ]);
    expect(result).toEqual({
      path: '/api/1/deals',
      method: undefined,
      query: {},
      body: {
        details: [{ account_items: [{ id: '1', amount: '1000' }] }],
      },
      flags: [],
    });
  });

  it('should handle -d combined with query params', () => {
    const result = parseApiInput([
      '/api/1/deals',
      'company_id==123',
      '-d',
      '{"type":"income"}',
    ]);
    expect(result).toEqual({
      path: '/api/1/deals',
      method: undefined,
      query: { company_id: '123' },
      body: { type: 'income' },
      flags: [],
    });
  });
});
