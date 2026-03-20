# MCP 削除 & SKILL+CLI アーキテクチャ移行 Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Goal: MCP サーバーコードを完全に削除し、SKILL+CLI アーキテクチャに移行する。ドキュメントを新アーキテクチャに合わせて全面更新する。

Architecture: このリポジトリは元々 MCP サーバーだったが、SKILL+CLI に大胆に方針転換した。MCP プロトコル依存のコード（src/mcp/, client-mode.ts, mcp-config.ts）を削除し、`freee` CLI をメインのインターフェースにする。configure ウィザード（src/cli/）は OAuth セットアップとして残すが、MCP 登録機能は削除する。共有モジュール（auth, api, config, storage, openapi）はそのまま維持。

Tech Stack: TypeScript / Bun / Vitest / Biome

---

## 現在のアーキテクチャ

```
bin/cli.js (freee-mcp) ─── src/index.ts ───┬── src/mcp/ (MCP サーバー) ← 削除
                                            └── src/cli/ (configure ウィザード) ← MCP登録部分を削除
bin/freee.js (freee)  ─── src/cli-app/ (CLI) ← メインに昇格

共有: src/auth/, src/api/, src/config/, src/storage/, src/openapi/
```

## 移行後のアーキテクチャ

```
bin/cli.js (freee-mcp) ─── src/index.ts ── src/cli/ (configure ウィザード、OAuth のみ)
bin/freee.js (freee)   ─── src/cli-app/ (CLI、メインインターフェース)

共有: src/auth/, src/api/, src/config/, src/storage/, src/openapi/
```

---

### Task 1: MCP サーバーコードと関連ファイルの一括削除

MCP プロトコル依存のコード一式を削除する。MCP リクエストコンテキスト専用のモジュール、
MCP 専用の e2e テスト・モックも合わせて削除する。

Files:
- Delete: `src/mcp/` (ディレクトリごと: handlers, tools, file-upload-tool + 各テスト)
- Delete: `src/openapi/client-mode.ts` (MCP ツール生成)
- Delete: `src/types/mcp-overrides.d.ts` (MCP SDK 型オーバーライド)
- Delete: `src/storage/context.ts` (MCP リクエストからの認証コンテキスト抽出)
- Delete: `src/e2e/client-mode.e2e.test.ts` (MCP ツール e2e テスト)
- Delete: `src/e2e/auth-flow.e2e.test.ts` (MCP 認証ツール e2e テスト)
- Delete: `src/e2e/mock-api.ts` (上記 e2e テスト専用モック)
- Modify: `src/utils/error.ts` (MCP 専用の TextResponse / createTextResponse を削除)

- [ ] Step 1: src/mcp/ ディレクトリを削除

```bash
rm -rf src/mcp/
```

- [ ] Step 2: MCP ツール生成コードと型オーバーライドを削除

```bash
rm src/openapi/client-mode.ts
rm src/types/mcp-overrides.d.ts
rmdir src/types/ 2>/dev/null || true
```

- [ ] Step 3: MCP コンテキスト抽出モジュールを削除

`src/storage/context.ts` は MCP の `extra` パラメータからトークンを取り出す専用モジュール。
CLI は `FileTokenStore` と `getCurrentCompanyId()` を直接使うため不要。

```bash
rm src/storage/context.ts
```

`src/storage/index.ts`（barrel export）も不要なら合わせて削除:

```bash
rm src/storage/index.ts 2>/dev/null || true
```

- [ ] Step 4: MCP 関連の e2e テスト・モックを削除

```bash
rm src/e2e/client-mode.e2e.test.ts
rm src/e2e/auth-flow.e2e.test.ts
rm src/e2e/mock-api.ts
```

`src/e2e/configure.e2e.test.ts` と `src/e2e/fixtures/` は残す（configure ウィザードのテスト）。

- [ ] Step 5: src/utils/error.ts から MCP 専用のレスポンス型を削除

`TextResponse` インターフェースと `createTextResponse()` 関数を削除する。
これらは MCP ツールのレスポンス形式専用。

汎用的な `formatErrorMessage()`, `parseJsonResponse()`, `formatApiErrorMessage()` は残す。

- [ ] Step 6: 型チェックとテストの確認

src/index.ts が src/mcp/handlers.ts をインポートしているため、この時点では型チェックが失敗する。
テストのみ先に確認:

```bash
bun run test:run
```

壊れたテストがあれば、MCP インポートが残っている箇所を特定する。

- [ ] Step 7: コミット

```bash
git add -u
git commit -m "chore: MCP サーバーコードと関連モジュールを一括削除"
```

---

### Task 2: src/index.ts から MCP 起動を削除

MCP サーバーのエントリポイント（src/index.ts）から MCP 起動処理を削除し、configure ウィザード専用にする。

Files:
- Modify: `src/index.ts`

- [ ] Step 1: src/index.ts を configure 専用に書き換え

現在の内容:

```typescript
import { createAndStartServer } from './mcp/handlers.js';
import { configure } from './cli.js';
// ... MCP サーバー起動ロジック
```

