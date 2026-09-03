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
