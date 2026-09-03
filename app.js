/* ========================================
   Daily — メインアプリケーションロジック（確定版）
   ======================================== */

// ========================================
// 設定値（SupabaseのURLとAnon Keyを設定してください）
// ========================================
const SUPABASE_URL = 'https://sgyfrlxlhflawpwtyirq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNneWZybHhsaGZsYXdwd3R5aXJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYwODcxODYsImV4cCI6MjEwMTY2MzE4Nn0.Me_YOplC2n6eNv6tQ-TrJc9w9A-hanAbO-xhJQqfvrc';

// 服装アドバイスの温度閾値
const CLOTHING_THRESHOLDS = [
    { minTemp: 28, advice: '半袖で快適' },
    { minTemp: 22, advice: '半袖＋薄手の上着' },
    { minTemp: 18, advice: '長袖シャツで快適' },
    { minTemp: 12, advice: '長袖＋カーディガン' },
    { minTemp: -Infinity, advice: 'コートが必要' },
];

// 傘が必要な降水確率の閾値
const UMBRELLA_THRESHOLD = 50;

// 週の開始曜日（0=日, 1=月）
const WEEK_START_DAY = 1;

// ========================================
// 勤務形態の定義
// ========================================
const WORK_STATUSES = {
    office: { label: '出社', icon: 'building' },
    remote: { label: 'リモート', icon: 'laptop' },
    off: { label: '休日', icon: 'moon' },
    paid_full: { label: '有給（全休）', icon: 'star' },
    paid_am: { label: '有給（AM半休）', icon: 'sunrise' },
    paid_pm: { label: '有給（PM半休）', icon: 'sunset' },
    holiday_work: { label: '休日出勤', icon: 'star-burst' },
};

// ========================================
// 祝日リスト（2026年〜2027年）
// ========================================
const HOLIDAYS = {
    '2026-01-01': '元日', '2026-01-12': '成人の日', '2026-02-11': '建国記念の日',
    '2026-02-23': '天皇誕生日', '2026-03-20': '春分の日', '2026-04-29': '昭和の日',
    '2026-05-03': '憲法記念日', '2026-05-04': 'みどりの日', '2026-05-05': 'こどもの日',
    '2026-07-20': '海の日', '2026-08-11': '山の日', '2026-09-21': '敬老の日',
    '2026-09-22': '秋分の日', '2026-10-12': 'スポーツの日', '2026-11-03': '文化の日',
    '2026-11-23': '勤労感謝の日',
    '2027-01-01': '元日', '2027-01-11': '成人の日', '2027-02-11': '建国記念の日',
    '2027-02-23': '天皇誕生日', '2027-03-21': '春分の日', '2027-04-29': '昭和の日',
    '2027-05-03': '憲法記念日', '2027-05-04': 'みどりの日', '2027-05-05': 'こどもの日',
    '2027-07-19': '海の日', '2027-08-11': '山の日', '2027-09-20': '敬老の日',
    '2027-09-23': '秋分の日', '2027-10-11': 'スポーツの日', '2027-11-03': '文化の日',
    '2027-11-23': '勤労感謝の日',
};

// ========================================
// アプリ状態
// ========================================
let db = null;
let currentUser = null;
let settings = null;
let eventsCache = {};
let workRecordsCache = {};
let selectedDate = new Date();
let currentYear = new Date().getFullYear();
let currentMonth = new Date().getMonth();
let deleteEventId = null;
let editingWorkDefaultDay = null;

// ========================================
// 初期化・認証監視
// ========================================
async function init() {
    if (typeof supabase === 'undefined') {
        showToast('Supabase SDKの読み込みに失敗しました');
        return;
    }

    db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // 認証状態の変更検知
    db.auth.onAuthStateChange((event, session) => {
        if (session) {
            currentUser = session.user;
            showMainApp();
        } else {
            currentUser = null;
            showAuthScreen();
        }
    });

    // PWA Service Worker の登録
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('service-worker.js').catch(err => console.error('SW Error:', err));
    }
}

// 画面表示切り替え
function showAuthScreen() {
    document.getElementById('screen-auth').classList.add('active');
    document.getElementById('main-app').style.display = 'none';
}

