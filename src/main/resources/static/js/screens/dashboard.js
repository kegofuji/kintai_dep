(function (global) {
/**
 * ダッシュボード画面モジュール
 */
class DashboardScreen {
    constructor() {
        this.clockInBtn = null;
        this.clockOutBtn = null;
        this.refreshHistoryBtn = null;
        this.attendanceHistory = null;
        this.monthlySubmitBtn = null;
        this.monthSelect = null;
        this.logoutBtn = null;
        this.breakTimeElement = null;
        this.currentAttendance = null;
    }

    /**
     * 初期化
     */
    init() {
        console.log('Dashboard init called, employeeId:', window.currentEmployeeId);
        this.initializeElements();
        this.setupEventListeners();
        this.updateDateTime();
        
        // 従業員IDが設定されている場合のみ勤怠データを読み込み
        if (window.currentEmployeeId) {
            console.log('従業員IDが設定されています。勤怠データを読み込みます。');
            this.loadTodayAttendance();
            this.loadAttendanceHistory();
        } else {
            console.log('従業員IDが設定されていません。セッション情報を確認します。');
            // セッション情報を再確認
            this.checkSessionAndLoadData();
        }
        
        this.generateMonthOptions();
        
        // 現在時刻を1秒ごとに更新
        setInterval(() => {
            this.updateDateTime();
            // 勤務時間のリアルタイム更新は行わない
        }, 1000);
    }

    /**
     * セッション情報を確認してデータを読み込み
     */
    async checkSessionAndLoadData() {
        try {
            console.log('セッション情報を確認中...');
            const response = await fetchWithAuth.get('/api/auth/session');
            
            if (response.ok) {
                const data = await response.json();
                if (data.authenticated) {
                    console.log('セッション確認成功、ユーザー情報を更新:', data);
                    
                    window.currentUser = data.username;
                    
                    // 管理者の場合はadminId、従業員の場合はemployeeIdを使用
                    let userId = data.employeeId;
                    if (data.role === 'ADMIN') {
                        userId = data.adminId;
                        console.log('管理者セッション確認 - adminId:', userId, '型:', typeof userId);
                    } else {
                        console.log('従業員セッション確認 - employeeId:', userId, '型:', typeof userId);
                    }
                    
                    window.currentEmployeeId = userId;
                    
                    // アプリケーションのユーザー情報を更新
                    if (window.app) {
                        window.app.updateUserInfo(data.username, userId);
                    }
                    
                    // 勤怠データを読み込み
                    this.loadTodayAttendance();
                    this.loadAttendanceHistory();
                } else {
                    console.log('セッションが無効です');
                }
            } else {
                console.log('セッション確認失敗:', response.status);
                const errorText = await response.text();
                console.log('エラーレスポンス:', errorText);
            }
        } catch (error) {
            console.error('セッション確認エラー:', error);
        }
    }

    /**
     * DOM要素の初期化
     */
    initializeElements() {
        this.clockInBtn = document.getElementById('clockInBtn');
        this.clockOutBtn = document.getElementById('clockOutBtn');
        this.refreshHistoryBtn = document.getElementById('refreshHistoryBtn');
        this.attendanceHistory = document.getElementById('attendanceHistory');
        this.monthlySubmitBtn = document.getElementById('monthlySubmitBtn');
        this.monthSelect = document.getElementById('historyMonthSelect');
        this.logoutBtn = document.getElementById('logoutBtn');
        this.breakTimeElement = document.getElementById('breakTime');
    }

    /**
     * イベントリスナー設定
     */
    setupEventListeners() {
        if (this.clockInBtn) {
            this.clockInBtn.addEventListener('click', () => this.handleClockIn());
        }

        if (this.clockOutBtn) {
            this.clockOutBtn.addEventListener('click', () => this.handleClockOut());
        }

        if (this.refreshHistoryBtn) {
            this.refreshHistoryBtn.addEventListener('click', () => this.loadAttendanceHistory());
        }

        if (this.monthlySubmitBtn) {
            this.monthlySubmitBtn.addEventListener('click', () => this.handleMonthlySubmit());
        }

        if (this.logoutBtn) {
            this.logoutBtn.addEventListener('click', () => this.handleLogout());
        }
    }

    /**
     * 出勤打刻
     */
    async handleClockIn() {
        if (!window.currentEmployeeId) {
            return;
        }

        try {
            const data = await fetchWithAuth.handleApiCall(
                () => fetchWithAuth.post('/api/attendance/clock-in', { employeeId: window.currentEmployeeId }),
                ''
            );

            this.showAlert(data.message, 'success');
            await this.loadTodayAttendance();
            await this.loadAttendanceHistory();
            
            // カレンダーを即時更新
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
        } catch (error) {
            // エラー時は状態を再同期のみ実行
            await this.loadTodayAttendance();
            await this.loadAttendanceHistory();
        }
    }

    /**
     * 退勤打刻
     */
    async handleClockOut() {
        if (!window.currentEmployeeId) {
            return;
        }

        try {
            console.log('退勤打刻を開始します。従業員ID:', window.currentEmployeeId);
            const data = await fetchWithAuth.handleApiCall(
                () => fetchWithAuth.post('/api/attendance/clock-out', { employeeId: window.currentEmployeeId }),
                ''
            );

            console.log('退勤打刻APIレスポンス:', data);
            this.showAlert(data.message, 'success');
            
            console.log('今日の勤怠状況を再読み込みします');
            await this.loadTodayAttendance();
            
            console.log('勤怠履歴を再読み込みします');
            await this.loadAttendanceHistory();
            
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
        } catch (error) {
            // エラー時は状態を再同期のみ実行
            await this.loadTodayAttendance();
            await this.loadAttendanceHistory();
        }
    }

    /**
     * 表示用の休憩時間を算出（未設定時は法定休憩を推定）
     * @param {Object|null} data
     * @returns {number|null}
     */
    calculateEffectiveBreakMinutes(data) {
        if (!data || !data.clockInTime || !data.clockOutTime) {
            return null;
        }

        const rawBreak = data.breakMinutes;
        if (typeof rawBreak === 'number' && !Number.isNaN(rawBreak) && rawBreak >= 0) {
            return rawBreak;
        }

        try {
            const start = new Date(data.clockInTime);
            const end = new Date(data.clockOutTime);
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

    /**
     * 日時表示更新
     */
    updateDateTime() {
        const now = new Date();
        
        // 日付表示更新
        const currentDateElement = document.getElementById('currentDate');
        if (currentDateElement) {
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const date = now.getDate();
            const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
            const dayName = dayNames[now.getDay()];
            currentDateElement.textContent = `${year}/${month}/${String(date).padStart(2, '0')}(${dayName})`;
        }
        
        // 時刻表示更新
        const currentTimeElement = document.getElementById('currentTime');
        if (currentTimeElement) {
            const timeString = now.toLocaleTimeString('ja-JP', {hour: '2-digit', minute: '2-digit'});
            currentTimeElement.textContent = timeString;
        }
    }

    /**
     * 勤務時間のリアルタイム更新
     */
    updateWorkingTime() {}

    /**
     * 値をbooleanに正規化
     * @param {*} value - 判定対象
     * @returns {boolean}
     */
    normalizeBoolean(value) {
        if (typeof value === 'boolean') {
            return value;
        }
        if (typeof value === 'string') {
            const normalized = value.trim().toLowerCase();
            return normalized === 'true' || normalized === '1' || normalized === 'yes';
        }
        if (typeof value === 'number') {
            return value === 1;
        }
        return false;
    }

    /**
     * 今日の勤怠状況読み込み
     */
    async loadTodayAttendance() {
        console.log('loadTodayAttendance called, employeeId:', window.currentEmployeeId, 'type:', typeof window.currentEmployeeId);

        if (!window.currentEmployeeId) {
            console.log('No employee ID found, attempting to get from session');
            // セッションから従業員IDを再取得
            await this.checkSessionAndLoadData();
            return;
        }

        try {
            console.log('Fetching today attendance for employee:', window.currentEmployeeId);
            const apiUrl = `/api/attendance/today/${window.currentEmployeeId}`;
            console.log('API URL:', apiUrl);
            
            const response = await fetchWithAuth.get(apiUrl);
            
            console.log('API Response status:', response.status);
            console.log('API Response headers:', response.headers);
            
            if (response.ok) {
                const data = await response.json();
                console.log('Today attendance API response:', JSON.stringify(data, null, 2));
                
                if (data.success) {
                    if (data.data) {
                        console.log('Displaying attendance data:', data.data);
                        this.displayTodayAttendance(data.data);
                    } else {
                        console.log('No attendance data in response, showing default');
                        this.displayTodayAttendance(null);
                    }
                } else {
                    console.log('API returned success=false:', data.message);
                    this.displayTodayAttendance(null);
                }
            } else if (response.status === 404) {
                // 404エラーの場合は勤怠記録がないことを意味する
                console.log('No attendance record found (404), showing default');
                this.displayTodayAttendance(null);
            } else {
                // その他のエラー
                console.error('API error:', response.status, response.statusText);
                const errorText = await response.text();
                console.error('Error response body:', errorText);
                this.displayTodayAttendance(null);
            }
        } catch (error) {
            console.error('今日の勤怠状況読み込みエラー:', error);
            // エラーの場合はデフォルト表示
            this.displayTodayAttendance(null);
        }
    }

    /**
     * 今日の勤怠状況表示
     * @param {Object} data - 勤怠データ
     */
    displayTodayAttendance(data) {
        console.log('displayTodayAttendance called with data:', data);
        console.log('Data type:', typeof data);
        console.log('Data keys:', data ? Object.keys(data) : 'null');

        const effectiveBreakMinutes = this.calculateEffectiveBreakMinutes(data);
        const attendanceForState = data ? { ...data } : data;
        if (attendanceForState && effectiveBreakMinutes !== null &&
            (attendanceForState.breakMinutes === undefined || attendanceForState.breakMinutes === null)) {
            attendanceForState.breakMinutes = effectiveBreakMinutes;
        }

        const hasApprovedAdjustment = this.normalizeBoolean(attendanceForState?.hasApprovedAdjustment);
        if (attendanceForState) {
            attendanceForState.hasApprovedAdjustment = hasApprovedAdjustment;
        }
        this.currentAttendance = attendanceForState;

        if (this.breakTimeElement) {
            if (effectiveBreakMinutes !== null) {
                this.breakTimeElement.textContent = TimeUtils.formatMinutesToTime(effectiveBreakMinutes);
            } else {
                this.breakTimeElement.textContent = '';
            }
        }

        const formatTime = (isoString) => {
            if (!isoString) {
                return '';
            }

            // ISO形式から時刻部分だけを安全に抽出（Safari互換）
            const isoMatch = /T(\d{2}):(\d{2})/.exec(isoString);
            if (isoMatch) {
                return `${isoMatch[1]}:${isoMatch[2]}`;
            }

            try {
                const parsed = new Date(isoString);
                if (Number.isNaN(parsed.getTime())) {
                    return '';
                }
                return parsed.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
            } catch (error) {
                console.error('Error formatting time:', error, isoString);
                return '';
            }
        };

        // 出勤時刻表示
        const clockInTimeElement = document.getElementById('clockInTime');
        if (clockInTimeElement) {
            const formattedClockIn = formatTime(data?.clockInTime);
            clockInTimeElement.textContent = formattedClockIn;
            console.log('Clock in time set to:', formattedClockIn);
        } else {
            console.log('clockInTimeElement not found');
        }

        // 退勤時刻表示
        const clockOutTimeElement = document.getElementById('clockOutTime');
        if (clockOutTimeElement) {
            const formattedClockOut = data?.clockOutTime ? formatTime(data.clockOutTime) : '';
            clockOutTimeElement.textContent = formattedClockOut;
            console.log('Clock out time set to:', formattedClockOut);
        } else {
            console.log('clockOutTimeElement not found');
        }

        // 勤務時間表示
        const workingTimeElement = document.getElementById('workingTime');
        if (workingTimeElement) {
            if (data && data.clockInTime && data.clockOutTime) {
                // 打刻データがある場合は必ず計算で求める（正確性を優先）
                const workingTime = TimeUtils.calculateWorkingTime(data.clockInTime, data.clockOutTime, effectiveBreakMinutes);
                workingTimeElement.textContent = workingTime;
                console.log('Working time set to:', workingTime);
            } else {
                workingTimeElement.textContent = '';
            }
        } else {
            console.log('workingTimeElement not found');
        }

        // ボタンの状態更新
        this.updateButtonStates(data);
    }

    /**
     * ボタンの状態更新
     * @param {Object} data - 勤怠データ
     */
    updateButtonStates(data) {
        if (!this.clockInBtn || !this.clockOutBtn) return;

        if (data && data.clockInTime && !data.clockOutTime) {
            // 出勤済・退勤未済の場合
            this.clockInBtn.disabled = true;
            this.clockInBtn.innerHTML = '出勤済';
            this.clockInBtn.className = 'btn btn-secondary btn-lg me-3 clock-btn';
            
            this.clockOutBtn.disabled = false;
            this.clockOutBtn.innerHTML = '退勤';
            this.clockOutBtn.className = 'btn btn-danger btn-lg clock-btn';
        } else if (data && data.clockInTime && data.clockOutTime) {
            // 出勤済・退勤済の場合
            this.clockInBtn.disabled = true;
            this.clockInBtn.innerHTML = '出勤済';
            this.clockInBtn.className = 'btn btn-secondary btn-lg me-3 clock-btn';
            
            this.clockOutBtn.disabled = true;
            this.clockOutBtn.innerHTML = '退勤済';
            this.clockOutBtn.className = 'btn btn-secondary btn-lg clock-btn';
        } else {
            // 未出勤の場合
            this.clockInBtn.disabled = false;
            this.clockInBtn.innerHTML = '出勤';
            this.clockInBtn.className = 'btn btn-success btn-lg me-3 clock-btn';
            
            this.clockOutBtn.disabled = true;
            this.clockOutBtn.innerHTML = '退勤';
            this.clockOutBtn.className = 'btn btn-secondary btn-lg clock-btn';
        }
    }

    /**
     * 勤怠履歴読み込み
     */
    async loadAttendanceHistory() {
        if (!window.currentEmployeeId) return;

        try {
            const data = await fetchWithAuth.handleApiCall(
                () => fetchWithAuth.get(`/api/attendance/history/${window.currentEmployeeId}`),
                '勤怠履歴の取得に失敗しました'
            );

            if (data.success) {
                this.displayAttendanceHistory(data.data);
            } else {
                // APIが失敗した場合はモックデータを表示
                const mockData = this.generateMockAttendanceData();
                this.displayAttendanceHistory(mockData);
            }
        } catch (error) {
            console.error('勤怠履歴読み込みエラー:', error);
            // エラーの場合はモックデータを表示
            const mockData = this.generateMockAttendanceData();
            this.displayAttendanceHistory(mockData);
        }
    }

    /**
     * モック勤怠データ生成
     * @returns {Array} - モックデータ
     */
    generateMockAttendanceData() {
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

            data.push({
                attendanceDate: date.toISOString().split('T')[0],
                clockInTime: clockIn.toISOString(),
                clockOutTime: clockOut.toISOString(),
                workingHours: workingHours,
                status: i === 0 ? '出勤中' : '退勤済'
            });
        }

        return data;
    }

    /**
     * 勤怠履歴表示
     * @param {Array} data - 勤怠データ
     */
    displayAttendanceHistory(data) {
        if (!this.attendanceHistory) return;

        this.attendanceHistory.innerHTML = '';

        // データがない場合でも、ヘッダ列のみ表示（空のテーブル本体）
        if (data.length === 0) {
            return;
        }

        data.forEach(record => {
            const row = document.createElement('tr');

            // 実際のデータ構造に合わせて表示
            const clockInTime = record.clockInTime ? 
                new Date(record.clockInTime).toLocaleTimeString('ja-JP', {hour: '2-digit', minute: '2-digit'}) : '-';
            const clockOutTime = record.clockOutTime ? 
                new Date(record.clockOutTime).toLocaleTimeString('ja-JP', {hour: '2-digit', minute: '2-digit'}) : '';

            // 勤務時間計算（打刻データがある場合は正確な計算を優先）
            let workingHours = '';
            if (record.clockInTime && record.clockOutTime) {
                // 打刻データがある場合は必ず計算で求める（正確性を優先）
                workingHours = TimeUtils.calculateWorkingTime(record.clockInTime, record.clockOutTime, record.breakMinutes);
            }

            let breakDisplay = '';
            if (record.clockInTime && record.clockOutTime) {
                if (record.breakMinutes !== undefined && record.breakMinutes !== null) {
                    breakDisplay = TimeUtils.formatMinutesToTime(record.breakMinutes);
                }
            }

            // ステータス表示
            let statusText = '未出勤';

            if (record.clockInTime && !record.clockOutTime) {
                statusText = '出勤中';
            } else if (record.clockInTime && record.clockOutTime) {
                statusText = '退勤済';
            }

            row.innerHTML = `
                <td>${record.attendanceDate}</td>
                <td>${clockInTime}</td>
                <td>${clockOutTime}</td>
                <td>${breakDisplay}</td>
                <td>${workingHours}</td>
                <td>${statusText}</td>
            `;
            this.attendanceHistory.appendChild(row);
        });
    }

    /**
     * 他画面に更新を伝播
     */
    async refreshLinkedScreens() {
        try {
            if (window.historyScreen) {
                if (typeof window.historyScreen.loadCalendarData === 'function') {
                    try {
                        await window.historyScreen.loadCalendarData(true);
                    } catch (error) {
                        console.warn('勤怠履歴の再読込に失敗しました:', error);
                    }
                }
                if (typeof window.historyScreen.generateCalendar === 'function') {
                    try {
                        window.historyScreen.generateCalendar();
                    } catch (error) {
                        console.warn('勤怠履歴カレンダーの再描画に失敗しました:', error);
                    }
                }
            }

            if (window.calendarScreen) {
                if (typeof window.calendarScreen.loadCalendarData === 'function') {
                    try {
                        await window.calendarScreen.loadCalendarData();
                    } catch (error) {
                        console.warn('カレンダー画面の再読込に失敗しました:', error);
                    }
                }
                if (typeof window.calendarScreen.generateCalendar === 'function') {
                    try {
                        window.calendarScreen.generateCalendar();
                    } catch (error) {
                        console.warn('カレンダー画面の再描画に失敗しました:', error);
                    }
                }
            }
        } catch (error) {
            console.warn('関連画面の更新中にエラーが発生しました:', error);
        }
    }

    /**
     * ログアウト処理
     */
    async handleLogout() {
        try {
            await fetchWithAuth.post('/api/auth/logout');
            
            window.currentUser = null;
            window.currentEmployeeId = null;
            if (typeof window.clearAdminViewingState === 'function') {
                window.clearAdminViewingState();
            }
            this.showAlert('ログアウトしました', 'success');
            
            // ログイン画面に戻る
            if (window.loginScreen) {
                window.loginScreen.showLoginInterface();
            }
        } catch (error) {
            console.error('ログアウトエラー:', error);
            this.showAlert('ログアウト処理中にエラーが発生しました', 'danger');
        }
    }

    /**
     * 月選択オプション生成
     */
    generateMonthOptions() {
        if (!this.monthSelect) return;

        const currentDate = new Date();
        const currentYear = currentDate.getFullYear();
        const currentMonth = currentDate.getMonth() + 1;

        for (let i = 0; i < 12; i++) {
            const date = new Date(currentYear, currentMonth - 1 - i, 1);
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const value = `${year}-${month}`;
            const label = `${year}年${month}月`;

            const option = document.createElement('option');
            option.value = value;
            option.textContent = label;
            this.monthSelect.appendChild(option);
        }
    }

    /**
     * アラート表示
     * @param {string} message - メッセージ
     * @param {string} type - アラートタイプ
     */
    showAlert(message, type = 'info') {
        // グローバルな showAlert 関数が存在する場合はそちらを使用
        if (typeof window.showAlert === 'function') {
            window.showAlert(message, type);
            return;
        }

        const alertContainer = document.getElementById('alertContainer');
        if (!alertContainer) return;

        // 既存のアラートをクリア
        alertContainer.innerHTML = '';

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
}

// グローバルインスタンスを作成
global.dashboardScreen = new DashboardScreen();
})(window);
