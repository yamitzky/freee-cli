import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { API_CONFIGS, type ApiType } from '../openapi/schema-loader.js';
import type { MinimalPathItem } from '../openapi/minimal-types.js';
import { resolveSchemaPath } from './path-resolver.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---- Types for full OpenAPI schema ----

interface SchemaObject {
  type?: string;
  properties?: Record<string, SchemaObject>;
  required?: string[];
  items?: SchemaObject;
  $ref?: string;
  allOf?: SchemaObject[];
  oneOf?: SchemaObject[];
  anyOf?: SchemaObject[];
  description?: string;
  example?: unknown;
  enum?: unknown[];
  format?: string;
}

interface ParameterObject {
  name: string;
  in: string;
  required?: boolean;
  description?: string;
  schema?: SchemaObject;
  type?: string;
}

interface RequestBodyObject {
  content?: Record<string, { schema?: SchemaObject }>;
  required?: boolean;
}

interface ResponseObject {
  description?: string;
  content?: Record<string, { schema?: SchemaObject }>;
}

interface OperationObject {
  summary?: string;
  description?: string;
  parameters?: ParameterObject[];
  requestBody?: RequestBodyObject;
  responses?: Record<string, ResponseObject>;
}

interface FullPathItem {
  get?: OperationObject;
  post?: OperationObject;
  put?: OperationObject;
  delete?: OperationObject;
  patch?: OperationObject;
}

interface OpenApiSchema {
  paths: Record<string, FullPathItem>;
  components?: {
    schemas?: Record<string, SchemaObject>;
    parameters?: Record<string, ParameterObject>;
  };
}

// ---- Full schema loading ----

const FULL_SCHEMA_FILES: Record<ApiType, string> = {
  accounting: 'accounting-api-schema.json',
  hr: 'hr-api-schema.json',
  invoice: 'invoice-api-schema.json',
  pm: 'pm-api-schema.json',
  sm: 'sm-api-schema.json',
};

let _fullSchemasDir: string | null = null;

function getFullSchemasDir(): string {
  if (_fullSchemasDir) return _fullSchemasDir;

  const candidates = [
    path.resolve(__dirname, './openapi'),
    path.resolve(__dirname, '../dist/openapi'),
    path.resolve(__dirname, '../../openapi'),
  ];

  for (const c of candidates) {
    if (fs.existsSync(path.join(c, 'accounting-api-schema.json'))) {
      _fullSchemasDir = c;
      return c;
    }
  }

  throw new Error(
    `Could not find full OpenAPI schema directory. Searched paths:\n${candidates.join('\n')}`
  );
}

const _loadedFullSchemas: Partial<Record<ApiType, OpenApiSchema>> = {};

function loadFullSchema(service: ApiType): OpenApiSchema {
  if (_loadedFullSchemas[service]) {
    // biome-ignore lint/style/noNonNullAssertion: checked above
    return _loadedFullSchemas[service]!;
  }
  const dir = getFullSchemasDir();
  const filePath = path.join(dir, FULL_SCHEMA_FILES[service]);
  const content = fs.readFileSync(filePath, 'utf-8');
  const parsed = JSON.parse(content) as OpenApiSchema;
  _loadedFullSchemas[service] = parsed;
  return parsed;
}

// ---- HTML stripping ----

