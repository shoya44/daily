# gpt_0903

Daily の UX・安全性改善を本番へ反映するための作業フォルダです。

## 内容

- `apply_ux_safety_improvements.ps1` — 既存ファイルへ今回の修正を自動適用するPowerShellスクリプト
- `REPLACEMENTS.md` — 変更内容と適用対象の一覧
- `PRODUCTION_APPLY.md` — 本番反映手順・確認項目

## 対象

- `app.js`
- `index.html`
- `style.css`
- `初期データ投入.sql`

## 方針

- 新しいライブラリ・外部サービス・DBテーブルは追加しない
- 既存機能を維持し、面倒な操作・判断・確認を減らす
- Supabaseのデータ境界をRLSで明示する
- 通信エラーと「データなし」を区別する
- Today画面では「今日どうするか」を最優先に表示する