async function showMainApp() {
    document.getElementById('screen-auth').classList.remove('active');
    document.getElementById('main-app').style.display = 'block';

    updateHeaderDate();
    await loadSettings();
    await loadCurrentMonthData();
    renderCalendar();
    await renderTodayScreen();
    switchTab('screen-today', document.querySelector('.tab.active'));
}

// ========================================
// 認証処理 (Auth)
// ========================================
async function handleLogin() {
    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value;
    const msgEl = document.getElementById('authMessage');
    msgEl.textContent = '';

    if (!email || !password) {
        msgEl.textContent = 'メールアドレスとパスワードを入力してください';
        return;
    }

    const { error } = await db.auth.signInWithPassword({ email, password });
    if (error) {
        msgEl.textContent = 'ログイン失敗: ' + error.message;
    }
}

async function handleSignUp() {
    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value;
    const msgEl = document.getElementById('authMessage');
    msgEl.textContent = '';

    if (!email || !password) {
        msgEl.textContent = 'メールアドレスとパスワードを入力してください';
        return;
    }

    const { error } = await db.auth.signUp({ email, password });
    if (error) {
        msgEl.textContent = '登録失敗: ' + error.message;
    } else {
        msgEl.style.color = 'var(--accent-green)';
        msgEl.textContent = '確認メールを送信しました。メールをご確認ください。';
    }
}

async function handleLogout() {
    await db.auth.signOut();
}

// ========================================
// Supabase データ操作
// ========================================
async function loadSettings() {
    if (!db || !currentUser) return;
    const { data, error } = await db.from('settings').select('data').eq('user_id', currentUser.id).single();
    if (error || !data) {
        settings = getDefaultSettings();
    } else {
        settings = data.data || getDefaultSettings();
    }
    renderSettingsScreen();
}

function getDefaultSettings() {
    return {
        workDefaults: {
            mon: 'remote', tue: 'office', wed: 'office', thu: 'remote',
            fri: 'remote', sat: 'off', sun: 'off',
        },
        garbageSchedule: [
            { type: '燃えるゴミ', weekdays: [1, 4], weeks: [] },
            { type: 'プラスチック', weekdays: [6], weeks: [] },
            { type: '資源', weekdays: [2], weeks: [] },
            { type: '燃えないゴミ', weekdays: [5], weeks: [2, 4] },
        ],
        weatherLocation: { name: '東京', lat: 35.68, lon: 139.76 },
    };
}

async function saveSettings() {
    if (!db || !settings || !currentUser) return;
    if (!checkOnline()) return;

    const { error } = await db.from('settings').update({ data: settings }).eq('user_id', currentUser.id);
    if (error) {
        showToast('設定の保存に失敗しました（通信状態をご確認ください）');
    }
}

async function loadCurrentMonthData() {
    if (!db || !currentUser) return;
    const startDate = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-01`;
    const lastDate = new Date(currentYear, currentMonth + 1, 0).getDate();
    const endDate = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(lastDate).padStart(2, '0')}`;

    const { data: events } = await db
        .from('events')
        .select('*')
        .gte('date', startDate)
        .lte('date', endDate)
        .order('created_at', { ascending: true });

    eventsCache = {};
    if (events) {
        events.forEach(ev => {
            if (!eventsCache[ev.date]) eventsCache[ev.date] = [];
            eventsCache[ev.date].push(ev);
        });
    }

    const { data: records } = await db
        .from('work_records')
        .select('*')
        .gte('date', startDate)
        .lte('date', endDate);

    workRecordsCache = {};
    if (records) {
        records.forEach(r => {
            workRecordsCache[r.date] = r.status;
        });
    }
}

async function addEventToDb(dateStr, text) {
    if (!db || !checkOnline()) return null;
    const { data, error } = await db.from('events').insert([{ date: dateStr, text }]).select().single();
    if (error) {
        showToast('予定の追加に失敗しました（通信状態をご確認ください）');
        return null;
    }
    if (!eventsCache[dateStr]) eventsCache[dateStr] = [];
    eventsCache[dateStr].push(data);
    return data;
}