function stripHtml(text: string): string {
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

// ---- $ref resolution ----

function resolveParamRef(param: ParameterObject, root: OpenApiSchema): ParameterObject {
  if ('$ref' in param && typeof (param as { $ref: string }).$ref === 'string') {
    const ref = (param as { $ref: string }).$ref;
    const match = ref.match(/^#\/components\/parameters\/(.+)$/);
    if (match && root.components?.parameters) {
      return root.components.parameters[match[1]] ?? param;
    }
  }
  return param;
}

function resolveRef(schema: SchemaObject, root: OpenApiSchema): SchemaObject {
  if (schema.$ref) {
    if (!schema.$ref.startsWith('#/components/schemas/')) {
      // Unsupported $ref format (e.g., #/paths/...) - return as-is
      return { type: 'object' };
    }
    const refPath = schema.$ref.replace('#/components/schemas/', '');
    const resolved = root.components?.schemas?.[refPath];
    if (!resolved) return { type: 'object' };
    return resolveRef(resolved, root);
  }
  if (schema.allOf) {
    const merged: SchemaObject = { type: 'object', properties: {}, required: [] };
    for (const sub of schema.allOf) {
      const resolved = resolveRef(sub, root);
      if (resolved.properties) {
        merged.properties = { ...merged.properties, ...resolved.properties };
      }
      if (resolved.required) {
        merged.required = [...(merged.required ?? []), ...resolved.required];
      }
    }
    return merged;
  }
  if (schema.oneOf?.length) return resolveRef(schema.oneOf[0], root);
  if (schema.anyOf?.length) return resolveRef(schema.anyOf[0], root);
  return schema;
}

// ---- Schema field rendering ----

function getTypeString(schema: SchemaObject, root: OpenApiSchema): string {
  const resolved = resolveRef(schema, root);
  if (resolved.type === 'array' && resolved.items) {
    const itemType = getTypeString(resolved.items, root);
    return `array[${itemType}]`;
  }
  return resolved.type ?? 'object';
}

// ---- Public API ----

const HTTP_METHODS = ['get', 'post', 'put', 'delete', 'patch'] as const;

export function generateMethodList(service: ApiType, concretePath: string): string {
  const schemaPath = resolveSchemaPath(service, concretePath);
  if (!schemaPath) {
    return `パス '${concretePath}' は ${API_CONFIGS[service].name} に見つかりません。`;
  }

  const config = API_CONFIGS[service];
  const pathItem = config.schema.paths[schemaPath] as MinimalPathItem;
  const lines: string[] = [];

  lines.push(`${config.name}: ${schemaPath}`);
  lines.push('');

  for (const method of HTTP_METHODS) {
    const op = pathItem[method];
    if (!op) continue;
    const summary = op.summary ?? '';
    lines.push(`  ${method.toUpperCase()}  ${summary}`);
    lines.push(`    freee ${service} ${method} ${concretePath} --help`);
    lines.push('');
  }

  return lines.join('\n');
}

interface GenerateDocsOptions {
  includeResponse?: boolean;
}

function renderParamLine(name: string, required: boolean, desc: string, indent = ''): string {
  const reqMark = required ? ' (必須)' : '';
  const padding = Math.max(1, 28 - indent.length - name.length - reqMark.length);
  return `${indent}${name}${reqMark}${' '.repeat(padding)}${desc}`;
}

export function generateDocs(service: ApiType, concretePath: string, method: string, options: GenerateDocsOptions = {}): string {
  const schemaPath = resolveSchemaPath(service, concretePath);
  if (!schemaPath) {
    return `パス '${concretePath}' は ${API_CONFIGS[service].name} に見つかりません。`;
  }

  const fullSchema = loadFullSchema(service);
  const pathItem = fullSchema.paths[schemaPath];
  if (!pathItem) {
    return `パス '${schemaPath}' のスキーマが見つかりません。`;
  }

  const m = method.toLowerCase() as (typeof HTTP_METHODS)[number];
  const op = pathItem[m];
  if (!op) {
    return `${method.toUpperCase()} メソッドは ${schemaPath} にありません。`;
  }

  const lines: string[] = [];

  // Header
  lines.push(`freee ${service} ${m} ${concretePath}`);
  if (op.summary) lines.push(op.summary);
  lines.push('');

  // Usage examples
  const pathParams: ParameterObject[] = [];
  const queryParams: ParameterObject[] = [];
  if (op.parameters) {
    for (const rawParam of op.parameters) {
      const param = resolveParamRef(rawParam, fullSchema);
      if (param.in === 'path') pathParams.push(param);
      else if (param.in === 'query') queryParams.push(param);
    }
  }

  lines.push('使い方:');
  lines.push(`  freee ${service} ${m} ${concretePath}`);
  // Show example with a few common query params
  const exampleParams = queryParams
    .filter((p) => p.name !== 'company_id' && p.name !== 'offset')
    .slice(0, 2);
  if (exampleParams.length > 0) {
    const exampleParts = exampleParams.map((p) => `${p.name}==...`).join(' ');
    lines.push(`  freee ${service} ${m} ${concretePath} ${exampleParts}`);
  }
  lines.push('');

  // Query parameters (company_id is auto-injected, hide from help)
  const visibleQueryParams = queryParams.filter((p) => p.name !== 'company_id');
  if (visibleQueryParams.length > 0) {
    lines.push('パラメータ:');
    for (const param of visibleQueryParams) {
      const desc = param.description ? stripHtml(param.description) : '';
      const truncDesc = desc.length > 60 ? `${desc.substring(0, 57)}...` : desc;
      lines.push(renderParamLine(param.name, param.required === true, truncDesc, '  '));
    }
    lines.push('');
  }

  // Request body
  if (op.requestBody) {
    const bodySchema =
      op.requestBody.content?.['application/json']?.schema ??
      op.requestBody.content?.['application/x-www-form-urlencoded']?.schema;
    if (bodySchema) {
      lines.push('リクエストボディ:');
      const resolved = resolveRef(bodySchema, fullSchema);
      const props = resolved.properties;
      if (props) {
        const required = new Set(resolved.required ?? []);
        for (const [name, propSchema] of Object.entries(props)) {
          if (name === 'company_id') continue;
          const prop = resolveRef(propSchema, fullSchema);
          const desc = prop.description ? stripHtml(prop.description) : '';
          const truncDesc = desc.length > 60 ? `${desc.substring(0, 57)}...` : desc;
          lines.push(renderParamLine(name, required.has(name), truncDesc, '  '));

          // Show nested fields for arrays/objects (one level)
          if (prop.type === 'array' && prop.items) {
            const itemResolved = resolveRef(prop.items, fullSchema);
            if (itemResolved.properties) {
              const itemRequired = new Set(itemResolved.required ?? []);
              for (const [subName, subSchema] of Object.entries(itemResolved.properties)) {
                const sub = resolveRef(subSchema, fullSchema);
                const subDesc = sub.description ? stripHtml(sub.description) : '';
                const truncSubDesc = subDesc.length > 50 ? `${subDesc.substring(0, 47)}...` : subDesc;
                lines.push(renderParamLine(subName, itemRequired.has(subName), truncSubDesc, '    '));
              }
            }
          }
        }
      }
      lines.push('');
    }
  }

  // Response (only when --response flag is specified)
  if (options.includeResponse) {
    const successCode = op.responses?.['200'] ? '200' : op.responses?.['201'] ? '201' : null;
    if (successCode) {
      const resp = op.responses?.[successCode];
      const respSchema = resp?.content?.['application/json']?.schema;
      if (respSchema) {
        lines.push('レスポンス:');
        const resolved = resolveRef(respSchema, fullSchema);
        const props = resolved.properties;
        if (props) {
          const required = new Set(resolved.required ?? []);
          for (const [name, propSchema] of Object.entries(props)) {
            const typeStr = getTypeString(propSchema, fullSchema);
            lines.push(renderParamLine(name, required.has(name), typeStr, '  '));
          }
        }
        lines.push('');
        lines.push(`(詳細は \`freee ${service} ${m} ${concretePath} --spec\` で確認)`);
        lines.push('');
      }
    }
  }

  return lines.join('\n');
}

export function generateSpec(service: ApiType, concretePath: string): string {
  const schemaPath = resolveSchemaPath(service, concretePath);
  if (!schemaPath) {
    return JSON.stringify({ error: `パス '${concretePath}' は ${API_CONFIGS[service].name} に見つかりません。` }, null, 2);
  }

  const fullSchema = loadFullSchema(service);
  const pathItem = fullSchema.paths[schemaPath];
  if (!pathItem) {
    return JSON.stringify({ error: `パス '${schemaPath}' のスキーマが見つかりません。` }, null, 2);
  }

  return JSON.stringify(pathItem, null, 2);
}
