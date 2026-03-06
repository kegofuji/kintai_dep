// グローバル変数
let currentUser = null;
let csrfToken = null;
let currentEmployeeId = null;
let isAdmin = false; // 管理者かどうかのフラグ

// DOM要素の取得
const loginContainer = document.getElementById('loginContainer');
const mainContainer = document.getElementById('mainContainer');
const loginForm = document.getElementById('loginForm');
const currentUserSpan = document.getElementById('currentUserDisplay');
const clockInBtn = document.getElementById('clockInBtn');
const clockOutBtn = document.getElementById('clockOutBtn');
const refreshHistoryBtn = document.getElementById('refreshHistoryBtn');
const attendanceHistory = document.getElementById('historyTableBody');
const monthlySubmitBtn = document.getElementById('monthlySubmitBtn');
const monthSelect = document.getElementById('historyMonthSelect');
// 管理者メニューアイテムの要素を取得
const adminVacationManagementNavItem = document.getElementById('adminVacationManagementNavItem');
const adminEmployeesNavItem = document.getElementById('adminEmployeesNavItem');
const adminAttendanceNavItem = document.getElementById('adminAttendanceNavItem');
const adminApprovalsNavItem = document.getElementById('adminApprovalsNavItem');
const adminWorkPatternNavItem = document.getElementById('adminWorkPatternNavItem');
const adminReportsNavItem = document.getElementById('adminReportsNavItem');
const logoutBtn = document.getElementById('logoutBtn');
const vacationForm = document.getElementById('vacationForm');
const submitVacationBtn = document.getElementById('submitVacationBtn');
const alertContainer = document.getElementById('alertContainer');

/**
 * ISO形式の文字列からHH:mmを抽出（Safari互換）
 * @param {string|null|undefined} isoString
 * @returns {string}
 */
function formatTimeDisplay(isoString) {
    if (!isoString) {
        return '--:--';
    }

    const match = /T(\d{2}):(\d{2})/.exec(isoString);
    if (match) {
        return `${match[1]}:${match[2]}`;
    }

    try {
        const parsed = new Date(isoString);
        if (!Number.isNaN(parsed.getTime())) {
            return parsed.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
        }
    } catch (error) {
        console.error('時刻フォーマットエラー:', isoString, error);
    }

    return '--:--';
}

function sanitizeDashboardValue(value) {
    if (value === null || value === undefined) {
        return '';
    }
    const text = String(value).trim();
    if (!text) {
        return '';
    }
    const normalized = text.replace(/\u200B/g, '');
    const placeholders = new Set(['--:--', '-:-', '-:-:-', '0:00', '00:00']);
    return placeholders.has(normalized) ? '' : normalized;
}
function translateAttendanceStatus(status) {
    if (!status) {
        return '';
    }
    const mapping = {
        NORMAL: '通常',
        LATE: '遅刻',
        EARLY_LEAVE: '早退',
        LATE_AND_EARLY_LEAVE: '遅刻・早退',
        OVERTIME: '残業',
        NIGHT_SHIFT: '深夜勤務',
        HOLIDAY: '休日',
        ABSENT: '欠勤'
    };
    const key = status.toString().toUpperCase();
    return mapping[key] || '';
}

// 初期化
document.addEventListener('DOMContentLoaded', function() {
    if (!window.router && typeof Router === 'function') {
        window.router = new Router();
    }

    initializeApp();
    setupEventListeners();
});

// アプリケーション初期化
function initializeApp() {
    console.log('アプリケーションを初期化中...');
    
    // 画面クラスのインスタンスを作成（既存があれば再作成しない）
    if (!window.historyScreen) {
        window.historyScreen = new HistoryScreen();
    }
    
    // セッション確認
    checkSession();
    
    // 現在時刻の更新開始（即座に実行）
    updateCurrentTime();
    // 1秒間隔で時刻を更新
    setInterval(updateCurrentTime, 1000);
    
    // 現在日付の更新
    updateCurrentDate();
    
    console.log('アプリケーション初期化完了');
}

// イベントリスナー設定
function setupEventListeners() {
    const usingDashboardModule = !!window.dashboardScreen;

    // 基本イベントリスナー（要素が存在する場合のみ）
    if (loginForm) loginForm.addEventListener('submit', handleLogin);
    if (!usingDashboardModule) {
        if (clockInBtn) clockInBtn.addEventListener('click', handleClockIn);
        if (clockOutBtn) clockOutBtn.addEventListener('click', handleClockOut);
        if (refreshHistoryBtn) refreshHistoryBtn.addEventListener('click', loadAttendanceHistory);
    }
    if (monthlySubmitBtn) monthlySubmitBtn.addEventListener('click', handleMonthlySubmit);
    if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
    
    // ナビゲーションメニューのイベントリスナー
    setupNavigationListeners();
    
    // パスワード強度チェック機能は削除
}

// セッション確認
async function checkSession() {
    try {
        const response = await fetch('/api/auth/session', {
            credentials: 'include'
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.authenticated) {
                currentUser = data.username;
                window.currentUser = data.username;
                
                // 管理者の場合はadminId、従業員の場合はemployeeIdを使用
                if (data.role === 'ADMIN') {
                    currentEmployeeId = data.adminId;
                    window.currentEmployeeId = data.adminId;
                    isAdmin = true;
                    window.isAdmin = true;
                } else {
                    currentEmployeeId = data.employeeId;
                    window.currentEmployeeId = data.employeeId;
                    isAdmin = false;
                    window.isAdmin = false;
                }
                
                // 右上表示名を先に更新（画面表示前でも反映）
                await updateTopRightDisplayName(currentEmployeeId, currentUser);
                await showMainInterface();
                await loadCSRFToken();
                await loadAttendanceHistory();
                updateTodayAttendance();
            } else {
                showLoginInterface();
            }
        } else {
            showLoginInterface();
        }
    } catch (error) {
        console.error('セッション確認エラー:', error);
        showLoginInterface();
    }
}

// ログイン処理
async function handleLogin(e) {
    e.preventDefault();
    
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    
    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (data.success) {
            currentUser = data.username;
            window.currentUser = data.username;
            
            // 管理者の場合はadminId、従業員の場合はemployeeIdを使用
            if (data.role === 'ADMIN') {
                currentEmployeeId = data.adminId;
                window.currentEmployeeId = data.adminId;
                isAdmin = true;
                window.isAdmin = true;
            } else {
                currentEmployeeId = data.employeeId;
                window.currentEmployeeId = data.employeeId;
                isAdmin = false;
                window.isAdmin = false;
            }
            
            showAlert('ログインしました', 'success');
            await updateTopRightDisplayName(currentEmployeeId, currentUser);
            await showMainInterface();
            await loadCSRFToken();
            await loadAttendanceHistory();
            updateTodayAttendance();
        } else {
            showAlert(data.message || 'ログインに失敗しました', 'danger');
        }
    } catch (error) {
        console.error('ログインエラー:', error);
        showAlert('ログイン処理中にエラーが発生しました', 'danger');
    }
}

// ログアウト処理
async function handleLogout() {
    try {
        await fetch('/api/auth/logout', {
            method: 'POST',
            headers: {
                'X-CSRF-TOKEN': csrfToken
            },
            credentials: 'include'
        });
        
        currentUser = null;
        window.currentUser = null;
        currentEmployeeId = null;
        window.currentEmployeeId = null;
        csrfToken = null;
        if (typeof window.clearAdminViewingState === 'function') {
            window.clearAdminViewingState();
        }
        showLoginInterface();
        showAlert('ログアウトしました', 'info');
    } catch (error) {
        console.error('ログアウトエラー:', error);
        showAlert('ログアウト処理中にエラーが発生しました', 'danger');
    }
}

// CSRFトークン取得
async function loadCSRFToken() {
    try {
        const response = await fetch('/api/attendance/csrf-token', {
            credentials: 'include'
        });
        
        if (response.ok) {
            const data = await response.json();
            csrfToken = data.token;
            // admin.js 側のfetchで参照しているためwindowにも公開
            window.csrfToken = data.token;
        }
    } catch (error) {
        console.error('CSRFトークン取得エラー:', error);
    }
}

