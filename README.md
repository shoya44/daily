# Daily

面倒くさがりのための、必要な情報だけを簡単に記録・確認できるカレンダー/手帳風PWAアプリ。

Dailyの最優先事項は、機能を増やすことではなく、日々の「小さな判断」「記録」「確認」の手間を減らすこと。

- 判断回数を減らす
- タップ数を減らす
- 視線移動を減らす
- スクロール量を減らす
- 保存できたかどうかの不安を減らす
- 設定・メンテナンスの手間を減らす

**「毎日使っていることを意識しない」ことを目標とする。**

---

## 1. プロジェクト概要

| 項目 | 内容 |
| --- | --- |
| アプリ名 | Daily |
| 目的 | 面倒くさがりのための、必要な情報だけを簡単に記録・確認できるカレンダー/手帳風PWA |
| 形式 | PWA（ホーム画面追加可能、オフライン起動対応） |
| 対象デバイス | iPhone（Safari）、PC（Chrome） |
| デザイン | ダーク・ミニマル・Apple/Linearライク |
| データ管理 | Supabase（無料プラン、メールアドレス認証、RLS） |
| 外部API | Open-Meteo API |
| 通知 | Supabase Edge Function + iOSショートカット |
| ホスティング | Vercel |

---

## 2. 設計方針

### 2.1 UXの基本方針

Dailyは「高機能な手帳」ではなく、毎日の判断を減らすための道具とする。

特にToday画面では、単なる状態表示よりも、可能な限り「次に何をすればよいか」を表示する。

- 「傘必要」ではなく「傘を持っていく」
- 「今週の残り出社 2」ではなく「今週あと2日出社」
- 今日重要な情報を上部に集約
- 不要な情報は視覚的に弱くする

### 2.2 シンプルさを維持する方針

以下は原則として追加しない。

- タグ
- カテゴリ
- 複数カレンダー
- Google Calendar等との連携
- 高度な検索
- 統計・グラフ
- 複雑な通知設定
- 多ユーザー向け機能
- 高度なオフライン同期
- 過剰なUIカスタマイズ

機能追加によって操作や設定が増える場合は、利便性よりシンプルさを優先する。

---

## 3. システム構成

- **Frontend:** HTML5 / CSS3 / JavaScript（Vanilla JS、ES6+）
- **Backend:** PostgreSQL（Supabase）
- **Authentication:** Supabase Auth（Email / Password）
- **Weather:** Open-Meteo API
- **PWA:** Web App Manifest + Service Worker
- **Hosting:** Vercel
- **Morning summary:** Supabase Edge Function `daily-summary` + iOSショートカット
- **External notification service:** 使用しない

---

## 4. DB仕様

### 4.1 `events` テーブル

| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| id | uuid | PK, gen_random_uuid() | 予定ID |
| user_id | uuid | NOT NULL, auth.uid() | ユーザーID |
| date | date | NOT NULL | 予定日 |
| text | text | NOT NULL | 予定・メモ |
| created_at | timestamptz | DEFAULT now() | 作成日時 |

### 4.2 `work_records` テーブル

| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| id | uuid | PK, gen_random_uuid() | 記録ID |
| user_id | uuid | NOT NULL, auth.uid() | ユーザーID |
| date | date | NOT NULL | 対象日 |
| status | text | NOT NULL, CHECK | 勤務形態 |
| updated_at | timestamptz | DEFAULT now() | 更新日時 |

CHECK値:

`office`, `remote`, `paid_full`, `paid_am`, `paid_pm`, `holiday_work`, `off`

複合UNIQUE制約: `(user_id, date)`

### 4.3 `settings` テーブル

| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| id | uuid | PK, gen_random_uuid() | 設定ID |
| user_id | uuid | NOT NULL, UNIQUE, auth.uid() | ユーザーID |
| data | jsonb | NOT NULL | ユーザー設定 |

新規ユーザー登録時に `handle_new_user()` トリガーで初期データを生成する。

```json
{
  "workDefaults": {
    "mon": "remote", "tue": "office", "wed": "office",
    "thu": "remote", "fri": "remote", "sat": "off", "sun": "off"
  },
  "garbageSchedule": [
    { "type": "燃えるゴミ", "weekdays": [1, 4], "weeks": [] },
    { "type": "プラスチック", "weekdays": [6], "weeks": [] },
    { "type": "資源", "weekdays": [2], "weeks": [] },
    { "type": "燃えないゴミ", "weekdays": [5], "weeks": [2, 4] }
  ],
  "weatherLocation": { "name": "東京", "lat": 35.68, "lon": 139.76 }
}
```

