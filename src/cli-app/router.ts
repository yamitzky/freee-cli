export type ParsedCommand = {
  group: string;
  command: string;
  args: string[];
};

const API_SERVICES = new Set(['accounting', 'hr', 'invoice', 'pm', 'sm']);

export function parseCommand(argv: string[]): ParsedCommand {
  if (argv.length === 0) {
    return { group: 'help', command: 'help', args: [] };
  }

  const [group, ...rest] = argv;

  if (API_SERVICES.has(group)) {
    if (rest.length === 0) {
      return { group, command: 'ls', args: [] };
    }
    const [first, ...remaining] = rest;
    if (first === 'ls') {
      return { group, command: 'ls', args: remaining };
    }
    // Both full paths (/api/1/deals) and shorthands (deals, deals/123) → api command
    return { group, command: 'api', args: [first, ...remaining] };
  }

  // Other groups: auth, company, help, etc.
  if (rest.length === 0) {
    return { group, command: group, args: [] };
  }

  const [command, ...args] = rest;
  return { group, command, args };
}
