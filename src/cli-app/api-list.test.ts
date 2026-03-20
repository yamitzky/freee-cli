import { describe, it, expect } from 'vitest';
import { listEndpoints } from './api-list.js';

describe('listEndpoints', () => {
  it('lists accounting endpoints grouped by resource', () => {
    const output = listEndpoints('accounting');
    expect(output).toContain('RESOURCE');
    expect(output).toContain('OPERATIONS');
    expect(output).toContain('deals');
    expect(output).toContain('取引');
  });

  it('shows shorthand paths without /api/1/ prefix', () => {
    const output = listEndpoints('accounting');
    const lines = output.split('\n').filter((l) => l.startsWith('deals'));
    expect(lines.length).toBeGreaterThan(0);
    // Should not contain /api/1/ prefix
    expect(lines[0]).not.toContain('/api/1/');
  });

  it('groups operations by path', () => {
    const output = listEndpoints('accounting');
    // deals path should show GET and POST on one line
    const dealsLine = output.split('\n').find((l) => /^deals\s/.test(l));
    expect(dealsLine).toContain('GET');
    expect(dealsLine).toContain('POST');
  });

  it('filters by keyword', () => {
    const output = listEndpoints('accounting', 'deals');
    const lines = output.split('\n').filter((l) => l.trim() !== '');
    // Header + deals-related paths only
    expect(lines.length).toBeLessThan(20);
    expect(lines.every((l) => l.includes('deals') || l.includes('RESOURCE'))).toBe(true);
  });

  it('returns message when filter has no matches', () => {
    const output = listEndpoints('accounting', 'nonexistent_xyz');
    expect(output).toContain('No endpoints matching');
  });
});