// 出勤打刻
async function handleClockIn() {
    if (!currentEmployeeId) {
        return;
    }
    
    // ボタンを一時的に無効化
    const clockInBtn = document.getElementById('clockInBtn');
    if (clockInBtn) {
        clockInBtn.disabled = true;
        clockInBtn.textContent = '処理中...';
    }
    
    try {
        const response = await fetch('/api/attendance/clock-in', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-TOKEN': csrfToken
            },
            credentials: 'include',
            body: JSON.stringify({ employeeId: currentEmployeeId })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showAlert(data.message, 'success');
            await loadAttendanceHistory();
            await updateTodayAttendance();
            
            // 履歴カレンダーを即時更新
            try {
                if (window.historyScreen && typeof window.historyScreen.loadCalendarData === 'function') {
                    await window.historyScreen.loadCalendarData();
                    if (typeof window.historyScreen.generateCalendar === 'function') {
                        window.historyScreen.generateCalendar();
                    }
                }
                // 旧カレンダー画面にも反映（存在する場合）
                if (window.calendarScreen && typeof window.calendarScreen.loadCalendarData === 'function') {
                    await window.calendarScreen.loadCalendarData();
                    if (typeof window.calendarScreen.generateCalendar === 'function') {
                        window.calendarScreen.generateCalendar();
                    }
                }
            } catch (calendarError) {
                console.warn('カレンダー更新エラー:', calendarError);
            }
        } else {
            // エラー時は状態を再同期のみ実行
            await updateTodayAttendance();
        }
    } catch (error) {
        console.error('出勤打刻エラー:', error);
        // エラー時は状態を再同期のみ実行
        await updateTodayAttendance();
    } finally {
        // ボタンの状態を復元
        if (clockInBtn) {
            clockInBtn.textContent = '出勤';
            // updateTodayAttendance()で適切な状態に更新される
        }
    }
}

// 退勤打刻
async function handleClockOut() {
    if (!currentEmployeeId) {
        return;
    }
    
    // ボタンを一時的に無効化
    const clockOutBtn = document.getElementById('clockOutBtn');
    if (clockOutBtn) {
        clockOutBtn.disabled = true;
        clockOutBtn.textContent = '処理中...';
    }
    
    try {
        const response = await fetch('/api/attendance/clock-out', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-TOKEN': csrfToken
            },
            credentials: 'include',
            body: JSON.stringify({ employeeId: currentEmployeeId })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showAlert(data.message, 'success');
            await loadAttendanceHistory();
            await updateTodayAttendance();
            
            // 履歴カレンダーを即時更新
            try {
                if (window.historyScreen && typeof window.historyScreen.loadCalendarData === 'function') {
                    await window.historyScreen.loadCalendarData();
                    if (typeof window.historyScreen.generateCalendar === 'function') {
                        window.historyScreen.generateCalendar();
                    }
                }
                // 旧カレンダー画面にも反映（存在する場合）
                if (window.calendarScreen && typeof window.calendarScreen.loadCalendarData === 'function') {
                    await window.calendarScreen.loadCalendarData();
                    if (typeof window.calendarScreen.generateCalendar === 'function') {
                        window.calendarScreen.generateCalendar();
                    }
                }
            } catch (calendarError) {
                console.warn('カレンダー更新エラー:', calendarError);
            }
        } else {
            // エラー時は状態を再同期のみ実行
            await updateTodayAttendance();
        }
    } catch (error) {
        console.error('退勤打刻エラー:', error);
        // エラー時は状態を再同期のみ実行
        await updateTodayAttendance();
    } finally {
        // ボタンの状態を復元
        if (clockOutBtn) {
            clockOutBtn.textContent = '退勤';
            // updateTodayAttendance()で適切な状態に更新される
        }
    }
}

// 勤怠履歴読み込み
async function loadAttendanceHistory() {
    if (!currentEmployeeId) return;
    
    try {
        // 実際のAPIを呼び出し
        const response = await fetch(`/api/attendance/history/${currentEmployeeId}`, {
            credentials: 'include'
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.success) {
                displayAttendanceHistory(data.data);
            } else {
                // APIが失敗した場合はモックデータを表示
                const mockData = generateMockAttendanceData();
                displayAttendanceHistory(mockData);
            }
        } else {
            // APIが利用できない場合はモックデータを表示
            const mockData = generateMockAttendanceData();
            displayAttendanceHistory(mockData);
        }
    } catch (error) {
        console.error('勤怠履歴読み込みエラー:', error);
        // エラーの場合はモックデータを表示
        const mockData = generateMockAttendanceData();
        displayAttendanceHistory(mockData);
    }
}

// 新規社員かどうかを判定する関数
function isNewEmployee() {
    // 現在のユーザーがemp1またはemp2の場合は既存社員（テスト用）
    if (window.currentUser === 'emp1' || window.currentUser === 'emp2') {
        return false;
    }
    
    // emp3以降は新規社員として扱う（管理者画面で作成された社員）
    if (window.currentUser && window.currentUser.startsWith('emp')) {
        const empNumber = parseInt(window.currentUser.replace('emp', ''));
        return empNumber >= 3;
    }
    
    // その他の場合は新規社員として扱う
    return true;
}

// モック勤怠データ生成
function generateMockAttendanceData() {
    // 新規作成された社員の場合は空のデータを返す（勤怠データは存在しない）
    if (isNewEmployee()) {
        return [];
    }
    
    const data = [];
    const today = new Date();
    
    for (let i = 0; i < 7; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        
        const clockIn = new Date(date);
        clockIn.setHours(9, Math.floor(Math.random() * 30), 0, 0);
        
        const clockOut = new Date(date);
        clockOut.setHours(18, Math.floor(Math.random() * 60), 0, 0);
        
        const diffMinutes = Math.floor((clockOut - clockIn) / (1000 * 60));
        const workingHours = TimeUtils.formatMinutesToTime(diffMinutes);
        
        // 日本時間での日付文字列を生成
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;
        
        data.push({
            attendanceDate: dateStr,
            clockInTime: clockIn.toISOString(),
            clockOutTime: clockOut.toISOString(),
            workingHours: workingHours,
            status: i === 0 ? '出勤中' : '退勤済'
        });
    }
    
    return data;
}

// 勤怠履歴表示
function displayAttendanceHistory(data) {
    const tbody = document.getElementById('historyTableBody');
    if (!tbody) {
        console.error('historyTableBody要素が見つかりません');
        return;
    }
    
    // カレンダー用にデータを保存
    window.attendanceData = data || [];
    
    tbody.innerHTML = '';
    
    // データがない場合でも、ヘッダ列のみ表示（空のテーブル本体）
    if (!data || data.length === 0) {
        return;
    }
    
    data.forEach(record => {
        const row = document.createElement('tr');
        
        // 実際のデータ構造に合わせて表示
        const clockInTime = record.clockInTime ? formatTimeDisplay(record.clockInTime) : '-';
        const clockOutTime = record.clockOutTime ? formatTimeDisplay(record.clockOutTime) : '-';
        
        // 勤務時間計算（打刻データがある場合は正確な計算を優先）
        let workingHours = '';
        if (record.clockInTime && record.clockOutTime) {
            // 打刻データがある場合は必ず計算で求める（正確性を優先）
            workingHours = TimeUtils.calculateWorkingTime(record.clockInTime, record.clockOutTime, record.breakMinutes);
        } else if (record.workingMinutes !== undefined && record.workingMinutes !== null) {
            workingHours = TimeUtils.formatMinutesToTime(record.workingMinutes);
        }

        let breakDisplay = '';
        if (record.clockInTime && record.clockOutTime && record.breakMinutes !== undefined && record.breakMinutes !== null) {
            breakDisplay = TimeUtils.formatMinutesToTime(record.breakMinutes);
        }
        
        const lateMinutes = Number(record.lateMinutes ?? 0);
        const earlyLeaveMinutes = Number(record.earlyLeaveMinutes ?? 0);
        const nightWorkMinutes = record.clockInTime && record.clockOutTime
            ? ((record.nightWorkMinutes ?? record.nightShiftMinutes) || 0)
            : 0;
        const overtimeMinutes = record.clockInTime && record.clockOutTime
            ? ((record.overtimeMinutes ?? 0))
            : null;
        const lateDisplay = record.clockInTime && record.clockOutTime ? formatMinutesToTime(lateMinutes) : '';
        const earlyLeaveDisplay = record.clockInTime && record.clockOutTime ? formatMinutesToTime(earlyLeaveMinutes) : '';
        const overtimeDisplay = record.clockInTime && record.clockOutTime ? formatMinutesToTime(overtimeMinutes || 0) : '';
        const nightWorkDisplay = record.clockInTime && record.clockOutTime ? formatMinutesToTime(nightWorkMinutes) : '';
        
        // ステータス表示
        let statusText = translateAttendanceStatus(record.attendanceStatus);
        if (!statusText) {
            if (record.clockInTime && !record.clockOutTime) {
                statusText = '出勤中';
            } else if (record.clockInTime && record.clockOutTime) {
                statusText = '退勤済';
            } else {
                statusText = '出勤前';
            }
        }
        
        row.innerHTML = `
            <td>${record.attendanceDate}</td>
            <td>${clockInTime}</td>
            <td>${clockOutTime}</td>
            <td>${breakDisplay}</td>
            <td>${workingHours}</td>
            <td>${lateDisplay}</td>
            <td>${earlyLeaveDisplay}</td>
            <td>${overtimeDisplay}</td>
            <td>${nightWorkDisplay}</td>
            <td>${statusText}</td>
        `;
        tbody.appendChild(row);
    });
    
    // カレンダーを再生成
    if (window.historyScreen) {
        window.historyScreen.generateCalendar();
    }
}


