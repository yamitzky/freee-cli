import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { API_CONFIGS, type ApiType } from '../openapi/schema-loader.js';
import type { MinimalPathItem } from '../openapi/minimal-types.js';

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

// ---- Path resolution ----

function resolveSchemaPath(service: ApiType, concretePath: string): string | null {
  const config = API_CONFIGS[service];
  const paths = config.schema.paths;

  if (concretePath in paths) return concretePath;

  for (const schemaPath of Object.keys(paths)) {
    const pattern = schemaPath.replace(/\{[^}]+\}/g, '[^/]+');
    if (new RegExp(`^${pattern}$`).test(concretePath)) return schemaPath;
  }

  return null;
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

function resolveRef(schema: SchemaObject, root: OpenApiSchema): SchemaObject {
  if (schema.$ref) {
    const refPath = schema.$ref.replace('#/components/schemas/', '');
    const resolved = root.components?.schemas?.[refPath] ?? schema;
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

function renderFields(
  schema: SchemaObject,
  root: OpenApiSchema,
  depth: number,
  requiredFields?: string[]
): string[] {
  if (depth > 3) return [];

  const resolved = resolveRef(schema, root);
  const props = resolved.properties;
  if (!props) return [];

  const required = new Set(requiredFields ?? resolved.required ?? []);
  const lines: string[] = [];
  const indent = '  '.repeat(depth);

  for (const [name, propSchema] of Object.entries(props)) {
    const prop = resolveRef(propSchema, root);
    const typeStr = getTypeString(propSchema, root);
    const isRequired = required.has(name) ? 'Yes' : '';
    const desc = prop.description ? stripHtml(prop.description) : '';
    const truncDesc = desc.length > 60 ? `${desc.substring(0, 57)}...` : desc;

    lines.push(`${indent}| ${name} | ${isRequired} | ${typeStr} | ${truncDesc} |`);

    // Recurse into nested objects
    if (prop.type === 'object' && prop.properties && depth < 3) {
      lines.push(...renderFields(prop, root, depth + 1));
    }
    if (prop.type === 'array' && prop.items && depth < 3) {
      const itemResolved = resolveRef(prop.items, root);
      if (itemResolved.type === 'object' && itemResolved.properties) {
        lines.push(...renderFields(itemResolved, root, depth + 1));
      }
    }
  }

  return lines;
}

// ---- Public API ----

const HTTP_METHODS = ['get', 'post', 'put', 'delete', 'patch'] as const;

export function generateHelp(service: ApiType, concretePath: string): string {
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
    lines.push(`    docs: freee ${service} ${schemaPath} --docs${method !== 'get' ? ` --method ${method.toUpperCase()}` : ''}`);
    lines.push(`    spec: freee ${service} ${schemaPath} --spec`);
    lines.push('');
  }

  return lines.join('\n');
}

export function generateDocs(service: ApiType, concretePath: string, method?: string): string {
  const schemaPath = resolveSchemaPath(service, concretePath);
  if (!schemaPath) {
    return `パス '${concretePath}' は ${API_CONFIGS[service].name} に見つかりません。`;
  }

  const fullSchema = loadFullSchema(service);
  const pathItem = fullSchema.paths[schemaPath];
  if (!pathItem) {
    return `パス '${schemaPath}' のスキーマが見つかりません。`;
  }

  const methods = method
    ? [method.toLowerCase() as (typeof HTTP_METHODS)[number]]
    : HTTP_METHODS.filter((m) => pathItem[m]);

  const sections: string[] = [];
  sections.push(`# ${API_CONFIGS[service].name}: ${schemaPath}`);
  sections.push('');

  for (const m of methods) {
    const op = pathItem[m];
    if (!op) continue;

    sections.push(`## ${m.toUpperCase()} ${schemaPath}`);
    if (op.summary) sections.push(`${op.summary}`);
    if (op.description) {
      sections.push('');
      sections.push(stripHtml(op.description));
    }
    sections.push('');

    // Parameters
    if (op.parameters && op.parameters.length > 0) {
      sections.push('### パラメータ');
      sections.push('');
      sections.push('| 名前 | 位置 | 必須 | 型 | 説明 |');
      sections.push('| --- | --- | --- | --- | --- |');
      for (const param of op.parameters) {
        const paramType = param.schema?.type ?? param.type ?? 'string';
        const required = param.required ? 'Yes' : '';
        const desc = param.description ? stripHtml(param.description) : '';
        const truncDesc = desc.length > 60 ? `${desc.substring(0, 57)}...` : desc;
        sections.push(`| ${param.name} | ${param.in} | ${required} | ${paramType} | ${truncDesc} |`);
      }
      sections.push('');
    }

    // Request body
    if (op.requestBody) {
      const bodySchema =
        op.requestBody.content?.['application/json']?.schema ??
        op.requestBody.content?.['application/x-www-form-urlencoded']?.schema;
      if (bodySchema) {
        sections.push('### リクエストボディ');
        sections.push('');
        sections.push('| 名前 | 必須 | 型 | 説明 |');
        sections.push('| --- | --- | --- | --- |');
        const fields = renderFields(bodySchema, fullSchema, 0);
        sections.push(...fields);
        sections.push('');
      }
    }

    // Response
    const successCode = op.responses?.['200'] ? '200' : op.responses?.['201'] ? '201' : null;
    if (successCode) {
      const resp = op.responses?.[successCode];
      const respSchema = resp?.content?.['application/json']?.schema;
      if (respSchema) {
        sections.push('### レスポンス');
        sections.push('');
        sections.push('| 名前 | 必須 | 型 | 説明 |');
        sections.push('| --- | --- | --- | --- |');
        const fields = renderFields(respSchema, fullSchema, 0);
        sections.push(...fields);
        sections.push('');
      }
    }
  }

  return sections.join('\n');
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
