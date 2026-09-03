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
let editingEventId = null;
let editingEventDate = null;
let editingWorkDefaultDay = null;
let addEventTargetDate = null;

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
    // TOKEN_REFRESHEDはトークンの自動更新のみを表し、画面やデータは変わらない。
    // ここでshowMainApp()を呼ぶと、PWAのバックグラウンド復帰等で頻発するリフレッシュのたびに
    // 全データを再取得・全画面を再描画してしまい、その瞬間の通信不調がそのままエラー表示になる。
    db.auth.onAuthStateChange((event, session) => {
        if (session) {
            currentUser = session.user;
            if (event !== 'TOKEN_REFRESHED') {
                showMainApp();
            }
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

// Service Workerのキャッシュを破棄して最新版を強制取得する
async function forceUpdateApp() {
    showToast('最新版を確認しています…');
    try {
        if ('serviceWorker' in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            await Promise.all(registrations.map(reg => reg.unregister()));
        }
        if ('caches' in window) {
            const keys = await caches.keys();
            await Promise.all(keys.map(key => caches.delete(key)));
        }
    } finally {
        location.reload();
    }
}

// ========================================
// Supabase データ操作
// ========================================
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
    showToast('予定を追加しました');
    return data;
}

async function updateEventInDb(eventId, dateStr, text) {
    if (!db || !checkOnline()) return false;
    const { data, error } = await db.from('events').update({ text }).eq('id', eventId).select().single();
    if (error) {
        showToast('予定の更新に失敗しました（通信状態をご確認ください）');
        return false;
    }
    if (eventsCache[dateStr]) {
        const idx = eventsCache[dateStr].findIndex(ev => ev.id === eventId);
        if (idx !== -1) eventsCache[dateStr][idx] = data;
    }
    showToast('予定を更新しました');
    return true;
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
// 「残り」なので今日より前の日は数えない（今日がoffice/holiday_workなら含む）。
async function getRemainingOfficeDaysThisWeek() {
    const { monday, sunday } = getThisWeekRange();
    const todayStr = formatDate(new Date());
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
        if (formatDate(date) < todayStr) continue;
        const status = resolveWorkStatus(date, weekRecords);
        if (status === 'office' || status === 'holiday_work') count++;
    }
    return count;
}

// 「これからの予定」（今日より後、直近UPCOMING_EVENTS_LIMIT件）を
// 月キャッシュに頼らずDBから直接取得する。今日の予定は別カードで表示するため含めない。
const UPCOMING_EVENTS_LIMIT = 5;

async function getUpcomingEvents() {
    if (!db || !currentUser) return [];
    const todayStr = formatDate(new Date());
    const { data } = await db
        .from('events')
        .select('*')
        .gt('date', todayStr)
        .order('date', { ascending: true })
        .order('created_at', { ascending: true })
        .limit(UPCOMING_EVENTS_LIMIT);
    return data || [];
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
                const tomorrowPrecipProb = data.daily.precipitation_probability_max[index + 1];
                renderWeather(
                    data.daily.weathercode[index],
                    data.daily.temperature_2m_max[index],
                    data.daily.precipitation_probability_max[index],
                    tomorrowPrecipProb
                );
            }
        }
    } catch (error) {
        document.getElementById('weatherDesc').textContent = '天気情報オフライン';
    }
}

function renderWeather(weatherCode, tempMax, precipProb, tomorrowPrecipProb) {
    const weatherInfo = getWeatherInfo(weatherCode);
    const iconEl = document.getElementById('weatherIcon');
    iconEl.innerHTML = weatherInfo.icon;
    iconEl.style.color = weatherInfo.color;
    document.getElementById('weatherTemp').innerHTML = `${Math.round(tempMax)}<span class="unit">°C</span>`;
    document.getElementById('weatherDesc').textContent = weatherInfo.label;

    const adviceRow = document.getElementById('weatherAdvice');
    const needUmbrella = precipProb >= UMBRELLA_THRESHOLD;
    const clothing = getClothingAdvice(tempMax);
    adviceRow.innerHTML = `
        <div class="weather-advice ${needUmbrella ? 'umbrella-alert' : 'normal'}">
            <span class="dot"></span>${needUmbrella ? '傘を持っていく' : '傘は不要'}
        </div>
        <div class="weather-advice clothing">
            <span class="dot"></span>${clothing}
        </div>
    `;

    const tomorrowEl = document.getElementById('weatherTomorrow');
    tomorrowEl.textContent = tomorrowPrecipProb === undefined
        ? ''
        : `明日: ${tomorrowPrecipProb >= UMBRELLA_THRESHOLD ? '傘が必要' : '傘は不要'}`;
}

function getClothingAdvice(tempMax) {
    for (const threshold of CLOTHING_THRESHOLDS) {
        if (tempMax >= threshold.minTemp) return threshold.advice;
    }
    return CLOTHING_THRESHOLDS[CLOTHING_THRESHOLDS.length - 1].advice;
}