### 4.4 RLS

全テーブルでRow Level Security（RLS）を有効化する。

各テーブルのポリシーは、認証済みユーザーについて以下を満たすこと。

```sql
USING ((select auth.uid()) = user_id)
WITH CHECK ((select auth.uid()) = user_id)
```

`USING` だけでなく `WITH CHECK` も指定し、INSERT / UPDATE時にも本人の `user_id` であることを保証する。

---

## 5. 画面仕様

### 5.1 認証画面（`#screen-auth`）

- メールアドレス・パスワード入力
- ログイン
- 新規登録
- エラー・通知表示
- 認証成功後、Today画面を表示

### 5.2 Today画面（`#screen-today`）

Dailyの中心画面。上から見るだけで「今日どうするか」が分かる構成とする。

情報の優先順位:

1. **今日どうする？** — 天気、傘、服装
2. **勤務** — 今日の勤務形態、今週あと何日出社か
3. **ゴミ** — 今日出すゴミ
4. **今日の予定** — 今日の予定・メモ
5. **これからの予定** — 今日より後、直近5件の予定

#### 天気

- 天気アイコン
- 最高気温
- 天気説明
- 傘の判断
- 服装の判断
- 明日の傘の判断（1行、控えめに表示）

状態だけでなく、可能な限り行動として表示する。

例:

- 「傘必要」→「傘を持っていく」
- 「傘不要」→「傘は不要」

明日分は傘の要否のみ先出しする。服装は当日分のみとし、情報量を抑える。

#### 勤務

- 当日の勤務形態を表示
- タップで変更
- 今週の残り出社日数を表示
- 2日以上: 赤
- 1日: 黄
- 0日: 緑

#### ゴミ

- 当日出すゴミを表示
- ゴミがある日は見落としにくくする
- ゴミがない日は控えめに表示
- 明日出すゴミを1行で先出し表示（当日の有無に関わらず常時表示）

#### 予定

- 今日の予定を表示
- タップで編集
- 編集では本文変更・削除が可能
- FAB（＋）から予定追加
- 入力後Enterでも追加可能
- 入力欄のプレースホルダーは「何する？」
- 保存・更新・削除の結果を短いToastで通知

基本操作:

```text
＋ → 入力 → Enter
```

#### これからの予定

- 今日より後の予定を、直近5件まで表示（週をまたいでも表示）
- 日付バッジ付き
- Todayの主情報より視覚的に弱くする
- カード右上の＋から、日付選択（明日〜再来週の日曜まで）→予定追加が可能

### 5.3 カレンダー画面（`#screen-calendar`）

- 前月 / 次月
- 今日へ移動
- 月間カレンダー
- 選択日詳細

ドットの意味は固定する。

- 青: 予定あり
- 黄: 勤務変更あり
- 紫: ゴミの日

カレンダーは複雑な入力画面ではなく「状況を確認する画面」とする。

選択日の詳細:

- 日付
- 勤務形態
- ゴミ
- 予定
- 選択日への予定追加

### 5.4 設定画面（`#screen-settings`）

「一度設定したら普段は触らない画面」とする。

- 勤務形態のデフォルト
- ゴミの日
- 天気取得地点
- アプリ情報 / 最新版を確認
- ログアウト

通知設定、タグ、カテゴリ等の追加設定は行わない。

---

## 6. 機能・判定ロジック

### 6.1 勤務形態

1. 対象日付の `work_records` を検索
2. 明示記録があればその `status` を採用
3. 記録がなければ祝日を確認
4. 祝日なら `off`
5. それ以外は曜日ごとの `workDefaults` を採用

今週の残り出社日数は、今日以降の `office` / `holiday_work` の日数を数える。月境界をまたぐ週にも対応する。

### 6.2 ゴミ

曜日番号（0=日〜6=土）と月内の第N曜日を算出し、`garbageSchedule` の条件に一致する種類を抽出する。

第N曜日:

```text
floor((date - 1) / 7) + 1
```

### 6.3 服装

