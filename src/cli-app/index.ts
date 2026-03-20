import { loadConfig } from '../config.js';
import { configure } from '../cli.js';
import type { ApiType } from '../openapi/schema-loader.js';
import { generateDocs, generateHelp, generateSpec } from './api-docs.js';
import { executeApiRequest } from './api-exec.js';
import { listEndpoints } from './api-list.js';
import { handleAuth } from './auth.js';
import { handleCompany } from './company.js';
import { parseApiInput } from './input-parser.js';
import { parseCommand } from './router.js';

declare const __PACKAGE_VERSION__: string;

function printUsage(): void {
  console.log(`freee CLI v${__PACKAGE_VERSION__}

Usage: freee <command> [options]

Setup:
  freee configure           OAuth認証と事業所の設定を対話式で行います
  freee configure --force   保存済みのログイン情報をリセットして再設定

Auth:
  freee auth login          freee にログイン
  freee auth logout         ログアウト
  freee auth status         認証状態を表示

Company:
  freee company ls          事業所一覧を表示
  freee company set <id>    操作対象の事業所を設定
  freee company current     現在の事業所を表示

API:
  freee <service> ls [filter]           エンドポイント一覧（filterで絞込可）
  freee <service> get <path>            GET リクエスト
  freee <service> post <path>           POST リクエスト
  freee <service> put <path>            PUT リクエスト
  freee <service> delete <path>         DELETE リクエスト
  freee <service> patch <path>          PATCH リクエスト
  freee <service> docs <path>           コンパクトなAPIドキュメントを表示
  freee <service> help <path>           エンドポイントの詳細を表示
  freee <service> spec <path>           生の OpenAPI スキーマを表示

  service: accounting, hr, invoice, pm, sm
  path: deals, approval_requests, partners, etc. (/api/1/ は省略可)

  Input syntax:
    key==val    クエリパラメータ
    key=val     ボディパラメータ（文字列）
    key:=json   ボディパラメータ（JSON値）
    -d '{}'     JSON ボディを直接指定
    --json      レスポンスを生JSONで表示
    --max=N     表示件数（デフォルト: 10）
    --verbose   リクエスト先URLとボディを表示

Options:
  --version                 バージョンを表示
  --help                    ヘルプを表示`);
}

async function handleApiCommand(service: ApiType, method: string | undefined, args: string[]): Promise<void> {
  const input = parseApiInput(args, method);
  if (input.flags.includes('--help')) {
    console.log(generateHelp(service, input.path));
    return;
  }
  if (input.flags.includes('--docs')) {
    console.log(generateDocs(service, input.path, input.method));
    return;
  }
  if (input.flags.includes('--spec')) {
    console.log(generateSpec(service, input.path));
    return;
  }
  const output = await executeApiRequest(service, input);
  console.log(output);
}

export async function main(argv: string[]): Promise<void> {
  if (argv.includes('--version')) {
    console.log(__PACKAGE_VERSION__);
    return;
  }

  if (argv.includes('--help') && argv.length === 1) {
    printUsage();
    return;
  }

  const parsed = parseCommand(argv);

  switch (parsed.group) {
    case 'configure': {
      const force = argv.includes('--force');
      await configure({ force });
      break;
    }

    case 'auth':
      await loadConfig();
      console.log(await handleAuth(parsed.command));
      break;

    case 'company':
      await loadConfig();
      console.log(await handleCompany(parsed.command, parsed.args));
      break;

    case 'accounting':
    case 'hr':
    case 'invoice':
    case 'pm':
    case 'sm': {
      await loadConfig();
      const service = parsed.group as ApiType;
      if (parsed.command === 'ls') {
        console.log(listEndpoints(service, parsed.args[0]));
      } else if (parsed.command === 'docs') {
        console.log(generateDocs(service, parsed.args[0], parsed.args[1]));
      } else if (parsed.command === 'help') {
        console.log(generateHelp(service, parsed.args[0]));
      } else if (parsed.command === 'spec') {
        console.log(generateSpec(service, parsed.args[0]));
      } else if (parsed.command === 'api') {
        await handleApiCommand(service, parsed.method, parsed.args);
      } else {
        console.error(`Unknown command: ${parsed.command}`);
        printUsage();
        process.exit(1);
      }
      break;
    }

    case 'help':
      printUsage();
      break;

    default:
      console.error(`Unknown command: ${parsed.group}`);
      printUsage();
      process.exit(1);
  }
}
