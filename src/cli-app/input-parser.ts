export interface ApiInput {
  path: string;
  method: string | undefined;
  query: Record<string, string>;
  body: Record<string, unknown> | undefined;
  flags: string[];
  filePaths: string[];
}

function setNested(obj: Record<string, unknown>, keys: (string | number)[], value: unknown): void {
  let current: unknown = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    const nextKey = keys[i + 1];
    const currentObj = current as Record<string, unknown>;
    if (currentObj[key as string] === undefined) {
      currentObj[key as string] = typeof nextKey === 'number' ? [] : {};
    }
    current = currentObj[key as string];
  }
  const lastKey = keys[keys.length - 1];
  (current as Record<string, unknown>)[lastKey as string] = value;
}

function parseBracketKeys(raw: string): (string | number)[] {
  const parts = raw.split('[');
  const keys: (string | number)[] = [parts[0]];
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i].replace(']', '');
    const num = Number(part);
    keys.push(Number.isNaN(num) ? part : num);
  }
  return keys;
}

export function parseApiInput(args: string[], methodOverride?: string): ApiInput {
  if (args.length === 0) {
    return { path: '', method: methodOverride, query: {}, body: undefined, flags: [], filePaths: [] };
  }

  const path = args[0];
  let method: string | undefined;
  let hasExplicitMethod = false;
  const query: Record<string, string> = {};
  let body: Record<string, unknown> | undefined;
  const flags: string[] = [];
  const filePaths: string[] = [];

  let i = 1;
  while (i < args.length) {
    const arg = args[i];

    // -X METHOD
    if (arg === '-X' && i + 1 < args.length) {
      method = args[i + 1].toUpperCase();
      hasExplicitMethod = true;
      i += 2;
      continue;
    }

    // -d JSON body
    if (arg === '-d' && i + 1 < args.length) {
      body = { ...body, ...(JSON.parse(args[i + 1]) as Record<string, unknown>) };
      i += 2;
      continue;
    }

    // flags (--help, --spec, --response, etc.)
    if (arg.startsWith('--')) {
      flags.push(arg);
      i++;
      continue;
    }

    // == query parameter
    const eqEqIdx = arg.indexOf('==');
    if (eqEqIdx !== -1) {
      const key = arg.slice(0, eqEqIdx);
      const value = arg.slice(eqEqIdx + 2);
      query[key] = value;
      i++;
      continue;
    }

    // := typed JSON body field
    const colonEqIdx = arg.indexOf(':=');
    if (colonEqIdx !== -1) {
      const key = arg.slice(0, colonEqIdx);
      const value = JSON.parse(arg.slice(colonEqIdx + 2)) as unknown;
      if (!body) body = {};
      body[key] = value;
      i++;
      continue;
    }

    // = body field (including bracket notation)
    const eqIdx = arg.indexOf('=');
    if (eqIdx !== -1) {
      const rawKey = arg.slice(0, eqIdx);
      const value = arg.slice(eqIdx + 1);
      if (!body) body = {};

      if (rawKey.includes('[')) {
        const keys = parseBracketKeys(rawKey);
        setNested(body, keys, value);
      } else {
        body[rawKey] = value;
      }
      i++;
      continue;
    }

    // Unknown arg — treat as file path
    filePaths.push(arg);
    i++;
  }

  // If no explicit -X flag, use methodOverride if provided
  if (!hasExplicitMethod && methodOverride !== undefined) {
    method = methodOverride;
  }

  return { path, method, query, body, flags, filePaths };
}