| 条件 | 表示 |
|---|---|
| 最高気温 >= 28°C | 半袖で快適 |
| 最高気温 >= 22°C | 半袖＋薄手の上着 |
| 最高気温 >= 18°C | 長袖シャツで快適 |
| 最高気温 >= 12°C | 長袖＋カーディガン |
| 最高気温 < 12°C | コートが必要 |

降水確率 >= 50% の場合は「傘を持っていく」として強調する。

---

## 7. エラー処理

### 設定読み込み

「設定が存在しない」と「通信エラー」を区別する。

- データなし → デフォルト設定を使用
- 通信エラー → デフォルト設定へ勝手に置き換えず、エラー通知

### 初期ロード

設定・月データ・Today画面の読み込み中に例外が発生した場合、コンソールに記録し、ユーザーには短いToastで読み込み失敗を知らせる。

### 書き込み

- オフライン → 変更せず「オフラインのため変更できません」を表示
- DBエラー → 変更失敗をToast表示
- 成功 → 成功内容を短いToastで表示

---

## 8. PWA・オフライン仕様

- Service WorkerでHTML/CSS/JS/アイコン等の静的アセットをキャッシュ
- オフラインでもアプリの起動・閲覧が可能
- オフライン中の書き込みは行わない
- キャッシュ戦略はシンプルなCache Firstを維持
- デプロイ後に古いキャッシュが残る場合は「最新版を確認」を使用
- コード変更を伴うデプロイ時は `CACHE_NAME` を更新する

### 最新版を確認

設定画面 → アプリ → 「最新版を確認」で、Service Workerの登録解除とキャッシュ削除を行い再読み込みする。

---

## 9. 朝のサマリー通知

Supabase Edge Function `daily-summary` が当日の情報をJSONで返し、iOSショートカットから取得してローカル通知として表示する。

通知内容:

- 天気
- 服装
- 傘
- 勤務
- ゴミ
- 予定

OneSignal等の外部通知サービスは使用しない。

### セキュリティ

- Edge FunctionはService Role Key相当の権限を利用する
- 秘密トークンと `TARGET_USER_ID` はEdge Function側で管理する
- Edge Functionのソースはこのリポジトリに含めない

### ショートカット設定

iPhoneの「ショートカット」アプリで個人用オートメーションを作成する。

```text
時刻トリガー
↓
URLの内容を取得
↓
Edge Functionのエンドポイント
↓
「辞書から値を取得」（body）
↓
通知を表示
```

「実行前に尋ねる」はオフにする。

---

## 10. セットアップ手順

### 10.1 Supabaseプロジェクト

1. Supabaseでプロジェクトを作成（無料プランで可）
2. SQL Editorで `初期データ投入.sql` を実行
3. Authentication → ProvidersでEmail認証を有効化
4. Project Settings → APIからProject URLと `anon public` キーを取得
5. RLSが3テーブルすべてで有効になっていることを確認

### 10.2 フロントエンド設定

`app.js` 冒頭の以下2行を設定する。

```js
const SUPABASE_URL = 'https://YOUR_PROJECT.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY';
```

`anon` キーはクライアント公開を前提としたキーであり、RLSでアクセス制御する。

**`service_role` キーは絶対にフロントエンドへ含めない。**

### 10.3 ローカル起動

PWA（Service Worker）はHTTPS、または `localhost` 配信で動作する。

```bash
python3 -m http.server 8000
```

ブラウザで `http://localhost:8000` を開く。

---

## 11. 本番デプロイ

Vercelの無料プランでホスティングする。GitHubの `main` へのpush時に自動デプロイする。

ビルド設定は不要。静的HTML/CSS/JSをそのまま配信する。

### Service Worker更新

`service-worker.js` の `CACHE_NAME` をコード変更時にインクリメントする。

例:

```js
const CACHE_NAME = 'daily-app-v4';
```

→

```js
const CACHE_NAME = 'daily-app-v5';
```

デプロイ直後に端末で確認する場合は、設定画面の「最新版を確認」を使用する。

---

## 12. 保守・運用

### 12.1 祝日データ

祝日データは以下2箇所に保持する。

1. `app.js` の `HOLIDAYS`
2. Supabase Edge Function `daily-summary` の `HOLIDAYS`

翌々年分が判明したら両方を更新する。片方だけ更新すると、アプリ本体と朝の通知サマリーで判定がずれる。

