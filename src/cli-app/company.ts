import { getCurrentCompanyId, setCurrentCompany, getCompanyInfo } from '../config/companies.js';
import { getValidAccessToken } from '../auth/tokens.js';
import { makeApiRequest } from '../api/client.js';

const USAGE = `Usage: freee company <command>

Commands:
  current    Show current company
  set <id>   Set current company
  ls         List available companies`;

export async function handleCompany(command: string, args: string[]): Promise<string> {
  switch (command) {
    case 'current':
      return handleCurrent();
    case 'set':
      return handleSet(args);
    case 'ls':
      return handleList();
    default:
      return USAGE;
  }
}

async function handleCurrent(): Promise<string> {
  const companyId = await getCurrentCompanyId();
  if (!companyId || companyId === '0') {
    return 'No company set';
  }
  const info = await getCompanyInfo(companyId);
  if (info?.name) {
    return `Current company: ${info.name} (ID: ${companyId})`;
  }
  return `Current company: ID: ${companyId}`;
}

async function handleSet(args: string[]): Promise<string> {
  const companyId = args[0];
  if (!companyId) {
    return 'Usage: freee company set <company_id>';
  }
  await setCurrentCompany(companyId);
  return `Company set to: ${companyId}`;
}

async function handleList(): Promise<string> {
  const token = await getValidAccessToken();
  if (!token) {
    return 'Not authenticated. Run "freee auth login" first.';
  }

  const result = (await makeApiRequest('GET', '/api/1/companies', {}, undefined, 'https://api.freee.co.jp')) as {
    companies: Array<{ id: number; name: string; role: string }>;
  };

  if (!result.companies || result.companies.length === 0) {
    return 'No companies found.';
  }

  const lines = ['ID\tName\tRole'];
  for (const c of result.companies) {
    lines.push(`${c.id}\t${c.name}\t${c.role}`);
  }
  return lines.join('\n');
}