function getWeatherInfo(code) {
    if (code === 0 || code === 1) return { label: '晴れ', icon: sunIcon(), color: '#E3B341' };
    if (code === 2) return { label: '晴れ時々曇り', icon: partlyCloudyIcon(), color: '#E3B341' };
    if (code === 3) return { label: '曇り', icon: cloudIcon(), color: '#8B949E' };
    if (code >= 50 && code <= 69) return { label: '雨', icon: rainIcon(), color: '#58A6FF' };
    if (code >= 70 && code <= 79) return { label: '雪', icon: snowIcon(), color: '#A5D6FF' };
    return { label: '曇り', icon: cloudIcon(), color: '#8B949E' };
}

// Icon SVG Helpers（塗りつぶし主体で視認性を高めたデザイン）
function sunIcon() {
    return `<circle cx="12" cy="12" r="5" fill="currentColor"/>
<line x1="20" y1="12" x2="22.5" y2="12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
<line x1="17.66" y1="17.66" x2="19.42" y2="19.42" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
<line x1="12" y1="20" x2="12" y2="22.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
<line x1="6.34" y1="17.66" x2="4.58" y2="19.42" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
<line x1="4" y1="12" x2="1.5" y2="12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
<line x1="6.34" y1="6.34" x2="4.58" y2="4.58" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
<line x1="12" y1="4" x2="12" y2="1.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
<line x1="17.66" y1="6.34" x2="19.42" y2="4.58" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>`;
}
function partlyCloudyIcon() {
    return `<circle cx="17" cy="7.5" r="3.3" fill="currentColor" opacity="0.85"/>
<path d="M6 18.5a4 4 0 0 1 0-8 5 5 0 0 1 9-2.2 3.5 3.5 0 0 1 .3 6.98A3.47 3.47 0 0 1 15 18.5H6z" fill="currentColor"/>`;
}
function cloudIcon() {
    return `<path d="M6 18a4.5 4.5 0 0 1 0-9c.2 0 .4 0 .6.02A5.5 5.5 0 0 1 17 10.5c0 .17 0 .34-.02.5A3.75 3.75 0 0 1 16.5 18H6z" fill="currentColor"/>`;
}
function rainIcon() {
    return `<path d="M6 14.5a4 4 0 0 1 0-8c.2 0 .4 0 .6.02A5 5 0 0 1 16 8.5c0 .14 0 .28-.02.4A3.25 3.25 0 0 1 15.5 14.5H6z" fill="currentColor"/>
<line x1="8" y1="17" x2="7" y2="21" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
<line x1="12" y1="17" x2="11" y2="21" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
<line x1="16" y1="17" x2="15" y2="21" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>`;
}
function snowIcon() {
    return `<path d="M6 12.5a4 4 0 0 1 0-8c.2 0 .4 0 .6.02A5 5 0 0 1 16 6.5c0 .14 0 .28-.02.4A3.25 3.25 0 0 1 15.5 12.5H6z" fill="currentColor"/>
<circle cx="8" cy="18" r="1.3" fill="currentColor"/>
<circle cx="12" cy="20" r="1.3" fill="currentColor"/>
<circle cx="16" cy="18" r="1.3" fill="currentColor"/>`;
}

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

    // 今週の残り出社日数（少ないほど良い＝緑、多いほど注意＝赤）
    const remainingOfficeDays = await getRemainingOfficeDaysThisWeek();
    const circle = document.getElementById('officeDaysCircle');
    circle.textContent = remainingOfficeDays;
    circle.className = 'office-days-circle';
    if (remainingOfficeDays === 1) circle.classList.add('warning');
    if (remainingOfficeDays >= 2) circle.classList.add('danger');

    renderGarbage(today);
    renderGarbageTomorrow(today);
    renderEventList(eventsCache[todayStr] || [], document.getElementById('todayEvents'));

    const upcomingEvents = await getUpcomingEvents();
    renderUpcomingEvents(upcomingEvents);

    fetchWeather();
}

