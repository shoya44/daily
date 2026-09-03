# Daily

面倒くさがりのための、必要な情報だけを簡単に記録・確認できるカレンダー/手帳風PWAアプリ。
詳細な要件・設計仕様は [`spec.md`](./spec.md) を参照。

## セットアップ手順

### 1. Supabaseプロジェクトの準備

1. [Supabase](https://supabase.com) でプロジェクトを作成（無料プランで可）。
2. SQL Editor で `初期データ投入.sql` を実行し、テーブル・RLSポリシー・
   新規ユーザー用トリガーを作成する。
3. Authentication → Providers で Email 認証を有効化する。
4. Project Settings → API から `Project URL` と `anon public` キーを控える。

### 2. フロントエンドの設定

`app.js` 冒頭の以下2行を、手順1で控えた値に差し替える。

```js
const SUPABASE_URL = 'https://YOUR_PROJECT.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY';
```

> `anon` キーはクライアント公開を前提としたキーです（RLSでアクセス制御されるため）。
> `service_role` キーは絶対にフロントエンドに含めないでください。

### 3. ローカル起動・検証

PWA（Service Worker）はHTTPS、または `localhost` 配信でのみ動作する。

```bash
# 例: Pythonの簡易サーバーで起動
python3 -m http.server 8000
```

ブラウザで `http://localhost:8000` を開き、以下を確認する。

- 新規登録 → 確認メール → ログインができる
- 予定の追加・削除、勤務形態の変更が反映される
- カレンダー画面で月をまたいでも表示・出社日数カウントが正しい
- オフライン化してもアプリが起動し、書き込み操作時にトースト通知が出る

## 本番デプロイ

[Vercel](https://vercel.com) の無料プランでホスティングしている（GitHub連携で `main` への
push時に自動デプロイ）。ビルド設定は不要（静的HTML/CSS/JSをそのまま配信）。

## プッシュ通知（朝のサマリー）

Supabase Edge Function `daily-summary` が、当日の天気・服装アドバイス・勤務形態・
ゴミの種類・予定をまとめたテキストをJSONで返す。iPhoneの「ショートカット」アプリの
個人用オートメーション（時刻トリガー）からこのエンドポイントを呼び出し、
「通知を表示」でローカル通知として表示する構成。OneSignal等の外部プッシュ通知
サービスは使わず、ショートカット単体で完結する。

- エンドポイント: `https://<project-ref>.supabase.co/functions/v1/daily-summary?token=<秘密トークン>`
- 認可: クエリパラメータ `token`（またはヘッダー `x-summary-token`）を、Edge Function内に
  ハードコードした秘密トークンと比較する簡易方式。トークンと通知対象の `TARGET_USER_ID`は
  Edge Functionのソース冒頭で定義。
- **このEdge Functionのソースは `daily` リポジトリには含めていない。**
  Service Role Key相当の強い権限（RLSを経由せず全ユーザーのデータにアクセス可能）で動くため、
  コードはSupabaseダッシュボード（Edge Functions → `daily-summary` → Code）側でのみ管理する。
- 設定手順: ショートカットアプリ → オートメーション → 個人用オートメーションを作成 →
  トリガー「時刻」 → アクション「URLの内容を取得」（上記エンドポイント）→
  「辞書から値を取得」（キー: `body`）→「通知を表示」。保存時に「実行前に尋ねる」をオフにする。

## 保守・運用手順

### 年1回：祝日データ（HOLIDAYS）の更新

祝日データは **2箇所** に同じ内容を保持している。翌々年分が判明したら両方を更新すること。
片方だけ更新すると、アプリ本体の祝日判定と朝の通知サマリーの判定がズレる。

1. `app.js` 冒頭（10行目付近）の `HOLIDAYS` 定数
2. Supabase Edge Function `daily-summary`（Supabaseダッシュボード →
   Edge Functions → `daily-summary` → Code）冒頭の `HOLIDAYS` 定数。
   編集後は Deploy で再反映する。

保守で書き換える可能性のある値（祝日データ、服装/傘の温度閾値、勤務形態ラベル等）は、
両ファイルとも冒頭にまとめて定義してある。途中のロジック部分を探さなくても、
ファイル先頭を見れば変更箇所がわかる。

### 既知の制約（あえて対応していない点）

`daily-summary` は判定ロジック・定数の一部（祝日データ、服装閾値、勤務形態ラベル）を
`app.js` と重複して持っている。フロントエンドがブラウザで動く素のJS、Edge FunctionがDeno
ランタイムという実行環境の違いにより、完全な共通モジュール化は行っていない
（`index.html` のインラインイベントハンドラを書き換える必要があり、工数対効果が見合わないため）。
変更頻度の低い項目（閾値・ラベル）は重複していても実害が小さく、変更頻度の高い祝日データのみ
上記の手動同期運用でカバーする方針。

## ファイル構成

```
├── index.html          … 認証および主要3画面のHTML構造・モーダルUI
├── style.css            … ダークテーマスタイリング、CSS変数、レスポンシブ対応
├── app.js                … Supabase Auth、データ操作、画面制御、判定ロジック
├── manifest.json         … PWAマニフェスト
├── service-worker.js     … 静的アセットキャッシュ、オフライン表示制御
├── icons/                … PWA用アイコン (icon-192.png / icon-512.png)
└── 初期データ投入.sql     … Supabase初期セットアップ用SQL
```

※ Supabase Edge Function `daily-summary` のソースはこのリポジトリに含まれない
（上記「プッシュ通知」参照）。
