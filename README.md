# freee CLI

freee API を AI エージェントから操作するための CLI & Agent Skill です。

## このリポジトリについて

これは個人的な私家版です。freee 公式のプロダクトではありません。

元々は [freee/freee-mcp](https://github.com/freee/freee-mcp) をもとに、MCP サーバーではなく CLI + Agent Skill として使うために再構成したものです。その後、npm/Bun/Node.js への依存を減らして単一バイナリで扱えるようにするため、Codex に依頼して TypeScript 実装から Go 実装へ移植しました。

実利用での検証はかなり限定的です。作者自身も一部の会計 API を試している程度で、会計 API 全体を網羅的に確認しているわけではなく、人事労務・請求書・工数管理・販売 API についてはほぼ未検証です。利用する場合は、実行前にリクエスト内容と freee 側の結果を必ず確認してください。

## できること

- Go 単一バイナリ: Node.js、Bun、npm install 不要
- freee CLI: シェルから直接 freee API を操作
- Agent Skill: CLI の使い方をガイドするスキルを同梱
- 複数 API 対応: 会計・人事労務・請求書・工数管理・販売の5つの freee API
- OAuth 2.0 + PKCE: 認証フローとトークン自動更新
- OpenAPI 埋め込み: `ls`、`--help`、`--spec` はバイナリ単体で動作

## インストール

### GitHub Releases から取得

リリースページから OS/CPU に合う `freee` バイナリをダウンロードし、PATH の通った場所へ配置してください。

```bash
chmod +x freee
./freee --help
```

### ソースからビルド

```bash
go build -trimpath -ldflags "-s -w -X main.version=$(cat VERSION)" -o freee .
./freee --help
```

## セットアップ

freee アプリストアで新しいアプリケーションを作成し、コールバック URL に以下を登録します。

```text
http://127.0.0.1:54321/callback
```

その後、CLI で認証と事業所選択を行います。

```bash
freee configure
```

設定は `~/.config/freee-mcp/config.json`、トークンは `~/.config/freee-mcp/tokens.json` に保存されます。どちらも owner read/write の権限で作成されます。

### リモート環境でのセットアップ

SSH先、Dev Container、Codespaces などでCLIを実行する場合、ブラウザ側の `127.0.0.1` とCLI側の `127.0.0.1` が別になるため、ポート転送が必要です。

```bash
ssh -L 54321:127.0.0.1:54321 user@remote-host
freee configure --remote
```

`--remote` はブラウザを自動起動せず、Port Forwarding の案内と認証URLを表示します。ブラウザを開かずURL表示だけにしたい場合は `--no-open` を使えます。

```bash
freee configure --no-open
freee auth login --remote
```

freee アプリのコールバック URL は通常どおり以下を登録してください。

```text
http://127.0.0.1:54321/callback
```

## 使い方

```bash
freee auth status
freee company ls
freee company set <company_id>

freee accounting ls
freee accounting get deals
freee accounting get deals limit==10
freee accounting post deals -d '{"issue_date":"2026-01-01"}'
freee accounting post deals -d @body.json
cat body.json | freee accounting post deals -d -
freee accounting get deals --json
```

service は `accounting`, `hr`, `invoice`, `pm`, `sm` を指定できます。

### API ドキュメント

```bash
freee accounting deals --help
freee accounting get deals --help
freee accounting get deals --help --response
freee accounting get deals --spec
```

### 入力記法

| 記法 | 用途 |
| --- | --- |
| `key==val` | クエリパラメータ |
| `key=val` | ボディパラメータ（文字列） |
| `key:=json` | ボディパラメータ（JSON値） |
| `-d '{}'` | JSONボディを直接指定 |
| `-d @file.json` | JSONボディをファイルから読み込み |
| `-d -` | JSONボディを標準入力から読み込み |
| `--json` | レスポンスを生JSONで表示 |
| `--max=N` | コンパクト出力の表示件数 |
| `--verbose` | リクエストURLとボディを stderr に表示 |

`company_id` は現在の事業所が自動的に使用されます。

## Agent Skill

`skills/freee-cli-skill` に Agent Skill を同梱しています。利用するエージェントのスキル配置先へこのディレクトリを登録してください。

## 開発

```bash
go test ./...
go build -o freee .
```

サンドボックス環境などホームディレクトリに Go キャッシュを書けない場合:

```bash
GOCACHE=/tmp/freee-go-build GOMODCACHE=/tmp/freee-go-mod go test ./...
```

## リリース

Git タグ `vX.Y.Z` を push すると GitHub Actions が主要 OS/CPU 向けのバイナリと checksums を作成し、GitHub Release に添付します。

## License

このフォークには、freee K.K. による [freee/freee-mcp](https://github.com/freee/freee-mcp) のコードが含まれており、当該コードは Apache License 2.0 に基づいて提供されています。法令上許容される限りにおいて、私がこのフォークに加えた独自の変更および追加部分については、著作権が発生するとは考えておらず、CC0 1.0 に基づき、著作権その他の関連する権利を放棄します。

API の利用については [freee API 利用規約](https://app.secure.freee.co.jp/terms-freee-api.html) に準拠します。
