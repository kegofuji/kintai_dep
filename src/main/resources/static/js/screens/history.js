/**
 * 勤怠履歴画面モジュール
 */
const HISTORY_CALENDAR_RANGE = {
    start: { year: 2025, month: 0 },
    end: { year: 2099, month: 11 }
};




class HistoryScreen {
    constructor() {
        this.historyMonthSelect = null;
        this.previousMonthButton = null;
        this.todayButton = null;
        this.nextMonthButton = null;
        this.currentMonthLabel = null;
        this.monthlySubmitHistoryBtn = null;
        this.historyTableBody = null;
        this.calendarGrid = null;
        // 休日参照のために、勤務パターンに基づく勤務日判定関数を公開
        window.isWorkingDayByPattern = (date) => {
            try {
                if (!date) return null;
                const d = new Date(date);
                const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                const isHoliday = this.isHoliday(d);

                // 当月読み込み済みの勤務パターンから日付に対応するものを優先的に使用
                if (typeof this.getWorkPatternRequestForDate === 'function' && typeof this.formatDateString === 'function') {
                    const dateKey = this.formatDateString(d);
                    let entry = this.getWorkPatternRequestForDate(dateKey);
                    // 履歴画面未初期化時でも holiday 側の共有キャッシュから参照
                    if ((!entry || !entry.request) && Array.isArray(window._workPatternForHoliday)) {
                        entry = window._workPatternForHoliday.find(it => it.date === dateKey);
                    }
                    if (entry && entry.request && typeof this.isDateInWorkPattern === 'function') {
                        // 祝日かつ applyHoliday=false は非勤務日（バックエンドの規約に合わせる）
                        if (isHoliday && entry.request.applyHoliday === false) {
                            return false;
                        }
                        const inPattern = this.isDateInWorkPattern(d, entry.request, isWeekend, isHoliday);
                        return !!inPattern; // true=勤務日, false=休日
                    }
                }

                // 後方互換: 単一の currentWorkPattern が設定されている場合
                if (this.currentWorkPattern && typeof this.isDateInWorkPattern === 'function') {
                    if (isHoliday && this.currentWorkPattern.request && this.currentWorkPattern.request.applyHoliday === false) {
                        return false;
                    }
                    const inPattern = this.isDateInWorkPattern(d, this.currentWorkPattern.request, isWeekend, isHoliday);
                    return !!inPattern;
                }
            } catch (_) {}
            return null; // 判定できない場合
        };
        const initial = this.clampDateToRange(new Date());
        this.currentYear = initial.year;
        this.currentMonth = initial.month;
        this.attendanceData = [];
        this.vacationRequests = [];
        this.adjustmentRequests = [];
        this.workPatternRequests = [];
        this.holidayRequests = [];
        this.customHolidays = [];
        this.vacationRequestRawMap = new Map();
        this.holidayRequestRawMap = new Map();
        this.activeVacationDates = new Set();
        this.adjustmentCancelButton = null;
        this.vacationCancelButton = null;
        this.adjustmentResubmitButton = null;
        this.vacationResubmitButton = null;
        this.currentAdjustmentDetail = null;
        this.currentVacationDetail = null;
        this.eventsBound = false;
        this.realtimeTimer = null;
        this.currentSnapshot = '';
        this.pollIntervalMs = 1000;
        this.visibilityChangeHandler = null;
        this.pollingInProgress = false;
        this.attendanceDetailCache = new Map();
        this.dayActionMenu = null;
        this.activeActionButton = null;
        this.actionMenuListenersBound = false;
        this.ignoreDocumentClickForCurrentEvent = false;
        this.handleDocumentClickBound = this.handleDocumentClick.bind(this);
        this.handleWindowScrollBound = this.handleWindowScroll.bind(this);
        this.handleKeydownBound = this.handleKeydown.bind(this);
        this.selectedDateString = null; // 現在選択されている日付（YYYY-MM-DD形式）
        this.isInitialDateSelection = true; // 初回の日付選択かどうか
        this.menuOpenedAt = null; // メニューを開いた時刻（タイムスタンプ）
        this.menuMinDisplayTimeMs = 5000; // メニューの最低表示時間（5秒）
        this.calendarActionDefinitions = [
            { key: 'adjustment', path: '/adjustment', label: '打刻修正申請', icon: '' },
            { key: 'vacation', path: '/vacation', label: '休暇申請', icon: '' },
            { key: 'workPattern', path: '/work-pattern', label: '勤務時間変更', icon: '' },
            { key: 'holiday', path: '/holiday', label: '休日関連申請', icon: '' }
        ];
    }

    /**
     * 初期化
     */
    async init() {
        this.initializeElements();
        this.setupEventListeners();
        this.setupModalActions();

        // ルーターからの年月プレフィルを反映（/history/YYYYMM 対応）
        const navigationPrefill = typeof window.consumeNavigationPrefill === 'function'
            ? window.consumeNavigationPrefill('/history')
            : null;
        if (navigationPrefill && typeof navigationPrefill.year === 'number' && typeof navigationPrefill.month === 'number') {
            const y = navigationPrefill.year;
            const m = navigationPrefill.month - 1; // 内部表現は0始まり
            if (!Number.isNaN(y) && !Number.isNaN(m) && m >= 0 && m < 12) {
                this.currentYear = y;
                this.currentMonth = m;
            }
        }

        this.generateMonthOptions();
        // URL を /history/YYYYMM に整形
        this.updateUrlForCurrentMonth(true);
        await this.loadCalendarData(true); // 初回読み込み時はカレンダーを生成
        // 休日画面用の勤務パターンキャッシュを先に用意（初期表示の同期用）
        try {
            if (typeof this.loadWorkPatternRequests === 'function') {
                await this.loadWorkPatternRequests();
                // holiday.js が先に初期化されているケースも考慮し、共有キャッシュへコピー
                if (Array.isArray(this.workPatternRequests)) {
                    window._workPatternForHoliday = this.workPatternRequests.slice();
                }
            }
        } catch (_) {}
        this.currentSnapshot = this.calculateSnapshot();
        this.startRealtimePolling(true);
        // 初期の月末申請ボタン状態を反映（関数が存在する場合のみ）
        const selectedMonth = this.historyMonthSelect?.value;
        if (selectedMonth && typeof this.updateMonthlySubmitButton === 'function') {
            await this.updateMonthlySubmitButton(selectedMonth);
        } else if (typeof this.hideMonthlySubmitButton === 'function') {
            // 月が選択されていない場合はボタンを非表示
            this.hideMonthlySubmitButton();
        }
        
        // 初期化完了後にカレンダーが表示されているか確認
        setTimeout(() => {
            const calendarGrid = document.getElementById('calendarGrid');
            if (calendarGrid && calendarGrid.children.length === 0 && this.calendarGrid) {
                console.log('初期化完了後、カレンダーが空のため再生成します');
                this.generateCalendar();
            }
        }, 200);
        
        // 管理者が閲覧している場合はタイトルを更新
        this.updateHistoryTitle();
        
        this.initialized = true;
    }

    /**
     * 現在の年月に基づき URL を /history/YYYYMM に更新
     * @param {boolean} replace - true: replaceState, false: pushState
     */
    updateUrlForCurrentMonth(replace = true) {
        try {
            const yyyy = String(this.currentYear);
            const mm = String(this.currentMonth + 1).padStart(2, '0');
            const target = `/history/${yyyy}${mm}`;
            const state = { path: '/history' };
            if (replace) {
                window.history.replaceState(state, '', target);
            } else {
                window.history.pushState(state, '', target);
            }
        } catch (_) {
            // no-op
        }
    }

    /**
     * DOM要素の初期化
     */
    initializeElements() {
        this.historyMonthSelect = document.getElementById('historyMonthSelect');
        this.historyRefreshBtn = document.getElementById('historyRefreshBtn');
        this.previousMonthButton = document.getElementById('historyPrevMonthBtn');
        this.todayButton = document.getElementById('historyTodayBtn');
        this.nextMonthButton = document.getElementById('historyNextMonthBtn');
        this.currentMonthLabel = document.getElementById('historyCurrentMonthLabel');
        this.monthlySubmitHistoryBtn = document.getElementById('monthlySubmitHistoryBtn');
        this.historyTableBody = document.getElementById('historyTableBody');
        this.calendarGrid = document.getElementById('calendarGrid');
        this.adjustmentCancelButton = document.getElementById('adjustmentCancelButton');
        this.vacationCancelButton = document.getElementById('vacationCancelButton');
        this.adjustmentResubmitButton = document.getElementById('adjustmentResubmitButton');
        this.vacationResubmitButton = document.getElementById('vacationResubmitButton');
        
        // calendarGrid要素が見つからない場合のデバッグ情報とフォールバック
        if (!this.calendarGrid) {
            console.error('calendarGrid要素が見つかりません。DOM要素の確認が必要です。');
            console.log('現在のDOM構造:', document.querySelector('#calendarGrid'));
            console.log('historyScreenのDOM要素確認:', document.querySelector('#historyScreen'));
            
            // 少し待ってから再試行
            setTimeout(() => {
                this.calendarGrid = document.getElementById('calendarGrid');
                if (this.calendarGrid) {
                    console.log('再試行でcalendarGrid要素を取得しました:', this.calendarGrid);
                } else {
                    console.error('再試行後もcalendarGrid要素が見つかりません');
                }
            }, 100);
        } else {
            console.log('calendarGrid要素を正常に取得しました:', this.calendarGrid);
        }

        if (this.calendarGrid && !this.calendarGrid.dataset.actionBound) {
            this.calendarGrid.addEventListener('click', (event) => this.handleCalendarGridClick(event));
            this.calendarGrid.dataset.actionBound = 'true';
        }
    }

    /**
     * イベントリスナー設定
     */
    setupEventListeners() {
        if (this.eventsBound) return;
        if (this.monthlySubmitHistoryBtn) {
            this.monthlySubmitHistoryBtn.addEventListener('click', () => {
                const action = this.monthlySubmitHistoryBtn.dataset.action || 'submit';
                if (action === 'cancel') {
                    this.handleMonthlyCancel();
                } else {
                    this.handleMonthlySubmit();
                }
            });
        }

        // ドロップダウンの変更イベント
        if (this.historyMonthSelect) {
            this.historyMonthSelect.addEventListener('change', () => this.handleMonthSelectChange());
        }

        if (this.previousMonthButton) {
            this.previousMonthButton.addEventListener('click', async () => {
                await this.navigateMonth(-1);
            });
        }

        if (this.todayButton) {
            this.todayButton.addEventListener('click', async () => {
                await this.goToToday();
            });
        }

        if (this.nextMonthButton) {
            this.nextMonthButton.addEventListener('click', async () => {
                await this.navigateMonth(1);
            });
        }

        // 更新ボタンのクリックイベント
        if (this.historyRefreshBtn) {
            this.historyRefreshBtn.addEventListener('click', async () => {
                const success = await this.handleRefreshButton(this.historyRefreshBtn, () => this.loadCalendarData(true));
                if (!success) {
                    this.showAlert('更新に失敗しました', 'danger');
                }
            });
        }
        this.eventsBound = true;
    }

    /**
     * 詳細モーダルのイベント設定
     */
    setupModalActions() {
        if (this.adjustmentCancelButton && !this.adjustmentCancelButton.dataset.bound) {
            this.adjustmentCancelButton.addEventListener('click', () => this.handleAdjustmentCancel());
            this.adjustmentCancelButton.dataset.bound = 'true';
        }

        if (this.vacationCancelButton && !this.vacationCancelButton.dataset.bound) {
            this.vacationCancelButton.addEventListener('click', () => this.handleVacationCancel());
            this.vacationCancelButton.dataset.bound = 'true';
        }

        if (this.adjustmentResubmitButton && !this.adjustmentResubmitButton.dataset.bound) {
            this.adjustmentResubmitButton.addEventListener('click', () => this.handleAdjustmentResubmit());
            this.adjustmentResubmitButton.dataset.bound = 'true';
        }

        if (this.vacationResubmitButton && !this.vacationResubmitButton.dataset.bound) {
            this.vacationResubmitButton.addEventListener('click', () => this.handleVacationResubmit());
            this.vacationResubmitButton.dataset.bound = 'true';
        }
    }

    /**
     * カレンダーデータ読み込み
     * @param {boolean} shouldRegenerate - カレンダーを再生成するかどうか（デフォルト: false）
     */
    async loadCalendarData(shouldRegenerate = false) {
        if (!window.currentEmployeeId) {
            console.warn('従業員IDが取得できません');
            return false;
        }

        const selectedMonth = this.historyMonthSelect?.value;
        let url = `/api/attendance/history/${window.currentEmployeeId}`;
        
        if (selectedMonth) {
            const [year, month] = selectedMonth.split('-');
            url += `?year=${year}&month=${parseInt(month, 10)}`;
        }

        let success = true;
        try {
            const data = await fetchWithAuth.handleApiCall(
                () => fetchWithAuth.get(url),
                '勤怠履歴の取得に失敗しました'
            );

            if (data && data.success) {
                this.attendanceData = data.data || [];
                console.log('勤怠履歴データ取得成功:', this.attendanceData.length, '件');
            } else {
                // APIが失敗した場合はモックデータを使用せず、実データのみ表示
                this.attendanceData = [];
                console.log('勤怠履歴データ取得失敗、空配列で継続');
            }

            // 休暇申請データも読み込み（履歴カレンダー用）
            await this.loadVacationRequests();

            // 打刻修正申請データも読み込み（履歴カレンダー用）
            await this.loadAdjustmentRequests();
            
            // 勤務時間変更申請データも読み込み（履歴カレンダー用）
            await this.loadWorkPatternRequests();
            
            // 休日出勤・振替休日出勤申請データも読み込み（履歴カレンダー用）
            await this.loadHolidayRequests();
            
            // カスタム休日データも読み込み（履歴カレンダー用）
            await this.loadCustomHolidays();
            
            // カレンダーを再生成（shouldRegenerateがtrueの場合のみ）
            if (shouldRegenerate) {
                this.generateCalendar();
            }
            
        } catch (error) {
            success = false;
            console.error('勤怠履歴読み込みエラー:', error);
            // エラーの場合もモックデータは使用しない
            this.attendanceData = [];
            console.log('エラーにより勤怠データは空で継続、申請データは別途読み込み');
            
            // 申請データは独立して読み込み
            try {
                await this.loadVacationRequests();
                await this.loadAdjustmentRequests();
                await this.loadWorkPatternRequests();
                await this.loadHolidayRequests();
                await this.loadCustomHolidays();
            } catch (appError) {
                console.error('申請データ読み込みエラー:', appError);
                this.vacationRequests = [];
                this.adjustmentRequests = [];
                this.workPatternRequests = [];
                this.holidayRequests = [];
                this.customHolidays = [];
            }
            
            // エラーが発生した場合でも、shouldRegenerateがtrueの場合はカレンダーを生成
            if (shouldRegenerate) {
                console.log('エラー発生時でもカレンダーを生成します');
                this.generateCalendar();
            }
        }
        return success;
    }

    /**
     * 更新ボタンの共通ハンドリング
     * @param {HTMLButtonElement} button
     * @param {() => Promise<boolean|void>} taskFn
     * @returns {Promise<boolean>}
     */
    async handleRefreshButton(button, taskFn) {
        if (!button || typeof taskFn !== 'function') {
            return false;
        }

        const originalHtml = button.dataset.originalHtml || button.innerHTML;
        button.dataset.originalHtml = originalHtml;
        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>更新中...';

        let success = true;
        let caughtError = null;

        try {
            const result = await taskFn();
            if (result === false || (result && typeof result === 'object' && result.success === false)) {
                success = false;
            }
        } catch (error) {
            success = false;
            caughtError = error;
            console.error('更新処理でエラーが発生しました:', error);
        }

        if (success) {
            button.innerHTML = '<i class="fas fa-check me-1"></i>更新完了';
            setTimeout(() => {
                button.innerHTML = originalHtml;
                button.disabled = false;
            }, 1000);
        } else {
            button.innerHTML = '<i class="fas fa-exclamation-triangle me-1"></i>更新失敗';
            setTimeout(() => {
                button.innerHTML = originalHtml;
                button.disabled = false;
            }, 2000);
        }

        if (caughtError == null && success === false) {
            console.warn('更新処理は失敗として扱われました');
        }

        return success;
    }

    /**
     * 深夜勤務分を推定（サーバー値が欠落している場合はフロントで再計算）
     * @param {Object} record
     * @returns {number}
     */
    resolveNightMinutes(record) {
        if (!record) {
            return 0;
        }
        const directValue = record.nightWorkMinutes ?? record.nightShiftMinutes;
        let normalized = TimeUtils.normalizeMinutesValue(directValue);
        if (normalized !== null && !Number.isNaN(normalized) && normalized > 0) {
            return normalized;
        }

        if (record.clockInTime && record.clockOutTime) {
            const computed = TimeUtils.calculateNightShiftMinutes(
                record.clockInTime,
                record.clockOutTime,
                record.breakMinutes
            );
            if (computed > 0) {
                normalized = computed;
            }
        }

        return normalized && !Number.isNaN(normalized) ? normalized : 0;
    }

