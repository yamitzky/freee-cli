import { makeApiRequest } from '../api/client.js';
import { getValidAccessToken } from '../auth/tokens.js';
import { getCurrentCompanyId } from '../config/companies.js';
import { validatePathForService, type ApiType } from '../openapi/schema-loader.js';
import type { ApiInput } from './input-parser.js';

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
    (result as any).type === 'binary'
  ) {
    return `File saved: ${(result as any).filePath}`;
  }
  return JSON.stringify(result, null, 2);
}
