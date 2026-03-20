import { API_CONFIGS, type ApiType } from '../openapi/schema-loader.js';

/**
 * API path prefixes for each service.
 * Used to expand shorthands like "deals" → "/api/1/deals"
 */
const PATH_PREFIXES: Record<ApiType, string> = {
  accounting: '/api/1/',
  hr: '/api/v1/',
  invoice: '/invoices/',
  pm: '/projects/',
  sm: '/businesses/',
};

/**
 * Expand a shorthand path to a full API path.
 * "deals" → "/api/1/deals"
 * "deals/123" → "/api/1/deals/123"
 * "/api/1/deals" → "/api/1/deals" (already full)
 */
export function expandPath(service: ApiType, input: string): string {
  if (input.startsWith('/')) return input;
  return `${PATH_PREFIXES[service]}${input}`;
}

/**
 * Resolve a concrete path to its schema path pattern.
 * "/api/1/deals/123" → "/api/1/deals/{id}"
 * "deals/123" → "/api/1/deals/{id}" (with expansion)
 */
export function resolveSchemaPath(service: ApiType, concretePath: string): string | null {
  const fullPath = expandPath(service, concretePath);
  const config = API_CONFIGS[service];
  const paths = config.schema.paths;

  // Exact match
  if (fullPath in paths) return fullPath;

  // Pattern match (replace path params with regex)
  for (const schemaPath of Object.keys(paths)) {
    const pattern = schemaPath.replace(/\{[^}]+\}/g, '[^/]+');
    if (new RegExp(`^${pattern}$`).test(fullPath)) return schemaPath;
  }

  return null;
}
