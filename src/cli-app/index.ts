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
  freee company show        現在の事業所を表示

API:
  freee <service> ls                    エンドポイント一覧
  freee <service> <path>                GET リクエスト実行
  freee <service> <path> --help         エンドポイントの詳細を表示
  freee <service> <path> key==value     クエリパラメータ付き GET

  service: accounting, hr, invoice, pm, sm

Options:
  --version                 バージョンを表示
  --help                    ヘルプを表示`);
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
      console.log('auth: not yet implemented');
      break;

    case 'company':
      console.log('company: not yet implemented');
      break;

    case 'accounting':
    case 'hr':
    case 'invoice':
    case 'pm':
    case 'sm':
      console.log(`${parsed.group} ${parsed.command}: not yet implemented`);
      break;

    case 'help':
      printUsage();
      break;

    default:
      console.error(`Unknown command: ${parsed.group}`);
      printUsage();
      process.exit(1);
  }
}
