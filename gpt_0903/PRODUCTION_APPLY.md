# 本番反映手順

## 目的

`gpt_0903` は、Dailyの「面倒くさいを減らす・日々のストレスを減らす」というコンセプトに沿ったUX改善と、Supabase RLSの安全性改善を反映するための作業資料です。

## 0. 前提

- 対象ブランチ: `feature/daily-ux-safety-improvements`
- 本番環境: Vercel + Supabase
- 既存機能を維持する
- 新規ライブラリ、外部サービス、DBテーブルは追加しない
- DB変更は本番へ直接適用せず、必ず確認してから実施する

## 1. 作業前バックアップ

1. ローカルの最新 `main` / PRブランチを取得。
2. `app.js`、`index.html`、`style.css`、`初期データ投入.sql` の変更前コピーを保存。
3. Supabaseのバックアップ／復旧手段を確認。
4. 本番DBへ変更を適用する前に、SQLを必ず目視確認。

## 2. コード変更

`gpt_0903/apply_ux_safety_improvements.ps1` をローカルリポジトリのルートから実行します。

まず確認のみ:

```powershell
powershell -ExecutionPolicy Bypass -File .\gpt_0903\apply_ux_safety_improvements.ps1
```

問題がなければ適用:

```powershell
powershell -ExecutionPolicy Bypass -File .\gpt_0903\apply_ux_safety_improvements.ps1 -Apply
```

スクリプトは変更前ファイルを `.gpt_0903_backup_YYYYMMDD-HHMMSS` に退避します。

## 3. SQL変更

`REPLACEMENTS.md` のRLS SQLを確認します。

対象3テーブル:

- `events`
- `work_records`
- `settings`

変更内容:

- `TO authenticated`
- `USING ((select auth.uid()) = user_id)`
- `WITH CHECK ((select auth.uid()) = user_id)`

### 本番適用時

1. Supabase DashboardのSQL Editorで対象SQLを確認。
2. 既存ポリシー名との重複を確認。
3. 必要なら既存ポリシーを安全に削除してから再作成。
4. 実行後、Authenticatedユーザーとして自分のデータをSELECT/INSERT/UPDATE/DELETEできることを確認。
5. 他ユーザーのデータを参照・変更できないことを確認。

**DB変更は不可逆になり得るため、未確認のまま本番実行しない。**

## 4. ローカル検証

### 起動

通常のプロジェクト手順でローカル確認します。

### 必須確認

- ログインできる
- Today画面が表示される
- 設定が正常に読み込まれる
- Supabase通信エラー時にアプリが中途半端な状態にならず、Toastが表示される
- 設定データが存在しない場合はデフォルト設定になる
- 天気カードが「今日どうする？」になっている
- 雨天時に「傘を持っていく」と表示される
- 晴天時に「傘は不要」と表示される
- 予定入力欄が「何する？」になっている
- 予定をEnterで追加できる
- 予定追加成功時にToastが表示される
- 予定編集成功時にToastが表示される
- 予定削除成功時にToastが表示される
- 勤務変更成功時にToastが表示される
- 「今週の予定」が補助情報として表示される
- ゴミバッジが従来より視認しやすい
- カレンダーの青／黄／紫のドット表示が壊れていない
- FAB「＋」から予定を追加できる
- 設定画面が壊れていない

## 5. iPhone実機確認

PWAとして以下を確認します。

- ホーム画面から起動できる
- Safe Areaが正常
- FABが画面下端に隠れない
- 予定入力時にキーボードが入力欄を隠さない
- Enter相当の操作で予定追加できる
- Today画面を短いスクロールで確認できる
- ダークUIの視認性が維持されている
- Service Workerの更新が正常
- 「最新版を確認」が機能する

## 6. 本番反映

推奨順序:

1. コードをコミット。
2. PRのCIがある場合は全チェック成功を確認。
3. Preview環境でiPhone実機確認。
4. PRをレビュー。
5. `main` へマージ。
6. Vercelの本番デプロイ成功を確認。
7. 本番PWAをiPhoneで開く。
8. Service Workerのキャッシュが古い場合は「最新版を確認」を実行。
9. Supabaseのログイン・予定・勤務変更を確認。
10. 必要な場合のみRLS変更を本番DBへ適用。

## 7. ロールバック

### コード

問題が発生した場合は、今回のコードコミットをrevertし、Vercelを正常なコミットへ戻します。

### DB

RLS変更前のポリシー定義を保存してから実行してください。問題が発生した場合は、保存した旧定義へ戻します。

## 8. 完了条件

以下をすべて満たせば完了です。

- [ ] コードレビュー完了
- [ ] ローカル検証完了
- [ ] iPhone実機検証完了
- [ ] Preview検証完了
- [ ] RLS確認完了
- [ ] 本番デプロイ成功
- [ ] 本番ログイン成功
- [ ] 予定追加／編集／削除成功
- [ ] 勤務変更成功
- [ ] Today画面が「今日どうする？」中心になっている
- [ ] 重大なエラーがない

## 9. 今回あえて追加しないもの

- Undo削除
- タグ
- カテゴリ
- 繰り返し予定
- Google Calendar連携
- 通知サービス追加
- 高度な検索
- 統計・グラフ
- 新規DBテーブル
- 新規npm依存関係

Dailyは「高機能化」ではなく「日々の判断と操作を減らす」ことを優先します。
