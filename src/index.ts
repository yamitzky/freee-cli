import { configure } from './cli.js';

const main = async (): Promise<void> => {
  const args = process.argv.slice(2);
  const subcommand = args.find((arg) => !arg.startsWith('--'));

  if (subcommand === 'configure') {
    const force = args.includes('--force');
    await configure({ force });
    return;
  }

  console.error('Usage: freee-mcp configure [--force]');
  console.error('');
  console.error('  configure  - OAuth認証と事業所の設定を対話式で行います');
  console.error('  --force    - 保存済みのログイン情報をリセットして再設定');
  console.error('');
  console.error('API操作には freee CLI を使ってください:');
  console.error('  freee --help');
  process.exit(1);
};

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