    /**
     * 勤怠履歴読み込み
     */
    async loadAttendanceHistory() {
        if (!window.currentEmployeeId) {
            this.showAlert('従業員IDが取得できません', 'danger');
            return;
        }

        this.invalidateAttendanceDetailCache();

        const selectedMonth = this.historyMonthSelect?.value;
        let url = `/api/attendance/history/${window.currentEmployeeId}`;
        
        if (selectedMonth) {
            const [year, month] = selectedMonth.split('-');
            url += `?year=${year}&month=${parseInt(month, 10)}`;
        }

        try {
            const data = await fetchWithAuth.handleApiCall(
                () => fetchWithAuth.get(url),
                '勤怠履歴の取得に失敗しました'
            );

            if (data && data.success) {
                this.attendanceData = Array.isArray(data.data) ? data.data : [];
            } else {
                this.attendanceData = [];
            }

            await this.loadVacationRequests();
            await this.loadAdjustmentRequests();
            await this.loadWorkPatternRequests();
            await this.loadHolidayRequests();

            this.displayAttendanceHistory(this.attendanceData);
        } catch (error) {
            console.error('勤怠履歴読み込みエラー:', error);
            this.attendanceData = [];
            this.displayAttendanceHistory([]);
        }
    }

    /**
     * 新規社員かどうかを判定する関数
     * @returns {boolean} - 新規社員の場合true
     */
    isNewEmployee() {
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

    /**
     * モック勤怠データ生成
     * @param {string} month - 対象月（YYYY-MM形式）
     * @returns {Array} - モックデータ
     */
    generateMockAttendanceData(month = null) {
        // 新規作成された社員の場合は空のデータを返す（勤怠データは存在しない）
        if (this.isNewEmployee()) {
            return [];
        }
        
        const data = [];
        const today = new Date();
        let targetDate = today;

        if (month) {
            const [year, monthNum] = month.split('-');
            targetDate = new Date(year, monthNum - 1, 1);
        }

        // 指定月の日数を取得
        const daysInMonth = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0).getDate();

        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(targetDate.getFullYear(), targetDate.getMonth(), day);
            
            // 土日はスキップ
            if (date.getDay() === 0 || date.getDay() === 6) continue;

            const clockIn = new Date(date);
            clockIn.setHours(9, Math.floor(Math.random() * 30), 0, 0);

            const clockOut = new Date(date);
            clockOut.setHours(18, Math.floor(Math.random() * 60), 0, 0);

            // 残業と深夜勤務のみ計算（遅刻・早退は廃止）
            const clockInMinutes = clockIn.getHours() * 60 + clockIn.getMinutes();
            const clockOutMinutes = clockOut.getHours() * 60 + clockOut.getMinutes();
            const workedMinutes = Math.max(0, clockOutMinutes - clockInMinutes);
            const nightWorkMinutes = Math.max(0, clockOutMinutes - (22 * 60)); // 22:00以降の深夜
            const overtimeMinutes = Math.max(0, workedMinutes - (8 * 60));

            // 日本時間での日付文字列を生成（UTC変換を避ける）
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const dateStr = `${year}-${month}-${day}`;
            
            data.push({
                attendanceDate: dateStr,
                clockInTime: clockIn.toISOString(),
                clockOutTime: clockOut.toISOString(),
                lateMinutes: null,
                earlyLeaveMinutes: null,
                overtimeMinutes: overtimeMinutes,
                nightWorkMinutes: nightWorkMinutes
            });
        }