function renderUpcomingEvents(events) {
    const container = document.getElementById('upcomingEvents');
    container.innerHTML = '';
    if (events.length === 0) {
        container.innerHTML = '<div class="event-empty">予定なし</div>';
        return;
    }
    const days = ['日', '月', '火', '水', '木', '金', '土'];
    events.forEach(ev => {
        const [y, m, d] = ev.date.split('-').map(Number);
        const dateLabel = `${m}/${d}(${days[new Date(y, m - 1, d).getDay()]})`;
        container.innerHTML += `
            <div class="event-item" onclick="openEditEventModal('${ev.id}', '${ev.date}', '${escapeHtml(ev.text)}')">
                <span class="event-date-badge">${dateLabel}</span>
                ${escapeHtml(ev.text)}
            </div>
        `;
    });
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

function renderGarbageTomorrow(dateObj) {
    const tomorrow = new Date(dateObj);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const garbage = getGarbageForDate(tomorrow);
    const label = garbage.length > 0 ? garbage.map(type => escapeHtml(type)).join('・') : 'ゴミなし';
    document.getElementById('garbageTomorrow').textContent = `明日: ${label}`;
}

function renderEventList(events, container) {
    container.innerHTML = '';
    if (events.length === 0) {
        container.innerHTML = '<div class="event-empty">予定なし</div>';
        return;
    }
    events.forEach(ev => {
        container.innerHTML += `
            <div class="event-item" onclick="openEditEventModal('${ev.id}', '${formatDate(new Date(ev.date))}', '${escapeHtml(ev.text)}')">
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
        const hasGarbage = getGarbageForDate(dateObj).length > 0;
        if (hasEvents || hasWorkOverride || hasGarbage) {
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
            if (hasGarbage) {
                const dot = document.createElement('span');
                dot.className = 'dot dot-garbage';
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

    const garbage = getGarbageForDate(selectedDate);
    document.getElementById('selectedDateGarbage').innerHTML = garbage
        .map(type => `<div class="garbage-badge">${escapeHtml(type)}</div>`)
        .join('');

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

async function selectWorkOption(status) {
    const saved = await saveWorkRecord(formatDate(new Date()), status);
    if (!saved) return;

    closeModal('workModal');
    renderTodayScreen();
    renderCalendar();
    showToast(`${getWorkStatusLabel(status)}に変更しました`);
}

document.getElementById('newEventInput').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        event.preventDefault();
        addEvent();
    }
});

// 「これからの予定」の＋から、当日を除く今週〜来週の日曜までの日付を選ばせる
function openDateSelectModal() {
    const modal = document.getElementById('dateSelectModal');
    const optionsContainer = document.getElementById('dateSelectOptions');
    optionsContainer.innerHTML = '';

    const { monday } = getThisWeekRange();
    const rangeEnd = new Date(monday);
    rangeEnd.setDate(monday.getDate() + 13); // 来週の日曜まで

    const days = ['日', '月', '火', '水', '木', '金', '土'];
    const cursor = new Date();
    cursor.setDate(cursor.getDate() + 1); // 明日から（今日はFABから追加する）

    while (cursor <= rangeEnd) {
        const dateStr = formatDate(cursor);
        const label = `${cursor.getMonth() + 1}月${cursor.getDate()}日(${days[cursor.getDay()]})`;
        const option = document.createElement('div');
        option.className = 'modal-option';
        option.textContent = label;
        option.onclick = () => {
            closeModal('dateSelectModal');
            openAddEventModal(dateStr);
        };
        optionsContainer.appendChild(option);
        cursor.setDate(cursor.getDate() + 1);
    }

    modal.classList.add('show');
}

function openAddEventModal(dateStr) {
    addEventTargetDate = dateStr || formatDate(new Date());

    const [y, m, d] = addEventTargetDate.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    const days = ['日', '月', '火', '水', '木', '金', '土'];
    const todayStr = formatDate(new Date());
    document.getElementById('addEventModalTitle').textContent =
        addEventTargetDate === todayStr
            ? '予定を追加'
            : `${m}月${d}日(${days[dateObj.getDay()]})の予定を追加`;

    document.getElementById('addEventModal').classList.add('show');
    document.getElementById('newEventInput').value = '';
    document.getElementById('newEventInput').focus();
}

async function addEvent() {
    const input = document.getElementById('newEventInput');
    const text = input.value.trim();
    if (!text) return;

    const dateStr = addEventTargetDate || formatDate(new Date());
    await addEventToDb(dateStr, text);
    closeModal('addEventModal');
    renderTodayScreen();
    renderCalendar();
}

function openEditEventModal(eventId, dateStr, eventText) {
    editingEventId = eventId;
    editingEventDate = dateStr;
    document.getElementById('editEventInput').value = eventText;
    document.getElementById('editEventModal').classList.add('show');
}

async function saveEditEvent() {
    const input = document.getElementById('editEventInput');
    const text = input.value.trim();
    if (!text || !editingEventId) return;

    await updateEventInDb(editingEventId, editingEventDate, text);
    editingEventId = null;
    editingEventDate = null;
    closeModal('editEventModal');
    renderTodayScreen();
    renderCalendar();
}

async function confirmDeleteEvent() {
    if (!editingEventId) return;
    await deleteEventFromDb(editingEventId, editingEventDate);
    editingEventId = null;
    editingEventDate = null;
    closeModal('editEventModal');
    renderTodayScreen();
    renderCalendar();
}

function closeEditEventModal() {
    editingEventId = null;
    editingEventDate = null;
    closeModal('editEventModal');
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
