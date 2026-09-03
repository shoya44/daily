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

### デプロイ後、変更が反映されない場合

Service Worker（`service-worker.js`）がキャッシュ優先で静的ファイルを配信するため、
サーバー側は最新でも端末側が古いキャッシュを表示し続けることがある。

- **アプリ側の対処（ユーザー操作）**: 設定画面 → アプリ情報 →「最新版を確認」を
  タップすると、Service Workerの登録解除とキャッシュ全削除を行い再読み込みする。
  デプロイ直後に変更をすぐ確認したいときに使う。
- **開発側の対処（コード変更を伴うデプロイのたび）**: `service-worker.js` 冒頭の
  `CACHE_NAME` をインクリメントする（例: `daily-app-v2` → `daily-app-v3`）。
  これを更新し忘れると、「最新版を確認」を押さない限り新しいCSS/JSが反映されない
  端末が残る。README上の他の変更と同様、デプロイ作業の一部として必ず行うこと。

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

### 通知文言の変更手順

通知本文の組み立ては `daily-summary`（Supabaseダッシュボード → Edge Functions →
`daily-summary` → Code）内で行っている。文言を変えたい場合は以下を編集し、Deployで
再反映する。

1. **各項目のラベル文言**（例: 「勤務」「ゴミ」「予定」、天気の「／」区切り等）
   → ファイル末尾付近、`body` を組み立てている箇所
   ```ts
   const body = [
     weatherLabel,
     `勤務: ${workLabel}`,
     `ゴミ: ${garbageLabel}`,
     `予定: ${eventsLabel}`,
   ].join("\n");
   ```
   この配列の各行の文言・並び順・区切り文字（`\n`）を編集する。
2. **通知タイトル**（例: `Daily 9/3(木)`）→ `title: \`Daily ${dateLabel}\`` の
   `"Daily"` 部分を編集する。
3. **天気の表現**（「晴れ 24°C／傘不要／半袖＋薄手の上着」の組み立て）
   → `weatherLabel = \`${desc} ${Math.round(tempMax)}°C／${umbrella}／${clothing}\`;`
   の行を編集する。
4. **服装アドバイス・傘要否・勤務形態などの個別ラベル文言**は、ファイル冒頭の
   `CLOTHING_THRESHOLDS` / `WORK_LABELS` 定数、および傘要否を組み立てている
   `umbrella` 変数の三項演算子部分を編集する（app.jsの同名表現と揃える場合は
   両方更新する。上記「保守・運用手順」参照）。
5. 編集後はエンドポイントURLをSafari等で直接開き、返ってきたJSONの `body` が
   意図通りか確認する。ショートカット側の設定変更は不要（`body` キーの中身が
   変わるだけなので、オートメーション側はそのまま動く）。

このセッション（Claude Code）に依頼すれば、Supabase MCP経由でコード編集・再デプロイを
代行できる。

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
