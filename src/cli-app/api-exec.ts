import { makeApiRequest } from '../api/client.js';
import { getValidAccessToken } from '../auth/tokens.js';
import { getCurrentCompanyId } from '../config/companies.js';
import { validatePathForService, type ApiType } from '../openapi/schema-loader.js';
import type { ApiInput } from './input-parser.js';
import { expandPath } from './path-resolver.js';

const DEFAULT_MAX_ITEMS = 10;

/**
 * Find the main data array in a response object.
 * freee APIs typically return { "deals": [...], "meta": { "total_count": N } }
 */
function findMainArray(data: Record<string, unknown>): { key: string; items: unknown[] } | null {
  for (const [key, value] of Object.entries(data)) {
    if (key === 'meta') continue;
    if (Array.isArray(value)) return { key, items: value };
  }
  return null;
}

/**
 * Format response as compact table (TSV-like).
 * Extracts top-level fields from array items, truncates to maxItems.
 */
function formatCompact(data: unknown, maxItems: number): string {
  if (typeof data !== 'object' || data === null) {
    return String(data);
  }

  const obj = data as Record<string, unknown>;
  const mainArray = findMainArray(obj);

  if (!mainArray || mainArray.items.length === 0) {
    // No array found or empty — show as compact JSON
    return JSON.stringify(data, null, 2);
  }

  const { key, items } = mainArray;
  const meta = obj.meta as Record<string, unknown> | undefined;
  const totalCount = meta?.total_count ?? items.length;

  // Extract column names from first item (top-level scalar fields only)
  const firstItem = items[0] as Record<string, unknown>;
  const columns = Object.keys(firstItem).filter((k) => {
    const v = firstItem[k];
    return v === null || typeof v !== 'object';
  });

  // Limit columns to keep output compact
  const maxCols = 6;
  const displayCols = columns.slice(0, maxCols);

  // Truncate items
  const displayItems = items.slice(0, maxItems);

  // Build table
  const lines: string[] = [];
  lines.push(`${key}: ${displayItems.length} of ${totalCount} items`);
  lines.push('');
  lines.push(displayCols.join('\t'));

  for (const item of displayItems) {
    const row = item as Record<string, unknown>;
    const cells = displayCols.map((col) => {
      const v = row[col];
      if (v === null || v === undefined) return '';
      const s = String(v);
      return s.length > 50 ? `${s.slice(0, 47)}...` : s;
    });
    lines.push(cells.join('\t'));
  }

  if (Number(totalCount) > maxItems) {
    lines.push(`... and ${Number(totalCount) - maxItems} more (use --max=N or --json)`);
  }

  return lines.join('\n');
}

export async function executeApiRequest(service: ApiType, input: ApiInput): Promise<string> {
  const token = await getValidAccessToken();
  if (!token) return 'Not authenticated. Run: freee auth login';

  const method = input.method ?? (input.body ? 'POST' : 'GET');
  const apiPath = expandPath(service, input.path);
  const validation = validatePathForService(method, apiPath, service);
  if (!validation.isValid) return validation.message;

  const companyId = await getCurrentCompanyId();
  const query: Record<string, string> = { ...input.query };
  if (companyId && !query.company_id) query.company_id = companyId;

  let body = input.body;
  if (body && companyId && !('company_id' in body)) {
    body = { ...body, company_id: Number(companyId) };
  }

  if (input.flags.includes('--verbose')) {
    const url = `${validation.baseUrl}${apiPath}`;
    const qs = Object.entries(query).map(([k, v]) => `${k}=${v}`).join('&');
    console.error(`${method} ${url}${qs ? `?${qs}` : ''}`);
    if (body) console.error(`Body: ${JSON.stringify(body)}`);
  }

  const result = await makeApiRequest(method, apiPath, query, body, validation.baseUrl);

  if (result === null) return '(no content)';
  if (
    typeof result === 'object' &&
    result !== null &&
    'type' in result &&
    (result as Record<string, unknown>).type === 'binary'
  ) {
    return `File saved: ${(result as Record<string, unknown>).filePath}`;
  }

  // Parse output flags
  const maxFlag = input.flags.find((f) => f.startsWith('--max='));
  const maxItems = maxFlag ? Number.parseInt(maxFlag.split('=')[1], 10) : DEFAULT_MAX_ITEMS;
  const useJson = input.flags.includes('--json');

  if (useJson) {
    return JSON.stringify(result, null, 2);
  }

  return formatCompact(result, maxItems);
}
