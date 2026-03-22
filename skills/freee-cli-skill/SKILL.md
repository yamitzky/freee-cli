---
name: freee-cli-skill
description: >-
  freee CLI (`freee`) を使って freee API を操作する。
  会計・人事労務・請求書・工数管理・販売の API リファレンスと使い方ガイドを提供。
  経費申請・取引登録・勤怠打刻・給与明細・見積書・試算表・仕訳・従業員管理・工数登録・売上管理など、
  freee関連の操作やAPI仕様を調べたいときに使う。
---

# freee CLI

## Look things up before answering

CLI is self-documenting. Always run these instead of guessing:

- `freee accounting ls [filter]` -- list endpoints (filter by keyword).
- `freee accounting docs <path>` -- compact API docs (params, response).
- `freee accounting help <path>` -- show methods for an endpoint.

## Install

```bash
npx @yamitzky/freee --help
```

## Authentication

`freee auth login` to authenticate (opens browser).
Tokens are auto-refreshed. If 401 error occurs, run `freee auth login` again.

## API Calls

```bash
freee accounting get deals limit==10
freee accounting post deals -d '{"type":"income","issue_date":"2025-01-15","details":[{"tax_code":1,"amount":10000}]}'
freee accounting delete deals/123
```

service: accounting, hr, invoice, pm, sm
path: shorthand OK (`deals` = `/api/1/deals`)

## Recipes

- `recipes/deal-operations.md` -- 取引
- `recipes/expense-application-operations.md` -- 経費申請
- `recipes/hr-employee-operations.md` -- 人事労務
- `recipes/hr-attendance-operations.md` -- 勤怠
- `recipes/invoice-operations.md` -- 請求書
- `recipes/receipt-operations.md` -- ファイルアップロード
- `recipes/pm-operations.md` -- 工数管理
- `recipes/sm-operations.md` -- 販売管理
- `recipes/troubleshooting.md` -- トラブルシューティング
