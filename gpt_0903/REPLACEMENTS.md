# 修正内容

## 1. 初期データ投入.sql

RLSの3ポリシーを以下へ変更します。

```sql
CREATE POLICY "Users can manage their own events"
ON events
FOR ALL
TO authenticated
USING ((select auth.uid()) = user_id)
WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can manage their own work_records"
ON work_records
FOR ALL
TO authenticated
USING ((select auth.uid()) = user_id)
WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can manage their own settings"
ON settings
FOR ALL
TO authenticated
USING ((select auth.uid()) = user_id)
WITH CHECK ((select auth.uid()) = user_id);
```

## 2. app.js

以下を適用します。

### `showMainApp()`

```js
async function showMainApp() {
    document.getElementById('screen-auth').classList.remove('active');
    document.getElementById('main-app').style.display = 'block';

    updateHeaderDate();

    try {
        await loadSettings();
        await loadCurrentMonthData();
        renderCalendar();
        await renderTodayScreen();
        switchTab('screen-today', document.querySelector('.tab.active'));
    } catch (error) {
        console.error('App initialization error:', error);
        showToast('データを読み込めませんでした。通信状態をご確認ください。');
    }
}
```

### `loadSettings()`

```js
async function loadSettings() {
    if (!db || !currentUser) return;

    const { data, error } = await db
        .from('settings')
        .select('data')
        .eq('user_id', currentUser.id)
        .maybeSingle();

    if (error) {
        console.error('Settings load error:', error);
        throw new Error('設定の読み込みに失敗しました');
    }

    if (!data) {
        settings = getDefaultSettings();
    } else {
        settings = data.data || getDefaultSettings();
    }

    renderSettingsScreen();
}
```

### `saveWorkRecord()`

成功時に `true`、失敗時に `false` を返します。

```js
async function saveWorkRecord(dateStr, status) {
    if (!db || !checkOnline()) return false;

    const { data: existing } = await db
        .from('work_records')
        .select('id')
        .eq('date', dateStr)
        .single();

    let error;
    if (existing) {
        ({ error } = await db
            .from('work_records')
            .update({ status, updated_at: new Date().toISOString() })
            .eq('id', existing.id));
    } else {
        ({ error } = await db
            .from('work_records')
            .insert([{ date: dateStr, status }]));
    }

    if (error) {
        showToast('勤務形態の保存に失敗しました（通信状態をご確認ください）');
        return false;
    }

    workRecordsCache[dateStr] = status;
    return true;
}
```

### 勤務変更

```js
async function selectWorkOption(status) {
    const saved = await saveWorkRecord(formatDate(new Date()), status);
    if (!saved) return;

    closeModal('workModal');
    renderTodayScreen();
    renderCalendar();
    showToast(`${getWorkStatusLabel(status)}に変更しました`);
}
```

### `addEventToDb()`

成功時にToastを表示します。

```js
// eventsCacheへの追加後
showToast('予定を追加しました');
return data;
```

### `updateEventInDb()`

成功時にToastを表示します。

```js
// eventsCache更新後
showToast('予定を更新しました');
return true;
```

### 予定入力のEnter対応

`newEventInput` のイベント登録付近へ追加します。

```js
document.getElementById('newEventInput').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        event.preventDefault();
        addEvent();
    }
});
```

### 天気アドバイス

現在の「傘必要／傘不要」を、行動が明確な文言へ変更します。

```js
adviceRow.innerHTML = `
    <div class="weather-advice ${needUmbrella ? 'umbrella-alert' : 'normal'}">
        <span class="dot"></span>${needUmbrella ? '傘を持っていく' : '傘は不要'}
    </div>
    <div class="weather-advice clothing">
        <span class="dot"></span>${clothing}
    </div>
`;
```

## 3. index.html

### Todayの天気カード

```html
<div class="card-label">今日どうする？</div>
```

### 予定入力

```html
<input type="text"
       id="newEventInput"
       class="modal-input"
       placeholder="何する？"
       autocomplete="off">
```

### 今週の予定

カードへ `secondary-card` を追加します。

```html
<div class="card secondary-card">
    <div class="card-label">今週の予定</div>
```

## 4. style.css

### カード密度

```css
.card {
    background: var(--bg-card);
    border-radius: var(--radius-lg);
    padding: 16px 18px;
    margin-bottom: 8px;
}
```

### ゴミバッジ

```css
.garbage-badge {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: rgba(163, 113, 247, 0.08);
    border: 1px solid rgba(163, 113, 247, 0.2);
    border-radius: 9px;
    padding: 9px 14px;
    font-size: 14px;
    font-weight: 600;
    color: var(--text);
    letter-spacing: 0;
}
```

### 今週の予定を少し弱く表示

```css
.secondary-card {
    opacity: 0.9;
}
```

### 予定なしをさらに控えめに

```css
.event-empty {
    color: var(--text-muted);
    font-size: 12px;
    padding: 6px 0;
    font-weight: 450;
}
```

## 変更しないもの

- Vanilla JS構成
- DBテーブル構成
- カレンダーの3色ドット
- FAB
- 設定画面の基本構造
- Service Workerの基本戦略
- 外部通知サービスの追加
- Undo削除機能