async function deleteEventFromDb(eventId, dateStr) {
    if (!db || !checkOnline()) return false;
    const { error } = await db.from('events').delete().eq('id', eventId);
    if (error) {
        showToast('予定の削除に失敗しました（通信状態をご確認ください）');
        return false;
    }
    if (eventsCache[dateStr]) {
        eventsCache[dateStr] = eventsCache[dateStr].filter(ev => ev.id !== eventId);
    }
    return true;
}

async function saveWorkRecord(dateStr, status) {
    if (!db || !checkOnline()) return;
    const { data: existing } = await db
        .from('work_records')
        .select('id')
        .eq('date', dateStr)
        .single();

    let error;
    if (existing) {
        ({ error } = await db.from('work_records').update({ status, updated_at: new Date().toISOString() }).eq('id', existing.id));
    } else {
        ({ error } = await db.from('work_records').insert([{ date: dateStr, status }]));
    }
    if (error) {
        showToast('勤務形態の保存に失敗しました（通信状態をご確認ください）');
        return;
    }
    workRecordsCache[dateStr] = status;
}

// ========================================
// ロジック・判定関数
// ========================================
function resolveWorkStatus(dateObj, recordsMap) {
    const dateStr = formatDate(dateObj);
    if (recordsMap[dateStr]) return recordsMap[dateStr];
    if (HOLIDAYS[dateStr]) return 'off';
    if (settings?.workDefaults) {
        const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
        return settings.workDefaults[dayNames[dateObj.getDay()]] || 'remote';
    }
    return 'remote';
}

function getWorkStatus(dateObj) {
    return resolveWorkStatus(dateObj, workRecordsCache);
}

function getWorkStatusLabel(status) {
    return WORK_STATUSES[status]?.label || status;
}

function getThisWeekRange() {
    const today = new Date();
    const diffToMonday = (today.getDay() - WEEK_START_DAY + 7) % 7;
    const monday = new Date(today);
    monday.setDate(today.getDate() - diffToMonday);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { monday, sunday };
}

// 今週が月をまたぐ場合でも work_records を正しく反映するため、
// 月キャッシュ（workRecordsCache）に頼らず今週分をDBから個別取得する。
async function getOfficeDaysThisWeek() {
    const { monday, sunday } = getThisWeekRange();
    let weekRecords = {};

    if (db && currentUser) {
        const { data: records } = await db
            .from('work_records')
            .select('date, status')
            .gte('date', formatDate(monday))
            .lte('date', formatDate(sunday));
        if (records) {
            records.forEach(r => { weekRecords[r.date] = r.status; });
        }
    }

    let count = 0;
    for (let i = 0; i < 7; i++) {
        const date = new Date(monday);
        date.setDate(monday.getDate() + i);
        const status = resolveWorkStatus(date, weekRecords);
        if (status === 'office' || status === 'holiday_work') count++;
    }
    return count;
}

function getGarbageForDate(dateObj) {
    if (!settings?.garbageSchedule) return [];
    const dayOfWeek = dateObj.getDay();
    const weekNumber = Math.floor((dateObj.getDate() - 1) / 7) + 1; // 第N〇曜日判定

    return settings.garbageSchedule
        .filter(item =>
            item.weekdays.includes(dayOfWeek) &&
            (item.weeks.length === 0 || item.weeks.includes(weekNumber))
        )
        .map(item => item.type);
}

