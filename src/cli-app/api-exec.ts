import { makeApiRequest } from '../api/client.js';
import { getValidAccessToken } from '../auth/tokens.js';
import { getCurrentCompanyId } from '../config/companies.js';
import { validatePathForService, type ApiType } from '../openapi/schema-loader.js';
import type { ApiInput } from './input-parser.js';

const DEFAULT_MAX_ITEMS = 10;

/**
 * Truncate large arrays in API responses to save tokens.
 * Shows first N items + total count.
 */
function truncateResponse(data: unknown, maxItems: number): unknown {
  if (typeof data !== 'object' || data === null) return data;

  const obj = data as Record<string, unknown>;
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (Array.isArray(value) && value.length > maxItems) {
      result[key] = value.slice(0, maxItems);
      result[`${key}_truncated`] = { shown: maxItems, total: value.length };
    } else {
      result[key] = value;
    }
  }

  return result;
}

export async function executeApiRequest(service: ApiType, input: ApiInput): Promise<string> {
  const token = await getValidAccessToken();
  if (!token) return 'Not authenticated. Run: freee auth login';

  const method = input.method ?? (input.body ? 'POST' : 'GET');
  const validation = validatePathForService(method, input.path, service);
  if (!validation.isValid) return validation.message;

  const companyId = await getCurrentCompanyId();
  const query: Record<string, string> = { ...input.query };
  if (companyId && !query.company_id) query.company_id = companyId;

  let body = input.body;
  if (body && companyId && !('company_id' in body)) {
    body = { ...body, company_id: Number(companyId) };
  }

  const result = await makeApiRequest(method, input.path, query, body, validation.baseUrl);

  if (result === null) return '(no content)';
  if (
    typeof result === 'object' &&
    result !== null &&
    'type' in result &&
    (result as Record<string, unknown>).type === 'binary'
  ) {
    return `File saved: ${(result as Record<string, unknown>).filePath}`;
  }

  // Parse --max flag or use default truncation
  const maxFlag = input.flags.find((f) => f.startsWith('--max='));
  const maxItems = maxFlag ? Number.parseInt(maxFlag.split('=')[1], 10) : DEFAULT_MAX_ITEMS;
  const noTruncate = input.flags.includes('--no-truncate');

  const output = noTruncate ? result : truncateResponse(result, maxItems);
  return JSON.stringify(output, null, 2);
}
