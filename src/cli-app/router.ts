type ParsedCommand = {
  group: string;
  command: string;
  method: string | undefined;
  args: string[];
};

const API_SERVICES = new Set(['accounting', 'hr', 'invoice', 'pm', 'sm']);

const METHOD_SUBCOMMANDS: Record<string, string> = {
  get: 'GET',
  post: 'POST',
  put: 'PUT',
  delete: 'DELETE',
  patch: 'PATCH',
};

const SERVICE_SUBCOMMANDS = new Set(['ls']);

export function parseCommand(argv: string[]): ParsedCommand {
  if (argv.length === 0) {
    return { group: 'help', command: 'help', method: undefined, args: [] };
  }

  const [group, ...rest] = argv;

  if (API_SERVICES.has(group)) {
    if (rest.length === 0) {
      return { group, command: 'ls', method: undefined, args: [] };
    }
    const [first, ...remaining] = rest;
    if (first === 'ls') {
      return { group, command: 'ls', method: undefined, args: remaining };
    }
    if (SERVICE_SUBCOMMANDS.has(first)) {
      return { group, command: first, method: undefined, args: remaining };
    }
    if (METHOD_SUBCOMMANDS[first] !== undefined) {
      return { group, command: 'api', method: METHOD_SUBCOMMANDS[first], args: remaining };
    }
    // Both full paths (/api/1/deals) and shorthands (deals, deals/123) → api command (backward compat)
    return { group, command: 'api', method: undefined, args: [first, ...remaining] };
  }

  // configure is handled directly at the top level
  if (group === 'configure') {
    return { group: 'configure', command: 'configure', method: undefined, args: rest };
  }

  // Other groups: auth, company, help, etc.
  if (rest.length === 0) {
    return { group, command: group, method: undefined, args: [] };
  }

  const [command, ...args] = rest;
  return { group, command, method: undefined, args };
}