// ========================================
// 天気取得
// ========================================
async function fetchWeather() {
    if (!settings?.weatherLocation) return;
    const { lat, lon } = settings.weatherLocation;
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Asia/Tokyo`;

    try {
        const response = await fetch(url);
        const data = await response.json();
        if (data?.daily) {
            const todayStr = formatDate(new Date());
            const index = data.daily.time.indexOf(todayStr);
            if (index !== -1) {
                renderWeather(
                    data.daily.weathercode[index],
                    data.daily.temperature_2m_max[index],
                    data.daily.precipitation_probability_max[index]
                );
            }
        }
    } catch (error) {
        document.getElementById('weatherDesc').textContent = '天気情報オフライン';
    }
}

function renderWeather(weatherCode, tempMax, precipProb) {
    const weatherInfo = getWeatherInfo(weatherCode);
    document.getElementById('weatherIcon').innerHTML = weatherInfo.icon;
    document.getElementById('weatherTemp').innerHTML = `${Math.round(tempMax)}<span class="unit">°C</span>`;
    document.getElementById('weatherDesc').textContent = weatherInfo.label;

    const adviceRow = document.getElementById('weatherAdvice');
    const needUmbrella = precipProb >= UMBRELLA_THRESHOLD;
    const clothing = getClothingAdvice(tempMax);
    adviceRow.innerHTML = `
        <div class="weather-advice ${needUmbrella ? '' : 'clothing'}">
            <span class="dot"></span>${needUmbrella ? '傘必要' : '傘不要'}
        </div>
        <div class="weather-advice clothing">
            <span class="dot"></span>${clothing}
        </div>
    `;
}

function getClothingAdvice(tempMax) {
    for (const threshold of CLOTHING_THRESHOLDS) {
        if (tempMax >= threshold.minTemp) return threshold.advice;
    }
    return CLOTHING_THRESHOLDS[CLOTHING_THRESHOLDS.length - 1].advice;
}

function getWeatherInfo(code) {
    if (code === 0 || code === 1) return { label: '晴れ', icon: sunIcon() };
    if (code === 2) return { label: '晴れ時々曇り', icon: partlyCloudyIcon() };
    if (code === 3) return { label: '曇り', icon: cloudIcon() };
    if (code >= 50 && code <= 69) return { label: '雨', icon: rainIcon() };
    if (code >= 70 && code <= 79) return { label: '雪', icon: snowIcon() };
    return { label: '曇り', icon: cloudIcon() };
}

// Icon SVG Helpers
function sunIcon() { return `<circle cx="12" cy="12" r="4" fill="currentColor"/><line x1="12" y1="2" x2="12" y2="5" stroke="currentColor" stroke-width="1.5"/><line x1="12" y1="19" x2="12" y2="22" stroke="currentColor" stroke-width="1.5"/><line x1="2" y1="12" x2="5" y2="12" stroke="currentColor" stroke-width="1.5"/><line x1="19" y1="12" x2="22" y2="12" stroke="currentColor" stroke-width="1.5"/>`; }
function partlyCloudyIcon() { return `<path d="M6 14a4 4 0 0 1 0-8 5 5 0 0 1 9.5-1.5A3.5 3.5 0 0 1 16 14H6z" stroke="currentColor" stroke-width="1.5" fill="none"/>`; }
function cloudIcon() { return `<path d="M6 14a4 4 0 0 1 0-8 5 5 0 0 1 9.5-1.5A3.5 3.5 0 0 1 16 14H6z" stroke="currentColor" stroke-width="1.5" fill="none"/>`; }
function rainIcon() { return `<path d="M6 12a4 4 0 0 1 0-8 5 5 0 0 1 9.5-1.5A3.5 3.5 0 0 1 16 12H6z" stroke="currentColor" stroke-width="1.5" fill="none"/><line x1="8" y1="15" x2="8" y2="19" stroke="currentColor" stroke-width="1.5"/><line x1="12" y1="15" x2="12" y2="19" stroke="currentColor" stroke-width="1.5"/>`; }
function snowIcon() { return `<circle cx="8" cy="16" r="1" fill="currentColor"/><circle cx="12" cy="16" r="1" fill="currentColor"/>`; }

function getWorkStatusIcon(status) {
    const icons = {
        office: `<svg class="icon icon-sm" viewBox="0 0 24 24"><path d="M3 21V8l9-5 9 5v13" stroke="currentColor" stroke-width="1.6"/><path d="M9 21v-6h6v6" stroke="currentColor" stroke-width="1.6"/></svg>`,
        remote: `<svg class="icon icon-sm" viewBox="0 0 24 24"><path d="M3 11.5V8.5a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v3" stroke="currentColor" stroke-width="1.6"/><path d="M3 11.5h18V16a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3v-4.5z" stroke="currentColor" stroke-width="1.6"/></svg>`,
        off: `<svg class="icon icon-sm" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="1.6"/></svg>`,
    };
    return icons[status] || icons.remote;
}

// ========================================
// 画面描画
// ========================================
async function renderTodayScreen() {
    const today = new Date();
    const todayStr = formatDate(today);

    // 勤務形態
    const status = getWorkStatus(today);
    document.getElementById('workBadgeLabel').textContent = getWorkStatusLabel(status);
    document.getElementById('workBadge').querySelector('.badge-icon').outerHTML = getWorkStatusIcon(status);

    // 出社日数
    const officeDays = await getOfficeDaysThisWeek();
    const circle = document.getElementById('officeDaysCircle');
    circle.textContent = officeDays;
    circle.className = 'office-days-circle';
    if (officeDays === 1) circle.classList.add('warning');
    if (officeDays === 0) circle.classList.add('danger');

    renderGarbage(today);
    renderEventList(eventsCache[todayStr] || [], document.getElementById('todayEvents'));
    fetchWeather();
}

function renderGarbage(dateObj) {
    const garbageRow = document.getElementById('garbageRow');
    const garbage = getGarbageForDate(dateObj);
    garbageRow.innerHTML = '';
    if (garbage.length === 0) {
        garbageRow.innerHTML = '<span class="event-empty">ゴミなし</span>';
        return;
    }
    garbage.forEach(type => {
        garbageRow.innerHTML += `<div class="garbage-badge">${escapeHtml(type)}</div>`;
    });
}

function renderEventList(events, container) {
    container.innerHTML = '';
    if (events.length === 0) {
        container.innerHTML = '<div class="event-empty">予定なし</div>';
        return;
    }
    events.forEach(ev => {
        container.innerHTML += `
            <div class="event-item" onclick="openDeleteConfirmModal('${ev.id}', '${formatDate(new Date(ev.date))}', '${escapeHtml(ev.text)}')">
                <svg class="icon icon-sm event-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="1.5"/></svg>
                ${escapeHtml(ev.text)}
            </div>
        `;
    });
}

function renderCalendar() {
    const grid = document.getElementById('calendarGrid');
    grid.innerHTML = '';

    const dows = ['日', '月', '火', '水', '木', '金', '土'];
    dows.forEach(dow => {
        const div = document.createElement('div');
        div.className = 'calendar-dow';
        div.textContent = dow;
        grid.appendChild(div);
    });

    document.getElementById('calendarMonth').textContent = `${currentYear}年${currentMonth + 1}月`;

    const firstDay = new Date(currentYear, currentMonth, 1);
    const lastDay = new Date(currentYear, currentMonth + 1, 0);
    const startDow = firstDay.getDay();
    const daysInMonth = lastDay.getDate();
    const todayStr = formatDate(new Date());

    const prevMonthDays = new Date(currentYear, currentMonth, 0).getDate();
    for (let i = startDow - 1; i >= 0; i--) {
        const day = prevMonthDays - i;
        const btn = document.createElement('button');
        btn.className = 'calendar-day other-month';
        btn.textContent = day;
        btn.onclick = () => selectCalendarDay(new Date(currentYear, currentMonth - 1, day));
        grid.appendChild(btn);
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const dateObj = new Date(currentYear, currentMonth, day);
        const dateStr = formatDate(dateObj);
        const btn = document.createElement('button');
        btn.className = 'calendar-day';
        btn.textContent = day;

        if (dateStr === todayStr) btn.classList.add('today');

        const hasEvents = eventsCache[dateStr]?.length > 0;
        const hasWorkOverride = !!workRecordsCache[dateStr];
        if (hasEvents || hasWorkOverride) {
            const dots = document.createElement('span');
            dots.className = 'dots';
            if (hasEvents) {
                const dot = document.createElement('span');
                dot.className = 'dot dot-event';
                dots.appendChild(dot);
            }
            if (hasWorkOverride) {
                const dot = document.createElement('span');
                dot.className = 'dot dot-work';
                dots.appendChild(dot);
            }
            btn.appendChild(dots);
        }

        if (dateObj.toDateString() === selectedDate.toDateString()) btn.classList.add('selected');
        btn.onclick = () => selectCalendarDay(dateObj);
        grid.appendChild(btn);
    }

    const totalCells = startDow + daysInMonth;
    const nextMonthDays = (7 - (totalCells % 7)) % 7;
    for (let day = 1; day <= nextMonthDays; day++) {
        const btn = document.createElement('button');
        btn.className = 'calendar-day other-month';
        btn.textContent = day;
        btn.onclick = () => selectCalendarDay(new Date(currentYear, currentMonth + 1, day));
        grid.appendChild(btn);
    }

    updateSelectedDateSection();
}

function updateSelectedDateSection() {
    const days = ['日', '月', '火', '水', '木', '金', '土'];
    const d = selectedDate.getDate();
    const m = selectedDate.getMonth() + 1;
    const dow = days[selectedDate.getDay()];
    document.getElementById('selectedDateTitle').textContent = `${m}月${d}日(${dow})`;

    const dateStr = formatDate(selectedDate);
    document.getElementById('selectedDateWorkSelect').value = getWorkStatus(selectedDate);
    renderEventList(eventsCache[dateStr] || [], document.getElementById('selectedDateEvents'));
}

async function updateWorkFromSelect() {
    const status = document.getElementById('selectedDateWorkSelect').value;
    const dateStr = formatDate(selectedDate);
    await saveWorkRecord(dateStr, status);
    renderTodayScreen();
    renderCalendar();
}

function renderSettingsScreen() {
    if (!settings) return;

    const workDefaultsContainer = document.getElementById('workDefaultsSettings');
    workDefaultsContainer.innerHTML = '';
    const dayNames = [
        { key: 'mon', label: '月曜日' }, { key: 'tue', label: '火曜日' },
        { key: 'wed', label: '水曜日' }, { key: 'thu', label: '木曜日' },
        { key: 'fri', label: '金曜日' }, { key: 'sat', label: '土曜日' },
        { key: 'sun', label: '日曜日' },
    ];

    dayNames.forEach(day => {
        const status = settings.workDefaults[day.key] || 'remote';
        const isFixed = day.key === 'sat' || day.key === 'sun';
        workDefaultsContainer.innerHTML += `
            <div class="settings-item" onclick="${isFixed ? '' : `openWorkDefaultModal('${day.key}')`}">
                <span class="settings-item-label">${day.label}</span>
                <span class="settings-item-value">${getWorkStatusLabel(status)} ${isFixed ? '' : '›'}</span>
            </div>
        `;
    });

    const garbageContainer = document.getElementById('garbageSettings');
    garbageContainer.innerHTML = '';
    if (settings.garbageSchedule) {
        settings.garbageSchedule.forEach(item => {
            const weekdaysStr = item.weekdays.map(w => ['日', '月', '火', '水', '木', '金', '土'][w]).join('・');
            const weeksStr = item.weeks.length > 0 ? `第${item.weeks.join('・第')}` : '';
            garbageContainer.innerHTML += `
                <div class="settings-item">
                    <span class="settings-item-label">${escapeHtml(item.type)}</span>
                    <span class="settings-item-value">${weekdaysStr}${weeksStr ? '（' + weeksStr + '）' : ''}</span>
                </div>
            `;
        });
    }

    if (settings.weatherLocation) {
        document.getElementById('weatherLocationValue').textContent =
            `${settings.weatherLocation.name}（${settings.weatherLocation.lat}, ${settings.weatherLocation.lon}）`;
    }
}

// ========================================
// 画面遷移・モーダル操作
// ========================================
function switchTab(screenId, tabEl) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tabEl.classList.add('active');
    document.getElementById('fab').style.display = screenId === 'screen-today' ? 'flex' : 'none';
}

function selectCalendarDay(dateObj) {
    selectedDate = dateObj;
    renderCalendar();
}

async function changeMonth(delta) {
    currentMonth += delta;
    if (currentMonth < 0) { currentMonth = 11; currentYear--; }
    else if (currentMonth > 11) { currentMonth = 0; currentYear++; }
    await loadCurrentMonthData();
    renderCalendar();
}

async function goToday() {
    const now = new Date();
    currentYear = now.getFullYear();
    currentMonth = now.getMonth();
    selectedDate = now;
    await loadCurrentMonthData();
    renderCalendar();
}

function openWorkModal() {
    const modal = document.getElementById('workModal');
    const optionsContainer = document.getElementById('workModalOptions');
    optionsContainer.innerHTML = '';

    const currentStatus = getWorkStatus(new Date());
    Object.entries(WORK_STATUSES).forEach(([key, value]) => {
        const option = document.createElement('div');
        option.className = `modal-option${key === currentStatus ? ' selected' : ''}`;
        option.innerHTML = `${getWorkStatusIcon(key)} ${value.label}`;
        option.onclick = () => selectWorkOption(key);
        optionsContainer.appendChild(option);
    });
    modal.classList.add('show');
}

function selectWorkOption(status) {
    saveWorkRecord(formatDate(new Date()), status);
    closeModal('workModal');
    renderTodayScreen();
    renderCalendar();
}

function openAddEventModal() {
    document.getElementById('addEventModal').classList.add('show');
    document.getElementById('newEventInput').value = '';
    document.getElementById('newEventInput').focus();
}

async function addEvent() {
    const input = document.getElementById('newEventInput');
    const text = input.value.trim();
    if (!text) return;

    await addEventToDb(formatDate(new Date()), text);
    closeModal('addEventModal');
    renderTodayScreen();
    renderCalendar();
}

function openDeleteConfirmModal(eventId, dateStr, eventText) {
    deleteEventId = eventId;
    document.getElementById('deleteEventText').textContent = eventText;
    document.getElementById('deleteConfirmModal').dataset.date = dateStr;
    document.getElementById('deleteConfirmModal').classList.add('show');
}

async function confirmDeleteEvent() {
    if (!deleteEventId) return;
    const dateStr = document.getElementById('deleteConfirmModal').dataset.date;
    await deleteEventFromDb(deleteEventId, dateStr);
    deleteEventId = null;
    closeModal('deleteConfirmModal');
    renderTodayScreen();
    renderCalendar();
}

function closeDeleteConfirmModal() {
    deleteEventId = null;
    closeModal('deleteConfirmModal');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('show');
}

document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', function(e) {
        if (e.target === this) this.classList.remove('show');
    });
});

function openWorkDefaultModal(dayKey) {
    editingWorkDefaultDay = dayKey;
    const modal = document.getElementById('workModal');
    const optionsContainer = document.getElementById('workModalOptions');
    optionsContainer.innerHTML = '';

    const currentStatus = settings.workDefaults[dayKey];
    Object.entries(WORK_STATUSES).forEach(([key, value]) => {
        const option = document.createElement('div');
        option.className = `modal-option${key === currentStatus ? ' selected' : ''}`;
        option.innerHTML = `${getWorkStatusIcon(key)} ${value.label}`;
        option.onclick = () => selectWorkDefaultOption(key);
        optionsContainer.appendChild(option);
    });

    modal.querySelector('.modal-title').textContent = `デフォルト勤務形態を変更`;
    modal.classList.add('show');
}

function selectWorkDefaultOption(status) {
    if (editingWorkDefaultDay) {
        settings.workDefaults[editingWorkDefaultDay] = status;
        saveSettings();
        editingWorkDefaultDay = null;
    }
    closeModal('workModal');
    renderSettingsScreen();
    renderTodayScreen();
    renderCalendar();
}

function editWeatherLocation() {
    document.getElementById('weatherLocationNameInput').value = settings.weatherLocation?.name || '';
    document.getElementById('weatherLatInput').value = settings.weatherLocation?.lat || '';
    document.getElementById('weatherLonInput').value = settings.weatherLocation?.lon || '';
    document.getElementById('weatherLocationModal').classList.add('show');
}

async function saveWeatherLocation() {
    const name = document.getElementById('weatherLocationNameInput').value.trim();
    const lat = parseFloat(document.getElementById('weatherLatInput').value);
    const lon = parseFloat(document.getElementById('weatherLonInput').value);

    if (!name || isNaN(lat) || isNaN(lon)) {
        showToast('入力値を確認してください');
        return;
    }

    settings.weatherLocation = { name, lat, lon };
    await saveSettings();
    closeModal('weatherLocationModal');
    renderSettingsScreen();
    fetchWeather();
}

// ========================================
// ユーティリティ
// ========================================
function checkOnline() {
    if (!navigator.onLine) {
        showToast('オフラインのため変更できません');
        return false;
    }
    return true;
}

function showToast(msg) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

function formatDate(dateObj) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function updateHeaderDate() {
    const now = new Date();
    const m = now.getMonth() + 1;
    const d = now.getDate();
    const days = ['日', '月', '火', '水', '木', '金', '土'];
    document.getElementById('headerDate').textContent = `${m}月${d}日(${days[now.getDay()]})`;
}

function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

// 起動
document.addEventListener('DOMContentLoaded', init);
