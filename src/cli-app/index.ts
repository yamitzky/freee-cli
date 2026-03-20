import { loadConfig } from '../config.js';
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
  freee <service> <path>                GET リクエスト実行
  freee <service> <path> --help         エンドポイントの詳細を表示
  freee <service> <path> --docs         コンパクトなAPIドキュメントを表示
  freee <service> <path> --spec         生の OpenAPI スキーマを表示
  freee <service> <path> key==value     クエリパラメータ付き GET
  freee <service> <path> key=value      ボディパラメータ付き POST
  freee <service> <path> key:=json      JSON 値のボディパラメータ付き POST
  freee <service> <path> -X METHOD      HTTP メソッドを指定
  freee <service> <path> -d '{"json"}'  JSON ボディを直接指定
  freee <service> <path> --max=N        配列レスポンスの表示件数（デフォルト: 10）
  freee <service> <path> --no-truncate  レスポンスを省略しない

  service: accounting, hr, invoice, pm, sm

Options:
  --version                 バージョンを表示
  --help                    ヘルプを表示`);
}

async function handleApiCommand(service: ApiType, args: string[]): Promise<void> {
  const input = parseApiInput(args);
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
      } else if (parsed.command === 'api') {
        await handleApiCommand(service, parsed.args);
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