        return data;
    }

    /**
     * 勤怠履歴表示
     * @param {Array} data - 勤怠データ
     */
    displayAttendanceHistory(data) {
        if (!this.historyTableBody) return;

        this.historyTableBody.innerHTML = '';

        // データがない場合でも、ヘッダ列のみ表示（空のテーブル本体）
        if (data.length === 0) {
            return;
        }

        const updatedKeys = [];

        data.forEach(record => {
            const dateKey = this.normalizeDateKey(record.attendanceDate);
            const detail = this.getAttendanceDetailForDate(dateKey, {
                attendanceOverride: record,
                includeVacations: true,
                force: true
            });

            if (!detail) {
                return;
            }

            updatedKeys.push(detail.dateKey);

            const row = document.createElement('tr');
            row.classList.add('attendance-row');
            row.dataset.dateKey = detail.dateKey;

            row.innerHTML = `
                <td>${detail.dateDisplay}</td>
                <td>${detail.clockInDisplay}</td>
                <td>${detail.clockOutDisplay}</td>
                <td>${detail.breakDisplay}</td>
                <td>${detail.workingDisplay}</td>
                <td>${detail.lateDisplay}</td>
                <td>${detail.earlyLeaveDisplay}</td>
                <td>${detail.overtimeDisplay}</td>
                <td>${detail.nightDisplay}</td>
            `;

            this.historyTableBody.appendChild(row);
        });

        if (updatedKeys.length > 0) {
            this.notifyAttendanceDetailUpdate(updatedKeys);
        }
    }

    /**
     * ドロップダウン月選択変更時の処理
     */
    async handleMonthSelectChange() {
        const selectedMonth = this.historyMonthSelect?.value;
        
        if (!selectedMonth) return;
        
        const [year, month] = selectedMonth.split('-');
        const clamped = this.clampYearMonth(parseInt(year, 10), parseInt(month, 10) - 1);
        this.currentYear = clamped.year;
        this.currentMonth = clamped.month; // JavaScriptの月は0ベース

        this.syncMonthSelect();

        // URL も更新
        this.updateUrlForCurrentMonth(true);
        await this.loadCalendarData(true); // 月変更時はカレンダーを再生成

    }

    /**
     * 月移動ボタンクリック時の処理
     * @param {number} offset - 現在月からのオフセット（例: -1 = 前月, 1 = 次月）
     */
    async navigateMonth(offset) {
        if (!Number.isInteger(offset) || offset === 0) {
            return;
        }

        const tentative = new Date(this.currentYear, this.currentMonth + offset, 1);
        const target = this.clampYearMonth(tentative.getFullYear(), tentative.getMonth());

        if (target.year === this.currentYear && target.month === this.currentMonth) {
            return;
        }

        this.currentYear = target.year;
        this.currentMonth = target.month;
        this.syncMonthSelect();
        this.updateUrlForCurrentMonth(true);
        await this.loadCalendarData(true);
    }

    /**
     * 今日ボタン押下時の処理
     */
    async goToToday() {
        const now = new Date();
        const today = this.clampDateToRange(now);
        const daysInTargetMonth = new Date(today.year, today.month + 1, 0).getDate();
        const dayForSelection = Math.min(now.getDate(), daysInTargetMonth);
        const targetDate = new Date(today.year, today.month, dayForSelection);

        this.selectedDateString = this.formatDateString(targetDate);
        this.isInitialDateSelection = false;

        if (today.year === this.currentYear && today.month === this.currentMonth) {
            if (this.calendarGrid) {
                const todayCell = this.calendarGrid.querySelector(`.calendar-day[data-date="${this.selectedDateString}"]`);
                if (todayCell) {
                    this.updateSelectedDate(todayCell);
                    this.filterAttendanceTableByDate(this.selectedDateString);
                }
            }
            await this.loadCalendarData(true);
            return;
        }

        this.currentYear = today.year;
        this.currentMonth = today.month;
        this.syncMonthSelect();
        this.updateUrlForCurrentMonth(true);
        await this.loadCalendarData(true);
    }

    /**
     * 月選択プルダウンの表示値を現在年月に合わせる
     */
    syncMonthSelect() {
        if (this.historyMonthSelect) {
            const normalizedValue = this.formatYearMonth(this.currentYear, this.currentMonth);
            if (this.historyMonthSelect.value !== normalizedValue) {
                this.historyMonthSelect.value = normalizedValue;
            }
        }
        this.updateMonthLabel();
    }

    /**
     * カードヘッダーの現在月表示を更新
     */
    updateMonthLabel() {
        if (!this.currentMonthLabel) return;
        if (typeof this.currentYear !== 'number' || typeof this.currentMonth !== 'number') {
            this.currentMonthLabel.textContent = '--';
            return;
        }
        try {
            const year = this.currentYear || new Date().getFullYear();
            const month = (this.currentMonth ?? 0) + 1;
            this.currentMonthLabel.textContent = `${year}/${String(month).padStart(2, '0')}`;
        } catch (error) {
            const year = this.currentYear || new Date().getFullYear();
            const month = (this.currentMonth ?? 0) + 1;
            this.currentMonthLabel.textContent = `${year}/${String(month).padStart(2, '0')}`;
        }
    }




    /**
     * 月選択オプション生成
     */
    generateMonthOptions() {
        if (!this.historyMonthSelect) return;

        // 既存のオプションをクリア（最初のオプション以外）
        while (this.historyMonthSelect.children.length > 1) {
            this.historyMonthSelect.removeChild(this.historyMonthSelect.lastChild);
        }

        const selected = this.clampYearMonth(this.currentYear, this.currentMonth);
        const startIndex = this.getMonthIndex(HISTORY_CALENDAR_RANGE.start.year, HISTORY_CALENDAR_RANGE.start.month);
        const endIndex = this.getMonthIndex(HISTORY_CALENDAR_RANGE.end.year, HISTORY_CALENDAR_RANGE.end.month);

        for (let index = startIndex; index <= endIndex; index++) {
            const year = Math.floor(index / 12);
            const month = index % 12;
            const value = this.formatYearMonth(year, month);
            const option = document.createElement('option');
            option.value = value;
            option.textContent = `${year}/${String(month + 1).padStart(2, '0')}`;

            if (year === selected.year && month === selected.month) {
                option.selected = true;
            }

            this.historyMonthSelect.appendChild(option);
        }

        const normalizedValue = this.formatYearMonth(selected.year, selected.month);
        if (this.historyMonthSelect.value !== normalizedValue) {
            this.historyMonthSelect.value = normalizedValue;
        }

        this.currentYear = selected.year;
        this.currentMonth = selected.month;
        this.updateMonthLabel();
    }

    /**
     * 分数を時間:分形式に変換
     * @param {number} minutes - 分数
     * @returns {string} - 時間:分形式の文字列
     */
    // formatMinutesToTime関数はtimeUtils.jsに移動しました

    /**
     * アラート表示
     * @param {string} message - メッセージ
     * @param {string} type - アラートタイプ
     */
    showAlert(message, type = 'info') {
        const alertContainer = document.getElementById('alertContainer');
        if (!alertContainer) return;

        // 既存のアラートをクリアして重複表示を防止
        while (alertContainer.firstChild) {
            alertContainer.removeChild(alertContainer.firstChild);
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

    /**
     * カレンダー生成
     */
    generateCalendar() {
        console.log('generateCalendar呼び出し - calendarGrid:', this.calendarGrid);
        
        if (!this.calendarGrid) {
            console.warn('calendarGrid要素が見つかりません。再取得を試みます。');
            // 要素の再取得を試行
            this.calendarGrid = document.getElementById('calendarGrid');
            if (!this.calendarGrid) {
                console.error('calendarGrid要素の再取得に失敗しました。要素のIDは「calendarGrid」です。');
                return;
            }
            console.log('calendarGrid要素を再取得しました:', this.calendarGrid);
        }

        // デバッグ用：データ読み込み状況を確認
        console.log('=== カレンダー生成開始 ===');
        console.log('現在の年月:', this.currentYear, '/', this.currentMonth + 1);
        console.log('休暇申請データ:', this.vacationRequests?.length || 0, '件');
        console.log('打刻修正申請データ:', this.adjustmentRequests?.length || 0, '件');
        console.log('休日出勤・振替休日出勤申請データ:', this.holidayRequests?.length || 0, '件');
        console.log('勤怠データ:', this.attendanceData?.length || 0, '件');

        // 既存のカレンダー内容をクリア
        this.calendarGrid.innerHTML = '';

        // 曜日ヘッダー
        const weekdays = ['月', '火', '水', '木', '金', '土', '日'];
        const headerHtml = weekdays.map((day, index) => {
            // 土日（index 5, 6）で、勤務時間変更申請の対象期間内の場合は赤字
            const isWeekend = index === 5 || index === 6; // 土=5, 日=6
            const isInWorkPatternPeriod = this.isWeekendInWorkPatternPeriod(index);
            const className = isWeekend && isInWorkPatternPeriod ? 'calendar-header text-danger' : 'calendar-header';
            return `<div class="${className}">${day}</div>`;
        }).join('');

        // 月の最初の日と最後の日
        const firstDay = new Date(this.currentYear, this.currentMonth, 1);
        const lastDay = new Date(this.currentYear, this.currentMonth + 1, 0);

        // 月曜始まりのカレンダー計算
        const mondayOffset = (firstDay.getDay() + 6) % 7; // Mon=0 ... Sun=6
        const startDate = new Date(firstDay);
        startDate.setDate(startDate.getDate() - mondayOffset);
        const totalCells = Math.ceil((mondayOffset + lastDay.getDate()) / 7) * 7;

        let calendarHtml = headerHtml;

        for (let index = 0; index < totalCells; index++) {
            const currentDate = new Date(startDate);
            currentDate.setDate(startDate.getDate() + index);

            const isCurrentMonth = currentDate.getFullYear() === this.currentYear
                && currentDate.getMonth() === this.currentMonth;

            if (!isCurrentMonth) {
                calendarHtml += `<div class="calendar-empty"></div>`;
                continue;
            }

            const isToday = this.isToday(currentDate);
            const weekday = currentDate.getDay();
            const isWeekend = weekday === 0 || weekday === 6;
            const isHoliday = this.isHoliday(currentDate);
            const dateString = this.formatDateString(currentDate);

            const attendance = this.getAttendanceForDate(dateString);
            const vacationRequest = this.getVacationRequestForDate(dateString);
            const adjustmentRequest = this.getAdjustmentRequestForDate(dateString);
            const workPatternRequest = this.getWorkPatternRequestForDate(dateString);
            const holidayRequest = this.getHolidayRequestForDate(dateString);
            const customHoliday = this.getCustomHolidayForDate(dateString);

            let hasApprovedWorkPattern = false;
            let isWorkPatternHoliday = false;
            let isNonWorkingDay = false;

            let dayClasses = ['calendar-day'];
            if (isToday) dayClasses.push('today');
            if (weekday === 0) dayClasses.push('sunday');
            if (weekday === 6) dayClasses.push('saturday');
            if (isWeekend) dayClasses.push('weekend');
            if (isHoliday) dayClasses.push('holiday');

            let badges = '';
            let customHolidayLabel = '';
            let holidayLabel = '';
            let attendanceInfoHtml = '';
            let styleAttr = 'cursor: pointer;';
            const titleAttr = 'クリックして詳細を表示';

            // デバッグ用：勤務時間変更申請のデータを確認
            if (workPatternRequest) {
                console.log(`${dateString}: 勤務時間変更申請データ:`, workPatternRequest);
            }

            // デバッグ用：打刻修正申請のデータを確認
            if (adjustmentRequest) {
                console.log(`日付 ${dateString} の打刻修正申請:`, adjustmentRequest);
            }

            if (workPatternRequest && workPatternRequest.status === 'APPROVED' && workPatternRequest.request) {
                hasApprovedWorkPattern = true;
                const isInWorkPattern = this.isDateInWorkPattern(currentDate, workPatternRequest.request, isWeekend, isHoliday);
                isWorkPatternHoliday = !isInWorkPattern;
                console.log(`${dateString}: 勤務時間変更申請あり - isInWorkPattern: ${isInWorkPattern}, isWorkPatternHoliday: ${isWorkPatternHoliday}`);
            }

            if (hasApprovedWorkPattern) {
                isNonWorkingDay = isWorkPatternHoliday;
            } else {
                isNonWorkingDay = isWeekend || isHoliday;
            }

            if (attendance) dayClasses.push('has-attendance');
            if (attendance && attendance.clockOutTime) dayClasses.push('clocked-out');
            if (attendance && attendance.clockInTime && !attendance.clockOutTime) dayClasses.push('clocked-in');

            if (attendance) {
                console.log(`日付 ${dateString}: 勤怠データあり`, {
                    clockInTime: attendance.clockInTime,
                    clockOutTime: attendance.clockOutTime,
                    attendanceDate: attendance.attendanceDate
                });
            } else {
                console.log(`日付 ${dateString}: 勤怠データなし`);
            }
            if (vacationRequest || adjustmentRequest || holidayRequest) {
                console.log(`日付 ${dateString}: 申請あり`, { 
                    vacationRequest: vacationRequest ? `${vacationRequest.status}` : 'なし',
                    adjustmentRequest: adjustmentRequest ? `${adjustmentRequest.status}` : 'なし'
                });
            }

            if (vacationRequest && !isNonWorkingDay) {
                const statusUpper = (vacationRequest.status || '').toUpperCase();
                let statusClass = 'bg-secondary';
                let statusLabel = '申請';
                switch (statusUpper) {
                    case 'APPROVED':
                        statusClass = 'bg-success';
                        statusLabel = '承認済';
                        break;
                    case 'PENDING':
                        statusClass = 'bg-warning';
                        statusLabel = '申請中';
                        break;
                    case 'REJECTED':
                        statusClass = 'bg-danger';
                        statusLabel = '却下';
                        break;
                    default:
                        statusClass = 'bg-secondary';
                        statusLabel = statusUpper || '申請';
                }

                const leaveTypeText = LEAVE_TYPE_LABELS[vacationRequest.leaveType] || '有休';
                const unitLabel = LEAVE_TIME_UNIT_LABELS[vacationRequest.timeUnit] || '';
                const unitMarker = LEAVE_TIME_UNIT_MARKERS[vacationRequest.timeUnit] || '';

                let badgeMain;
                if (statusUpper === 'PENDING') {
                    if (leaveTypeText === '有休') {
                        badgeMain = unitMarker ? `${unitMarker}申請中` : '有休申請中';
                    } else {
                        badgeMain = `${leaveTypeText}休暇申請中`;
                    }
                } else {
                    if (leaveTypeText === '有休') {
                        badgeMain = unitMarker ? `${unitMarker}${statusLabel}` : `有休${statusLabel}`;
                    } else {
                        badgeMain = unitLabel ? `${leaveTypeText}（${unitLabel}） ${statusLabel}` : `${leaveTypeText}休暇${statusLabel}`;
                    }
                }

                const badgeText = badgeMain;
                const dataAttrs = [
                    `data-vacation-id="${vacationRequest.vacationId || ''}"`,
                    `data-status="${vacationRequest.status}"`,
                    `data-date="${dateString}"`,
                    `data-leave-type="${vacationRequest.leaveType || ''}"`,
                    `data-time-unit="${vacationRequest.timeUnit || ''}"`
                ].join(' ');
                badges += `<span class="badge ${statusClass} badge-sm vacation-badge clickable" ${dataAttrs} title="クリックして申請内容を確認">${badgeText}</span>`;
            }

            if (adjustmentRequest) {
                let statusClass, label, title;

                switch (adjustmentRequest.status) {
                    case 'APPROVED':
                        statusClass = 'bg-success';
                        label = '承認済';
                        title = 'クリックして申請内容を確認';
                        break;
                    case 'REJECTED':
                        statusClass = 'bg-danger';
                        label = '却下';
                        title = 'クリックして却下理由を確認';
                        break;
                    default: // PENDING
                        statusClass = 'bg-warning';
                        label = '申請中';
                        title = 'クリックして申請内容を確認';
                }

                const dataAttrs = `data-adjustment-date="${dateString}" data-status="${adjustmentRequest.status}" data-adjustment-id="${adjustmentRequest.adjustmentRequestId}" data-rejection-comment="${adjustmentRequest.rejectionComment || ''}"`;
                badges += `<span class="badge ${statusClass} badge-sm adjustment-badge clickable" ${dataAttrs} title="${title}">打刻修正${label}</span>`;
            }

            if (holidayRequest) {
                console.log(`日付 ${dateString}: 休日出勤・振替休日出勤申請表示`, holidayRequest);
                let statusClass, label, title, requestTypeLabel;

                switch (holidayRequest.status) {
                    case 'APPROVED':
                        statusClass = 'bg-success';
                        label = '承認済';
                        title = 'クリックして申請内容を確認';
                        break;
                    case 'REJECTED':
                        statusClass = 'bg-danger';
                        label = '却下';
                        title = 'クリックして却下理由を確認';
                        break;
                    default: // PENDING
                        statusClass = 'bg-warning';
                        label = '申請中';
                        title = 'クリックして申請内容を確認';
                }

                if (holidayRequest.requestType === 'HOLIDAY_WORK') {
                    requestTypeLabel = '休日出勤';
                } else if (holidayRequest.requestType === 'TRANSFER') {
                    requestTypeLabel = '振替';
                } else {
                    requestTypeLabel = '休日関連';
                }

                const dataAttrs = `data-holiday-date="${dateString}" data-status="${holidayRequest.status}" data-holiday-id="${holidayRequest.holidayId}" data-request-type="${holidayRequest.requestType}" data-rejection-comment="${holidayRequest.request?.rejectionComment || ''}"`;
                badges += `<span class="badge ${statusClass} badge-sm holiday-badge clickable" ${dataAttrs} title="${title}">${requestTypeLabel}${label}</span>`;
            }

            if (customHoliday) {
                customHolidayLabel = `<div class="holiday-label text-danger fw-semibold">${customHoliday.holidayType}</div>`;
            }

            if (isNonWorkingDay && !customHoliday) {
                const approvedHolidayReq = this.holidayRequests.find(r => r.date === dateString && (r.status || '').toUpperCase() === 'APPROVED');
                if (!approvedHolidayReq) {
                    holidayLabel = '<div class="holiday-label text-danger fw-semibold">休日</div>';
                }
            }

            if (hasApprovedWorkPattern) {
                styleAttr += ' background-color: white !important;';
            }

            if (attendance || adjustmentRequest?.status === 'APPROVED') {
                attendanceInfoHtml = this.renderAttendanceInfo(attendance, dateString, adjustmentRequest);
            }

            calendarHtml += `
                <div class="${dayClasses.join(' ')}" data-date="${dateString}" style="${styleAttr}" title="${titleAttr}">
                    <div class="calendar-day-content">
                        <div class="day-header">
                            <div class="day-number">${currentDate.getDate()}</div>
                            ${customHolidayLabel}
                            ${holidayLabel}
                        </div>
                        <div class="day-badges">${badges}</div>
                        ${attendanceInfoHtml}
                    </div>
                    <button type="button" class="calendar-add-btn" data-date="${dateString}" aria-label="${dateString}の申請を追加" aria-haspopup="menu" aria-expanded="false">
                        <i class="fas fa-plus" aria-hidden="true"></i>
                    </button>
                </div>
            `;
        }

        this.calendarGrid.innerHTML = calendarHtml;
        this.hideActionMenu();
        this.ensureActionMenu();
        console.log('カレンダーHTMLを挿入しました。要素数:', this.calendarGrid.children.length);
        console.log('calendarGrid要素の状態:', this.calendarGrid);
        
        // カレンダーの日付クリックイベントを設定
        this.setupCalendarClickEvents();
        
        // 休暇バッジのクリックイベント（申請詳細）
        this.setupVacationBadgeActions();
        
        // 打刻修正バッジのクリックイベント（申請詳細表示）
        this.setupAdjustmentBadgeActions();

        // 休日出勤・振替休日出勤申請バッジのクリックイベント（申請詳細表示）
        this.setupHolidayBadgeActions();
        
        console.log('=== カレンダー生成完了 ===');

        // 日付選択の復元処理
        try {
            let dateToSelect = null;
            
            // 既に選択されている日付がある場合、それを再選択
            if (this.selectedDateString) {
                const selectedCell = this.calendarGrid.querySelector(`.calendar-day[data-date="${this.selectedDateString}"]`);
                if (selectedCell) {
                    dateToSelect = this.selectedDateString;
                } else {
                    // 選択されていた日付が現在表示中の月に含まれていない場合はクリア
                    this.selectedDateString = null;
                }
            }
            
            // 初回のみ、または選択日付がない場合のみ、今日の日付を自動選択
            if (!dateToSelect && this.isInitialDateSelection) {
                const today = new Date();
                if (this.currentYear === today.getFullYear() && this.currentMonth === today.getMonth()) {
                    const yyyy = today.getFullYear();
                    const mm = String(today.getMonth() + 1).padStart(2, '0');
                    const dd = String(today.getDate()).padStart(2, '0');
                    const todayStr = `${yyyy}-${mm}-${dd}`;
                    const todayCell = this.calendarGrid.querySelector(`.calendar-day[data-date="${todayStr}"]`);
                    if (todayCell) {
                        dateToSelect = todayStr;
                        this.selectedDateString = todayStr;
                    }
                }
            }
            
            // 日付を選択
            if (dateToSelect) {
                const cellToSelect = this.calendarGrid.querySelector(`.calendar-day[data-date="${dateToSelect}"]`);
                if (cellToSelect) {
                    this.updateSelectedDate(cellToSelect);
                    this.filterAttendanceTableByDate(dateToSelect);
                }
            }
        } catch (e) {
            console.warn('日付選択の復元中にエラー:', e);
        }

        this.currentSnapshot = this.calculateSnapshot();
    }

    ensureActionMenu() {
        if (this.dayActionMenu) {
            return this.dayActionMenu;
        }
        if (!Array.isArray(this.calendarActionDefinitions) || this.calendarActionDefinitions.length === 0) {
            return null;
        }
        const menu = document.createElement('div');
        menu.className = 'calendar-action-menu';
        menu.setAttribute('role', 'menu');
        menu.innerHTML = this.calendarActionDefinitions.map(({ key, label, icon }) => {
            const iconHtml = icon ? `<i class="${icon}" aria-hidden="true"></i>` : '';
            return `<button type="button" class="calendar-action-item" data-action="${key}" role="menuitem">${iconHtml}<span>${label}</span></button>`;
        }).join('');
        menu.addEventListener('click', (event) => this.handleActionMenuClick(event));
        document.body.appendChild(menu);
        this.dayActionMenu = menu;
        this.bindActionMenuListeners();
        return menu;
    }

    bindActionMenuListeners() {
        if (this.actionMenuListenersBound) {
            return;
        }
        // バブリングフェーズで処理（プラスボタンのクリック後に発火するようにするため）
        // useCaptureをfalseにすることで、バブリングフェーズで処理され、stopPropagation()が効く
        document.addEventListener('click', this.handleDocumentClickBound, false);
        window.addEventListener('scroll', this.handleWindowScrollBound, true);
        window.addEventListener('resize', this.handleWindowScrollBound, true);
        document.addEventListener('keydown', this.handleKeydownBound);
        this.actionMenuListenersBound = true;
    }

    handleCalendarGridClick(event) {
        const addButton = event.target.closest('.calendar-add-btn');
        if (addButton) {
            // このクリックイベントがドキュメントクリックハンドラーで処理されないようにする
            // 先にフラグを設定することで、バブリングで到達する前に無視される
            this.ignoreDocumentClickForCurrentEvent = true;
            
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            
            const { date } = addButton.dataset;
            this.toggleActionMenu(addButton, date);
        }
    }

    toggleActionMenu(button, dateString) {
        if (!button || !dateString) {
            return;
        }
        const menu = this.ensureActionMenu();
        if (!menu) {
            return;
        }
        const isoDate = this.convertToIsoDate(dateString);
        const alreadyOpen = menu.dataset.visible === 'true'
            && menu.dataset.dateIso === isoDate
            && this.activeActionButton === button;
        if (alreadyOpen) {
            this.hideActionMenu(true); // 同じボタンをクリックした場合は強制的に閉じる
            return;
        }
        this.showActionMenu(button, dateString, isoDate);
    }

    showActionMenu(button, displayDate, isoDate) {
        const menu = this.ensureActionMenu();
        if (!menu) {
            return;
        }

        if (this.activeActionButton && this.activeActionButton !== button) {
            this.activeActionButton.setAttribute('aria-expanded', 'false');
        }

        this.activeActionButton = button;
        button.setAttribute('aria-expanded', 'true');

        menu.dataset.visible = 'true';
        menu.dataset.dateIso = isoDate;
        menu.dataset.dateDisplay = displayDate;
        menu.style.display = 'block';
        menu.style.visibility = 'hidden';

        requestAnimationFrame(() => {
            if (!this.activeActionButton || menu.dataset.visible !== 'true') {
                return;
            }
            const rect = this.activeActionButton.getBoundingClientRect();
            const menuWidth = menu.offsetWidth;
            const menuHeight = menu.offsetHeight;
            const scrollX = window.scrollX || window.pageXOffset || 0;
            const scrollY = window.scrollY || window.pageYOffset || 0;
            const preferredTop = scrollY + rect.bottom + 12;
            const preferredLeft = scrollX + rect.right - menuWidth;

            let top = preferredTop;
            let left = preferredLeft;

            const viewportBottom = scrollY + window.innerHeight;
            if (preferredTop + menuHeight + 8 > viewportBottom) {
                top = Math.max(scrollY + rect.top - menuHeight - 12, scrollY + 8);
            }

            left = Math.max(left, scrollX + 8);

            menu.style.top = `${top}px`;
            menu.style.left = `${left}px`;
            menu.style.visibility = 'visible';
            
            // メニューを開いた時刻を記録
            this.menuOpenedAt = Date.now();
            
            // メニューが完全に表示された後にフラグをリセット（メニューが表示されている間は維持）
            setTimeout(() => {
                // メニューがまだ表示されている場合はフラグを維持
                if (menu.dataset.visible !== 'true') {
                    this.ignoreDocumentClickForCurrentEvent = false;
                } else {
                    // メニューが表示されている間はフラグを維持し、メニューが閉じられた時にリセット
                    // フラグは hideActionMenu でリセットされる
                }
            }, 200);
        });
    }

    hideActionMenu(force = false) {
        if (!this.dayActionMenu || this.dayActionMenu.dataset.visible !== 'true') {
            if (this.activeActionButton) {
                this.activeActionButton.setAttribute('aria-expanded', 'false');
                this.activeActionButton = null;
            }
            // メニューが閉じられたらフラグをリセット
            this.ignoreDocumentClickForCurrentEvent = false;
            this.menuOpenedAt = null;
            return;
        }
        
        // 5秒経過していない場合は閉じない（強制閉じる場合は除く）
        if (!force && this.menuOpenedAt !== null) {
            const elapsed = Date.now() - this.menuOpenedAt;
            if (elapsed < this.menuMinDisplayTimeMs) {
                // まだ5秒経過していないので閉じない
                return;
            }
        }
        
        this.dayActionMenu.style.display = 'none';
        this.dayActionMenu.style.visibility = 'hidden';
        this.dayActionMenu.dataset.visible = 'false';
        this.dayActionMenu.removeAttribute('data-date-iso');
        this.dayActionMenu.removeAttribute('data-date-display');
        if (this.activeActionButton) {
            this.activeActionButton.setAttribute('aria-expanded', 'false');
            this.activeActionButton = null;
        }
        // メニューが閉じられたらフラグをリセット
        this.ignoreDocumentClickForCurrentEvent = false;
        this.menuOpenedAt = null;
    }

    convertToIsoDate(value) {
        if (!value || typeof value !== 'string') {
            return '';
        }
        const trimmed = value.trim();
        if (!trimmed) {
            return '';
        }
        if (trimmed.includes('/')) {
            return trimmed.replace(/\//g, '-');
        }
        return trimmed;
    }

    handleActionMenuClick(event) {
        const item = event.target.closest('.calendar-action-item');
        if (!item) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        const actionKey = item.dataset.action;
        const isoDate = this.dayActionMenu?.dataset?.dateIso || '';
        const displayDate = this.dayActionMenu?.dataset?.dateDisplay || '';
        this.performActionNavigation(actionKey, isoDate, displayDate);
    }

    performActionNavigation(actionKey, isoDate, displayDate) {
        const action = (this.calendarActionDefinitions || []).find((candidate) => candidate.key === actionKey);
        if (!action || !isoDate) {
            this.hideActionMenu(true); // メニュー項目をクリックした時は強制的に閉じる
            return;
        }

        const normalizedIsoDate = this.normalizeDateKey(isoDate) || isoDate;
        const payload = {
            source: 'history-calendar',
            date: normalizedIsoDate,
            startDate: normalizedIsoDate,
            displayDate
        };

        switch (action.key) {
            case 'adjustment':
                payload.clockInDate = normalizedIsoDate;
                payload.clockOutDate = normalizedIsoDate;
                try {
                    const attendance = this.getAttendanceForDate(normalizedIsoDate);
                    if (attendance) {
                        payload.clockIn = attendance.clockInTime || attendance.clockIn;
                        payload.clockOut = attendance.clockOutTime || attendance.clockOut;
                        if (attendance.breakMinutes !== undefined) {
                            payload.breakMinutes = attendance.breakMinutes;
                        }
                    }
                } catch (error) {
                    console.warn('Failed to attach attendance data for adjustment prefill:', error);
                }
                break;
            case 'workPattern':
                break;
            case 'holiday':
                payload.workDate = normalizedIsoDate;
                payload.transferWorkDate = normalizedIsoDate;
                break;
            default:
                break;
        }

        if (typeof window.setNavigationPrefill === 'function') {
            window.setNavigationPrefill(action.path, payload);
        } else {
            window.__navigationPrefillFallback = window.__navigationPrefillFallback || {};
            window.__navigationPrefillFallback[action.path] = payload;
        }

        this.hideActionMenu(true); // メニュー項目をクリックした時は強制的に閉じる

        const targetPath = `${action.path}/${normalizedIsoDate}`;
        if (window.router && typeof window.router.navigate === 'function') {
            window.router.navigate(targetPath, { updateHistory: true });
        } else {
            window.location.href = targetPath;
        }
    }

    handleDocumentClick(event) {
        const target = event.target;
        
        // クリックがプラスボタンやその子要素（アイコンなど）の場合は何もしない
        if (target && typeof target.closest === 'function') {
            if (target.closest('.calendar-add-btn')) {
                // プラスボタンのクリック時はフラグを設定して無視
                this.ignoreDocumentClickForCurrentEvent = true;
                return;
            }
            
            // カレンダーの日付セルをクリックした場合も何もしない（別のハンドラーで処理される）
            if (target.closest('.calendar-day')) {
                return;
            }
        }
        
        // プラスボタンをクリックしたときのイベントを無視（メニュー表示中）
        if (this.ignoreDocumentClickForCurrentEvent) {
            return;
        }
        
        if (!this.dayActionMenu || this.dayActionMenu.dataset.visible !== 'true') {
            return;
        }
        
        // クリックがメニュー内の場合は何もしない
        if (target && typeof target.closest === 'function') {
            if (target.closest('.calendar-action-menu')) {
                return;
            }
        }
        
        // それ以外の場所をクリックした場合はメニューを閉じる
        this.hideActionMenu();
    }

    handleWindowScroll() {
        this.hideActionMenu(true); // スクロール時は強制的に閉じる
    }

    handleKeydown(event) {
        if (event.key === 'Escape') {
            this.hideActionMenu(true); // Escapeキーを押した時は強制的に閉じる
        }
    }


    /**
     * 今日かどうか判定
     */
    isToday(date) {
        const today = new Date();
        return date.getDate() === today.getDate() &&
               date.getMonth() === today.getMonth() &&
               date.getFullYear() === today.getFullYear();
    }

    /**
     * 祝日かどうか判定
     */
    isHoliday(date) {
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const day = date.getDate();
        
        // 日本の祝日判定（簡易版）
        if (window.BusinessDayUtils && typeof window.BusinessDayUtils.isHoliday === 'function') {
            return window.BusinessDayUtils.isHoliday(date);
        }

        const holidays = this.getHolidays(year);
        const dateString = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

        return holidays.includes(dateString);
    }

    /**
     * 指定年の祝日一覧を取得
     */
    getHolidays(year) {
        if (year < HISTORY_CALENDAR_RANGE.start.year || year > HISTORY_CALENDAR_RANGE.end.year) {
            return [];
        }

        if (window.BusinessDayUtils && typeof window.BusinessDayUtils.getHolidayListForYear === 'function') {
            return window.BusinessDayUtils.getHolidayListForYear(year);
        }

        return [];
    }

    getMonthIndex(year, month) {
        return year * 12 + month;
    }

    clampYearMonth(year, month) {
        const startIndex = this.getMonthIndex(HISTORY_CALENDAR_RANGE.start.year, HISTORY_CALENDAR_RANGE.start.month);
        const endIndex = this.getMonthIndex(HISTORY_CALENDAR_RANGE.end.year, HISTORY_CALENDAR_RANGE.end.month);
        const targetIndex = this.getMonthIndex(year, month);

        if (targetIndex < startIndex) {
            return { ...HISTORY_CALENDAR_RANGE.start };
        }

        if (targetIndex > endIndex) {
            return { ...HISTORY_CALENDAR_RANGE.end };
        }

        return { year, month };
    }

    clampDateToRange(date) {
        return this.clampYearMonth(date.getFullYear(), date.getMonth());
    }

    formatYearMonth(year, month) {
        return `${year}-${String(month + 1).padStart(2, '0')}`;
    }

    /**
     * 文字列から日付オブジェクトを生成（YYYY-MM-DD / YYYY/MM/DD などを許容）
     */
    parseDateString(value) {
        if (!value) {
            return null;
        }
        // Date オブジェクト
        if (value instanceof Date && !Number.isNaN(value.getTime())) {
            return new Date(value.getFullYear(), value.getMonth(), value.getDate());
        }
        // [yyyy, mm, dd] 形式（Jacksonの配列シリアライズ等）
        if (Array.isArray(value) && value.length >= 3) {
            const year = parseInt(value[0], 10);
            const month = parseInt(value[1], 10);
            const day = parseInt(value[2], 10);
            if ([year, month, day].some(num => Number.isNaN(num))) return null;
            return new Date(year, month - 1, day);
        }
        // {year: 2025, month: 10, day: 23} または {year:2025, monthValue:10, dayOfMonth:23}
        if (typeof value === 'object') {
            const year = parseInt(value.year, 10);
            const month = parseInt(value.monthValue ?? value.month, 10);
            const day = parseInt(value.dayOfMonth ?? value.day, 10);
            if ([year, month, day].every(v => !Number.isNaN(v))) {
                return new Date(year, month - 1, day);
            }
        }
        // 文字列（YYYY-MM-DD / YYYY/MM/DD）
        if (typeof value === 'string') {
            const parts = value.split(/[-/]/);
            if (parts.length !== 3) {
                return null;
            }
            const [yearStr, monthStr, dayStr] = parts;
            const year = parseInt(yearStr, 10);
            const month = parseInt(monthStr, 10);
            const day = parseInt(dayStr, 10);
            if ([year, month, day].some(num => Number.isNaN(num))) {
                return null;
            }
            return new Date(year, month - 1, day);
        }
        // 最後のフォールバック
        try {
            const coerced = new Date(value);
            if (!Number.isNaN(coerced.getTime())) {
                return new Date(coerced.getFullYear(), coerced.getMonth(), coerced.getDate());
            }
        } catch (_) {}
        return null;
    }

    /**
     * 営業日かどうか（休日・祝日を除外）
     */
    isBusinessDay(date) {
        if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
            return false;
        }
        if (window.BusinessDayUtils && typeof window.BusinessDayUtils.isBusinessDay === 'function') {
            return window.BusinessDayUtils.isBusinessDay(date);
        }
        const day = date.getDay();
        if (day === 0 || day === 6) {
            return false;
        }
        return !this.isHoliday(date);
    }

    /**
     * 日付文字列フォーマット
     */
    formatDateString(date) {
        return date.getFullYear() + '-' + 
               String(date.getMonth() + 1).padStart(2, '0') + '-' + 
               String(date.getDate()).padStart(2, '0');
    }

    normalizeDateKey(value) {
        if (value === null || value === undefined) {
            return '';
        }

        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (!trimmed) {
                return '';
            }

            const hyphenMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
            if (hyphenMatch) {
                const [, year, month, day] = hyphenMatch;
                return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
            }

            const slashMatch = trimmed.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/);
            if (slashMatch) {
                const [, year, month, day] = slashMatch;
                return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
            }

            if (trimmed.length >= 10) {
                return trimmed.substring(0, 10);
            }
        }

        try {
            const date = new Date(value);
            if (Number.isNaN(date.getTime())) {
                return '';
            }
            return this.formatDateString(date);
        } catch (error) {
            console.warn('normalizeDateKey failed:', error, value);
        }
        return '';
    }

    formatDisplayDate(value) {
        if (!value) {
            return '';
        }
        try {
            const date = value instanceof Date ? value : new Date(value);
            if (Number.isNaN(date.getTime())) {
                return '';
            }
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}/${month}/${day}`;
        } catch (error) {
            console.warn('formatDisplayDate failed:', error, value);
            return '';
        }
    }

    extractWorkingMinutesFromPattern(workPatternRequest) {
        if (!workPatternRequest || !workPatternRequest.request) {
            return null;
        }
        const request = workPatternRequest.request;
        const candidates = [
            request.currentWorkingMinutes,
            request.workingMinutes,
            request.standardWorkingMinutes
        ];
        for (const candidate of candidates) {
            const normalized = TimeUtils.normalizeMinutesValue(candidate);
            if (normalized !== null && !Number.isNaN(normalized)) {
                return normalized;
            }
        }
        return null;
    }

    extractStandardTimes(workPatternRequest) {
        const defaults = {
            startHour: 9,
            startMinute: 0,
            endHour: 18,
            endMinute: 0
        };

        if (!workPatternRequest || !workPatternRequest.request) {
            return defaults;
        }

        const request = workPatternRequest.request;
        if (request.startTime) {
            const match = String(request.startTime).match(/(\d{1,2}):(\d{2})/);
            if (match) {
                defaults.startHour = parseInt(match[1], 10) || defaults.startHour;
                defaults.startMinute = parseInt(match[2], 10) || defaults.startMinute;
            }
        }
        if (request.endTime) {
            const match = String(request.endTime).match(/(\d{1,2}):(\d{2})/);
            if (match) {
                defaults.endHour = parseInt(match[1], 10) || defaults.endHour;
                defaults.endMinute = parseInt(match[2], 10) || defaults.endMinute;
            }
        }

        return defaults;
    }

    calculateActualWorkingMinutes(attendance) {
        if (!attendance) {
            return 0;
        }

        const direct = TimeUtils.normalizeMinutesValue(attendance.workingMinutes);
        if (direct !== null && !Number.isNaN(direct)) {
            return direct;
        }

        if (attendance.clockInTime && attendance.clockOutTime) {
            const workingStr = TimeUtils.calculateWorkingTime(
                attendance.clockInTime,
                attendance.clockOutTime,
                attendance.breakMinutes
            );
            return TimeUtils.timeStringToMinutes(workingStr);
        }

        return 0;
    }

    computeAttendanceMetrics({
        attendance,
        vacationRequest,
        workPatternRequest,
        isHalfDayLeave,
        isFullDayLeave,
        actualWorkingMinutes
    }) {
        if (isFullDayLeave) {
            return {
                lateDisplay: '',
                earlyLeaveDisplay: '',
                overtimeDisplay: '',
                nightDisplay: ''
            };
        }

        const hasClockIn = !!attendance?.clockInTime;
        const hasClockOut = !!attendance?.clockOutTime;
        const isConfirmedAttendance = hasClockIn && hasClockOut;

        let lateMinutes = 0;
        let earlyLeaveMinutes = 0;
        let overtimeMinutes = 0;
        let nightMinutes = 0;

        if (isHalfDayLeave && isConfirmedAttendance) {
            const clockIn = new Date(attendance.clockInTime);
            const clockOut = new Date(attendance.clockOutTime);
            const patternMinutes = this.extractWorkingMinutesFromPattern(workPatternRequest);
            let workingMinutesForHalfDay = patternMinutes !== null ? parseInt(patternMinutes, 10) || 480 : 480;
            const standardTimes = this.extractStandardTimes(workPatternRequest);
            const halfDayMinutes = window.WORK_TIME_CONSTANTS?.HALF_DAY_WORKING_MINUTES || 240;

            if (vacationRequest && vacationRequest.timeUnit === 'HALF_AM') {
                // AM休の場合：勤務時間変更の実働時間 - 4時間 = 半休日に働く必要がある時間
                const expectedEndTime = new Date(clockOut);
                expectedEndTime.setHours(standardTimes.endHour, standardTimes.endMinute, 0, 0);
                // 勤務時間変更の実働時間から4時間を引いた時間が半休日に必要な勤務時間
                const requiredWorkMinutes = Math.max(0, workingMinutesForHalfDay - halfDayMinutes);
                const expectedStartTime = new Date(expectedEndTime.getTime() - requiredWorkMinutes * 60 * 1000);

                if (clockIn > expectedStartTime) {
                    const lateSeconds = Math.floor((clockIn - expectedStartTime) / 1000);
                    lateMinutes = Math.ceil(lateSeconds / 60);
                }

                if (clockOut < expectedEndTime) {
                    const earlySeconds = Math.floor((expectedEndTime - clockOut) / 1000);
                    earlyLeaveMinutes = Math.ceil(earlySeconds / 60);
                } else {
                    earlyLeaveMinutes = 0;
                }
            } else if (vacationRequest && vacationRequest.timeUnit === 'HALF_PM') {
                // PM休の場合：勤務時間変更の実働時間 - 4時間 = 半休日に働く必要がある時間
                const expectedStartTime = new Date(clockIn);
                expectedStartTime.setHours(standardTimes.startHour, standardTimes.startMinute, 0, 0);
                // 勤務時間変更の実働時間から4時間を引いた時間が半休日に必要な勤務時間
                const requiredWorkMinutes = Math.max(0, workingMinutesForHalfDay - halfDayMinutes);
                const expectedEndTime = new Date(expectedStartTime.getTime() + requiredWorkMinutes * 60 * 1000);

                if (clockIn > expectedStartTime) {
                    const lateSeconds = Math.floor((clockIn - expectedStartTime) / 1000);
                    lateMinutes = Math.ceil(lateSeconds / 60);
                }

                if (clockOut < expectedEndTime) {
                    const earlySeconds = Math.floor((expectedEndTime - clockOut) / 1000);
                    earlyLeaveMinutes = Math.ceil(earlySeconds / 60);
                } else {
                    earlyLeaveMinutes = 0;
                }
            }

            const totalWorkingMinutes = (actualWorkingMinutes || 0) + halfDayMinutes;
            overtimeMinutes = Math.max(0, totalWorkingMinutes - workingMinutesForHalfDay);
            nightMinutes = TimeUtils.calculateNightShiftMinutes(
                attendance.clockInTime,
                attendance.clockOutTime,
                attendance.breakMinutes
            );
        } else if (isConfirmedAttendance && attendance) {
            const standardTimes = this.extractStandardTimes(workPatternRequest);
            const clockIn = new Date(attendance.clockInTime);
            const clockOut = new Date(attendance.clockOutTime);
            const standardStart = new Date(clockIn.getFullYear(), clockIn.getMonth(), clockIn.getDate(),
                standardTimes.startHour, standardTimes.startMinute, 0, 0);
            const standardEnd = new Date(clockOut.getFullYear(), clockOut.getMonth(), clockOut.getDate(),
                standardTimes.endHour, standardTimes.endMinute, 0, 0);

            if (clockIn > standardStart) {
                const lateSeconds = Math.floor((clockIn - standardStart) / 1000);
                lateMinutes = Math.floor(lateSeconds / 60);
            }

            if (clockOut < standardEnd) {
                const earlySeconds = Math.floor((standardEnd - clockOut) / 1000);
                earlyLeaveMinutes = Math.ceil(earlySeconds / 60);
            }

            const totalMinutes = Math.floor((clockOut - clockIn) / (1000 * 60));
            const breakMinutes = TimeUtils.normalizeMinutesValue(attendance.breakMinutes) || 0;
            const workingMinutes = totalMinutes - breakMinutes;
            const standardWorkingMinutes = 8 * 60;
            overtimeMinutes = Math.max(0, workingMinutes - standardWorkingMinutes);
            nightMinutes = this.resolveNightMinutes(attendance);
        } else if (attendance) {
            lateMinutes = Number(attendance.lateMinutes ?? 0);
            earlyLeaveMinutes = Number(attendance.earlyLeaveMinutes ?? 0);
            overtimeMinutes = Number(attendance.overtimeMinutes ?? 0);
            nightMinutes = Number(
                attendance.nightShiftMinutes ??
                attendance.nightWorkMinutes ??
                0
            );
        }

        const formatMetric = (minutes) => TimeUtils.formatMinutesToTime(Math.max(0, minutes));

        return {
            lateDisplay: isConfirmedAttendance ? formatMetric(lateMinutes) : '',
            earlyLeaveDisplay: isConfirmedAttendance ? formatMetric(earlyLeaveMinutes) : '',
            overtimeDisplay: isConfirmedAttendance ? formatMetric(overtimeMinutes) : '',
            nightDisplay: isConfirmedAttendance ? formatMetric(nightMinutes) : ''
        };
    }

    buildAttendanceDetail(dateKey, attendance, vacationRequest, workPatternRequest) {
        const detail = {
            dateKey,
            dateDisplay: this.formatDisplayDate(
                attendance && attendance.attendanceDate ? attendance.attendanceDate : dateKey
            ),
            clockInDisplay: '',
            clockOutDisplay: '',
            breakDisplay: '',
            workingDisplay: '',
            lateDisplay: '',
            earlyLeaveDisplay: '',
            overtimeDisplay: '',
            nightDisplay: '',
            isPaidLeaveApproved: false,
            isHalfDayLeave: false,
            isFullDayLeave: false,
            hasAttendance: !!attendance,
            raw: {
                attendance,
                vacationRequest,
                workPatternRequest
            }
        };

        const status = (vacationRequest?.status || '').toUpperCase();
        const leaveType = (vacationRequest?.leaveType || '').toUpperCase();
        const timeUnit = (vacationRequest?.timeUnit || '').toUpperCase();

        const isPaidLeaveApproved = status === 'APPROVED' && leaveType === 'PAID_LEAVE';
        const isHalfDayLeave = isPaidLeaveApproved && (timeUnit === 'HALF_AM' || timeUnit === 'HALF_PM');
        const isFullDayLeave = isPaidLeaveApproved && !isHalfDayLeave;
        const hasClockIn = !!attendance?.clockInTime;
        const hasClockOut = !!attendance?.clockOutTime;
        const isConfirmedAttendance = hasClockIn && hasClockOut;
        const formatTime = (value) => value
            ? new Date(value).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
            : '';

        detail.isPaidLeaveApproved = isPaidLeaveApproved;
        detail.isHalfDayLeave = isHalfDayLeave;
        detail.isFullDayLeave = isFullDayLeave;

        if (!isFullDayLeave) {
            detail.clockInDisplay = hasClockIn ? formatTime(attendance.clockInTime) : '';
            detail.clockOutDisplay = hasClockOut ? formatTime(attendance.clockOutTime) : '';
        }

        const standardMinutes = window.WORK_TIME_CONSTANTS?.STANDARD_WORKING_MINUTES || 480;
        const halfDayMinutes = window.WORK_TIME_CONSTANTS?.HALF_DAY_WORKING_MINUTES || 240;
        const patternWorkingMinutes = this.extractWorkingMinutesFromPattern(workPatternRequest);
        const actualWorkingMinutes = this.calculateActualWorkingMinutes(attendance);

        let workingDisplay = '';

        if (isPaidLeaveApproved) {
            if (isHalfDayLeave) {
                if (attendance && actualWorkingMinutes > 0) {
                    // 半休で打刻データがある場合：実際に働いた時間 + 半休4時間を表示
                    const totalWorkingMinutes = actualWorkingMinutes + halfDayMinutes;
                    workingDisplay = TimeUtils.formatMinutesToTime(totalWorkingMinutes);
                } else {
                    // 半休で打刻データがない場合：半休4時間を表示
                    console.log('半休勤務時間計算:', {
                        patternWorkingMinutes,
                        standardMinutes,
                        halfDayMinutes,
                        actualWorkingMinutes,
                        hasAttendance: !!attendance
                    });
                    workingDisplay = TimeUtils.formatMinutesToTime(halfDayMinutes);
                }
            } else if (isFullDayLeave) {
                // 勤務時間変更申請が承認されている場合は、その実働時間を使用
                if (patternWorkingMinutes !== null) {
                    workingDisplay = TimeUtils.formatMinutesToTime(patternWorkingMinutes);
                } else {
                    workingDisplay = TimeUtils.formatMinutesToTime(standardMinutes);
                }
            } else {
                if (patternWorkingMinutes !== null) {
                    workingDisplay = TimeUtils.formatMinutesToTime(patternWorkingMinutes);
                } else if (isConfirmedAttendance) {
                    workingDisplay = TimeUtils.calculateWorkingTime(
                        attendance.clockInTime,
                        attendance.clockOutTime,
                        attendance.breakMinutes
                    );
                } else if (actualWorkingMinutes) {
                    workingDisplay = TimeUtils.formatMinutesToTime(actualWorkingMinutes);
                }

                if (!workingDisplay) {
                    workingDisplay = TimeUtils.formatMinutesToTime(standardMinutes);
                }
            }
        } else if (isConfirmedAttendance) {
            workingDisplay = TimeUtils.calculateWorkingTime(
                attendance.clockInTime,
                attendance.clockOutTime,
                attendance.breakMinutes
            );
        } else if (actualWorkingMinutes) {
            workingDisplay = TimeUtils.formatMinutesToTime(actualWorkingMinutes);
        } else {
            // 申請も打刻データもない場合は空表示
            workingDisplay = '';
        }

        detail.workingDisplay = workingDisplay;

        const breakMinutesValue = TimeUtils.normalizeMinutesValue(attendance?.breakMinutes);
        if (!isFullDayLeave && isConfirmedAttendance && breakMinutesValue !== null) {
            detail.breakDisplay = TimeUtils.formatMinutesToTime(breakMinutesValue);
        } else {
            detail.breakDisplay = '';
        }

        const metrics = this.computeAttendanceMetrics({
            attendance,
            vacationRequest,
            workPatternRequest,
            isHalfDayLeave,
            isFullDayLeave,
            actualWorkingMinutes
        });

        detail.lateDisplay = metrics.lateDisplay;
        detail.earlyLeaveDisplay = metrics.earlyLeaveDisplay;
        detail.overtimeDisplay = metrics.overtimeDisplay;
        detail.nightDisplay = metrics.nightDisplay;

        return detail;
    }

    computeAttendanceDetail(dateKey, attendance, overrides = {}) {
        const vacationRequest = overrides.vacationRequestOverride !== undefined
            ? overrides.vacationRequestOverride
            : this.getVacationRequestForDate(dateKey);
        const workPatternRequest = overrides.workPatternRequestOverride !== undefined
            ? overrides.workPatternRequestOverride
            : this.getWorkPatternRequestForDate(dateKey);
        const adjustmentRequest = overrides.adjustmentRequestOverride !== undefined
            ? overrides.adjustmentRequestOverride
            : this.getAdjustmentRequestForDate(dateKey);

        // 承認済みの打刻修正がある場合は、勤怠データにマージして詳細計算に反映する
        let effectiveAttendance = attendance;
        try {
            const isApproved = adjustmentRequest && (adjustmentRequest.status || '').toUpperCase() === 'APPROVED';
            const req = adjustmentRequest && adjustmentRequest.request ? adjustmentRequest.request : null;
            if (isApproved && req) {
                const normalizedBreak = typeof req.newBreakMinutes === 'number' && Number.isFinite(req.newBreakMinutes)
                    ? Math.max(0, req.newBreakMinutes)
                    : (attendance ? attendance.breakMinutes : null);
                effectiveAttendance = {
                    ...(attendance || { attendanceDate: dateKey }),
                    clockInTime: req.newClockIn ?? (attendance ? attendance.clockInTime : null),
                    clockOutTime: req.newClockOut ?? (attendance ? attendance.clockOutTime : null),
                    breakMinutes: normalizedBreak
                };
            }
        } catch (e) {
            console.warn('承認済み打刻修正の適用中にエラー:', e);
        }

        const detail = this.buildAttendanceDetail(
            dateKey,
            effectiveAttendance,
            vacationRequest,
            workPatternRequest
        );

        this.attendanceDetailCache.set(dateKey, detail);
        return detail;
    }

    getAttendanceDetailForDate(dateString, options = {}) {
        const dateKey = this.normalizeDateKey(dateString);
        if (!dateKey) {
            return null;
        }

        if (!options.force && this.attendanceDetailCache.has(dateKey)) {
            return this.attendanceDetailCache.get(dateKey);
        }

        const attendance = options.attendanceOverride !== undefined
            ? options.attendanceOverride
            : this.getAttendanceForDate(dateKey);

        if (!attendance && !options.includeVacations && !this.getVacationRequestForDate(dateKey)) {
            // データが存在しない場合はnullを返却（空行と同じ扱い）
            return null;
        }

        return this.computeAttendanceDetail(dateKey, attendance, options);
    }

    invalidateAttendanceDetailCache() {
        if (this.attendanceDetailCache) {
            this.attendanceDetailCache.clear();
        }
    }

    notifyAttendanceDetailUpdate(dateKeys = null) {
        try {
            const detailKeys = Array.isArray(dateKeys) ? dateKeys : Array.from(this.attendanceDetailCache.keys());
            const event = new CustomEvent('history:detail-updated', {
                detail: {
                    dateKeys: detailKeys,
                    timestamp: Date.now()
                }
            });
            window.dispatchEvent(event);
        } catch (error) {
            console.warn('Failed to dispatch history detail update event:', error);
        }
    }

    /**
     * 指定日の勤怠データ取得
     */
    getAttendanceForDate(dateString) {
        if (!Array.isArray(this.attendanceData) || this.attendanceData.length === 0) {
            return null;
        }

        const target = this.normalizeDateKey(dateString);
        if (!target) return null;

        // デバッグ用ログを追加
        console.log('勤怠データ検索:', {
            targetDate: target,
            attendanceDataCount: this.attendanceData.length,
            sampleData: this.attendanceData.slice(0, 2)
        });

        const found = this.attendanceData.find(record => {
            const recordDate = this.normalizeDateKey(record.attendanceDate);
            console.log('比較:', { recordDate, target, match: recordDate === target });
            return recordDate === target;
        });

        console.log('見つかった勤怠データ:', found);
        return found || null;
    }

    /**
     * 指定日のモック勤怠データ生成
     * @param {string} dateString - 日付文字列（YYYY-MM-DD形式）
     * @returns {Object|null} - モック勤怠データまたはnull
     */
    generateMockAttendanceForDate(dateString) {
        const date = new Date(dateString);
        const dayOfWeek = date.getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const isHoliday = this.isHoliday(date);
        
        // 土日祝日は勤怠データなし
        if (isWeekend || isHoliday) {
            return null;
        }
        
        // 平日の場合、ランダムに勤怠データを生成（50%の確率）
        if (Math.random() < 0.5) {
            return null;
        }
        
        // 勤怠データを生成
        const clockIn = new Date(date);
        clockIn.setHours(9, Math.floor(Math.random() * 30), 0, 0); // 9:00-9:30の間でランダム

        const clockOut = new Date(date);
        clockOut.setHours(18, Math.floor(Math.random() * 60), 0, 0); // 18:00-19:00の間でランダム

        // 深夜勤務と残業のみ計算（遅刻・早退は廃止）
        const clockInMinutes = clockIn.getHours() * 60 + clockIn.getMinutes();
        const clockOutMinutes = clockOut.getHours() * 60 + clockOut.getMinutes();
        const workedMinutes = Math.max(0, clockOutMinutes - clockInMinutes);
        const overtimeMinutes = Math.max(0, workedMinutes - (8 * 60)); // 8時間超過分
        const nightWorkMinutes = Math.max(0, clockOutMinutes - (22 * 60)); // 22:00以降の深夜

        return {
            attendanceDate: dateString,
            clockInTime: clockIn.toISOString(),
            clockOutTime: clockOut.toISOString(),
            lateMinutes: null,
            earlyLeaveMinutes: null,
            overtimeMinutes: overtimeMinutes,
            nightWorkMinutes: nightWorkMinutes
        };
    }

    /**
     * 指定日の休暇申請取得
     */
    getVacationRequestForDate(dateString) {
        return this.vacationRequests.find(request => request.date === dateString);
    }

    /**
     * 指定日の休日出勤・振替休日出勤申請取得
     */
    getHolidayRequestForDate(dateString) {
        return this.holidayRequests.find(request => request.date === dateString);
    }

    /**
     * 休暇申請データ読み込み（当月分に整形）
     */
    async loadVacationRequests() {
        if (!window.currentEmployeeId) {
            this.vacationRequests = [];
            return;
        }

        this.invalidateAttendanceDetailCache();

        try {
            const response = await fetchWithAuth.handleApiCall(
                () => fetchWithAuth.get(`/api/leave/requests/${window.currentEmployeeId}`),
                '休暇申請の取得に失敗しました'
            );

            const requests = (response && response.success && Array.isArray(response.data)) ? response.data : [];

            this.vacationRequestRawMap = new Map();
            this.activeVacationDates = new Set();

            const expanded = [];
            requests.forEach((req) => {
                if (!req.startDate || !req.endDate) {
                    return;
                }

                const requestId = req.leaveRequestId ?? req.id ?? req.vacationId;
                if (requestId === undefined || requestId === null) {
                    return;
                }

                const requestIdStr = String(requestId);
                this.vacationRequestRawMap.set(requestIdStr, req);

                try {
                    const start = this.parseDateString(req.startDate);
                    const end = this.parseDateString(req.endDate);
                    if (!start || !end) {
                        console.warn('休暇申請の日付を解析できませんでした:', req);
                        return;
                    }

                    const status = (req.status || 'PENDING').toUpperCase();
                    if (status === 'CANCELLED') {
                        return;
                    }

                    for (let d = new Date(start); d.getTime() <= end.getTime(); d.setDate(d.getDate() + 1)) {
                        const current = new Date(d);
                        const y = current.getFullYear();
                        const m = current.getMonth();
                        if (y === this.currentYear && m === this.currentMonth) {
                            const dateKey = this.formatDateString(current);
                            expanded.push({
                                date: dateKey,
                                status,
                                vacationId: requestIdStr,
                                leaveType: req.leaveType || 'PAID_LEAVE',
                                timeUnit: req.timeUnit || 'FULL_DAY',
                                days: req.days ?? req.requestDays ?? null,
                                request: req
                            });
                            this.activeVacationDates.add(dateKey);
                        }
                    }
                } catch (dateError) {
                    console.warn('休暇申請の日付解析エラー:', dateError, req);
                }
            });

            console.log('当月の休暇申請データ:', expanded);
            this.vacationRequests = expanded;
        } catch (error) {
            console.error('休暇申請データ読み込みエラー:', error);
            this.vacationRequests = [];
        }
    }

    /**
     * 休日出勤・振替休日出勤申請データ読み込み（当月分に整形）
     */
    async loadHolidayRequests() {
        if (!window.currentEmployeeId) {
            this.holidayRequests = [];
            return;
        }

        try {
            const response = await fetchWithAuth.handleApiCall(
                () => fetchWithAuth.get(`/api/holiday/requests/${window.currentEmployeeId}`),
                '休日出勤・振替休日出勤申請の取得に失敗しました'
            );

            const requests = (response && response.success && Array.isArray(response.data)) ? response.data : [];
            console.log('休日出勤・振替休日出勤申請APIレスポンス:', response);
            console.log('取得した申請データ:', requests);

            this.holidayRequestRawMap = new Map();

            const expanded = [];
            requests.forEach((req) => {
                const requestId = req.id;
                if (requestId === undefined || requestId === null) {
                    return;
                }

                const requestIdStr = String(requestId);
                this.holidayRequestRawMap.set(requestIdStr, req);

                try {
                    const status = (req.status || 'PENDING').toUpperCase();
                    if (status === 'CANCELLED') {
                        return;
                    }

                    // 休日出勤申請の場合
                    if (req.requestType === 'HOLIDAY_WORK' && req.workDate) {
                        const workDate = this.parseDateString(req.workDate);
                        if (workDate) {
                            const y = workDate.getFullYear();
                            const m = workDate.getMonth();
                            if (y === this.currentYear && m === this.currentMonth) {
                                const dateKey = this.formatDateString(workDate);
                                expanded.push({
                                    date: dateKey,
                                    status,
                                    holidayId: requestIdStr,
                                    requestType: 'HOLIDAY_WORK',
                                    workDate: req.workDate,
                                    compDate: req.compDate,
                                    takeComp: req.takeComp,
                                    reason: req.reason,
                                    request: req
                                });
                            }
                        }
                    }

                    // 振替申請の場合
                    if (req.requestType === 'TRANSFER' && req.workDate && req.transferHolidayDate) {
                        const workDate = this.parseDateString(req.workDate);
                        const holidayDate = this.parseDateString(req.transferHolidayDate);
                        
                        if (workDate) {
                            const y = workDate.getFullYear();
                            const m = workDate.getMonth();
                            if (y === this.currentYear && m === this.currentMonth) {
                                const dateKey = this.formatDateString(workDate);
                                expanded.push({
                                    date: dateKey,
                                    status,
                                    holidayId: requestIdStr,
                                    requestType: 'TRANSFER',
                                    workDate: req.workDate,
                                    transferHolidayDate: req.transferHolidayDate,
                                    reason: req.reason,
                                    request: req
                                });
                            }
                        }

                        if (holidayDate) {
                            const y = holidayDate.getFullYear();
                            const m = holidayDate.getMonth();
                            if (y === this.currentYear && m === this.currentMonth) {
                                const dateKey = this.formatDateString(holidayDate);
                                expanded.push({
                                    date: dateKey,
                                    status,
                                    holidayId: requestIdStr,
                                    requestType: 'TRANSFER',
                                    workDate: req.workDate,
                                    transferHolidayDate: req.transferHolidayDate,
                                    reason: req.reason,
                                    request: req
                                });
                            }
                        }
                    }
                } catch (dateError) {
                    console.warn('休日出勤・振替休日出勤申請の日付解析エラー:', dateError, req);
                }
            });

            console.log('当月の休日出勤・振替休日出勤申請データ:', expanded);
            this.holidayRequests = expanded;
        } catch (error) {
            console.error('休日出勤・振替休日出勤申請データ読み込みエラー:', error);
            this.holidayRequests = [];
        }
    }

    /**
     * 休暇バッジのクリックアクション
     */
    setupVacationBadgeActions() {
        if (!this.calendarGrid) return;
        const badges = this.calendarGrid.querySelectorAll('.vacation-badge');
        badges.forEach(badge => {
            badge.addEventListener('click', async (e) => {
                e.stopPropagation();
                const vacationId = badge.getAttribute('data-vacation-id');
                const dateString = badge.getAttribute('data-date');
                try {
                    await this.showVacationDetail(dateString, vacationId);
                } catch (error) {
                    this.showAlert(error.message || '申請詳細の表示に失敗しました', 'danger');
                }
            });
        });
    }

    /**
     * 打刻修正申請データ読み込み（当月分に整形）
     */
    async loadAdjustmentRequests() {
        if (!window.currentEmployeeId) {
            this.adjustmentRequests = [];
            return;
        }

        try {
            const response = await fetchWithAuth.handleApiCall(
                () => fetchWithAuth.get(`/api/attendance/adjustment/${window.currentEmployeeId}`),
                '打刻修正申請の取得に失敗しました'
            );

            console.log('打刻修正申請APIレスポンス:', response);

            // レスポンス構造の柔軟な対応
            let list = [];
            if (response && response.success && Array.isArray(response.data)) {
                list = response.data;
            } else if (Array.isArray(response)) {
                // 直接配列が返される場合
                list = response;
            } else if (response && Array.isArray(response.adjustmentRequests)) {
                // ネストされた構造の場合
                list = response.adjustmentRequests;
            }

            console.log('打刻修正申請リスト:', list);

            // 当月のみ抽出し、カレンダー用に整形（却下状態も含める）
            const filtered = [];
            list.forEach(req => {
                // 日付フィールドの候補をチェック（targetDate, date, attendanceDate）
                const dateField = req.targetDate || req.date || req.attendanceDate;
                if (!dateField) return;
                
                try {
                    const d = new Date(dateField);
                    if (d.getFullYear() === this.currentYear && d.getMonth() === this.currentMonth) {
                        const status = req.status || 'PENDING';
                        if ((status || '').toUpperCase() === 'CANCELLED') {
                            return;
                        }
                        const dateKey = this.formatDateString(d);
                        if (this.activeVacationDates.has(dateKey)) {
                            // 半休申請の場合は打刻修正申請も表示する
                            const vacationRequest = this.vacationRequests.find(vr => vr.date === dateKey);
                            const isHalfDayLeave = vacationRequest && 
                                vacationRequest.status === 'APPROVED' && 
                                vacationRequest.leaveType === 'PAID_LEAVE' &&
                                (vacationRequest.timeUnit === 'HALF_AM' || vacationRequest.timeUnit === 'HALF_PM');
                            
                            if (!isHalfDayLeave) {
                                console.log('全日有休申請と重複するため打刻修正申請を非表示:', req);
                                return;
                            } else {
                                console.log('半休申請のため打刻修正申請も表示:', req);
                            }
                        }
                        filtered.push({
                            date: dateKey,
                            status: status,
                            adjustmentRequestId: req.adjustmentRequestId || req.id,
                            rejectionComment: req.rejectionComment || '',
                            request: req
                        });
                    }
                } catch (dateError) {
                    console.warn('打刻修正申請の日付解析エラー:', dateError, req);
                }
            });

            console.log('フィルタリング後の打刻修正申請:', filtered);
            console.log('当月の打刻修正申請データ:', filtered);
            this.adjustmentRequests = filtered;
        } catch (error) {
            console.error('打刻修正申請データ読み込みエラー:', error);
            this.adjustmentRequests = [];
            // エラーを再スローしない（画面の表示を継続するため）
        }
    }

    /**
     * 指定日の打刻修正申請取得
     */
    getAdjustmentRequestForDate(dateString) {
        return this.adjustmentRequests.find(request => request.date === dateString);
    }

    /**
     * 勤務時間変更申請データ読み込み（当月分に整形）
     */
    async loadWorkPatternRequests() {
        if (!window.currentEmployeeId) {
            this.workPatternRequests = [];
            return;
        }

        this.invalidateAttendanceDetailCache();

        try {
            const response = await fetchWithAuth.handleApiCall(
                () => fetchWithAuth.get(`/api/work-pattern-change/requests/${window.currentEmployeeId}`),
                '勤務時間変更申請の取得に失敗しました'
            );

            console.log('勤務時間変更申請APIレスポンス:', response);

            let list = [];
            if (response && response.success && Array.isArray(response.data)) {
                list = response.data;
            } else if (Array.isArray(response)) {
                list = response;
            }

            console.log('勤務時間変更申請リスト:', list);

            // 当月のみ抽出し、カレンダー用に整形（承認済のみ）
            const filtered = [];
            list.forEach(req => {
                if (!req.startDate || !req.endDate) {
                    return;
                }

                const status = (req.status || '').toUpperCase();
                if (status !== 'APPROVED') {
                    return; // 承認済みのみ対象
                }

                try {
                    const start = this.parseDateString(req.startDate);
                    const end = this.parseDateString(req.endDate);
                    if (!start || !end) {
                        console.warn('勤務時間変更申請の日付を解析できませんでした:', req);
                        return;
                    }

                    // 当月に含まれる日付を展開（全ての日付を対象期間として記録）
                    for (let d = new Date(start); d.getTime() <= end.getTime(); d.setDate(d.getDate() + 1)) {
                        const current = new Date(d);
                        const y = current.getFullYear();
                        const m = current.getMonth();
                        if (y === this.currentYear && m === this.currentMonth) {
                            const dateKey = this.formatDateString(current);
                            
                            // 既に同じ日付のデータがある場合は更新、なければ追加
                            const existingIndex = filtered.findIndex(item => item.date === dateKey);
                            if (existingIndex >= 0) {
                                filtered[existingIndex] = {
                                    date: dateKey,
                                    request: req,
                                    status: status,
                                    requestId: req.requestId || req.id
                                };
                            } else {
                                filtered.push({
                                    date: dateKey,
                                    request: req,
                                    status: status,
                                    requestId: req.requestId || req.id
                                });
                            }
                        }
                    }
                } catch (dateError) {
                    console.warn('勤務時間変更申請の日付解析エラー:', dateError, req);
                }
            });

            console.log('フィルタリング後の勤務時間変更申請:', filtered);
            this.workPatternRequests = filtered;
        } catch (error) {
            console.error('勤務時間変更申請データ読み込みエラー:', error);
            this.workPatternRequests = [];
        }
    }

    /**
     * 指定日が勤務時間変更申請の対象日（勤務日）かどうかを判定
     */
    isDateInWorkPattern(date, request, isWeekend, isHoliday) {
        if (!request) {
            console.log('isDateInWorkPattern: request is null');
            return false;
        }
        
        const weekday = date.getDay();
        let shouldApply = false;
        
        // 祝日かつ applyHoliday=false は勤務しない
        if (isHoliday && request.applyHoliday === false) {
            return false;
        }

        // 曜日別の適用判定
        switch (weekday) {
            case 1: shouldApply = request.applyMonday; break;
            case 2: shouldApply = request.applyTuesday; break;
            case 3: shouldApply = request.applyWednesday; break;
            case 4: shouldApply = request.applyThursday; break;
            case 5: shouldApply = request.applyFriday; break;
            case 6: shouldApply = request.applySaturday; break;
            case 0: shouldApply = request.applySunday; break;
        }
        
        // 祝日の場合は applyHoliday フラグを確認
        if (isHoliday && request.applyHoliday) {
            shouldApply = true;
        }
        
        const weekdayNames = ['日', '月', '火', '水', '木', '金', '土'];
        console.log(`isDateInWorkPattern: ${weekdayNames[weekday]}曜日(${weekday}), shouldApply: ${shouldApply}`, {
            applyMonday: request.applyMonday,
            applyTuesday: request.applyTuesday,
            applyWednesday: request.applyWednesday,
            applyThursday: request.applyThursday,
            applyFriday: request.applyFriday,
            applySaturday: request.applySaturday,
            applySunday: request.applySunday,
            applyHoliday: request.applyHoliday,
            isHoliday: isHoliday
        });
        
        return shouldApply;
    }

    /**
     * 指定日の勤務時間変更申請取得（承認済の休日用）
     */
    getWorkPatternRequestForDate(dateString) {
        return this.workPatternRequests.find(request => request.date === dateString);
    }

    /**
     * 指定された曜日（0=日, 1=月, ..., 6=土）が勤務時間変更申請の対象期間内の土日かどうかを判定
     */
    isWeekendInWorkPatternPeriod(weekdayIndex) {
        if (!this.workPatternRequests || this.workPatternRequests.length === 0) {
            return false;
        }

        // 土日だけでない場合は対象外
        if (weekdayIndex !== 5 && weekdayIndex !== 6) { // 土=5, 日=6
            return false;
        }

        // 承認済みの勤務時間変更申請があるかチェック
        const hasApprovedRequest = this.workPatternRequests.some(request => 
            request.status === 'APPROVED' && request.request
        );

        return hasApprovedRequest;
    }

    /**
     * 却下理由表示モーダル
     */
    showRejectionCommentModal(comment) {
        // 既存のモーダルを削除
        const existingModal = document.getElementById('rejectionCommentModal');
        if (existingModal) {
            existingModal.remove();
        }

        // モーダルHTMLを作成
        const modalHtml = `
            <div class="modal fade" id="rejectionCommentModal" tabindex="-1" aria-labelledby="rejectionCommentModalLabel" aria-hidden="true">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title" id="rejectionCommentModalLabel">打刻修正申請却下理由</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                        </div>
                        <div class="modal-body">
                            <div class="alert alert-warning">
                                <h6>却下理由:</h6>
                                <p>${comment}</p>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">閉じる</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // モーダルをDOMに追加
        document.body.insertAdjacentHTML('beforeend', modalHtml);

        // モーダルを表示
        const modalElement = document.getElementById('rejectionCommentModal');
        if (modalElement && typeof bootstrap !== 'undefined') {
            const modal = new bootstrap.Modal(modalElement);
            modal.show();
        }
    }

    /**
     * 打刻修正バッジのクリックアクション（申請詳細表示）
     */
    setupAdjustmentBadgeActions() {
        if (!this.calendarGrid) return;
        const badges = this.calendarGrid.querySelectorAll('.adjustment-badge');
        badges.forEach(badge => {
            badge.addEventListener('click', async (e) => {
                e.stopPropagation();
                const adjustmentDate = badge.getAttribute('data-adjustment-date');
                const adjustmentId = badge.getAttribute('data-adjustment-id');

                if (!adjustmentDate) return;
                try {
                    await this.showAdjustmentDetail(adjustmentDate, adjustmentId);
                } catch (error) {
                    this.showAlert('申請詳細の取得に失敗しました', 'danger');
                }
            });
        });
    }

    /**
     * 休日出勤・振替休日出勤申請バッジのクリックアクション
     */
    setupHolidayBadgeActions() {
        if (!this.calendarGrid) return;
        const badges = this.calendarGrid.querySelectorAll('.holiday-badge');
        badges.forEach(badge => {
            badge.addEventListener('click', async (e) => {
                e.stopPropagation();
                const holidayDate = badge.getAttribute('data-holiday-date');
                const holidayId = badge.getAttribute('data-holiday-id');

                if (!holidayDate) return;
                try {
                    await this.showHolidayDetail(holidayDate, holidayId);
                } catch (error) {
                    this.showAlert('申請詳細の取得に失敗しました', 'danger');
                }
            });
        });
    }

    /**
     * カレンダークリックイベント設定
     */
    setupCalendarClickEvents() {
        const calendarDays = this.calendarGrid.querySelectorAll('.calendar-day');
        calendarDays.forEach(day => {
            day.addEventListener('click', (event) => {
                // プラスボタンがクリックされた場合は処理をスキップ
                if (event.target.closest('.calendar-add-btn')) {
                    return;
                }

                // 日付クリックイベントがドキュメントクリックハンドラーに到達しないようにする
                event.stopPropagation();
                
                const dateString = day.getAttribute('data-date');
                
                // 選択された日付を保存
                this.selectedDateString = dateString;
                this.isInitialDateSelection = false; // ユーザーが明示的に日付を選択した
                
                // 選択状態の視覚的フィードバック
                this.updateSelectedDate(day);
                
                // 勤怠詳細テーブルを選択日付でフィルタリング
                this.filterAttendanceTableByDate(dateString);
            });
        });
    }

    /**
     * 選択日付の視覚的フィードバック更新
     * @param {HTMLElement} selectedDay - 選択された日付要素
     */
    updateSelectedDate(selectedDay) {
        // 既存の選択状態をクリア
        const calendarDays = this.calendarGrid.querySelectorAll('.calendar-day');
        calendarDays.forEach(day => {
            day.classList.remove('selected');
        });
        
        // 選択された日付にクラスを追加
        selectedDay.classList.add('selected');
    }

    /**
     * 勤怠詳細テーブルを指定日付でフィルタリング
     * @param {string} dateString - フィルタリングする日付（YYYY-MM-DD形式）
     */
    filterAttendanceTableByDate(dateString) {
        if (!this.historyTableBody) return;

        // テーブルをクリア
        this.historyTableBody.innerHTML = '';

        const dateKey = this.normalizeDateKey(dateString);
        const attendance = this.getAttendanceForDate(dateKey);
        const adjustmentRequest = this.getAdjustmentRequestForDate(dateKey);
        const detail = this.getAttendanceDetailForDate(dateKey, {
            attendanceOverride: attendance,
            adjustmentRequestOverride: adjustmentRequest,
            includeVacations: true,
            force: true
        });

        if (detail) {
            const row = document.createElement('tr');
            row.classList.add('attendance-row');
            row.dataset.dateKey = detail.dateKey;

            if (!detail.hasAttendance && !detail.isPaidLeaveApproved) {
                row.innerHTML = `
                    <td>${detail.dateDisplay}</td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
                `;
            } else {
                row.innerHTML = `
                    <td>${detail.dateDisplay}</td>
                    <td>${detail.clockInDisplay}</td>
                    <td>${detail.clockOutDisplay}</td>
                    <td>${detail.breakDisplay}</td>
                    <td>${detail.workingDisplay}</td>
                    <td>${detail.lateDisplay}</td>
                    <td>${detail.earlyLeaveDisplay}</td>
                    <td>${detail.overtimeDisplay}</td>
                    <td>${detail.nightDisplay}</td>
                `;
            }
            this.historyTableBody.appendChild(row);
            this.notifyAttendanceDetailUpdate([detail.dateKey]);
        } else {
            // 勤怠データがない場合
            const row = document.createElement('tr');
            const dateDisplay = this.formatDisplayDate(dateString);

            row.innerHTML = `
                <td>${dateDisplay}</td>
                <td></td>
                <td></td>
                <td></td>
                <td></td>
                <td></td>
                <td></td>
                <td></td>
                <td></td>
            `;
            this.historyTableBody.appendChild(row);
        }
    }

    /**
     * 打刻修正申請詳細表示
     * @param {string} dateString - 対象日付
     */
    async showAdjustmentDetail(dateString, adjustmentRequestId = null) {
        if (!window.currentEmployeeId) {
            this.showAlert('従業員IDが取得できません', 'danger');
            return;
        }

        try {
            // 打刻修正申請の詳細データを取得
            console.log('打刻修正申請データを取得中...', window.currentEmployeeId);
            const response = await fetchWithAuth.handleApiCall(
                () => fetchWithAuth.get(`/api/attendance/adjustment/${window.currentEmployeeId}`),
                '打刻修正申請の取得に失敗しました'
            );

            console.log('APIレスポンス:', response);

            if (!response) {
                console.error('APIレスポンスがnullまたはundefined:', response);
                this.showAlert('APIからの応答がありません', 'danger');
                return;
            }

            if (!response.success) {
                console.error('APIが失敗を返しました:', response);
                this.showAlert(response.message || '申請データの取得に失敗しました', 'danger');
                return;
            }

            if (!Array.isArray(response.data)) {
                console.error('APIレスポンスのdataが配列ではありません:', response);
                this.showAlert('申請データの形式が正しくありません', 'danger');
                return;
            }

            // 対象申請を検索（ID優先、無ければ日付）
            const targetId = adjustmentRequestId ? String(adjustmentRequestId) : null;
            let adjustmentRequest = null;

            if (targetId) {
                adjustmentRequest = response.data.find(req => {
                    const reqId = req.adjustmentRequestId ?? req.id;
                    return reqId !== undefined && reqId !== null && String(reqId) === targetId;
                });
            }

            if (!adjustmentRequest && dateString) {
                adjustmentRequest = response.data.find(req => {
                    if (!req.targetDate) return false;
                    const reqDate = new Date(req.targetDate);
                    const targetDate = new Date(dateString);
                    return reqDate.toDateString() === targetDate.toDateString();
                });
            }

            console.log('見つかった申請:', adjustmentRequest);

            if (!adjustmentRequest) {
                this.showAlert('指定日の申請が見つかりません', 'danger');
                return;
            }

            // モーダルの要素を取得
            const modal = document.getElementById('adjustmentDetailModal');
            if (!modal) {
                console.error('打刻修正申請詳細モーダルが見つかりません');
                return;
            }

            // 申請情報を設定
            // 日付をyyyy/mm/dd形式に変換
            const formatDate = (dateStr) => {
                if (!dateStr) return '';
                const date = new Date(dateStr);
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                return `${year}/${month}/${day}`;
            };
            const formatTime = (dateStr) => {
                if (!dateStr) return '';
                const date = new Date(dateStr);
                if (Number.isNaN(date.getTime())) return '';
                return date.toLocaleTimeString('ja-JP', {hour: '2-digit', minute: '2-digit'});
            };

            const targetDateText = formatDate(adjustmentRequest.targetDate) || formatDate(adjustmentRequest.newClockIn);
            document.getElementById('adjustmentDetailDate').textContent = targetDateText || '-';

            // 申請状態を設定
            let statusText = '';
            switch (adjustmentRequest.status) {
                case 'PENDING':
                    statusText = '申請中';
                    break;
                case 'APPROVED':
                    statusText = '承認済';
                    break;
                case 'REJECTED':
                    statusText = '却下';
                    break;
                case 'CANCELLED':
                    statusText = '取消';
                    break;
                default:
                    statusText = adjustmentRequest.status || '-';
            }
            const statusElement = document.getElementById('adjustmentDetailStatus');
            statusElement.textContent = statusText;
            // 余計な色クラスのみ除去し、レイアウト用クラスは保持
            statusElement.classList.remove('text-success', 'text-danger', 'text-warning', 'text-muted');

            // 修正内容を設定
            const clockInDate = formatDate(adjustmentRequest.newClockIn) || '';
            const clockInTime = formatTime(adjustmentRequest.newClockIn) || '';
            const clockOutDate = formatDate(adjustmentRequest.newClockOut) || '';
            const clockOutTime = formatTime(adjustmentRequest.newClockOut) || '';

            document.getElementById('adjustmentDetailClockIn').textContent =
                this.combineDateTime(clockInDate, clockInTime);
            document.getElementById('adjustmentDetailClockOut').textContent =
                this.combineDateTime(clockOutDate, clockOutTime);

            // 勤務時間を計算
            const breakMinutes = adjustmentRequest.newBreakMinutes ?? adjustmentRequest.breakMinutes ?? 0;
            const breakDisplay = TimeUtils.formatMinutesToTime(breakMinutes);
            document.getElementById('adjustmentDetailBreak').textContent = breakDisplay;

            const workingTime = (adjustmentRequest.newClockIn && adjustmentRequest.newClockOut) ?
                TimeUtils.calculateWorkingTime(adjustmentRequest.newClockIn, adjustmentRequest.newClockOut, breakMinutes) : '-';
            document.getElementById('adjustmentDetailWorkingTime').textContent = workingTime;

            // 修正理由を設定
            document.getElementById('adjustmentDetailReason').textContent = 
                adjustmentRequest.reason || '理由は記載されていません';

            const rejectionRow = document.getElementById('adjustmentRejectionRow');
            const rejectionField = document.getElementById('adjustmentDetailRejection');
            if (rejectionRow && rejectionField) {
                const comment = adjustmentRequest.rejectionComment || '';
                const visible = comment.trim().length > 0;
                rejectionRow.style.display = visible ? '' : 'none';
                rejectionField.style.display = visible ? '' : 'none';
                rejectionField.textContent = visible ? comment.trim() : '-';
            }


            // 取消ボタンの表示制御
            this.currentAdjustmentDetail = {
                request: adjustmentRequest,
                dateString,
                fallbackId: adjustmentRequestId ? String(adjustmentRequestId) : (adjustmentRequest.adjustmentRequestId != null ? String(adjustmentRequest.adjustmentRequestId) : (targetId || null))
            };

            if (this.adjustmentCancelButton) {
                const reqIdValue = adjustmentRequest.adjustmentRequestId ?? adjustmentRequest.id;
                const canCancel = adjustmentRequest.status === 'PENDING' || adjustmentRequest.status === 'APPROVED';
                if (canCancel && reqIdValue !== undefined && reqIdValue !== null) {
                    this.adjustmentCancelButton.style.display = 'inline-block';
                    this.adjustmentCancelButton.disabled = false;
                    this.adjustmentCancelButton.dataset.requestId = String(reqIdValue);
                } else {
                    this.adjustmentCancelButton.style.display = 'none';
                    this.adjustmentCancelButton.removeAttribute('data-request-id');
                }
            }

            if (this.adjustmentResubmitButton) {
                const canResubmit = adjustmentRequest.status === 'REJECTED';
                if (canResubmit) {
                    this.adjustmentResubmitButton.style.display = 'inline-block';
                    this.adjustmentResubmitButton.disabled = false;
                } else {
                    this.adjustmentResubmitButton.style.display = 'none';
                    this.adjustmentResubmitButton.disabled = false;
                }
            }

            // モーダルを表示
            const modalInstance = new bootstrap.Modal(modal);
            modalInstance.show();

        } catch (error) {
            console.error('打刻修正申請詳細表示エラー:', error);
            const errorMessage = error.message || '申請詳細の表示に失敗しました';
            this.showAlert(errorMessage, 'danger');
        }
    }

    /**
     * 休日出勤・振替休日出勤申請詳細表示
     * @param {string} dateString - 対象日付
     */
    async showHolidayDetail(dateString, holidayId = null) {
        if (!window.currentEmployeeId) {
            this.showAlert('従業員IDが取得できません', 'danger');
            return;
        }

        try {
            // 休日出勤・振替休日出勤申請の詳細データを取得
            console.log('休日出勤・振替休日出勤申請データを取得中...', window.currentEmployeeId);
            const response = await fetchWithAuth.handleApiCall(
                () => fetchWithAuth.get(`/api/holiday/requests/${window.currentEmployeeId}`),
                '休日出勤・振替休日出勤申請の取得に失敗しました'
            );

            console.log('APIレスポンス:', response);

            if (!response) {
                console.error('APIレスポンスがnullまたはundefined:', response);
                this.showAlert('APIからの応答がありません', 'danger');
                return;
            }

            if (!response.success) {
                console.error('APIが失敗を返しました:', response);
                this.showAlert(response.message || '申請データの取得に失敗しました', 'danger');
                return;
            }

            if (!Array.isArray(response.data)) {
                console.error('APIレスポンスのdataが配列ではありません:', response);
                this.showAlert('申請データの形式が正しくありません', 'danger');
                return;
            }

            // 対象申請を検索（ID優先、無ければ日付）
            const targetId = holidayId ? String(holidayId) : null;
            let holidayRequest = null;

            if (targetId) {
                holidayRequest = response.data.find(req => {
                    const reqId = req.id;
                    return reqId !== undefined && reqId !== null && String(reqId) === targetId;
                });
            }

            if (!holidayRequest && dateString) {
                holidayRequest = response.data.find(req => {
                    // 休日出勤申請の場合
                    if (req.requestType === 'HOLIDAY_WORK' && req.workDate) {
                        const reqDate = new Date(req.workDate);
                        const targetDate = new Date(dateString);
                        return reqDate.toDateString() === targetDate.toDateString();
                    }
                    // 振替申請の場合
                    if (req.requestType === 'TRANSFER' && req.workDate && req.transferHolidayDate) {
                        const workDate = new Date(req.workDate);
                        const holidayDate = new Date(req.transferHolidayDate);
                        const targetDate = new Date(dateString);
                        return workDate.toDateString() === targetDate.toDateString() || 
                               holidayDate.toDateString() === targetDate.toDateString();
                    }
                    return false;
                });
            }

            console.log('見つかった申請:', holidayRequest);

            if (!holidayRequest) {
                this.showAlert('指定日の申請が見つかりません', 'danger');
                return;
            }

            // モーダルの要素を取得
            const modal = document.getElementById('holidayDetailModal');
            if (!modal) {
                console.error('休日出勤・振替休日出勤申請詳細モーダルが見つかりません');
                return;
            }

            // 申請情報を設定
            const formatDate = (dateStr) => {
                if (!dateStr) return '';
                const date = new Date(dateStr);
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                return `${year}/${month}/${day}`;
            };

            // 申請タイプに応じた表示
            let titleText = '';
            let detailHtml = '';

            if (holidayRequest.requestType === 'HOLIDAY_WORK') {
                titleText = '休日出勤申請詳細';
                detailHtml = `
                    <div class="mb-3">
                        <h6>申請内容</h6>
                        <p><strong>申請タイプ:</strong> 休日出勤</p>
                        <p><strong>休日出勤日:</strong> ${formatDate(holidayRequest.workDate)}</p>
                        <p><strong>代休取得:</strong> ${holidayRequest.takeComp ? '取得する' : '取得しない'}</p>
                        ${holidayRequest.takeComp && holidayRequest.compDate ? `<p><strong>代休日:</strong> ${formatDate(holidayRequest.compDate)}</p>` : ''}
                        <p><strong>理由:</strong> ${holidayRequest.reason || '記載なし'}</p>
                    </div>
                `;
            } else if (holidayRequest.requestType === 'TRANSFER') {
                titleText = '振替申請詳細';
                detailHtml = `
                    <div class="mb-3">
                        <h6>申請内容</h6>
                        <p><strong>申請タイプ:</strong> 振替</p>
                        <p><strong>振替出勤日:</strong> ${formatDate(holidayRequest.workDate)}</p>
                        <p><strong>振替休日:</strong> ${formatDate(holidayRequest.transferHolidayDate)}</p>
                        <p><strong>理由:</strong> ${holidayRequest.reason || '記載なし'}</p>
                    </div>
                `;
            }

            // 申請状態を設定
            let statusText = '';
            let statusClass = '';
            switch (holidayRequest.status) {
                case 'PENDING':
                    statusText = '申請中';
                    statusClass = 'text-warning';
                    break;
                case 'APPROVED':
                    statusText = '承認済';
                    statusClass = 'text-success';
                    break;
                case 'REJECTED':
                    statusText = '却下';
                    statusClass = 'text-danger';
                    break;
                case 'CANCELLED':
                    statusText = '取消済';
                    statusClass = 'text-secondary';
                    break;
                default:
                    statusText = holidayRequest.status || '不明';
                    statusClass = 'text-secondary';
            }

            // モーダルの内容を更新
            modal.querySelector('.modal-title').textContent = titleText;
            
            // 申請種別に応じてモーダルの内容を設定
            if (holidayRequest.requestType === 'HOLIDAY_WORK') {
                // 休日出勤申請の場合
                document.getElementById('holidayDetailType').textContent = '休日出勤';
                // 休日出勤日は表示
                const dateLabelEl = document.getElementById('holidayDetailDateLabel');
                const dateValueEl = document.getElementById('holidayDetailDate');
                if (dateLabelEl) dateLabelEl.style.display = '';
                if (dateLabelEl) dateLabelEl.textContent = '休日出勤日';
                if (dateValueEl) {
                    dateValueEl.style.display = '';
                    dateValueEl.textContent = formatDate(holidayRequest.workDate);
                }
                
                // 代休取得は常に非表示
                const takeCompLabel = document.getElementById('holidayDetailTakeCompLabel');
                const takeCompValue = document.getElementById('holidayDetailTakeComp');
                if (takeCompLabel) takeCompLabel.style.display = 'none';
                if (takeCompValue) takeCompValue.style.display = 'none';

                // 代休日は常に表示。値は日付 or なし
                const compDateLabel = document.getElementById('holidayDetailCompDateLabel');
                const compDateValue = document.getElementById('holidayDetailCompDate');
                if (compDateLabel) compDateLabel.style.display = '';
                if (compDateValue) {
                    compDateValue.style.display = '';
                    const hasCompDate = !!(holidayRequest.takeComp && holidayRequest.compDate);
                    compDateValue.textContent = hasCompDate ? formatDate(holidayRequest.compDate) : 'なし';
                }
                
                // 振替関連項目を非表示
                document.getElementById('holidayDetailTransferWorkDateLabel').style.display = 'none';
                document.getElementById('holidayDetailTransferWorkDate').style.display = 'none';
                document.getElementById('holidayDetailTransferHolidayDateLabel').style.display = 'none';
                document.getElementById('holidayDetailTransferHolidayDate').style.display = 'none';
                
            } else if (holidayRequest.requestType === 'TRANSFER') {
                // 振替申請の場合
                document.getElementById('holidayDetailType').textContent = '振替';
                // 対象日は不要のため非表示
                const dateLabelEl = document.getElementById('holidayDetailDateLabel');
                const dateValueEl = document.getElementById('holidayDetailDate');
                if (dateLabelEl) dateLabelEl.style.display = 'none';
                if (dateValueEl) {
                    dateValueEl.style.display = 'none';
                    dateValueEl.textContent = '';
                }
                
                // 振替関連項目を表示
                document.getElementById('holidayDetailTransferWorkDateLabel').style.display = '';
                document.getElementById('holidayDetailTransferWorkDate').style.display = '';
                document.getElementById('holidayDetailTransferWorkDate').textContent = formatDate(holidayRequest.workDate);
                
                document.getElementById('holidayDetailTransferHolidayDateLabel').style.display = '';
                document.getElementById('holidayDetailTransferHolidayDate').style.display = '';
                document.getElementById('holidayDetailTransferHolidayDate').textContent = formatDate(holidayRequest.transferHolidayDate);
                
                // 代休関連項目を非表示
                document.getElementById('holidayDetailTakeCompLabel').style.display = 'none';
                document.getElementById('holidayDetailTakeComp').style.display = 'none';
                document.getElementById('holidayDetailCompDateLabel').style.display = 'none';
                document.getElementById('holidayDetailCompDate').style.display = 'none';
            }
            
            document.getElementById('holidayDetailStatus').textContent = statusText;
            document.getElementById('holidayDetailReason').textContent = holidayRequest.reason || '記載なし';
            
            // 却下理由の表示制御
            const rejectionRow = document.getElementById('holidayRejectionRow');
            const rejectionText = document.getElementById('holidayDetailRejection');
            if (holidayRequest.status === 'REJECTED' && holidayRequest.rejectionComment) {
                rejectionRow.style.display = '';
                rejectionText.textContent = holidayRequest.rejectionComment;
            } else {
                rejectionRow.style.display = 'none';
                rejectionText.textContent = '';
            }

            // モーダルを表示
            const modalInstance = new bootstrap.Modal(modal);
            modalInstance.show();

        } catch (error) {
            console.error('休日出勤・振替休日出勤申請詳細表示エラー:', error);
            const errorMessage = error.message || '申請詳細の表示に失敗しました';
            this.showAlert(errorMessage, 'danger');
        }
    }

    /**
     * 打刻修正申請の取消処理
     */
    async handleAdjustmentCancel() {
        if (!this.adjustmentCancelButton) return;
        const detail = this.currentAdjustmentDetail;
        let requestId = null;

        if (detail?.request) {
            const resolved = detail.request.adjustmentRequestId ?? detail.request.id;
            if (resolved !== undefined && resolved !== null) {
                requestId = String(resolved);
            }
        }

        if (!requestId && detail?.fallbackId) {
            requestId = detail.fallbackId;
        }

        if (!requestId && this.adjustmentCancelButton.dataset.requestId) {
            requestId = this.adjustmentCancelButton.dataset.requestId;
        }

        const normalizedId = (requestId || '').trim();

        if (!normalizedId) {
            this.showAlert('申請IDを取得できません。画面を再読み込みしてください。', 'danger');
            return;
        }
        if (!window.currentEmployeeId) {
            this.showAlert('従業員IDが取得できません', 'danger');
            return;
        }

        const status = detail?.request?.status || '';
        const isApproved = status === 'APPROVED';
        const confirmMessage = isApproved
            ? 'この打刻修正申請は既に承認済です。取消すると申請が無かったものとして扱われます。取消しますか？'
            : 'この打刻修正申請を取消しますか？';

        const confirmHandler = window.employeeDialog?.confirm;
        let confirmed = false;
        if (confirmHandler) {
            const result = await confirmHandler({
                title: '打刻修正申請の取消',
                message: confirmMessage,
                confirmLabel: '取消する',
                cancelLabel: 'キャンセル'
            });
            confirmed = !!result?.confirmed;
        } else {
            confirmed = window.confirm(confirmMessage);
        }

        if (!confirmed) {
            return;
        }

        let refreshRequired = false;
        let closeModal = false;

        try {
            this.adjustmentCancelButton.disabled = true;
            const cancelPayload = {
                adjustmentRequestId: Number(normalizedId),
                employeeId: window.currentEmployeeId
            };

            const data = await this.invokeAdjustmentCancel(cancelPayload, normalizedId);

            this.showAlert(data.message || '修正申請を取消しました', 'success');
            refreshRequired = true;
            closeModal = true;
        } catch (error) {
            console.error('打刻修正申請取消エラー:', error);
            const message = error.message || '修正申請の取消に失敗しました';
            const isMissing = message.includes('見つかりません') || message.includes('存在しません');
            const isStateError = message.includes('取消できない');

            if (isMissing || isStateError) {
                this.showAlert(`${message}。最新の状態を反映します。`, 'info');
                refreshRequired = true;
                closeModal = true;
            } else {
                this.showAlert(message, 'danger');
            }
        } finally {
            this.adjustmentCancelButton.disabled = false;
            this.adjustmentCancelButton.removeAttribute('data-request-id');
            this.currentAdjustmentDetail = null;
            if (this.adjustmentResubmitButton) {
                this.adjustmentResubmitButton.style.display = 'none';
                this.adjustmentResubmitButton.disabled = false;
            }

            if (closeModal) {
                const modalElement = document.getElementById('adjustmentDetailModal');
                if (modalElement && typeof bootstrap !== 'undefined') {
                    const instance = bootstrap.Modal.getInstance(modalElement);
                    instance?.hide();
                }
            }

            if (refreshRequired) {
                try {
                    await this.loadCalendarData(true); // 取消後はカレンダーを再生成
                } catch (refreshError) {
                    console.error('修正申請取消後の再描画に失敗しました:', refreshError);
                }
            }
        }
    }

    /**
     * 休暇申請詳細表示
     */
    async showVacationDetail(dateString, vacationId) {
        if (!window.currentEmployeeId) {
            this.showAlert('従業員IDが取得できません', 'danger');
            return;
        }

        const targetId = vacationId ? String(vacationId) : null;
        let request = null;

        if (targetId && this.vacationRequestRawMap.has(targetId)) {
            request = this.vacationRequestRawMap.get(targetId);
        }

        try {
            if (!request) {
                const response = await fetchWithAuth.handleApiCall(
                    () => fetchWithAuth.get(`/api/leave/requests/${window.currentEmployeeId}`),
                    '休暇申請の取得に失敗しました'
                );

                const items = (response && response.success && Array.isArray(response.data)) ? response.data : [];
                this.vacationRequestRawMap = new Map();
                items.forEach(item => {
                    const id = item.leaveRequestId ?? item.id ?? item.vacationId;
                    if (id === undefined || id === null) return;
                    const idStr = String(id);
                    this.vacationRequestRawMap.set(idStr, item);
                    if (!request && targetId && idStr === targetId) {
                        request = item;
                    }
                });

                if (!request && dateString) {
                    const targetDate = new Date(dateString);
                    for (const value of this.vacationRequestRawMap.values()) {
                        if (!value.startDate || !value.endDate) continue;
                        const start = new Date(value.startDate);
                        const end = new Date(value.endDate);
                        if (targetDate >= start && targetDate <= end) {
                            request = value;
                            break;
                        }
                    }
                }
            }
        } catch (error) {
            console.error('休暇申請詳細取得エラー:', error);
            this.showAlert(error.message || '申請詳細の取得に失敗しました', 'danger');
            return;
        }

        if (!request) {
            this.showAlert('申請詳細が見つかりません', 'danger');
            return;
        }

        const modal = document.getElementById('vacationDetailModal');
        if (!modal) {
            console.error('休暇申請詳細モーダルが見つかりません');
            return;
        }

        const formatDate = (value) => {
            if (!value) return '-';
            const date = new Date(value);
            if (Number.isNaN(date.getTime())) return '-';
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}/${month}/${day}`;
        };

        const daysValue = Number(request.days);
        const daysText = Number.isFinite(daysValue)
            ? `${(daysValue % 1 === 0 ? daysValue : daysValue.toFixed(1))}日`
            : (request.days != null ? `${request.days}日` : '-');

        const leaveTypeLabel = LEAVE_TYPE_LABELS[request.leaveType] || '有休';
        const timeUnitLabel = LEAVE_TIME_UNIT_LABELS[request.timeUnit] || '';
        const startDisplay = formatDate(request.startDate);
        const endDisplay = formatDate(request.endDate);
        let targetDisplay = '-';
        if (startDisplay !== '-' && endDisplay !== '-' && startDisplay !== endDisplay) {
            targetDisplay = `${startDisplay}〜${endDisplay}`;
        } else {
            const targetDateValue = dateString
                || request.targetDate
                || request.startDate
                || request.endDate;
            targetDisplay = formatDate(targetDateValue);
        }

        const targetField = document.getElementById('vacationDetailTargetDate');
        if (targetField) {
            targetField.textContent = targetDisplay;
        }
        const typeField = document.getElementById('vacationDetailType');
        if (typeField) {
            typeField.textContent = leaveTypeLabel;
        }
        const unitField = document.getElementById('vacationDetailTimeUnit');
        if (unitField) {
            unitField.textContent = timeUnitLabel;
        }
        document.getElementById('vacationDetailDays').textContent = daysText;

        const statusElement = document.getElementById('vacationDetailStatus');
        const statusMap = {
            PENDING: '申請中',
            APPROVED: '承認済',
            REJECTED: '却下',
            CANCELLED: '取消'
        };
        const statusText = statusMap[request.status] || (request.status || '-');
        statusElement.textContent = statusText;

        document.getElementById('vacationDetailReason').textContent = request.reason || '理由は記載されていません';

        const vacationRejectionRow = document.getElementById('vacationRejectionRow');
        const vacationRejectionField = document.getElementById('vacationDetailRejection');
        if (vacationRejectionRow && vacationRejectionField) {
            const comment = request.rejectionComment || request.rejectionReason || '';
            const visible = comment.trim().length > 0;
            vacationRejectionRow.style.display = visible ? '' : 'none';
            vacationRejectionField.style.display = visible ? '' : 'none';
            vacationRejectionField.textContent = visible ? comment.trim() : '-';
        }

        this.currentVacationDetail = {
            request,
            dateString,
            fallbackId: targetId || ((request.leaveRequestId ?? request.id ?? request.vacationId) != null
                ? String(request.leaveRequestId ?? request.id ?? request.vacationId)
                : null)
        };

        if (this.vacationCancelButton) {
            const reqId = request.leaveRequestId ?? request.id ?? request.vacationId;
            const canCancel = (request.status === 'PENDING' || request.status === 'APPROVED') && reqId !== undefined && reqId !== null;
            if (canCancel) {
                this.vacationCancelButton.style.display = 'inline-block';
                this.vacationCancelButton.disabled = false;
                this.vacationCancelButton.dataset.vacationId = String(reqId);
            } else {
                this.vacationCancelButton.style.display = 'none';
                this.vacationCancelButton.removeAttribute('data-vacation-id');
            }
        }

        if (this.vacationResubmitButton) {
            const canResubmit = request.status === 'REJECTED';
            if (canResubmit) {
                this.vacationResubmitButton.style.display = 'inline-block';
                this.vacationResubmitButton.disabled = false;
            } else {
                this.vacationResubmitButton.style.display = 'none';
                this.vacationResubmitButton.disabled = false;
            }
        }

        const modalInstance = new bootstrap.Modal(modal);
        modalInstance.show();
    }

    /**
     * 休暇申請の取消処理
     */
    async handleVacationCancel() {
        if (!this.vacationCancelButton) return;
        const vacationDetail = this.currentVacationDetail;
        let vacationId = null;

        if (vacationDetail?.request) {
            const resolved = vacationDetail.request.vacationId ?? vacationDetail.request.id;
            if (resolved !== undefined && resolved !== null) {
                vacationId = String(resolved);
            }
        }

        if (!vacationId && vacationDetail?.fallbackId) {
            vacationId = vacationDetail.fallbackId;
        }

        if (!vacationId && this.vacationCancelButton.dataset.vacationId) {
            vacationId = this.vacationCancelButton.dataset.vacationId;
        }

        const normalizedId = (vacationId || '').trim();

        if (!normalizedId) {
            this.showAlert('申請IDを取得できません。画面を再読み込みしてください', 'danger');
            return;
        }
        if (!window.currentEmployeeId) {
            this.showAlert('従業員IDが取得できません', 'danger');
            return;
        }

        const status = vacationDetail?.request?.status || '';
        const isApproved = status === 'APPROVED';
        const confirmMessage = isApproved
            ? 'この休暇申請は既に承認済です。取消すると申請が無かったものとして扱われます。取消しますか？'
            : 'この休暇申請を取消しますか？';

        const confirmHandler = window.employeeDialog?.confirm;
        let confirmed = false;
        if (confirmHandler) {
            const result = await confirmHandler({
                title: '休暇申請の取消',
                message: confirmMessage,
                confirmLabel: '取消する',
                cancelLabel: 'キャンセル'
            });
            confirmed = !!result?.confirmed;
        } else {
            confirmed = window.confirm(confirmMessage);
        }

        if (!confirmed) {
            return;
        }

        let refreshRequired = false;
        let closeModal = false;

        try {
            this.vacationCancelButton.disabled = true;
            const cancelPayload = {
                leaveRequestId: Number(normalizedId),
                employeeId: window.currentEmployeeId
            };

            const data = await this.invokeVacationCancel(cancelPayload, normalizedId);

            this.showAlert(data?.message || '休暇申請を取消しました', 'success');
            refreshRequired = true;
            closeModal = true;
        } catch (error) {
            console.error('休暇申請取消エラー:', error);
            const message = error.message || '休暇申請の取消に失敗しました';
            const isMissing = message.includes('見つかりません') || message.includes('存在しません');
            const isStateError = message.includes('取消できない');

            if (isMissing || isStateError) {
                this.showAlert(`${message}。最新の状態を反映します`, 'info');
                refreshRequired = true;
                closeModal = true;
            } else {
                this.showAlert(message, 'danger');
            }
        } finally {
            this.vacationCancelButton.disabled = false;
            this.vacationCancelButton.removeAttribute('data-vacation-id');
        this.currentVacationDetail = null;
        if (this.vacationResubmitButton) {
            this.vacationResubmitButton.style.display = 'none';
            this.vacationResubmitButton.disabled = false;
        }

            if (closeModal) {
                const modalElement = document.getElementById('vacationDetailModal');
                if (modalElement && typeof bootstrap !== 'undefined') {
                    const instance = bootstrap.Modal.getInstance(modalElement);
                    instance?.hide();
                }
            }

            if (refreshRequired) {
                try {
                    await this.loadCalendarData(true); // 取消後はカレンダーを再生成
                } catch (refreshError) {
                    console.error('休暇申請取消後の再描画に失敗しました:', refreshError);
                }
            }
        }
    }

    /**
     * 打刻修正申請の再申請
     */
    handleAdjustmentResubmit() {
        if (this.adjustmentResubmitButton) {
            this.adjustmentResubmitButton.disabled = true;
        }
        const detail = this.currentAdjustmentDetail?.request;
        if (!detail) {
            this.showAlert('再申請するデータが見つかりません', 'danger');
            return;
        }

        const modalElement = document.getElementById('adjustmentDetailModal');
        if (modalElement && typeof bootstrap !== 'undefined') {
            const instance = bootstrap.Modal.getInstance(modalElement);
            instance?.hide();
        }

        if (typeof showScreen === 'function') {
            showScreen('adjustmentScreen');
        }

        setTimeout(() => {
            if (window.adjustmentScreen && typeof window.adjustmentScreen.prefillForm === 'function') {
                const toDate = (value, fallback = '') => {
                    if (!value) return fallback;
                    if (typeof value === 'string' && value.length >= 10) {
                        return value.slice(0, 10);
                    }
                    try {
                        const date = new Date(value);
                        if (!Number.isNaN(date.getTime())) {
                            const yyyy = date.getFullYear();
                            const mm = String(date.getMonth() + 1).padStart(2, '0');
                            const dd = String(date.getDate()).padStart(2, '0');
                            return `${yyyy}-${mm}-${dd}`;
                        }
                    } catch (e) {
                        // ignore
                    }
                    return fallback;
                };

                const toTime = (value) => {
                    if (!value) return '';
                    if (typeof value === 'string' && value.length >= 16) {
                        return value.slice(11, 16);
                    }
                    try {
                        const date = new Date(value);
                        if (!Number.isNaN(date.getTime())) {
                            const hh = String(date.getHours()).padStart(2, '0');
                            const mm = String(date.getMinutes()).padStart(2, '0');
                            return `${hh}:${mm}`;
                        }
                    } catch (e) {
                        // ignore
                    }
                    return '';
                };

                const fallbackDate = detail.targetDate || '';
                window.adjustmentScreen.prefillForm({
                    clockInDate: toDate(detail.newClockIn, toDate(fallbackDate)),
                    clockInTime: toTime(detail.newClockIn),
                    clockOutDate: toDate(detail.newClockOut, toDate(fallbackDate)),
                    clockOutTime: toTime(detail.newClockOut),
                    clockIn: detail.newClockIn,
                    clockOut: detail.newClockOut,
                    date: fallbackDate,
                    reason: detail.reason || '',
                    breakMinutes: detail.newBreakMinutes ?? detail.breakMinutes
                });
            }
        }, 150);

        this.currentAdjustmentDetail = null;
    }

    /**
     * 休暇申請の再申請
     */
    handleVacationResubmit() {
        if (this.vacationResubmitButton) {
            this.vacationResubmitButton.disabled = true;
        }
        const detail = this.currentVacationDetail?.request;
        if (!detail) {
            this.showAlert('再申請するデータが見つかりません', 'danger');
            return;
        }

        const modalElement = document.getElementById('vacationDetailModal');
        if (modalElement && typeof bootstrap !== 'undefined') {
            const instance = bootstrap.Modal.getInstance(modalElement);
            instance?.hide();
        }

        if (typeof showScreen === 'function') {
            showScreen('vacationScreen');
        }

        setTimeout(() => {
            if (window.vacationScreen && typeof window.vacationScreen.prefillForm === 'function') {
                window.vacationScreen.prefillForm({
                    startDate: detail.startDate,
                    endDate: detail.endDate,
                    reason: detail.reason || '',
                    leaveType: detail.leaveType || 'PAID_LEAVE',
                    timeUnit: detail.timeUnit || 'FULL_DAY'
                });
            }
        }, 150);

        this.currentVacationDetail = null;
    }

    hasPendingRequests() {
        return this.vacationRequests.some(item => (item.status || '').toUpperCase() === 'PENDING')
            || this.adjustmentRequests.some(item => (item.status || '').toUpperCase() === 'PENDING');
    }

    calculateSnapshot() {
        const serialize = (collection, idKey) => (collection || [])
            .map(item => `${item.date}|${(item.status || '').toUpperCase()}|${item[idKey] || ''}`)
            .sort()
            .join(',');

        return `${serialize(this.vacationRequests, 'vacationId')}::${serialize(this.adjustmentRequests, 'adjustmentRequestId')}::${serialize(this.workPatternRequests, 'requestId')}`;
    }

    startRealtimePolling(runImmediately = false) {
        if (this.realtimeTimer) {
            clearInterval(this.realtimeTimer);
        }

        const poll = async () => {
            if (this.pollingInProgress) return;
            if (document.hidden) return;
            const previousSnapshot = this.currentSnapshot;
            this.pollingInProgress = true;
            try {
                await this.loadCalendarData(true);
                const newSnapshot = this.calculateSnapshot();
                if (newSnapshot !== previousSnapshot) {
                    console.log('申請データの更新を検知したためカレンダーを再描画します');
                    this.generateCalendar();
                    this.currentSnapshot = newSnapshot;
                } else {
                    this.currentSnapshot = newSnapshot;
                }
            } catch (error) {
                console.warn('リアルタイム更新の取得に失敗しました:', error);
            } finally {
                this.pollingInProgress = false;
            }
        };

        this.realtimeTimer = setInterval(poll, this.pollIntervalMs);

        if (runImmediately) {
            poll();
        }

        if (!this.visibilityChangeHandler) {
            this.visibilityChangeHandler = () => {
                if (!document.hidden) {
                    poll();
                }
            };
            document.addEventListener('visibilitychange', this.visibilityChangeHandler);
        }
    }

    /**
     * 打刻修正取消API呼び出し
     */
    async invokeAdjustmentCancel(payload, fallbackId) {
        const primaryEndpoint = '/api/cancel/adjustment';
        const fallbackEndpoint = `/api/attendance/adjustment/${fallbackId}/cancel`;

        const tryRequest = async (url, body) => {
            const response = await fetchWithAuth.post(url, body);
            if (response.ok) {
                const data = await fetchWithAuth.parseJson(response);
                if (data && data.success === false) {
                    throw new Error(data.message || '修正申請の取消に失敗しました');
                }
                return data;
            }

            const errorData = await fetchWithAuth.parseJson(response);
            const message = errorData?.message || '';

            // 404/405 または 「POST はサポートされない」メッセージは旧APIと判断してフォールバック
            if (response.status === 404 || response.status === 405 || message.includes("Request method 'POST' is not supported")) {
                return null;
            }

            throw new Error(message || `修正申請の取消に失敗しました (HTTP ${response.status})`);
        };

        const primaryResult = await tryRequest(primaryEndpoint, payload);
        if (primaryResult) {
            return primaryResult;
        }

        const fallbackResult = await tryRequest(fallbackEndpoint, { employeeId: payload.employeeId });
        if (fallbackResult) {
            return fallbackResult;
        }

        throw new Error('修正申請の取消に失敗しました');
    }

    /**
     * 休暇取消API呼び出し
     */
    async invokeVacationCancel(payload, fallbackId) {
        const primaryEndpoint = '/api/cancel/leave';
        const fallbackEndpoint = `/api/leave/requests/${fallbackId}/cancel`;

        const tryRequest = async (url, body) => {
            const response = await fetchWithAuth.post(url, body);
            if (response.ok) {
                const data = await fetchWithAuth.parseJson(response);
                if (data && data.success === false) {
                    throw new Error(data.message || '休暇申請の取消に失敗しました');
                }
                return data;
            }

            const errorData = await fetchWithAuth.parseJson(response);
            const message = errorData?.message || '';

            if (response.status === 404 || response.status === 405 || message.includes("Request method 'POST' is not supported")) {
                return null;
            }

            throw new Error(message || `休暇申請の取消に失敗しました (HTTP ${response.status})`);
        };

        const primaryResult = await tryRequest(primaryEndpoint, payload);
        if (primaryResult) {
            return primaryResult;
        }

        const fallbackResult = await tryRequest(fallbackEndpoint, { employeeId: payload.employeeId });
        if (fallbackResult) {
            return fallbackResult;
        }

        throw new Error('休暇申請の取消に失敗しました');
    }

    combineDateTime(dateText, timeText) {
        const datePart = (dateText || '').trim();
        const timePart = (timeText || '').trim();

        if (datePart && timePart) {
            return `${datePart} ${timePart}`;
        }

        if (datePart) {
            return datePart;
        }

        if (timePart) {
            return timePart;
        }

        return '-';
    }

    /**
     * 勤怠情報レンダリング
     */
    renderAttendanceInfo(attendance, dateString = null, adjustmentRequest = null) {
        // 勤怠データまたは打刻修正申請データがない場合は何も表示しない
        if (!attendance && !adjustmentRequest) return '';

        console.log('勤怠情報レンダリング:', attendance, '打刻修正申請:', adjustmentRequest);

        // 有休申請の状態を確認
        const vacationRequest = dateString ? this.getVacationRequestForDate(dateString) : null;
        const isPaidLeaveApproved = vacationRequest && 
            vacationRequest.status === 'APPROVED' && 
            vacationRequest.leaveType === 'PAID_LEAVE';
        
        // 半休申請かどうかを判定
        const isHalfDayLeave = isPaidLeaveApproved && vacationRequest && 
            (vacationRequest.timeUnit === 'HALF_AM' || vacationRequest.timeUnit === 'HALF_PM');
            
        // 全日有休かどうかを判定（半休申請でない有休申請）
        const isFullDayLeave = isPaidLeaveApproved && !isHalfDayLeave;

        if (isFullDayLeave) {
            return `
                <div class="attendance-info">
                    <!-- 全日有休承認済の場合は出勤退勤打刻は表示しない -->
                </div>
            `;
        }

        // 出退勤時刻を取得
        let clockInTime = null;
        let clockOutTime = null;
        
        // まず勤怠データから時刻を取得
        if (attendance) {
            clockInTime = attendance.clockInTime ? 
                new Date(attendance.clockInTime).toLocaleTimeString('ja-JP', {hour: '2-digit', minute: '2-digit'}) : null;
            clockOutTime = attendance.clockOutTime ? 
                new Date(attendance.clockOutTime).toLocaleTimeString('ja-JP', {hour: '2-digit', minute: '2-digit'}) : null;
        }
        
        // 打刻修正申請が承認済みの場合のみ、修正後の時刻で上書き
        if (adjustmentRequest && adjustmentRequest.status === 'APPROVED' && adjustmentRequest.request) {
            const adjRequest = adjustmentRequest.request;
            if (adjRequest.newClockIn) {
                clockInTime = new Date(adjRequest.newClockIn).toLocaleTimeString('ja-JP', {hour: '2-digit', minute: '2-digit'});
            }
            if (adjRequest.newClockOut) {
                clockOutTime = new Date(adjRequest.newClockOut).toLocaleTimeString('ja-JP', {hour: '2-digit', minute: '2-digit'});
            }
        }
        // 申請中（PENDING）の場合は、勤怠データの時刻のみ表示（修正申請の時刻は表示しない）

        console.log('時刻変換結果:', { clockInTime, clockOutTime });

        // 出勤時刻のみ、退勤時刻のみ、または両方の表示を調整
        let timeDisplay = '';
        
        if (clockInTime && clockOutTime) {
            // 両方ある場合
            timeDisplay = `
                <div class="clock-times">
                    <small>出勤：${clockInTime} / 退勤：${clockOutTime}</small>
                </div>
            `;
        } else if (clockInTime) {
            // 出勤のみ - 出勤時刻だけを表示
            timeDisplay = `
                <div class="clock-times">
                    <small>出勤：${clockInTime}</small>
                </div>
            `;
        } else if (clockOutTime) {
            // 退勤のみ（通常はないが念のため）
            timeDisplay = `
                <div class="clock-times">
                    <small>出勤：--:-- / 退勤：${clockOutTime}</small>
                </div>
            `;
        }

        return `
            <div class="attendance-info">
                ${timeDisplay}
            </div>
        `;
    }

    /**
     * カスタム休日データ読み込み
     */
    async loadCustomHolidays() {
        if (!window.currentEmployeeId) return;

        try {
            const response = await fetch(`/api/custom-holidays/employee/${window.currentEmployeeId}`, {
                credentials: 'include'
            });

            if (response.ok) {
                const data = await response.json();
                this.customHolidays = data.data || [];
            }
        } catch (error) {
            console.error('カスタム休日データ読み込みエラー:', error);
            this.customHolidays = [];
        }
    }

    /**
     * 指定日のカスタム休日取得
     */
    getCustomHolidayForDate(dateString) {
        return this.customHolidays.find(holiday => {
            const holidayDate = new Date(holiday.holidayDate);
            const formattedDate = this.formatDateString(holidayDate);
            return formattedDate === dateString;
        });
    }

    /**
     * 履歴画面のタイトルを更新（管理者が閲覧している場合）
     */
    updateHistoryTitle() {
        const titleElement = document.querySelector('#historyScreen h5.mb-0');
        if (!titleElement) {
            return;
        }

        // 管理者が閲覧している場合
        if (window._adminViewingEmployeeId && window._adminViewingEmployeeName) {
            const employeeName = window._adminViewingEmployeeName;
            titleElement.textContent = `勤怠履歴（${employeeName} 閲覧中）`;
        } else {
            // 通常の表示
            titleElement.textContent = '勤怠履歴';
        }
    }
}

// グローバルインスタンスを作成
window.historyScreen = new HistoryScreen();