以下に変更:

```typescript
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
```

- [ ] Step 2: 型チェックが通ることを確認

```bash
bun run typecheck
```

- [ ] Step 3: コミット

```bash
git add src/index.ts
git commit -m "chore: freee-mcp コマンドを configure 専用に変更"
```

---

### Task 3: MCP 設定登録機能の削除

configure ウィザードから MCP 設定登録（Claude Desktop / Claude Code への mcpServers 登録）を削除する。
OAuth セットアップと事業所選択の機能は残す。

Files:
- Delete: `src/config/mcp-config.ts`
- Delete: `src/config/mcp-config.test.ts`（存在する場合）
- Modify: `src/cli/prompts.ts` - `configureMcpIntegration()` を削除
- Modify: `src/cli/index.ts` - `configureMcpIntegration()` 呼び出しを削除

- [ ] Step 1: src/config/mcp-config.ts を削除

```bash
rm src/config/mcp-config.ts
```

テストファイルがあれば削除:

```bash
rm src/config/mcp-config.test.ts 2>/dev/null || true
```

- [ ] Step 2: src/cli/prompts.ts から MCP 設定関数を削除

`configureMcpIntegration()` と、それが使用する内部関数（`configureMcpTarget`, `showSkillInstallGuide` 等）、
および `mcp-config.ts` からのインポートを削除する。

OAuth 関連の関数（`collectCredentials`, `selectCompany`）はそのまま残す。

- [ ] Step 3: src/cli/index.ts から MCP 設定呼び出しを削除

```typescript
// 削除: import { configureMcpIntegration } from './prompts.js';
// 削除: await configureMcpIntegration();
```

configure ウィザードの最後に、CLI の使い方を案内するメッセージを追加:

```typescript
console.log('\nセットアップ完了!');
console.log('freee CLI を使って API を操作できます:');
console.log('  freee auth status     # 認証状態を確認');
console.log('  freee accounting ls   # エンドポイント一覧');
console.log('  freee --help          # ヘルプ\n');
```

- [ ] Step 4: 型チェック・テストが通ることを確認

```bash
bun run typecheck && bun run test:run
```

- [ ] Step 5: コミット

```bash
git add -u
git commit -m "chore: configure ウィザードから MCP 設定登録を削除"
```

---

### Task 4: @modelcontextprotocol/sdk 依存の削除

MCP SDK の依存をすべて削除する。

Files:
- Modify: `package.json`
- Modify: `build.ts`（MCP inspector スクリプト削除）

- [ ] Step 1: @modelcontextprotocol/sdk を dependencies から削除

```bash
bun remove @modelcontextprotocol/sdk
```

- [ ] Step 2: @modelcontextprotocol/inspector を devDependencies から削除

```bash
bun remove @modelcontextprotocol/inspector
```

- [ ] Step 3: package.json の scripts から inspector を削除

`"inspector": "mcp-inspector bun run src/index.ts"` を削除。

- [ ] Step 4: package.json の description を更新

```
"description": "Model Context Protocol (MCP) server for freee API integration"
```

を以下に変更:

```
"description": "freee API CLI & Agent Skill"
```

- [ ] Step 5: ビルド・型チェック・テストが通ることを確認

```bash
bun run typecheck && bun run lint && bun run test:run && bun run build
```

- [ ] Step 6: コミット

```bash
git add package.json bun.lock
git commit -m "chore: @modelcontextprotocol/sdk 依存を削除"
```

---

### Task 5: 未使用コードの整理（knip クリーンアップ）

MCP 削除後に残った未使用 export / ファイルを整理する。

Files:
- Modify: `knip.json` - CLI エントリポイントを追加
- Delete: `src/storage/index.ts` - 未使用 barrel export
- 各種ソースファイル - 未使用 export の `export` キーワード除去

- [ ] Step 1: knip.json に CLI エントリポイントを追加

```json
{
  "$schema": "https://unpkg.com/knip@5/schema.json",
  "entry": ["src/cli.ts", "src/cli-app/entry.ts", "scripts/*.ts"],
  "project": ["src/**/*.ts", "scripts/**/*.ts"]
}
```

- [ ] Step 2: src/storage/index.ts を削除

```bash
rm src/storage/index.ts
```

- [ ] Step 3: knip を実行して残りの未使用 export を確認

```bash
bun run knip 2>&1
```

報告された未使用 export / 未使用型から `export` キーワードを除去する。
各シンボルがモジュール内部で使われているか確認してから修正すること。

- [ ] Step 4: テスト・型チェック・リントが通ることを確認

```bash
bun run typecheck && bun run lint && bun run test:run
```

- [ ] Step 5: コミット

```bash
git add -u
git commit -m "chore: 未使用 export と barrel export を整理"
```

---

### Task 6: README.md を SKILL+CLI アーキテクチャに全面更新

MCP 中心の記述を SKILL+CLI 中心に書き換える。

Files:
- Modify: `README.md`

- [ ] Step 1: README.md を更新

主な変更点:

