# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `bun run build` - Build the project (uses Bun.build)
- `bun run typecheck` - TypeScript type checking
- `bun run lint` - Run Biome linter
- `bun run format` - Run Biome formatter
- `bun run check` - Run Biome lint + format (recommended before PR)
- `bun run test:run` - Run tests (vitest)
- `bun run dev` - Start development server
- `bun run changeset` - Create a new changeset for version bumps
- `bun run version` - Apply changesets to update versions and CHANGELOG
- `bun run release` - Build and publish to npm

## Architecture

freee API CLI & Agent Skill:

- Schema: Multiple OpenAPI schemas in `openapi/` directory
  - `accounting-api-schema.json` - 会計API (https://api.freee.co.jp)
  - `hr-api-schema.json` - 人事労務API (https://api.freee.co.jp/hr)
  - `invoice-api-schema.json` - 請求書API (https://api.freee.co.jp/iv)
  - `pm-api-schema.json` - 工数管理API (https://api.freee.co.jp/pm)
  - `sm-api-schema.json` - 販売API (https://api.freee.co.jp/sm)
- Schema Loader: `src/openapi/schema-loader.ts` loads and manages all API schemas
- CLI: `src/cli-app/` - freee CLI (Agent Skill 用、メインインターフェース)
  - Entry: `src/cli-app/entry.ts` → `bin/freee.js`
  - Router: `src/cli-app/router.ts` - サブコマンドルーティング
  - Path resolver: `src/cli-app/path-resolver.ts` - ショートハンドパス解決
  - API docs: `src/cli-app/api-docs.ts` - OpenAPI からドキュメント生成
  - API exec: `src/cli-app/api-exec.ts` - API リクエスト実行（コンパクト出力）
  - API list: `src/cli-app/api-list.ts` - エンドポイント一覧
- Requests: `makeApiRequest()` in `src/api/client.ts` handles API calls with auto-auth and company_id injection

### CLI Subcommands

- `freee configure` - OAuth認証と事業所の対話式セットアップ
- `freee configure --force` - 保存済みのログイン情報をリセットして再設定
- `freee <service> ls [filter]` - エンドポイント一覧
- `freee <service> get <path> key==val` - GET リクエスト
- `freee <service> post <path> key=val` - POST リクエスト
- `freee <service> post receipts <file>` - ファイルアップロード
- `freee <service> put <path> -d '{}'` - PUT リクエスト
- `freee <service> delete <path>` - DELETE リクエスト
- `freee <service> <path> --help` - メソッド一覧
- `freee <service> get <path> --help` - パラメータのドキュメント
- `freee <service> get <path> --spec` - 生の OpenAPI スキーマ

### Configuration

`freee configure` で OAuth 認証情報と事業所の設定を行う。
設定は `~/.config/freee-mcp/config.json` に保存される。

Development mode: `bun run src/cli-app/entry.ts` で CLI を直接実行可能。

### API Base URL の上書き（開発用）

環境変数 `FREEE_API_BASE_URL_{SERVICE}` でAPIの向き先を変更できる（`src/openapi/schema-loader.ts` の `resolveBaseUrl` で処理）。

- `FREEE_API_BASE_URL_ACCOUNTING` - 会計API
- `FREEE_API_BASE_URL_HR` - 人事労務API
- `FREEE_API_BASE_URL_INVOICE` - 請求書API
- `FREEE_API_BASE_URL_PM` - 工数管理API
- `FREEE_API_BASE_URL_SM` - 販売API

## PR Creation Pre-flight Checklist

Always run before creating a PR:

```bash
bun run typecheck && bun run lint && bun run test:run && bun run build
```

Changeset requirement (必須):

- コミット時に changeset ファイルを必ず作成すること（忘れやすいので注意）
- `bun run changeset` が対話モードで使えない場合は `.changeset/<短い説明>.md` を直接作成する
- フォーマット: frontmatter に `"@yamitzky/freee": patch|minor|major`、本文に変更内容の説明（日本語）
- bump type: `patch`（バグ修正）、`minor`（新機能）、`major`（破壊的変更）

Common issues:

- Mock function return types (ensure `id` fields are strings)
- Missing return type annotations on exported functions
- Undefined environment variables in tests

## Writing Style

- Do not use markdown bold syntax (`**`)  in any files
