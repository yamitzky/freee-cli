import { API_CONFIGS, type ApiType } from '../openapi/schema-loader.js';
import type { MinimalPathItem } from '../openapi/minimal-types.js';

/** Path prefixes to strip for shorthand display */
const PATH_PREFIXES: Record<ApiType, string> = {
  accounting: '/api/1/',
  hr: '/api/v1/',
  invoice: '/',
  pm: '/',
  sm: '/',
};

function toShorthand(service: ApiType, fullPath: string): string {
  const prefix = PATH_PREFIXES[service];
  if (fullPath.startsWith(prefix)) {
    return fullPath.slice(prefix.length);
  }
  return fullPath;
}

interface OperationInfo {
  method: string;
  summary: string;
}

function formatOperation(op: OperationInfo): string {
  // Extract the key action word from summary for compact display
  const summary = op.summary.replace(/一覧の/, '').replace(/の$/, '');
  return `${op.method}(${summary})`;
}

export function listEndpoints(service: ApiType, filter?: string): string {
  const config = API_CONFIGS[service];
  if (!config) return `Unknown service: ${service}`;

  // Group operations by path
  const pathOps = new Map<string, OperationInfo[]>();

  for (const [fullPath, pathItem] of Object.entries(config.schema.paths)) {
    const shorthand = toShorthand(service, fullPath);
    const ops: OperationInfo[] = [];

    for (const method of ['get', 'post', 'put', 'delete', 'patch'] as const) {
      const op = (pathItem as MinimalPathItem)[method];
      if (op) {
        ops.push({ method, summary: (op.summary ?? '').trim() });
      }
    }

    if (ops.length > 0) {
      pathOps.set(shorthand, ops);
    }
  }

  // Sort by path
  const sorted = [...pathOps.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  // Filter by keyword if provided
  const filtered = filter
    ? sorted.filter(([path, ops]) =>
        path.includes(filter) || ops.some((o) => o.summary.includes(filter)),
      )
    : sorted;

  if (filtered.length === 0) {
    return `No endpoints matching '${filter}'. Run: freee ${service} ls`;
  }

  // Format output
  const lines: string[] = [];
  const maxPathLen = Math.max(8, ...filtered.map(([p]) => p.length));

  lines.push(`${'RESOURCE'.padEnd(maxPathLen)}  OPERATIONS`);

  for (const [path, ops] of filtered) {
    const opsStr = ops.map(formatOperation).join(' | ');
    lines.push(`${path.padEnd(maxPathLen)}  ${opsStr}`);
  }

  return lines.join('\n');
}