1. 冒頭の説明文を変更:
   - 旧: 「freee API を Claude から使えるようにする MCP サーバー & Claude Plugin です。」
   - 新: 「freee API を AI エージェントから操作するための CLI & Agent Skill です。」

2. 「特徴」セクションを更新:
   - MCP サーバーの記述を CLI に置き換え
   - 「freee CLI: シェルから直接 freee API を操作」を追加

3. 「SKILL と MCP の通信の流れ」の mermaid 図を更新:
   - MCP サーバーを経由する図から、CLI を直接呼び出す図に変更

4. 「クイックスタート」を更新:
   - Step 2 の `npx freee-mcp configure` はそのまま（OAuth セットアップ）
   - Step 3 を「Claude Desktop に追加」から「CLI の使い方」に変更

5. 「利用可能なツール」セクションを削除（MCP ツール一覧）:
   - 代わりに CLI コマンドの一覧を記載

6. 「Claude Code Plugin として使う」を更新:
   - Plugin install はそのまま（skill のインストール）
   - MCP サーバーの設定は不要になった旨を記載

7. 「company_id の取り扱い」は CLI でも同じ挙動なので、CLI コマンド例に更新

8. 開発者向けセクション:
   - `bun run inspector` を削除
   - `bun run dev` の説明を更新

注意: CLAUDE.md の Writing Style に従い、markdown の bold (`**`) は使わないこと。

- [ ] Step 2: コミット

```bash
git add README.md
git commit -m "docs: README.md を SKILL+CLI アーキテクチャに全面更新"
```

---

### Task 7: CLAUDE.md を更新

CLAUDE.md を新アーキテクチャに合わせて更新する。

Files:
- Modify: `CLAUDE.md`

- [ ] Step 1: CLAUDE.md を更新

主な変更点:

1. Architecture セクションの冒頭を変更:
   - 旧: 「MCP server that exposes freee API endpoints as MCP tools:」
   - 新: 「freee API CLI & Agent Skill:」

2. Tool Generation の記述を削除:
   - `generateClientModeTool()` の説明を削除

3. CLI Subcommands を更新:
   - `freee-mcp` の説明を「MCP サーバー起動」から「configure ウィザード（OAuth セットアップ）」に変更
   - freee CLI のコマンド一覧を追加

4. MCP Configuration セクションを削除（または「freee CLI の使い方」に置換）

5. scripts の `inspector` を削除

6. freee CLI のアーキテクチャを追記:
   - Entry: `src/cli-app/entry.ts` → `bin/freee.js`
   - 各モジュールの役割

- [ ] Step 2: コミット

```bash
git add CLAUDE.md
git commit -m "docs: CLAUDE.md を SKILL+CLI アーキテクチャに更新"
```

---

### Task 8: SKILL.md の更新

SKILL.md に references の案内を追加し、全体の整合性を確認する。

Files:
- Modify: `skills/freee-api-skill/SKILL.md`

- [ ] Step 1: SKILL.md に References セクションを追加

`## 関連リンク` の前に以下を追加:

```markdown
## References

`references/` ディレクトリに各 API のリファレンスドキュメントがある。
`--docs` と同等の内容だが、リソースごとにファイルが分かれている。

ファイル命名規則: `{service}-{resource}.md`（例: `accounting-deals.md`, `hr-employees.md`）

CLI と references の使い分け:
- `freee <service> <path> --docs` — 特定エンドポイントのドキュメントを即座に確認
- `references/` — リソース全体の概要を把握したいとき
```

- [ ] Step 2: コミット

```bash
git add skills/freee-api-skill/SKILL.md
git commit -m "docs: SKILL.md に references ディレクトリの案内を追加"
```

---

### Task 9: 開発計画ドキュメントの整理 & 最終検証

完了済みのプランファイルを削除し、全体の最終検証を行う。

Files:
- Delete: `docs/superpowers/plans/2026-03-20-freee-cli.md`
- Delete: `docs/superpowers/plans/2026-03-20-repo-cleanup.md`
- Delete: `docs/superpowers/` (ディレクトリごと)

- [ ] Step 1: 完了済みプランを削除

```bash
rm -rf docs/superpowers/
```

`docs/` が空になったら削除:

```bash
rmdir docs/ 2>/dev/null || true
```

- [ ] Step 2: pre-flight チェック

```bash
bun run typecheck && bun run lint && bun run test:run && bun run build
```

- [ ] Step 3: knip がクリーンであることを確認

```bash
bun run knip 2>&1
```

- [ ] Step 4: CLI の全サービス動作確認

```bash
bun run src/cli-app/entry.ts --help
bun run src/cli-app/entry.ts accounting ls | head -5
bun run src/cli-app/entry.ts hr ls | head -5
bun run src/cli-app/entry.ts invoice ls | head -5
bun run src/cli-app/entry.ts pm ls | head -5
bun run src/cli-app/entry.ts sm ls | head -5
```

- [ ] Step 5: コミット

```bash
git add -u
git commit -m "chore: 開発計画ドキュメントを削除、最終検証完了"
```
