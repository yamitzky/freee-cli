# freee-mcp

freee API を AI エージェントから操作するための CLI & Agent Skill です。

CLI と skill（API リファレンス）を組み合わせて利用することを想定しています。

[![npm version](https://badge.fury.io/js/freee-mcp.svg)](https://www.npmjs.com/package/freee-mcp)

> Note: このプロジェクトは開発中であり、予期せぬ不具合が発生する可能性があります。問題を発見された場合は [Issue](https://github.com/freee/freee-mcp/issues) として報告していただけると幸いです。

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
    Claude->>Skill: freee-api-skill 呼び出し
    Skill-->>Claude: API リファレンス注入<br/>(エンドポイント、パラメータ仕様)

    Note over Claude,CLI: 2. CLI で API を実行
    Claude->>CLI: freee accounting deals<br/>type==income limit==10

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
npx freee-mcp configure
```

対話式ウィザードが認証情報の設定、OAuth認証、事業所選択を行います。

### 3. CLI を使う

```bash
freee auth status         # 認証状態を確認
freee accounting ls       # エンドポイント一覧
freee accounting deals    # 取引一覧を取得
freee --help              # ヘルプ
```

## Claude Code Plugin として使う

Claude Code でプラグインとしてインストールすると、Agent Skill（API リファレンス付きスキル）がまとめて利用できます。

```bash
claude plugin install freee/freee-mcp
```

## Skill のみインストールする

Claude Code 以外のコーディングエージェント（Cursor, OpenCode など）で API リファレンス付きスキルを利用する場合は、[skills](https://www.npmjs.com/package/skills) でインストールできます。

```bash
npx skills add freee/freee-mcp
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
| `freee <service> <path> --docs` | API ドキュメント |
| `freee <service> <path> --help` | メソッド一覧 |
| `freee <service> <path> key==val` | クエリ付き GET |
| `freee <service> <path> key=val` | POST リクエスト |
| `freee <service> <path> -X METHOD` | HTTP メソッド指定 |

service: accounting, hr, invoice, pm, sm

### company_id の取り扱い

リクエスト（パラメータまたはボディ）に `company_id` を含める場合、現在の事業所と一致している必要があります。不一致の場合はエラーになります。

- 事業所の確認: `freee company current`
- 事業所の切り替え: `freee company set <id>`
- company_id を含まない API（例: `/api/1/companies`）はそのまま実行可能

## コントリビューション

詳しくは [CONTRIBUTING.md](./CONTRIBUTING.md) をご覧ください。

### Contributors

<!-- CONTRIBUTORS-START -->
<a href="https://github.com/him0"><img src="https://github.com/him0.png" width="40" height="40" alt="@him0"></a>
<a href="https://github.com/dais0n"><img src="https://github.com/dais0n.png" width="40" height="40" alt="@dais0n"></a>
<a href="https://github.com/HikaruEgashira"><img src="https://github.com/HikaruEgashira.png" width="40" height="40" alt="@HikaruEgashira"></a>
<a href="https://github.com/nakanoasaservice"><img src="https://github.com/nakanoasaservice.png" width="40" height="40" alt="@nakanoasaservice"></a>
<a href="https://github.com/tackeyy"><img src="https://github.com/tackeyy.png" width="40" height="40" alt="@tackeyy"></a>
<a href="https://github.com/worldscandy"><img src="https://github.com/worldscandy.png" width="40" height="40" alt="@worldscandy"></a>
<a href="https://github.com/akhr77"><img src="https://github.com/akhr77.png" width="40" height="40" alt="@akhr77"></a>
<a href="https://github.com/trpfrog"><img src="https://github.com/trpfrog.png" width="40" height="40" alt="@trpfrog"></a>
<a href="https://github.com/hoshinotsuyoshi"><img src="https://github.com/hoshinotsuyoshi.png" width="40" height="40" alt="@hoshinotsuyoshi"></a>
<a href="https://github.com/JeongJaeSoon"><img src="https://github.com/JeongJaeSoon.png" width="40" height="40" alt="@JeongJaeSoon"></a>
<a href="https://github.com/norimura114"><img src="https://github.com/norimura114.png" width="40" height="40" alt="@norimura114"></a>
<a href="https://github.com/akiras-ssrd"><img src="https://github.com/akiras-ssrd.png" width="40" height="40" alt="@akiras-ssrd"></a>
<a href="https://github.com/inoue2002"><img src="https://github.com/inoue2002.png" width="40" height="40" alt="@inoue2002"></a>
<a href="https://github.com/jacknocode"><img src="https://github.com/jacknocode.png" width="40" height="40" alt="@jacknocode"></a>
<a href="https://github.com/tnj"><img src="https://github.com/tnj.png" width="40" height="40" alt="@tnj"></a>
<a href="https://github.com/jaxx2104"><img src="https://github.com/jaxx2104.png" width="40" height="40" alt="@jaxx2104"></a>
<a href="https://github.com/kbyk004"><img src="https://github.com/kbyk004.png" width="40" height="40" alt="@kbyk004"></a>
<!-- CONTRIBUTORS-END -->

## 開発者向け

```bash
git clone https://github.com/freee/freee-mcp.git
cd freee-mcp
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

[Apache-2.0](./LICENSE)

## コミュニティ

質問や情報交換は Discord サーバーで行っています。お気軽にご参加ください。

- [Discord サーバー](https://discord.gg/9ddTPGyxPw)

## 関連リンク

- [紹介記事: Public API を MCP化するとき Agent Skill 併用が良さそう with freee-mcp](https://zenn.dev/him0/articles/766798ca1315e0)
- [freee API ドキュメント](https://developer.freee.co.jp/docs)
- [Model Context Protocol](https://modelcontextprotocol.io)