// 管理者機能: 社員一覧
async function loadEmployees() {
    try {
        const response = await fetch('/api/admin/employees', {
            credentials: 'include'
        });
        
        const data = await response.json();
        
        if (data.success) {
            // 社員一覧をモーダルで表示
            showEmployeeListModal(data.data);
        } else {
            showAlert(data.message || '社員一覧の取得に失敗しました', 'danger');
        }
    } catch (error) {
        console.error('社員一覧取得エラー:', error);
        showAlert('社員一覧の取得中にエラーが発生しました', 'danger');
    }
}

// 管理者機能: 未承認申請


// 管理者機能: レポート出力
async function downloadReport() {
    if (!currentEmployeeId) {
        showAlert('従業員IDが取得できません', 'danger');
        return;
    }
    
    const currentMonth = new Date().toISOString().substring(0, 7);
    
    try {
        const response = await fetch(`/api/attendance/report/${currentEmployeeId}/${currentMonth}`, {
            credentials: 'include'
        });
        
        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `attendance_${currentEmployeeId}_${currentMonth}.pdf`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            showAlert('レポートをダウンロードしました', 'success');
        } else {
            showAlert('レポートのダウンロードに失敗しました', 'danger');
        }
    } catch (error) {
        console.error('レポートダウンロードエラー:', error);
        showAlert('レポートのダウンロード中にエラーが発生しました', 'danger');
    }
}

// generateMonthOptions関数は削除されました - HistoryScreenクラスのgenerateMonthOptions()メソッドを使用

// ログイン画面表示
function showLoginInterface() {
    loginContainer.style.display = 'block';
    mainContainer.style.display = 'none';

    navigateWithRouter('/login', { updateHistory: true, replace: true });
}

// メイン画面表示
async function showMainInterface() {
    console.log('メイン画面を表示中...');
    
    loginContainer.style.display = 'none';
    mainContainer.style.display = 'block';
    
    // 右上の表示名を氏名優先に更新
    await updateTopRightDisplayName(currentEmployeeId, currentUser);
    
    // 管理者権限チェック（セッション情報からroleを取得）
    await checkAdminPermissions();
    
    // 時刻と日付を更新
    updateCurrentTime();
    updateCurrentDate();
    
    // 役割に応じて初期表示画面を切り替え
    if (isAdmin) {
        // 管理者の場合は現在のURLを保持、初回アクセスの場合のみ管理者TOPに遷移
        const currentPath = window.location.pathname;
        if (currentPath === '/' || currentPath === '/login') {
            navigateWithRouter('/admin', { updateHistory: true, replace: true, fallbackScreenId: 'adminDashboardScreen' });
        } else {
            // 管理者画面の場合は現在のパスをそのまま使用（リロード時の画面保持）
            if (currentPath.startsWith('/admin')) {
                navigateWithRouter(currentPath, { updateHistory: true, replace: true });
            } else {
                // 管理者以外のパスの場合は管理者TOPに遷移
                navigateWithRouter('/admin', { updateHistory: true, replace: true, fallbackScreenId: 'adminDashboardScreen' });
            }
        }
    } else {
        // 従業員の場合は現在のURLを保持、初回アクセスの場合のみダッシュボードに遷移
        const currentPath = window.location.pathname;
        if (currentPath === '/' || currentPath === '/login') {
            navigateWithRouter('/dashboard', { updateHistory: true, replace: true, fallbackScreenId: 'dashboardScreen' });
        } else {
            // 現在のパスをそのまま使用
            navigateWithRouter(currentPath, { updateHistory: true, replace: true });
        }
    }
    
    console.log('メイン画面表示完了');
}

// 右上表示名を氏名に更新（API失敗時はフォールバック）
async function updateTopRightDisplayName(employeeId, username) {
    try {
        if (!currentUserSpan) return;
        // 管理者は常に固定表示
        if (window.isAdmin === true || username === 'admin') {
            currentUserSpan.textContent = '管理者';
            return;
        }
        if (employeeId != null) {
            const resp = await fetch(`/api/employee/${employeeId}`, { credentials: 'include' });
            if (resp.ok) {
                const data = await resp.json().catch(() => null);
                let displayName = data?.data?.displayName || '';
                if (!displayName) {
                    displayName = `emp${employeeId}`;
                }
                currentUserSpan.textContent = displayName || `emp${employeeId}` || username || 'ユーザー';
                return;
            }
        }
        // フォールバック
        const fallback = employeeId != null ? `emp${employeeId}` : (username || 'ユーザー');
        currentUserSpan.textContent = fallback || 'ユーザー';
    } catch (e) {
        const fallback = employeeId != null ? `emp${employeeId}` : (username || 'ユーザー');
        currentUserSpan.textContent = fallback || 'ユーザー';
    }
}

