import { describe, expect, it } from 'vitest';
import { parseCommand } from './router.js';

describe('parseCommand', () => {
  it('should parse auth login', () => {
    expect(parseCommand(['auth', 'login'])).toEqual({
      group: 'auth',
      command: 'login',
      args: [],
    });
  });

  it('should parse accounting ls', () => {
    expect(parseCommand(['accounting', 'ls'])).toEqual({
      group: 'accounting',
      command: 'ls',
      args: [],
    });
  });

  it('should parse accounting with API path and --help as api command', () => {
    expect(parseCommand(['accounting', '/api/1/deals', '--help'])).toEqual({
      group: 'accounting',
      command: 'api',
      args: ['/api/1/deals', '--help'],
    });
  });

  it('should parse accounting with API path and query param as api command', () => {
    expect(parseCommand(['accounting', '/api/1/deals', 'company_id==123'])).toEqual({
      group: 'accounting',
      command: 'api',
      args: ['/api/1/deals', 'company_id==123'],
    });
  });

  it('should parse company set with argument', () => {
    expect(parseCommand(['company', 'set', '12345'])).toEqual({
      group: 'company',
      command: 'set',
      args: ['12345'],
    });
  });

  it('should return help when no args', () => {
    expect(parseCommand([])).toEqual({
      group: 'help',
      command: 'help',
      args: [],
    });
  });

  it('should parse bare auth as auth command', () => {
    expect(parseCommand(['auth'])).toEqual({
      group: 'auth',
      command: 'auth',
      args: [],
    });
  });

  it('should parse bare accounting as ls command', () => {
    expect(parseCommand(['accounting'])).toEqual({
      group: 'accounting',
      command: 'ls',
      args: [],
    });
  });

  it('should parse bare hr as ls command', () => {
    expect(parseCommand(['hr'])).toEqual({
      group: 'hr',
      command: 'ls',
      args: [],
    });
  });

  it('should parse bare invoice as ls command', () => {
    expect(parseCommand(['invoice'])).toEqual({
      group: 'invoice',
      command: 'ls',
      args: [],
    });
  });

  it('should parse bare pm as ls command', () => {
    expect(parseCommand(['pm'])).toEqual({
      group: 'pm',
      command: 'ls',
      args: [],
    });
  });

  it('should parse bare sm as ls command', () => {
    expect(parseCommand(['sm'])).toEqual({
      group: 'sm',
      command: 'ls',
      args: [],
    });
  });

  it('should parse hr with API path as api command', () => {
    expect(parseCommand(['hr', '/api/1/employees'])).toEqual({
      group: 'hr',
      command: 'api',
      args: ['/api/1/employees'],
    });
  });
});
