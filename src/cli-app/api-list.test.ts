import { describe, it, expect } from 'vitest';
import { listEndpoints } from './api-list.js';

describe('listEndpoints', () => {
  it('lists accounting endpoints in table format', () => {
    const output = listEndpoints('accounting');
    expect(output).toContain('METHOD');
    expect(output).toContain('PATH');
    expect(output).toContain('/api/1/deals');
    expect(output).toContain('GET');
  });

  it('includes summary column', () => {
    const output = listEndpoints('accounting');
    const lines = output.split('\n').filter(l => l.includes('/api/1/deals'));
    expect(lines.length).toBeGreaterThan(0);
    expect(lines[0]).toContain('取引');
  });
});
