# @yamitzky/freee

freee API を AI エージェントから操作するための CLI & Agent Skill です。

[freee/freee-mcp](https://github.com/freee/freee-mcp) を元に、MCP サーバーを廃止して CLI + Agent Skill アーキテクチャに再構築した非公式フォークです。

[![npm version](https://badge.fury.io/js/%40yamitzky%2Ffreee.svg)](https://www.npmjs.com/package/@yamitzky/freee)

> Note: このプロジェクトは非公式フォークです。また、CLIの作者は会計APIしか使っておらず、十分なテストを行っていません。

## 特徴

- freee CLI: シェルから直接 freee API を操作（トークン効率の高いコンパクト出力）
- Agent Skill: 詳細な API リファレンスドキュメント付きスキルを提供
- 複数 API 対応: 会計・人事労務・請求書・工数管理・販売の5つの freee API をサポート
- OAuth 2.0 + PKCE: セキュアな認証フロー、トークン自動更新
- 複数事業所対応: 事業所の動的切り替えが可能

## SKILL と CLI の連携の流れ

Claude Code では、SKILL（API リファレンス）と CLI（API 呼び出し）を組み合わせて利用します。

```mermaid
sequenceDiagram
    participant User as ユーザー
    participant Claude as Claude Code
    participant Skill as Agent Skill<br/>(API リファレンス)
    participant CLI as freee CLI<br/>(ローカル)
    participant API as freee API

    User->>Claude: リクエスト<br/>「取引一覧を取得して」

    Note over Claude,Skill: 1. SKILL からリファレンスを取得
    Claude->>Skill: freee-cli-skill 呼び出し
    Skill-->>Claude: API リファレンス注入<br/>(エンドポイント、パラメータ仕様)

    Note over Claude,CLI: 2. CLI で API を実行
    Claude->>CLI: freee accounting get deals<br/>type==income limit==10

    Note over CLI,API: 3. freee API への通信
    CLI->>API: GET /api/1/deals<br/>Authorization: Bearer xxx
    API-->>CLI: JSON レスポンス

    CLI-->>Claude: コンパクトなテーブル出力
    Claude-->>User: 結果を整形して表示
```

この仕組みにより：
- SKILL: 必要な API リファレンスを段階的にコンテキストに注入（コンテキスト効率化）
- CLI: 認証・リクエスト検証・API 呼び出しを担当（コンパクト出力でトークン効率化）

## クイックスタート

### 1. freee アプリケーションの登録

[freee アプリストア](https://app.secure.freee.co.jp/developers) で新しいアプリを作成:

- コールバックURL: `http://127.0.0.1:54321/callback`
- Client ID と Client Secret を取得
- 必要な権限にチェック

### 2. セットアップ

```bash
npx @yamitzky/freee configure
```

対話式ウィザードが認証情報の設定、OAuth認証、事業所選択を行います。

### 3. CLI を使う

```bash
npm install -g @yamitzky/freee
# または
bun install -g @yamitzky/freee

freee auth status              # 認証状態を確認
freee accounting ls            # エンドポイント一覧
freee accounting get deals     # 取引一覧を取得
freee --help                   # ヘルプ
```

## Claude Code Plugin として使う

Claude Code でプラグインとしてインストールすると、Agent Skill（API リファレンス付きスキル）がまとめて利用できます。

```bash
claude plugin install yamitzky/freee-cli
```

## Skill のみインストールする

Claude Code 以外のコーディングエージェント（Cursor, OpenCode など）で API リファレンス付きスキルを利用する場合は、[skills](https://www.npmjs.com/package/skills) でインストールできます。

```bash
npx skills add yamitzky/freee-cli
```

グローバルインストール(`-g`)や特定スキルのみのインストール(`-s`)も可能です。

### 含まれるリファレンス

| API      | 内容                                             | ファイル数 |
| -------- | ------------------------------------------------ | ---------- |
| 会計     | 取引、勘定科目、取引先、請求書、経費申請など     | 31         |
| 人事労務 | 従業員、勤怠、給与明細、年末調整など             | 28         |
| 請求書   | 請求書、見積書、納品書                           | 3          |
| 工数管理 | プロジェクト、チーム、パートナー、工数、ユーザーなど | 7          |
| 販売     | 案件、受注、マスタ                               | 3          |

Claude との会話中に API の使い方を質問すると、これらのリファレンスを参照して正確な情報を提供します。

### データ作成のベストプラクティス

請求書や経費精算など、同じ形式のデータを繰り返し作成する場合は、以前に作成したデータを参照することで効率的に作業できます：

- 請求書作成: 過去の請求書を取得して、取引先・品目・税区分などを参考にする
- 経費精算: 過去の申請を参照して、勘定科目や部門の指定を正確に行う
- 取引登録: 類似の取引を参考にして、入力ミスを防ぐ

```
例: 「先月の○○社への請求書を参考に、今月分を作成して」
```

## freee CLI コマンド

### 認証・事業所

| コマンド | 説明 |
|---------|------|
| `freee auth login` | OAuth 認証 |
| `freee auth status` | 認証状態を確認 |
| `freee auth logout` | ログアウト |
| `freee company ls` | 事業所一覧 |
| `freee company set <id>` | 操作対象の事業所を設定 |
| `freee company current` | 現在の事業所を表示 |

### API 操作

| コマンド | 説明 |
|---------|------|
| `freee <service> ls [filter]` | エンドポイント一覧 |
| `freee <service> docs <path>` | API ドキュメント |
| `freee <service> help <path>` | メソッド一覧 |
| `freee <service> get <path> key==val` | クエリ付き GET |
| `freee <service> post <path> key=val` | POST リクエスト |
| `freee <service> put <path> -d '{}'` | PUT リクエスト |
| `freee <service> delete <path>` | DELETE リクエスト |

service: accounting, hr, invoice, pm, sm

### company_id の取り扱い

リクエスト（パラメータまたはボディ）に `company_id` を含める場合、現在の事業所と一致している必要があります。不一致の場合はエラーになります。

- 事業所の確認: `freee company current`
- 事業所の切り替え: `freee company set <id>`
- company_id を含まない API（例: `/api/1/companies`）はそのまま実行可能

## 開発者向け

```bash
git clone https://github.com/yamitzky/freee-cli.git
cd freee-cli
bun install

bun run dev           # 開発サーバー（ウォッチモード）
bun run build         # ビルド
bun run typecheck    # 型チェック
bun run lint          # リント
bun run test:run      # テスト

# API リファレンスの再生成
bun run generate:references
```

### 技術スタック

TypeScript / OAuth 2.0 + PKCE / Zod / Bun

### アーキテクチャ詳細

プロジェクトのアーキテクチャ、内部構造、開発ガイドラインについては [CLAUDE.md](./CLAUDE.md) を参照してください。

## License / ライセンス

このフォークには、freee K.K. による [freee/freee-mcp](https://github.com/freee/freee-mcp) のコードが含まれており、当該コードは Apache License 2.0 に基づいて提供されています。法令上許容される限りにおいて、私がこのフォークに加えた独自の変更および追加部分については、著作権が発生するとは考えておらず、CC0 1.0 に基づき、著作権その他の関連する権利を放棄します。

また、APIの利用については[freee API 利用規約](https://app.secure.freee.co.jp/terms-freee-api.html) に準拠します。

## 関連リンク

- [フォーク元: freee/freee-mcp](https://github.com/freee/freee-mcp) -- オリジナルの MCP サーバー実装
- [freee API ドキュメント](https://developer.freee.co.jp/docs)
- [紹介記事: Public API を MCP化するとき Agent Skill 併用が良さそう](https://zenn.dev/him0/articles/766798ca1315e0) -- フォーク元の設計思想