// アラート表示
function showAlert(message, type = 'info', clearExisting = true) {
    // 既存のアラートをクリア（オプション）
    if (clearExisting) {
        clearAllAlerts();
    }
    
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} alert-dismissible fade show`;
    alertDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    alertContainer.appendChild(alertDiv);
    
    // 5秒後に自動削除
    setTimeout(() => {
        if (alertDiv.parentNode) {
            alertDiv.parentNode.removeChild(alertDiv);
        }
    }, 5000);
}

// 全てのアラートをクリア
function clearAllAlerts() {
    if (alertContainer) {
        alertContainer.innerHTML = '';
    }
}

function shouldSkipNavigation(event) {
    return event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
}

function navigateWithRouter(path, {
    updateHistory = true,
    replace = false,
    fallbackScreenId = null,
    fallbackActiveLink = null,
    fallbackInit = null
} = {}) {
    if (window.router && typeof window.router.navigate === 'function') {
        window.router.navigate(path, { updateHistory, replace });
        return;
    }

    if (fallbackScreenId) {
        showScreen(fallbackScreenId);
    }

    if (typeof fallbackInit === 'function') {
        fallbackInit();
    }

    if (fallbackActiveLink) {
        updateActiveNavLink(fallbackActiveLink);
    }
}

function handleNavigationClick(event, options) {
    if (shouldSkipNavigation(event)) {
        return;
    }

    event.preventDefault();
    navigateWithRouter(options.path, options);
}

// ナビゲーションリスナー設定
function setupNavigationListeners() {
    console.log('ナビゲーションリスナーを設定中...');
    
    // ブランドリンク
    const brandNavLink = document.getElementById('brandNavLink');
    
    // 一般ユーザーメニュー
    const dashboardNavLink = document.getElementById('dashboardNavLink');
    const historyNavLink = document.getElementById('historyNavLink');
    const vacationNavLink = document.getElementById('vacationNavLink');
    const adjustmentNavLink = document.getElementById('adjustmentNavLink');
    const workPatternNavLink = document.getElementById('workPatternNavLink');
    
    // 管理者メニュー
    const adminMonthlySubmissionsNavLink = document.getElementById('adminMonthlySubmissionsNavLink');
    const adminVacationManagementNavLink = document.getElementById('adminVacationManagementNavLink');
    const adminEmployeesNavLink = document.getElementById('adminEmployeesNavLink');
    const adminAttendanceNavLink = document.getElementById('adminAttendanceNavLink');
    const adminApprovalsNavLink = document.getElementById('adminApprovalsNavLink');
    const adminWorkPatternNavLink = document.getElementById('adminWorkPatternNavLink');
    const adminReportsNavLink = document.getElementById('adminReportsNavLink');
    
    console.log('ナビゲーション要素の取得状況:', {
        brandNavLink: !!brandNavLink,
        dashboardNavLink: !!dashboardNavLink,
        historyNavLink: !!historyNavLink,
        vacationNavLink: !!vacationNavLink,
        adjustmentNavLink: !!adjustmentNavLink,
        workPatternNavLink: !!workPatternNavLink
    });
    
    // イベントリスナー追加
    if (brandNavLink) {
        brandNavLink.addEventListener('click', (e) => {
            console.log('ブランドリンクがクリックされました');
            if (isAdmin) {
                handleNavigationClick(e, {
                    path: '/admin',
                    updateHistory: true,
                    fallbackScreenId: 'adminDashboardScreen'
                });
            } else {
                handleNavigationClick(e, {
                    path: '/dashboard',
                    updateHistory: true,
                    fallbackScreenId: 'dashboardScreen',
                    fallbackActiveLink: dashboardNavLink
                });
            }
        });
    }
    
    if (dashboardNavLink) {
        dashboardNavLink.addEventListener('click', (e) => {
            console.log('ダッシュボードリンクがクリックされました');
            handleNavigationClick(e, {
                path: '/dashboard',
                fallbackScreenId: 'dashboardScreen',
                fallbackActiveLink: dashboardNavLink
            });
        });
    }
    
    if (historyNavLink) {
        historyNavLink.addEventListener('click', (e) => {
            console.log('勤怠履歴リンクがクリックされました');
            handleNavigationClick(e, {
                path: '/history',
                fallbackScreenId: 'historyScreen',
                fallbackActiveLink: historyNavLink,
                fallbackInit: () => {
                    if (window.historyScreen && !window.historyScreen.initialized) {
                        window.historyScreen.init();
                    } else if (!window.historyScreen) {
                        setupHistoryMonthSelect();
                    }
                }
            });
        });
    }
    
    if (vacationNavLink) {
        vacationNavLink.addEventListener('click', (e) => {
            console.log('休暇申請リンクがクリックされました');
            handleNavigationClick(e, {
                path: '/vacation',
                fallbackScreenId: 'vacationScreen',
                fallbackActiveLink: vacationNavLink
            });
        });
    }
    
    if (adjustmentNavLink) {
        adjustmentNavLink.addEventListener('click', (e) => {
            console.log('打刻修正リンクがクリックされました');
            handleNavigationClick(e, {
                path: '/adjustment',
                fallbackScreenId: 'adjustmentScreen',
                fallbackActiveLink: adjustmentNavLink
            });
        });
    }

    if (workPatternNavLink) {
        workPatternNavLink.addEventListener('click', (e) => {
        console.log('勤務時間変更リンクがクリックされました');
            handleNavigationClick(e, {
                path: '/work-pattern',
                fallbackScreenId: 'workPatternScreen',
                fallbackActiveLink: workPatternNavLink
            });
        });
    }

    // 一般ユーザー: 休日関連
    const holidayNavLink = document.getElementById('holidayNavLink');
    if (holidayNavLink) {
        holidayNavLink.addEventListener('click', (e) => {
            console.log('休日関連リンクがクリックされました');
            handleNavigationClick(e, {
                path: '/holiday',
                fallbackScreenId: 'holidayScreen',
                fallbackActiveLink: holidayNavLink,
                fallbackInit: () => {
                    if (window.holidayScreen && typeof window.holidayScreen.init === 'function') {
                        window.holidayScreen.init();
                    }
                }
            });
        });
    }
    
    // 管理者メニューのイベントリスナー
    if (adminMonthlySubmissionsNavLink) {
        adminMonthlySubmissionsNavLink.addEventListener('click', (e) => {
            e.preventDefault();
            console.log('月末申請管理リンクがクリックされました');
            showScreen('adminMonthlySubmissionsScreen');
            updateActiveNavLink(adminMonthlySubmissionsNavLink);
            
            // AdminScreenの月末申請管理を初期化
            if (window.adminScreen) {
                window.adminScreen.initMonthlySubmissions();
            }
        });
    }

    if (adminVacationManagementNavLink) {
        adminVacationManagementNavLink.addEventListener('click', (e) => {
            console.log('休暇管理リンクがクリックされました');
            handleNavigationClick(e, {
                path: '/admin/vacation-management',
                fallbackScreenId: 'adminVacationManagementScreen',
                fallbackActiveLink: adminVacationManagementNavLink,
                fallbackInit: () => {
                    if (window.adminScreen) {
                        window.adminScreen.initVacationManagement();
                    }
                }
            });
        });
    }

    if (adminWorkPatternNavLink) {
        adminWorkPatternNavLink.addEventListener('click', (e) => {
        console.log('勤務時間変更（管理者）リンクがクリックされました');
            handleNavigationClick(e, {
                path: '/admin/work-pattern-change',
                fallbackScreenId: 'adminWorkPatternScreen',
                fallbackActiveLink: adminWorkPatternNavLink,
                fallbackInit: () => {
                    if (window.adminScreen) {
                        window.adminScreen.initWorkPattern();
                    }
                }
            });
        });
    }
    
    if (adminEmployeesNavLink) {
        adminEmployeesNavLink.addEventListener('click', (e) => {
            console.log('社員管理リンクがクリックされました');
            handleNavigationClick(e, {
                path: '/admin/employees',
                fallbackScreenId: 'adminEmployeesScreen',
                fallbackActiveLink: adminEmployeesNavLink,
                fallbackInit: () => {
                    if (window.adminScreen) {
                        console.log('app.jsから社員管理画面を初期化します');
                        setTimeout(() => {
                            window.adminScreen.initEmployees();
                        }, 50);
                    }
                }
            });
        });
    }
    
    if (adminAttendanceNavLink) {
        adminAttendanceNavLink.addEventListener('click', (e) => {
            e.preventDefault();
            console.log('勤怠管理リンクがクリックされました');
            showScreen('adminAttendanceScreen');
            updateActiveNavLink(adminAttendanceNavLink);
        });
    }
    
    if (adminApprovalsNavLink) {
        adminApprovalsNavLink.addEventListener('click', (e) => {
            console.log('申請承認リンクがクリックされました');
            handleNavigationClick(e, {
                path: '/admin/approvals',
                fallbackScreenId: 'adminApprovalsScreen',
                fallbackActiveLink: adminApprovalsNavLink,
                fallbackInit: () => {
                    if (window.adminScreen) {
                        window.adminScreen.initApprovals();
                    }
                }
            });
        });
    }
    
    if (adminReportsNavLink) {
        adminReportsNavLink.addEventListener('click', (e) => {
            e.preventDefault();
            console.log('レポート出力リンクがクリックされました');
            showScreen('adminReportsScreen');
            updateActiveNavLink(adminReportsNavLink);
        });
    }
    
    // 管理者: 休日関連
    const adminHolidayNavLink = document.getElementById('adminHolidayNavLink');
    if (adminHolidayNavLink) {
        adminHolidayNavLink.addEventListener('click', (e) => {
            console.log('休日関連（管理者）リンクがクリックされました');
            handleNavigationClick(e, {
                path: '/admin/holiday',
                fallbackScreenId: 'adminHolidayScreen',
                fallbackActiveLink: adminHolidayNavLink,
                fallbackInit: () => {
                    if (window.adminScreen) {
                        window.adminScreen.initHoliday();
                    }
                }
            });
        });
    }

    console.log('ナビゲーションリスナーの設定完了');
}

// アクティブなナビゲーションリンクを更新
function updateActiveNavLink(activeLink) {
    // 全てのナビゲーションリンクからactiveクラスを削除
    const allNavLinks = document.querySelectorAll('.nav-link');
    allNavLinks.forEach(link => {
        link.classList.remove('active');
    });
    
    // 選択されたリンクにactiveクラスを追加
    if (activeLink) {
        activeLink.classList.add('active');
    }
}

// 社員一覧モーダル表示
function showEmployeeListModal(employees) {
    const modalHtml = `
        <div class="modal fade" id="employeeListModal" tabindex="-1">
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">社員一覧</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div class="table-responsive">
                            <table class="table table-striped">
                                <thead>
                                    <tr>
                                        <th>ユーザー名</th>
                                        <th>ステータス</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${employees.map(emp => `
                                        <tr>
                                            <td>${emp.username || emp.employeeCode || `emp${emp.employeeId}`}</td>
                                            <td><span class="badge ${emp.isActive ? 'bg-success' : 'bg-secondary'}">${emp.isActive ? '在職' : '退職'}</span></td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">閉じる</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // 既存のモーダルを削除
    const existingModal = document.getElementById('employeeListModal');
    if (existingModal) {
        existingModal.remove();
    }
    
    // 新しいモーダルを追加
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    // モーダルを表示
    const modal = new bootstrap.Modal(document.getElementById('employeeListModal'));
    modal.show();
}



// 休暇申請承認（admin.jsのapproveVacationRequestメソッドに統一）


// 休暇申請却下（admin.jsのrejectVacationRequestメソッドに統一）


// パスワード強度チェック機能は削除されました

// 画面表示制御
function showScreen(screenId) {
    console.log('画面切り替え:', screenId);
    
    // 全ての画面を非表示
    const screens = document.querySelectorAll('.screen-container');
    console.log('検出された画面数:', screens.length);
    screens.forEach(screen => {
        screen.classList.remove('active');
    });
    
    // 指定された画面を表示
    const targetScreen = document.getElementById(screenId);
    if (targetScreen) {
        targetScreen.classList.add('active');
        console.log('画面を表示しました:', screenId);
    } else {
        console.error('画面が見つかりません:', screenId);
    }
    
    // 画面固有の初期化処理
    if (screenId === 'historyScreen') {
        // 勤怠履歴画面の初期化（重複防止）
        if (window.historyScreen && !window.historyScreen.initialized) {
            window.historyScreen.init();
        } else if (!window.historyScreen) {
            // フォールバック: 基本的な初期化のみ
            setupHistoryMonthSelect();
        }
    } else if (screenId === 'dashboardScreen') {
        // ダッシュボード画面の初期化
        if (window.dashboardScreen) {
            window.dashboardScreen.init();
        }
        // 打刻画面が表示された時に勤務時間を更新
        setTimeout(() => {
            updateTodayAttendance();
        }, 100);
    } else if (screenId === 'vacationScreen') {
        // 休暇申請画面の初期化
        if (window.vacationScreen) {
            window.vacationScreen.init();
        }
    } else if (screenId === 'adjustmentScreen') {
        // 打刻修正申請画面の初期化
        if (window.adjustmentScreen) {
            window.adjustmentScreen.init();
        }
    }
}

// 現在時刻の更新
function updateCurrentTime() {
    const now = new Date();
    const timeString = now.toLocaleTimeString('ja-JP', { 
        hour12: false,
        hour: '2-digit',
        minute: '2-digit'
    });
    
    const timeElement = document.getElementById('currentTime');
    if (timeElement) {
        timeElement.textContent = timeString;
        console.log('現在時刻を更新:', timeString);
    } else {
        console.error('currentTime要素が見つかりません');
    }
}

// 現在日付の更新
function updateCurrentDate() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const date = now.getDate();
    const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
    const dayName = dayNames[now.getDay()];
    const dateString = `${year}/${month}/${String(date).padStart(2, '0')}(${dayName})`;
    
    const dateElement = document.getElementById('currentDate');
    if (dateElement) {
        dateElement.textContent = dateString;
        console.log('現在日付を更新:', dateString);
    } else {
        console.error('currentDate要素が見つかりません');
    }
}

// generateCalendar関数は削除されました - HistoryScreenクラスのgenerateCalendar()メソッドを使用

// 指定日の勤怠データを取得
function getAttendanceForDate(date) {
    if (!window.attendanceData) return null;
    
    // 日本時間での日付文字列を生成（UTC変換を避ける）
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    
    return window.attendanceData.find(record => record.attendanceDate === dateStr);
}

// 指定日の申請ステータスを取得
function getRequestStatusForDate(date) {
    if (!window.requestData) return null;
    
    // 日本時間での日付文字列を生成
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    
    const request = window.requestData.find(req => req.requestDate === dateStr);
    if (!request) return null;
    
    return {
        text: request.status === 'APPROVED' ? '承認済' : '申請中',
        class: request.status === 'APPROVED' ? 'bg-success' : 'bg-warning'
    };
}

// カレンダーの日付クリックイベント設定
function setupCalendarClickEvents() {
    const calendarGrid = document.getElementById('calendarGrid');
    if (!calendarGrid) return;
    
    const calendarDays = calendarGrid.querySelectorAll('.calendar-day');
    calendarDays.forEach(day => {
        day.addEventListener('click', () => {
            const dateString = day.getAttribute('data-date');
            console.log('カレンダーの日付がクリックされました:', dateString);
            
            // 選択状態の視覚的フィードバック
            updateSelectedDate(day);
            
            // 勤怠詳細テーブルを選択日付でフィルタリング
            filterAttendanceTableByDate(dateString);
        });
    });
}

// 選択日付の視覚的フィードバック更新
function updateSelectedDate(selectedDay) {
    const calendarGrid = document.getElementById('calendarGrid');
    if (!calendarGrid) return;
    
    // 既存の選択状態をクリア
    const calendarDays = calendarGrid.querySelectorAll('.calendar-day');
    calendarDays.forEach(day => {
        day.classList.remove('selected');
    });
    
    // 選択された日付にクラスを追加
    selectedDay.classList.add('selected');
}

// 勤怠詳細テーブルを指定日付でフィルタリング
function filterAttendanceTableByDate(dateString) {
    const historyTableBody = document.getElementById('historyTableBody');
    if (!historyTableBody) return;

    // 選択された日付の勤怠データを取得
    const attendance = getAttendanceForDate(new Date(dateString));
    
    // 日付の詳細情報を取得
    const selectedDate = new Date(dateString);
    const isWeekend = selectedDate.getDay() === 0 || selectedDate.getDay() === 6;
    const isHoliday = isHolidayDate(selectedDate);
    
    // テーブルをクリア
    historyTableBody.innerHTML = '';

    if (attendance) {
        // 勤怠データがある場合
        const row = document.createElement('tr');
        row.style.cursor = 'pointer';
        row.classList.add('attendance-row');

        // 時刻表示
        const clockInTime = attendance.clockInTime ? 
            new Date(attendance.clockInTime).toLocaleTimeString('ja-JP', {hour: '2-digit', minute: '2-digit'}) : '-';
        const clockOutTime = attendance.clockOutTime ? 
            new Date(attendance.clockOutTime).toLocaleTimeString('ja-JP', {hour: '2-digit', minute: '2-digit'}) : '-';

        // 勤務時間の計算（打刻データがある場合は正確な計算を優先）
        let workingTime = '0:00';
        if (attendance.clockInTime && attendance.clockOutTime) {
            // 打刻データがある場合は必ず計算で求める（正確性を優先）
            workingTime = TimeUtils.calculateWorkingTime(attendance.clockInTime, attendance.clockOutTime, attendance.breakMinutes);
        } else if (attendance.workingMinutes !== undefined && attendance.workingMinutes !== null) {
            workingTime = TimeUtils.formatMinutesToTime(attendance.workingMinutes);
        }

        const lateMinutes = Number(attendance.lateMinutes ?? 0);
        const earlyLeaveMinutes = Number(attendance.earlyLeaveMinutes ?? 0);
        const lateDisplay = TimeUtils.formatMinutesToTime(lateMinutes);
        const earlyLeaveDisplay = TimeUtils.formatMinutesToTime(earlyLeaveMinutes);
        const overtimeMinutes = attendance.overtimeMinutes ?? 0;
        const overtimeDisplay = TimeUtils.formatMinutesToTime(overtimeMinutes);
        const nightWorkValue = attendance.nightWorkMinutes ?? attendance.nightShiftMinutes ?? 0;
        const nightWorkDisplay = TimeUtils.formatMinutesToTime(nightWorkValue);

        // ステータス表示
        let status = translateAttendanceStatus(attendance.attendanceStatus);
        if (!status) {
            if (attendance.clockInTime && !attendance.clockOutTime) {
                status = '出勤中';
            } else if (attendance.clockInTime && attendance.clockOutTime) {
                status = '退勤済';
            } else {
                status = '未出勤';
            }
        }

        let breakDisplay = '';
        if (attendance.clockInTime && attendance.clockOutTime) {
            if (attendance.breakMinutes !== undefined && attendance.breakMinutes !== null) {
                breakDisplay = TimeUtils.formatMinutesToTime(attendance.breakMinutes);
            } else {
                breakDisplay = '--:--';
            }
        }

        // 日付をyyyy/mm/dd形式に変換
        const formatDate = (dateStr) => {
            if (!dateStr) return '';
            const date = new Date(dateStr);
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}/${month}/${day}`;
        };

        row.innerHTML = `
            <td>${formatDate(attendance.attendanceDate)}</td>
            <td>${clockInTime}</td>
            <td>${clockOutTime}</td>
            <td>${breakDisplay}</td>
            <td>${workingTime}</td>
            <td>${lateDisplay}</td>
            <td>${earlyLeaveDisplay}</td>
            <td>${overtimeDisplay}</td>
            <td>${nightWorkDisplay}</td>
            <td>${status}</td>
        `;

        historyTableBody.appendChild(row);
    } else {
        // 勤怠データがない場合
        const row = document.createElement('tr');
        
        // ステータスを日付の種類に応じて設定
        let status = '打刻なし';
        if (isHoliday) {
            status = '祝日';
        } else if (isWeekend) {
            status = '休日';
        }

        // 日付をyyyy/mm/dd形式に変換
        const formatDate = (dateStr) => {
            if (!dateStr) return '';
            const date = new Date(dateStr);
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}/${month}/${day}`;
        };

        row.innerHTML = `
            <td>${formatDate(dateString)}</td>
            <td>-</td>
            <td>-</td>
            <td>--:--</td>
            <td>0:00</td>
            <td>0:00</td>
            <td>0:00</td>
            <td>0:00</td>
            <td>0:00</td>
            <td>${status}</td>
        `;
        historyTableBody.appendChild(row);
    }
}

    // 祝日判定（簡易版・令和以降の天皇誕生日に対応）
function isHolidayDate(date) {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    
    // 日本の祝日判定（簡易版）
        const holidays = [
            `${year}-01-01`,
            `${year}-02-11`,
            `${year}-02-23`,
            `${year}-04-29`,
            `${year}-05-03`,
            `${year}-05-04`,
            `${year}-05-05`,
            `${year}-08-11`,
            `${year}-11-03`,
            `${year}-11-23`
        ];
    
    const dateString = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return holidays.includes(dateString);
}

// カレンダーナビゲーション設定
function setupCalendarNavigation() {
    console.log('setupCalendarNavigation関数が呼び出されました');
    const prevMonthBtn = document.getElementById('prevMonthBtn');
    const currentMonthBtn = document.getElementById('currentMonthBtn');
    const nextMonthBtn = document.getElementById('nextMonthBtn');
    
    console.log('ボタン要素の取得状況:', {
        prevMonthBtn: !!prevMonthBtn,
        currentMonthBtn: !!currentMonthBtn,
        nextMonthBtn: !!nextMonthBtn
    });
    
    if (prevMonthBtn) {
        prevMonthBtn.addEventListener('click', () => {
            console.log('前月ボタンがクリックされました');
            changeCalendarMonth(-1);
        });
        console.log('前月ボタンにイベントリスナーを設定しました');
    }
    
    if (currentMonthBtn) {
        currentMonthBtn.addEventListener('click', () => {
            console.log('今月ボタンがクリックされました');
            goToCurrentMonth();
        });
        console.log('今月ボタンにイベントリスナーを設定しました');
    }
    
    if (nextMonthBtn) {
        nextMonthBtn.addEventListener('click', () => {
            console.log('次月ボタンがクリックされました');
            changeCalendarMonth(1);
        });
        console.log('次月ボタンにイベントリスナーを設定しました');
    }
}

// カレンダー月変更
function changeCalendarMonth(direction) {
    const now = new Date();
    let currentMonth = window.currentCalendarMonth || now.getMonth();
    let currentYear = window.currentCalendarYear || now.getFullYear();
    
    currentMonth += direction;
    
    if (currentMonth < 0) {
        currentMonth = 11;
        currentYear--;
    } else if (currentMonth > 11) {
        currentMonth = 0;
        currentYear++;
    }
    
    window.currentCalendarMonth = currentMonth;
    window.currentCalendarYear = currentYear;
    
    // カレンダーを再生成
    if (window.historyScreen) {
        window.historyScreen.generateCalendar();
    }
    
    // 選択された月の勤怠データを再読み込み
    loadAttendanceHistoryForMonth(currentYear, currentMonth + 1);
}

// 今月に移動
function goToCurrentMonth() {
    console.log('goToCurrentMonth関数が呼び出されました');
    const now = new Date();
    window.currentCalendarMonth = now.getMonth();
    window.currentCalendarYear = now.getFullYear();
    
    console.log('今月に移動:', now.getFullYear(), '年', now.getMonth() + 1, '月');
    
    // カレンダーを再生成
    if (window.historyScreen) {
        window.historyScreen.generateCalendar();
    }
    
    // 今月の勤怠データを再読み込み
    loadAttendanceHistoryForMonth(now.getFullYear(), now.getMonth() + 1);
}

// 指定月の勤怠データを読み込み
async function loadAttendanceHistoryForMonth(year, month) {
    if (!currentEmployeeId) return;
    
    try {
        const response = await fetch(`/api/attendance/history/${currentEmployeeId}?year=${year}&month=${month}`, {
            credentials: 'include'
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.success) {
                window.attendanceData = data.data || [];
                if (window.historyScreen) {
                    window.historyScreen.generateCalendar();
                }
            }
        }
    } catch (error) {
        console.error('月別勤怠データ読み込みエラー:', error);
    }
}

// 今日の勤怠状況を更新
async function updateTodayAttendance() {
    if (!currentEmployeeId) return;

    const clockInTime = document.getElementById('clockInTime');
    const clockOutTime = document.getElementById('clockOutTime');
    const workingTime = document.getElementById('workingTime');
    const breakTime = document.getElementById('breakTime');
    const clockInBtn = document.getElementById('clockInBtn');
    const clockOutBtn = document.getElementById('clockOutBtn');

    try {
        // 今日の勤怠記録を取得
        const response = await fetch(`/api/attendance/today/${currentEmployeeId}`, {
            credentials: 'include'
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.success && data.data) {
                const record = data.data;
                updateAttendanceDisplay(record, clockInTime, clockOutTime, workingTime, breakTime);
                updateButtonStates(record, clockInBtn, clockOutBtn);
                return;
            }
        }
    } catch (error) {
        console.error('今日の勤怠状況取得エラー:', error);
    }
    
    // APIが失敗した場合は未確定＝空白表示
    if (clockInTime) clockInTime.textContent = '';
    if (clockOutTime) clockOutTime.textContent = '';
    if (breakTime) breakTime.textContent = '';
    
    // 勤務時間の表示を更新（休暇申請や勤務時間変更申請を考慮）
    if (workingTime) {
        await updateWorkingTimeForNoData(workingTime);
    }
    
    updateButtonStates(null, clockInBtn, clockOutBtn);
}

// データがない場合の勤務時間表示更新
async function updateWorkingTimeForNoData(workingTime) {
    const today = new Date().toISOString().split('T')[0];
    let vacationRequest = null;
    let workPatternRequest = null;
    let patternWorkingMinutes = null;
    
    // データが読み込まれていない場合は、基本的な表示のみ行う
    if (window.historyScreen) {
        try {
            vacationRequest = window.historyScreen.getVacationRequestForDate(today);
            workPatternRequest = window.historyScreen.getWorkPatternRequestForDate(today);
            patternWorkingMinutes = workPatternRequest ? 
                window.historyScreen.extractWorkingMinutesFromPattern(workPatternRequest) : null;
        } catch (error) {
            console.debug('休暇申請または勤務時間変更申請の取得に失敗:', error);
        }
    }
    
    // データが読み込まれていない場合は、直接APIから取得を試行
    if (!vacationRequest && !workPatternRequest) {
        try {
            // 休暇申請データを直接取得
            const vacationResponse = await fetch(`/api/leave/requests/${currentEmployeeId}`, {
                credentials: 'include'
            });
            if (vacationResponse.ok) {
                const vacationData = await vacationResponse.json();
                if (vacationData.success && Array.isArray(vacationData.data)) {
                    vacationRequest = vacationData.data.find(req => 
                        req.startDate === today && 
                        req.status === 'APPROVED' && 
                        req.leaveType === 'PAID_LEAVE'
                    );
                }
            }
            
            // 勤務時間変更申請データを直接取得
            const workPatternResponse = await fetch(`/api/work-pattern-change/requests/${currentEmployeeId}`, {
                credentials: 'include'
            });
            if (workPatternResponse.ok) {
                const workPatternData = await workPatternResponse.json();
                if (workPatternData.success && Array.isArray(workPatternData.data)) {
                    workPatternRequest = workPatternData.data.find(req => 
                        req.startDate === today && 
                        req.status === 'APPROVED'
                    );
                    if (workPatternRequest) {
                        patternWorkingMinutes = workPatternRequest.workingMinutes;
                    }
                }
            }
            
            // 打刻修正申請データを直接取得
            const adjustmentResponse = await fetch(`/api/attendance/adjustments/${currentEmployeeId}`, {
                credentials: 'include'
            });
            if (adjustmentResponse.ok) {
                const adjustmentData = await adjustmentResponse.json();
                if (adjustmentData.success && Array.isArray(adjustmentData.data)) {
                    const approvedAdjustment = adjustmentData.data.find(req => 
                        req.targetDate === today && 
                        req.status === 'APPROVED'
                    );
                    if (approvedAdjustment && approvedAdjustment.newClockIn && approvedAdjustment.newClockOut) {
                        // 打刻修正が承認されている場合は、修正後の時間から勤務時間を計算
                        const calculatedWorkingTime = TimeUtils.calculateWorkingTime(
                            approvedAdjustment.newClockIn, 
                            approvedAdjustment.newClockOut, 
                            approvedAdjustment.newBreakMinutes
                        );
                        workingTime.textContent = sanitizeDashboardValue(calculatedWorkingTime);
                        return;
                    }
                }
            }
        } catch (error) {
            console.debug('直接API取得に失敗:', error);
        }
    }
    
    const isPaidLeaveApproved = vacationRequest && 
        vacationRequest.status === 'APPROVED' && 
        vacationRequest.leaveType === 'PAID_LEAVE';
    
    // 半休申請かどうかを判定
    const isHalfDayLeave = isPaidLeaveApproved && vacationRequest && 
        (vacationRequest.timeUnit === 'HALF_AM' || vacationRequest.timeUnit === 'HALF_PM');
    const isFullDayLeave = isPaidLeaveApproved && !isHalfDayLeave;
    
    let workingDisplay = '';
    
    if (isPaidLeaveApproved) {
        if (isFullDayLeave) {
            // 全日有休申請の場合、勤務時間変更申請があればその実働時間を使用
            if (patternWorkingMinutes !== null) {
                workingDisplay = TimeUtils.formatMinutesToTime(patternWorkingMinutes);
            } else {
                const standardMinutes = window.WORK_TIME_CONSTANTS?.STANDARD_WORKING_MINUTES || 480;
                workingDisplay = TimeUtils.formatMinutesToTime(standardMinutes);
            }
        } else {
            // その他の有休申請の場合
            if (patternWorkingMinutes !== null) {
                workingDisplay = TimeUtils.formatMinutesToTime(patternWorkingMinutes);
            } else {
                const standardMinutes = window.WORK_TIME_CONSTANTS?.STANDARD_WORKING_MINUTES || 480;
                workingDisplay = TimeUtils.formatMinutesToTime(standardMinutes);
            }
        }
    } else if (patternWorkingMinutes !== null) {
        // 勤務時間変更申請が承認されている場合
        workingDisplay = TimeUtils.formatMinutesToTime(patternWorkingMinutes);
    } else {
        workingDisplay = '';
    }
    
    workingTime.textContent = sanitizeDashboardValue(workingDisplay);
}

function calculateEffectiveBreakMinutes(record) {
    if (!record || !record.clockInTime || !record.clockOutTime) {
        return null;
    }

    const rawBreak = record.breakMinutes;
    if (typeof rawBreak === 'number' && !Number.isNaN(rawBreak) && rawBreak >= 0) {
        return rawBreak;
    }

    try {
        const start = new Date(record.clockInTime);
        const end = new Date(record.clockOutTime);
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
            return null;
        }
        const totalMinutes = Math.floor((end - start) / (1000 * 60));
        if (totalMinutes <= 0) {
            return null;
        }
        return Math.min(
            Math.max(TimeUtils.calculateRequiredBreakMinutes(totalMinutes), 0),
            totalMinutes
        );
    } catch (error) {
        console.debug('Failed to calculate effective break minutes:', error);
        return null;
    }
}

// 勤怠状況表示を更新
function updateAttendanceDisplay(record, clockInTime, clockOutTime, workingTime, breakTime) {
    if (!record) return;

    const effectiveBreakMinutes = calculateEffectiveBreakMinutes(record);
    const attendance = { ...record };
    if (effectiveBreakMinutes !== null &&
        (attendance.breakMinutes === undefined || attendance.breakMinutes === null)) {
        attendance.breakMinutes = effectiveBreakMinutes;
    }

    window.currentAttendanceRecord = attendance;

    if (clockInTime) {
        const formattedClockIn = formatTimeDisplay(attendance.clockInTime);
        clockInTime.textContent = sanitizeDashboardValue(formattedClockIn);
    }

    if (clockOutTime) {
        const formattedClockOut = attendance.clockOutTime ? formatTimeDisplay(attendance.clockOutTime) : '';
        clockOutTime.textContent = sanitizeDashboardValue(formattedClockOut);
    }

    if (breakTime) {
        if (attendance.clockInTime && attendance.clockOutTime &&
            attendance.breakMinutes !== undefined && attendance.breakMinutes !== null) {
            breakTime.textContent = sanitizeDashboardValue(
                TimeUtils.formatMinutesToTime(attendance.breakMinutes)
            );
        } else {
            breakTime.textContent = '';
        }
    }

    if (workingTime) {
        // 休暇申請の状態を確認
        const today = new Date().toISOString().split('T')[0];
        let vacationRequest = null;
        let workPatternRequest = null;
        let patternWorkingMinutes = null;
        
        // データが読み込まれていない場合は、基本的な表示のみ行う
        if (window.historyScreen) {
            try {
                vacationRequest = window.historyScreen.getVacationRequestForDate(today);
                workPatternRequest = window.historyScreen.getWorkPatternRequestForDate(today);
                patternWorkingMinutes = workPatternRequest ? 
                    window.historyScreen.extractWorkingMinutesFromPattern(workPatternRequest) : null;
            } catch (error) {
                console.debug('休暇申請または勤務時間変更申請の取得に失敗:', error);
            }
        }
        
        const isPaidLeaveApproved = vacationRequest && 
            vacationRequest.status === 'APPROVED' && 
            vacationRequest.leaveType === 'PAID_LEAVE';
        
        // 半休申請かどうかを判定
        const isHalfDayLeave = isPaidLeaveApproved && vacationRequest && 
            (vacationRequest.timeUnit === 'HALF_AM' || vacationRequest.timeUnit === 'HALF_PM');
        const isFullDayLeave = isPaidLeaveApproved && !isHalfDayLeave;
        
        let workingDisplay = '';
        
        if (isPaidLeaveApproved) {
            if (isHalfDayLeave && attendance.clockInTime && attendance.clockOutTime) {
                // 半休申請で打刻データがある場合
                const actualWorkingMinutes = TimeUtils.timeStringToMinutes(
                    TimeUtils.calculateWorkingTime(attendance.clockInTime, attendance.clockOutTime, attendance.breakMinutes)
                );
                const halfDayMinutes = window.WORK_TIME_CONSTANTS?.HALF_DAY_WORKING_MINUTES || 240;
                const totalMinutes = actualWorkingMinutes + halfDayMinutes;
                workingDisplay = TimeUtils.formatMinutesToTime(totalMinutes);
            } else if (isFullDayLeave) {
                // 全日有休申請の場合、勤務時間変更申請があればその実働時間を使用
                if (patternWorkingMinutes !== null) {
                    workingDisplay = TimeUtils.formatMinutesToTime(patternWorkingMinutes);
                } else {
                    const standardMinutes = window.WORK_TIME_CONSTANTS?.STANDARD_WORKING_MINUTES || 480;
                    workingDisplay = TimeUtils.formatMinutesToTime(standardMinutes);
                }
            } else {
                // その他の有休申請の場合
                if (patternWorkingMinutes !== null) {
                    workingDisplay = TimeUtils.formatMinutesToTime(patternWorkingMinutes);
                } else if (attendance.clockInTime && attendance.clockOutTime) {
                    workingDisplay = TimeUtils.calculateWorkingTime(attendance.clockInTime, attendance.clockOutTime, attendance.breakMinutes);
                } else if (attendance.workingMinutes !== undefined && attendance.workingMinutes !== null) {
                    workingDisplay = TimeUtils.formatMinutesToTime(attendance.workingMinutes);
                } else {
                    const standardMinutes = window.WORK_TIME_CONSTANTS?.STANDARD_WORKING_MINUTES || 480;
                    workingDisplay = TimeUtils.formatMinutesToTime(standardMinutes);
                }
            }
        } else if (attendance.clockInTime && attendance.clockOutTime) {
            // 通常の打刻データがある場合は計算で求める
            workingDisplay = TimeUtils.calculateWorkingTime(attendance.clockInTime, attendance.clockOutTime, attendance.breakMinutes);
        } else if (patternWorkingMinutes !== null) {
            // 勤務時間変更申請が承認されている場合
            workingDisplay = TimeUtils.formatMinutesToTime(patternWorkingMinutes);
        } else if (attendance.workingMinutes !== undefined && attendance.workingMinutes !== null) {
            // 勤怠記録の実働時間を使用
            workingDisplay = TimeUtils.formatMinutesToTime(attendance.workingMinutes);
        } else {
            workingDisplay = '';
        }
        
        workingTime.textContent = sanitizeDashboardValue(workingDisplay);
    }
}

// formatMinutesToTime関数はtimeUtils.jsに移動しました

// 管理者権限チェック
async function checkAdminPermissions() {
    try {
        const response = await fetch('/api/auth/session', {
            credentials: 'include'
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.authenticated && data.role === 'ADMIN') {
                isAdmin = true;
                window.isAdmin = true; // グローバル変数にも設定
                // 管理者: 一般メニューを非表示
                const dashboardNavLink = document.getElementById('dashboardNavLink');
                const historyNavLink = document.getElementById('historyNavLink');
                const vacationNavLink = document.getElementById('vacationNavLink');
                const holidayNavLink = document.getElementById('holidayNavLink');
                const adjustmentNavLink = document.getElementById('adjustmentNavLink');
                const workPatternNavLink = document.getElementById('workPatternNavLink');
                dashboardNavLink?.parentElement && (dashboardNavLink.parentElement.style.display = 'none');
                historyNavLink?.parentElement && (historyNavLink.parentElement.style.display = 'none');
                vacationNavLink?.parentElement && (vacationNavLink.parentElement.style.display = 'none');
                adjustmentNavLink?.parentElement && (adjustmentNavLink.parentElement.style.display = 'none');
                holidayNavLink?.parentElement && (holidayNavLink.parentElement.style.display = 'none');
                workPatternNavLink?.parentElement && (workPatternNavLink.parentElement.style.display = 'none');

                // 管理者: 勤怠管理は非表示のまま、申請承認は常時表示
                if (adminAttendanceNavItem) adminAttendanceNavItem.style.display = 'none';
                if (adminApprovalsNavItem) adminApprovalsNavItem.style.display = 'block';
                if (adminWorkPatternNavItem) adminWorkPatternNavItem.style.display = 'block';
                const adminHolidayNavItem = document.getElementById('adminHolidayNavItem');
                if (adminHolidayNavItem) adminHolidayNavItem.style.display = 'block';

                // 残りの管理メニューは表示（必要に応じて）
                const adminMonthlySubmissionsNavItem = document.getElementById('adminMonthlySubmissionsNavItem');
                if (adminMonthlySubmissionsNavItem) adminMonthlySubmissionsNavItem.style.display = 'block';
                if (adminVacationManagementNavItem) adminVacationManagementNavItem.style.display = 'block';
                if (adminEmployeesNavItem) adminEmployeesNavItem.style.display = 'block';
                if (adminWorkPatternNavItem) adminWorkPatternNavItem.style.display = 'block';
                if (adminReportsNavItem) adminReportsNavItem.style.display = 'block';
            } else {
                isAdmin = false;
                // 管理者メニューアイテムを非表示
                const adminMonthlySubmissionsNavItem = document.getElementById('adminMonthlySubmissionsNavItem');
                if (adminMonthlySubmissionsNavItem) adminMonthlySubmissionsNavItem.style.display = 'none';
                if (adminVacationManagementNavItem) adminVacationManagementNavItem.style.display = 'none';
                if (adminEmployeesNavItem) adminEmployeesNavItem.style.display = 'none';
                if (adminAttendanceNavItem) adminAttendanceNavItem.style.display = 'none';
                if (adminApprovalsNavItem) adminApprovalsNavItem.style.display = 'none';
                if (adminWorkPatternNavItem) adminWorkPatternNavItem.style.display = 'none';
                const adminHolidayNavItem2 = document.getElementById('adminHolidayNavItem');
                if (adminHolidayNavItem2) adminHolidayNavItem2.style.display = 'none';
                if (adminReportsNavItem) adminReportsNavItem.style.display = 'none';
                // 一般メニューは表示
                const dashboardNavLink = document.getElementById('dashboardNavLink');
                const historyNavLink = document.getElementById('historyNavLink');
                const vacationNavLink = document.getElementById('vacationNavLink');
                const adjustmentNavLink = document.getElementById('adjustmentNavLink');
                const holidayNavLink2 = document.getElementById('holidayNavLink');
                const workPatternNavLink = document.getElementById('workPatternNavLink');
                dashboardNavLink?.parentElement && (dashboardNavLink.parentElement.style.display = 'block');
                historyNavLink?.parentElement && (historyNavLink.parentElement.style.display = 'block');
                vacationNavLink?.parentElement && (vacationNavLink.parentElement.style.display = 'block');
                adjustmentNavLink?.parentElement && (adjustmentNavLink.parentElement.style.display = 'block');
                holidayNavLink2?.parentElement && (holidayNavLink2.parentElement.style.display = 'block');
                workPatternNavLink?.parentElement && (workPatternNavLink.parentElement.style.display = 'block');
            }
        }
    } catch (error) {
        console.error('管理者権限チェックエラー:', error);
        // エラーの場合は管理者メニューを非表示
        const adminMonthlySubmissionsNavItem = document.getElementById('adminMonthlySubmissionsNavItem');
        if (adminMonthlySubmissionsNavItem) adminMonthlySubmissionsNavItem.style.display = 'none';
        if (adminVacationManagementNavItem) adminVacationManagementNavItem.style.display = 'none';
        if (adminEmployeesNavItem) adminEmployeesNavItem.style.display = 'none';
        if (adminAttendanceNavItem) adminAttendanceNavItem.style.display = 'none';
        if (adminApprovalsNavItem) adminApprovalsNavItem.style.display = 'none';
        if (adminReportsNavItem) adminReportsNavItem.style.display = 'none';
    }
}

// 営業日判定
function isBusinessDay(date) {
    if (window.BusinessDayUtils && typeof window.BusinessDayUtils.isBusinessDay === 'function') {
        return window.BusinessDayUtils.isBusinessDay(date);
    }
    const day = date.getDay();
    return day !== 0 && day !== 6;
}

// ボタンの状態を更新
function updateButtonStates(record, clockInBtn, clockOutBtn) {
    if (!clockInBtn || !clockOutBtn) return;

    // 出勤打刻ボタン
    if (!record || !record.clockInTime) {
        clockInBtn.disabled = false;
        clockInBtn.classList.remove('btn-secondary');
        clockInBtn.classList.add('btn-success');
        clockInBtn.textContent = '出勤';
    } else {
        clockInBtn.disabled = true;
        clockInBtn.classList.remove('btn-success');
        clockInBtn.classList.add('btn-secondary');
        clockInBtn.textContent = '出勤済';
    }

    // 退勤打刻ボタン
    if (!record || !record.clockInTime || record.clockOutTime) {
        clockOutBtn.disabled = true;
        clockOutBtn.classList.remove('btn-danger');
        clockOutBtn.classList.add('btn-secondary');
        clockOutBtn.textContent = record && record.clockOutTime ? '退勤済' : '退勤';
    } else {
        clockOutBtn.disabled = false;
        clockOutBtn.classList.remove('btn-secondary');
        clockOutBtn.classList.add('btn-danger');
        clockOutBtn.textContent = '退勤';
    }
}

// 勤怠履歴画面の月選択設定
function setupHistoryMonthSelect() {
    const historyMonthSelect = document.getElementById('historyMonthSelect');
    const searchHistoryBtn = document.getElementById('searchHistoryBtn');
    
    if (historyMonthSelect) {
        // 月選択オプションを生成
        generateHistoryMonthOptions();
        
        // 月選択イベントリスナー
        historyMonthSelect.addEventListener('change', function() {
            const selectedValue = this.value;
            if (selectedValue) {
                const [year, month] = selectedValue.split('-');
                window.currentCalendarYear = parseInt(year);
                window.currentCalendarMonth = parseInt(month) - 1;
                if (window.historyScreen) {
                    window.historyScreen.generateCalendar();
                }
            }
        });
    }
    
    if (searchHistoryBtn) {
        searchHistoryBtn.addEventListener('click', function() {
            const selectedValue = historyMonthSelect.value;
            if (selectedValue) {
                const [year, month] = selectedValue.split('-');
                window.currentCalendarYear = parseInt(year);
                window.currentCalendarMonth = parseInt(month) - 1;
                if (window.historyScreen) {
                    window.historyScreen.generateCalendar();
                }
            } else {
                showAlert('月を選択してください', 'warning');
            }
        });
    }
}

// 勤怠履歴用月選択オプション生成
function generateHistoryMonthOptions() {
    const historyMonthSelect = document.getElementById('historyMonthSelect');
    if (!historyMonthSelect) return;

    // 既存のオプションをクリア（最初のオプション以外）
    while (historyMonthSelect.children.length > 1) {
        historyMonthSelect.removeChild(historyMonthSelect.lastChild);
    }

    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();

    // 現在年から過去3年分の1-12月を生成
    for (let year = currentYear; year >= currentYear - 2; year--) {
        for (let month = 12; month >= 1; month--) {
            const monthStr = String(month).padStart(2, '0');
            const value = `${year}-${monthStr}`;
            const label = `${year}/${monthStr}`;

            const option = document.createElement('option');
            option.value = value;
            option.textContent = label;
            historyMonthSelect.appendChild(option);
        }
    }
}
