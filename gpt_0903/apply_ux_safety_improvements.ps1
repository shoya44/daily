param(
    [switch]$Apply
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$targets = @('app.js', 'index.html', 'style.css')

Write-Host "Daily gpt_0903 patch"
Write-Host "Root: $root"

if (-not $Apply) {
    Write-Host ""
    Write-Host "DRY RUN: no files will be changed."
    Write-Host "Run with -Apply to modify the local working tree."
    exit 0
}

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupDir = Join-Path $root ".gpt_0903_backup_$timestamp"
New-Item -ItemType Directory -Path $backupDir | Out-Null

function Read-Utf8([string]$path) {
    return [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
}

function Write-Utf8NoBom([string]$path, [string]$content) {
    $utf8 = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($path, $content, $utf8)
}

function Replace-Exact([string]$content, [string]$old, [string]$new, [string]$label) {
    $count = ([regex]::Matches($content, [regex]::Escape($old))).Count
    if ($count -ne 1) {
        throw "[$label] expected exactly 1 match, found $count. File was not modified."
    }
    return $content.Replace($old, $new)
}

foreach ($target in $targets) {
    $source = Join-Path $root $target
    if (-not (Test-Path $source)) { throw "File not found: $source" }
    Copy-Item $source (Join-Path $backupDir $target)
}

# -----------------------------------------------------------------------------
# app.js
# -----------------------------------------------------------------------------
$appPath = Join-Path $root 'app.js'
$app = Read-Utf8 $appPath

$app = Replace-Exact $app @'
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
'@ @'
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
'@ 'showMainApp'

$app = Replace-Exact $app @'
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
'@ @'
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
'@ 'loadSettings'

$app = Replace-Exact $app @'
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
'@ @'
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
'@ 'saveWorkRecord'

$app = Replace-Exact $app @'
async function selectWorkOption(status) {
    saveWorkRecord(formatDate(new Date()), status);
    closeModal('workModal');
    renderTodayScreen();
    renderCalendar();
}
'@ @'
async function selectWorkOption(status) {
    const saved = await saveWorkRecord(formatDate(new Date()), status);
    if (!saved) return;

    closeModal('workModal');
    renderTodayScreen();
    renderCalendar();
    showToast(`${getWorkStatusLabel(status)}に変更しました`);
}
'@ 'selectWorkOption'

$app = Replace-Exact $app @'
    if (!eventsCache[dateStr]) eventsCache[dateStr] = [];
    eventsCache[dateStr].push(data);
    return data;
}
'@ @'
    if (!eventsCache[dateStr]) eventsCache[dateStr] = [];
    eventsCache[dateStr].push(data);
    showToast('予定を追加しました');
    return data;
}
'@ 'addEventToDb success toast'

$app = Replace-Exact $app @'
        const idx = eventsCache[dateStr].findIndex(ev => ev.id === eventId);
        if (idx !== -1) eventsCache[dateStr][idx] = data;
    }
    return true;
}
'@ @'
        const idx = eventsCache[dateStr].findIndex(ev => ev.id === eventId);
        if (idx !== -1) eventsCache[dateStr][idx] = data;
    }
    showToast('予定を更新しました');
    return true;
}
'@ 'updateEventInDb success toast'

$app = Replace-Exact $app @'
adviceRow.innerHTML = `
        <div class="weather-advice ${needUmbrella ? 'umbrella-alert' : 'clothing'}">
            <span class="dot"></span>${needUmbrella ? '傘必要' : '傘不要'}
        </div>
        <div class="weather-advice clothing">
            <span class="dot"></span>${clothing}
        </div>
    `;
'@ @'
adviceRow.innerHTML = `
        <div class="weather-advice ${needUmbrella ? 'umbrella-alert' : 'normal'}">
            <span class="dot"></span>${needUmbrella ? '傘を持っていく' : '傘は不要'}
        </div>
        <div class="weather-advice clothing">
            <span class="dot"></span>${clothing}
        </div>
    `;
'@ 'weather advice'

# Add Enter-to-submit immediately after the new-event input is initialized.
$enterSnippet = @'
document.getElementById('newEventInput').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        event.preventDefault();
        addEvent();
    }
});
'@
if ($app -notmatch [regex]::Escape("document.getElementById('newEventInput').addEventListener('keydown'")) {
    $anchor = "function openAddEventModal() {"
    if ($app -notmatch [regex]::Escape($anchor)) {
        throw '[Enter submit] anchor function openAddEventModal() was not found.'
    }
    $app = $app.Replace($anchor, "$enterSnippet`r`n$anchor")
}

Write-Utf8NoBom $appPath $app

# -----------------------------------------------------------------------------
# index.html
# -----------------------------------------------------------------------------
$indexPath = Join-Path $root 'index.html'
$index = Read-Utf8 $indexPath
$index = Replace-Exact $index '<div class="card-label">今日の天気</div>' '<div class="card-label">今日どうする？</div>' 'Today label'
$index = Replace-Exact $index 'placeholder="予定やメモを入力..."' 'placeholder="何する？"' 'event placeholder'
$index = Replace-Exact $index '<div class="card">\r\n    <div class="card-label">今週の残り予定</div>' '<div class="card secondary-card">\r\n    <div class="card-label">今週の予定</div>' 'weekly events card'
Write-Utf8NoBom $indexPath $index

# -----------------------------------------------------------------------------
# style.css
# -----------------------------------------------------------------------------
$stylePath = Join-Path $root 'style.css'
$style = Read-Utf8 $stylePath
$style = Replace-Exact $style @'
.card {
    background: var(--bg-card);
    border-radius: var(--radius-lg);
    padding: 18px 20px;
    margin-bottom: 10px;
'@ @'
.card {
    background: var(--bg-card);
    border-radius: var(--radius-lg);
    padding: 16px 18px;
    margin-bottom: 8px;
'@ 'card density'
$style = Replace-Exact $style @'
.garbage-badge {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: rgba(240, 246, 252, 0.03);
    border: 1px solid rgba(240, 246, 252, 0.05);
    border-radius: 7px;
    padding: 6px 12px;
    font-size: 12px;
    font-weight: 500;
    color: var(--text);
    letter-spacing: 0;
}
'@ @'
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
'@ 'garbage badge'
$style += @'

.secondary-card {
    opacity: 0.9;
}
'@
$style = Replace-Exact $style @'
.event-empty {
    color: var(--text-muted);
    font-size: 13px;
    padding: 8px 0;
    font-weight: 450;
}
'@ @'
.event-empty {
    color: var(--text-muted);
    font-size: 12px;
    padding: 6px 0;
    font-weight: 450;
}
'@ 'empty event'
Write-Utf8NoBom $stylePath $style

Write-Host ""
Write-Host "Applied successfully."
Write-Host "Backup: $backupDir"
Write-Host ""
Write-Host "Next steps:"
Write-Host "1. Review the diff."
Write-Host "2. Run the app locally / preview deployment."
Write-Host "3. Apply the RLS SQL manually after verifying the SQL in REPLACEMENTS.md."
Write-Host "4. Commit and push only after validation."