### 12.2 判定用定数

服装・傘・勤務形態等の低頻度変更項目は、各ファイルの冒頭付近にまとめて定義する。

Edge Function側にも一部同じ定数があるため、文言や閾値を変更する場合は必要に応じて両方を同期する。

### 12.3 通知文言

通知本文はSupabaseダッシュボード → Edge Functions → `daily-summary` → Codeで管理する。

主な変更箇所:

- `bodyLines`: 表示項目・順序
- `title`: 通知タイトル
- `weatherLabel`: 天気表現
- `eventsLabel`: 複数予定の表現
- `CLOTHING_THRESHOLDS`: 服装閾値
- `WORK_LABELS`: 勤務形態ラベル
- `umbrella`: 傘要否の表現

変更後はEdge FunctionをDeployし、エンドポイントからJSONの `body` を確認する。

---

## 13. ファイル構成

```text
├── index.html            … 認証・Today・カレンダー・設定・モーダルUI
├── style.css             … ダークテーマ、ミニマルUI、PWA向けレイアウト
├── app.js                … Auth、DB操作、画面制御、判定ロジック
├── manifest.json         … PWAマニフェスト
├── service-worker.js     … 静的アセットキャッシュ、オフライン制御
├── icons/                … PWA用アイコン（icon-192.png / icon-512.png）
├── 初期データ投入.sql     … Supabase初期セットアップ用SQL
└── README.md             … セットアップ・運用・仕様を統合したドキュメント
```

※ Supabase Edge Function `daily-summary` のソースはリポジトリに含めない。

---

## 14. 受け入れテスト

### 基本機能

- [ ] 新規登録 → 確認メール → ログイン
- [ ] Today画面が表示される
- [ ] カレンダーが表示される
- [ ] 設定画面が表示される

### Today / UX

- [ ] 「今日どうする？」が最上部に表示される
- [ ] 傘が必要な日は「傘を持っていく」と表示される
- [ ] 服装アドバイスが表示される
- [ ] 今週あと何日出社かが分かる
- [ ] ゴミの日を見落としにくい
- [ ] 今日の予定が確認できる
- [ ] FAB → 入力 → Enterで予定を追加できる
- [ ] 予定追加・更新・削除時にToastが表示される
- [ ] 明日のゴミが今日の有無に関わらず表示される
- [ ] 明日の傘の要否が表示される
- [ ] 「これからの予定」に今日より後・直近5件が週をまたいで表示される
- [ ] 「これからの予定」の＋→日付選択→予定追加ができる

### カレンダー

- [ ] 月移動ができる
- [ ] 月境界をまたいでも正しく表示される
- [ ] 青ドット＝予定、黄ドット＝勤務変更、紫ドット＝ゴミになっている
- [ ] 選択日の予定追加が対象日へ正しく登録される

### データ安全性

- [ ] 設定なし時はデフォルト設定が使用される
- [ ] Supabase通信エラー時にデフォルト設定へ勝手に置き換わらない
- [ ] DBエラー時に失敗Toastが表示される
- [ ] RLSで他ユーザーのデータを取得・変更できない

### PWA

- [ ] iPhone Safariからホーム画面へ追加できる
- [ ] ホーム画面から正常に起動する
- [ ] Safe Areaが正しく処理される
- [ ] オフラインでも起動・閲覧できる
- [ ] オフライン中の書き込みでToastが表示される
- [ ] 「最新版を確認」でキャッシュを破棄して再読み込みできる
- [ ] `CACHE_NAME` 更新後に新しいCSS/JSが反映される

### 通知

- [ ] Edge Functionが当日のサマリーJSONを返す
- [ ] iOSショートカットから通知を表示できる
- [ ] ゴミなし・予定なしの日は不要な行が表示されない

---

## 15. 非スコープ

以下は現行方針では実装しない。

- Web Push
- OneSignal等の外部通知サービス
- 複数ユーザー向け機能
- 高度なオフライン編集・同期
- Google Calendar等との同期
- タグ・カテゴリ
- 複雑な検索
- 統計・グラフ
- 複雑な通知設定
- 過剰なテーマ・UIカスタマイズ

READMEは、セットアップ、運用、設計方針、画面仕様、判定ロジック、エラー処理、PWA、通知、受け入れテストまでを一つにまとめ、これだけでDailyの全体像を把握できる構成としている。
