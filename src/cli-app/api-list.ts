import { API_CONFIGS, type ApiType } from '../openapi/schema-loader.js';
import type { MinimalPathItem } from '../openapi/minimal-types.js';

export function listEndpoints(service: ApiType, filter?: string): string {
  const config = API_CONFIGS[service];
  if (!config) return `Unknown service: ${service}`;

  const rows: Array<[string, string, string]> = [];
  for (const [path, pathItem] of Object.entries(config.schema.paths)) {
    for (const method of ['get', 'post', 'put', 'delete', 'patch'] as const) {
      const op = (pathItem as MinimalPathItem)[method];
      if (op) rows.push([method.toUpperCase(), path, op.summary ?? '']);
    }
  }

  rows.sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0]));

  // Filter by keyword if provided (matches path or summary)
  const filtered = filter
    ? rows.filter((r) => r[1].includes(filter) || r[2].includes(filter))
    : rows;

  if (filtered.length === 0) {
    return `No endpoints matching '${filter}'. Run: freee ${service} ls`;
  }

  const headers: [string, string, string] = ['METHOD', 'PATH', 'SUMMARY'];
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...filtered.map((r) => r[i].length)),
  );
  const formatRow = (row: [string, string, string]) =>
    row.map((cell, i) => cell.padEnd(widths[i])).join('  ');

  return [formatRow(headers), ...filtered.map(formatRow)].join('\n');
}
