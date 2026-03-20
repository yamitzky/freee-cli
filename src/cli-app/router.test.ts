import { describe, expect, it } from 'vitest';
import { parseCommand } from './router.js';

describe('parseCommand', () => {
  it('should parse auth login', () => {
    expect(parseCommand(['auth', 'login'])).toEqual({
      group: 'auth',
      command: 'login',
      method: undefined,
      args: [],
    });
  });

  it('should parse accounting ls', () => {
    expect(parseCommand(['accounting', 'ls'])).toEqual({
      group: 'accounting',
      command: 'ls',
      method: undefined,
      args: [],
    });
  });

  it('should parse accounting with API path and --help as api command', () => {
    expect(parseCommand(['accounting', '/api/1/deals', '--help'])).toEqual({
      group: 'accounting',
      command: 'api',
      method: undefined,
      args: ['/api/1/deals', '--help'],
    });
  });

  it('should parse accounting with API path and query param as api command', () => {
    expect(parseCommand(['accounting', '/api/1/deals', 'company_id==123'])).toEqual({
      group: 'accounting',
      command: 'api',
      method: undefined,
      args: ['/api/1/deals', 'company_id==123'],
    });
  });

  it('should parse company set with argument', () => {
    expect(parseCommand(['company', 'set', '12345'])).toEqual({
      group: 'company',
      command: 'set',
      method: undefined,
      args: ['12345'],
    });
  });

  it('should return help when no args', () => {
    expect(parseCommand([])).toEqual({
      group: 'help',
      command: 'help',
      method: undefined,
      args: [],
    });
  });

  it('should parse bare auth as auth command', () => {
    expect(parseCommand(['auth'])).toEqual({
      group: 'auth',
      command: 'auth',
      method: undefined,
      args: [],
    });
  });

  it('should parse bare accounting as ls command', () => {
    expect(parseCommand(['accounting'])).toEqual({
      group: 'accounting',
      command: 'ls',
      method: undefined,
      args: [],
    });
  });

  it('should parse bare hr as ls command', () => {
    expect(parseCommand(['hr'])).toEqual({
      group: 'hr',
      command: 'ls',
      method: undefined,
      args: [],
    });
  });

  it('should parse bare invoice as ls command', () => {
    expect(parseCommand(['invoice'])).toEqual({
      group: 'invoice',
      command: 'ls',
      method: undefined,
      args: [],
    });
  });

  it('should parse bare pm as ls command', () => {
    expect(parseCommand(['pm'])).toEqual({
      group: 'pm',
      command: 'ls',
      method: undefined,
      args: [],
    });
  });

  it('should parse bare sm as ls command', () => {
    expect(parseCommand(['sm'])).toEqual({
      group: 'sm',
      command: 'ls',
      method: undefined,
      args: [],
    });
  });

  it('should parse hr with API path as api command', () => {
    expect(parseCommand(['hr', '/api/1/employees'])).toEqual({
      group: 'hr',
      command: 'api',
      method: undefined,
      args: ['/api/1/employees'],
    });
  });

  // Method subcommand tests
  it('should parse accounting get deals as method GET', () => {
    expect(parseCommand(['accounting', 'get', 'deals'])).toEqual({
      group: 'accounting',
      command: 'api',
      method: 'GET',
      args: ['deals'],
    });
  });

  it('should parse accounting post deals with params as method POST', () => {
    expect(parseCommand(['accounting', 'post', 'deals', 'type=expense'])).toEqual({
      group: 'accounting',
      command: 'api',
      method: 'POST',
      args: ['deals', 'type=expense'],
    });
  });

  it('should parse accounting delete deals/123 as method DELETE', () => {
    expect(parseCommand(['accounting', 'delete', 'deals/123'])).toEqual({
      group: 'accounting',
      command: 'api',
      method: 'DELETE',
      args: ['deals/123'],
    });
  });

  it('should parse accounting put deals/123 with -d as method PUT', () => {
    expect(parseCommand(['accounting', 'put', 'deals/123', '-d', '{}'])).toEqual({
      group: 'accounting',
      command: 'api',
      method: 'PUT',
      args: ['deals/123', '-d', '{}'],
    });
  });

  it('should parse sm patch businesses/123 as method PATCH', () => {
    expect(parseCommand(['sm', 'patch', 'businesses/123'])).toEqual({
      group: 'sm',
      command: 'api',
      method: 'PATCH',
      args: ['businesses/123'],
    });
  });

  // Service subcommand tests
  it('should parse accounting docs deals as docs command', () => {
    expect(parseCommand(['accounting', 'docs', 'deals'])).toEqual({
      group: 'accounting',
      command: 'docs',
      method: undefined,
      args: ['deals'],
    });
  });

  it('should parse accounting help deals as help command', () => {
    expect(parseCommand(['accounting', 'help', 'deals'])).toEqual({
      group: 'accounting',
      command: 'help',
      method: undefined,
      args: ['deals'],
    });
  });

  it('should parse accounting spec deals as spec command', () => {
    expect(parseCommand(['accounting', 'spec', 'deals'])).toEqual({
      group: 'accounting',
      command: 'spec',
      method: undefined,
      args: ['deals'],
    });
  });

  // Backward compatibility
  it('should parse accounting deals as api command with no method (backward compat)', () => {
    expect(parseCommand(['accounting', 'deals'])).toEqual({
      group: 'accounting',
      command: 'api',
      method: undefined,
      args: ['deals'],
    });
  });
});
