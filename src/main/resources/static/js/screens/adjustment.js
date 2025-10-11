/**
 * 打刻修正申請画面モジュール
 */
class AdjustmentScreen {
    constructor() {
        this.adjustmentForm = null;
        this.clockInDateInput = null;
        this.clockInTimeInput = null;
        this.clockOutDateInput = null;
        this.clockOutTimeInput = null;
        this.adjustmentReason = null;
        this.formTitle = null;
        this.cancelPrefillButton = null;
        this.listenersBound = false;
    }

    prefillForm({ clockInDate, clockInTime, clockOutDate, clockOutTime, clockIn, clockOut, date, reason }) {
        if (!this.adjustmentForm) {
            this.init();
        }

        this.clearPrefillState();

        const normalizeDate = (value) => {
            if (!value) return '';
            if (value instanceof Date) {
                if (Number.isNaN(value.getTime())) return '';
                const yyyy = value.getFullYear();
                const mm = String(value.getMonth() + 1).padStart(2, '0');
                const dd = String(value.getDate()).padStart(2, '0');
                return `${yyyy}-${mm}-${dd}`;
            }
            if (typeof value === 'string') {
                if (value.includes('T')) {
                    return value.split('T')[0];
                }
                return value;
            }
            return '';
        };

        const normalizeTime = (value) => {
            if (!value) return '';
            if (value instanceof Date) {
                if (Number.isNaN(value.getTime())) return '';
                const hh = String(value.getHours()).padStart(2, '0');
                const mm = String(value.getMinutes()).padStart(2, '0');
                return `${hh}:${mm}`;
            }
            if (typeof value === 'string') {
                if (value.includes('T')) {
                    const timePart = value.split('T')[1] || '';
                    return timePart.slice(0, 5);
                }
                return value.slice(0, 5);
            }
            return '';
        };

        const resolvedClockInDate = clockInDate || normalizeDate(clockIn) || normalizeDate(date);
        const resolvedClockOutDate = clockOutDate || normalizeDate(clockOut) || normalizeDate(date);
        const resolvedClockInTime = clockInTime || normalizeTime(clockIn);
        const resolvedClockOutTime = clockOutTime || normalizeTime(clockOut);

        if (this.clockInDateInput && resolvedClockInDate) {
            this.clockInDateInput.value = resolvedClockInDate;
        }
        if (this.clockOutDateInput && resolvedClockOutDate) {
            this.clockOutDateInput.value = resolvedClockOutDate;
        }
        if (this.clockInTimeInput && resolvedClockInTime) {
            this.clockInTimeInput.value = resolvedClockInTime;
        }
        if (this.clockOutTimeInput && resolvedClockOutTime) {
            this.clockOutTimeInput.value = resolvedClockOutTime;
        }

        if (this.adjustmentReason) {
            this.adjustmentReason.value = reason || '';
        }

        if (this.formTitle) {
            this.formTitle.textContent = '打刻修正の再申請';
        }
        if (this.cancelPrefillButton) {
            this.cancelPrefillButton.style.display = 'inline-block';
            this.cancelPrefillButton.onclick = () => {
                this.adjustmentForm?.reset();
                this.setDefaultDate();
                this.clearPrefillState();
            };
        }
    }

    /**
     * 初期化
     */
    init() {
        this.initializeElements();
        this.setupEventListeners();
        this.setDefaultDate();
        this.clearPrefillState();
    }

    /**
     * DOM要素の初期化
     */
    initializeElements() {
        this.adjustmentForm = document.getElementById('adjustmentForm');
        this.clockInDateInput = document.getElementById('adjustmentClockInDate');
        this.clockInTimeInput = document.getElementById('adjustmentClockInTime');
        this.clockOutDateInput = document.getElementById('adjustmentClockOutDate');
        this.clockOutTimeInput = document.getElementById('adjustmentClockOutTime');
        this.adjustmentReason = document.getElementById('adjustmentReason');
        this.formTitle = document.getElementById('adjustmentFormTitle');
        this.cancelPrefillButton = document.getElementById('adjustmentFormCancel');
    }

    /**
     * イベントリスナー設定
     */
    setupEventListeners() {
        if (this.listenersBound) return;
        if (this.adjustmentForm) {
            this.adjustmentForm.addEventListener('submit', (e) => this.handleAdjustmentSubmit(e));
        }

        if (this.clockInDateInput) {
            this.clockInDateInput.addEventListener('change', () => this.validateDateFields());
        }
        if (this.clockOutDateInput) {
            this.clockOutDateInput.addEventListener('change', () => this.validateTimeRange());
        }
        if (this.clockInTimeInput) {
            this.clockInTimeInput.addEventListener('change', () => this.validateTimeRange());
        }
        if (this.clockOutTimeInput) {
            this.clockOutTimeInput.addEventListener('change', () => this.validateTimeRange());
        }

        this.listenersBound = true;
    }

    /**
     * デフォルト日付設定（今日の日付）
     */
    setDefaultDate() {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        const todayStr = `${year}-${month}-${day}`;

        if (this.clockInDateInput) {
            this.clockInDateInput.value = todayStr;
        }
        if (this.clockOutDateInput) {
            this.clockOutDateInput.value = todayStr;
        }
        if (this.clockInTimeInput) {
            this.clockInTimeInput.value = '';
        }
        if (this.clockOutTimeInput) {
            this.clockOutTimeInput.value = '';
        }
    }

    clearPrefillState() {
        if (this.formTitle) {
            this.formTitle.textContent = '打刻修正申請';
        }
        if (this.cancelPrefillButton) {
            this.cancelPrefillButton.style.display = 'none';
            this.cancelPrefillButton.onclick = null;
        }
    }

    /**
     * 打刻修正申請送信
     * @param {Event} e - イベント
     */
    async handleAdjustmentSubmit(e) {
        e.preventDefault();

        const clockInDate = this.clockInDateInput?.value || '';
        const clockInTime = this.clockInTimeInput?.value || '';
        const clockOutDate = this.clockOutDateInput?.value || '';
        const clockOutTime = this.clockOutTimeInput?.value || '';
        const reason = this.adjustmentReason?.value || '';

        if (!clockInDate || !clockOutDate || !reason) {
            this.showAlert('出勤日・退勤日・理由は必須です', 'warning');
            return;
        }

        if (!this.validateDateFields()) {
            return;
        }

        if (!clockInTime || !clockOutTime) {
            this.showAlert('出勤時刻と退勤時刻は両方入力してください', 'warning');
            return;
        }

        if (!this.validateTimeRange()) {
            return;
        }

        if (!window.currentEmployeeId) {
            this.showAlert('従業員IDが取得できません', 'danger');
            return;
        }

        const targetDates = this.expandDateRange(clockInDate, clockOutDate);
        try {
            const conflicts = await this.getActiveVacationConflicts(targetDates);
            if (conflicts.length > 0) {
                const displayDates = conflicts.map((date) => this.formatDateForDisplay(date)).filter(Boolean);
                const dateLabel = displayDates.length > 0 ? `対象日（${displayDates.join(', ')}）` : '対象日';
                this.showAlert(`${dateLabel}には有給申請が存在します。打刻修正するには、有給申請を取消してください。`, 'warning');
                return;
            }
        } catch (error) {
            console.error('有給申請状況の確認に失敗しました:', error);
            this.showAlert('有給申請状況の確認に失敗しました。時間をおいて再度お試しください。', 'danger');
            return;
        }

        const confirmHandler = window.employeeDialog?.confirm;
        const formatDateForDialog = (value) => {
            if (!value) {
                return '';
            }
            return value.replace(/-/g, '/');
        };

        const modalMessage = `打刻修正申請を送信します。\n出勤: ${formatDateForDialog(clockInDate)} ${clockInTime}\n退勤: ${formatDateForDialog(clockOutDate)} ${clockOutTime}`;
        const confirmMessage = `${modalMessage}\nよろしいですか？`;
        if (confirmHandler) {
            const { confirmed } = await confirmHandler({
                title: '打刻修正申請の送信',
                message: confirmMessage,
                confirmLabel: '申請する',
                cancelLabel: 'キャンセル'
            });
            if (!confirmed) {
                return;
            }
        } else {
            const confirmed = window.confirm(confirmMessage);
            if (!confirmed) {
                return;
            }
        }

        try {
            const data = await fetchWithAuth.handleApiCall(
                () => fetchWithAuth.post('/api/attendance/adjustment-request', {
                    employeeId: window.currentEmployeeId,
                    date: clockInDate,
                    clockInDate: clockInDate,
                    clockInTime: clockInTime,
                    clockOutDate: clockOutDate,
                    clockOutTime: clockOutTime,
                    reason: reason
                }),
                '打刻修正申請に失敗しました'
            );

            this.showAlert(data.message, 'success');
            this.adjustmentForm.reset();
            this.setDefaultDate();
            this.clearPrefillState();

            await this.refreshAllScreens();
        } catch (error) {
            this.showAlert(error.message, 'danger');
        }
    }

    /**
     * 出勤日のバリデーション
     * @returns {boolean}
     */
    validateDateFields() {
        if (!this.clockInDateInput) {
            return true;
        }

        const dateStr = this.clockInDateInput.value;
        if (!dateStr) {
            return true;
        }

        const selectedDate = new Date(`${dateStr}T00:00:00`);
        if (Number.isNaN(selectedDate.getTime())) {
            this.showAlert('有効な出勤日を入力してください', 'warning');
            this.clockInDateInput.focus();
            return false;
        }

        return true;
    }

    /**
     * 時刻範囲のバリデーション
     * @returns {boolean}
     */
    validateTimeRange() {
        if (!this.clockInDateInput || !this.clockOutDateInput || !this.clockInTimeInput || !this.clockOutTimeInput) {
            return true;
        }

        const clockInDate = this.clockInDateInput.value;
        const clockOutDate = this.clockOutDateInput.value;
        const clockInTime = this.clockInTimeInput.value;
        const clockOutTime = this.clockOutTimeInput.value;

        if (!clockInDate || !clockOutDate || !clockInTime || !clockOutTime) {
            return true;
        }

        const start = new Date(`${clockInDate}T${clockInTime}:00`);
        const end = new Date(`${clockOutDate}T${clockOutTime}:00`);

        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
            this.showAlert('有効な出勤・退勤日時を入力してください', 'warning');
            return false;
        }

        if (end <= start) {
            this.showAlert('退勤日時は出勤日時より後に設定してください', 'warning');
            this.clockOutTimeInput.focus();
            return false;
        }

        const workHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
        if (workHours > 36) {
            this.showAlert('勤務時間が長すぎます（36時間以内で入力してください）', 'warning');
            return false;
        }

        return true;
    }

    /**
     * 全画面を更新（リアルタイム反映）
     */
    async refreshAllScreens() {
        try {
            console.log('打刻修正申請後の画面更新を開始します');
            
            if (window.historyScreen) {
                console.log('勤怠履歴画面を更新中...');
                try {
                    if (typeof window.historyScreen.loadCalendarData === 'function') {
                        await window.historyScreen.loadCalendarData();
                    }
                    if (typeof window.historyScreen.generateCalendar === 'function') {
                        window.historyScreen.generateCalendar();
                    }
                    console.log('勤怠履歴画面の更新完了');
                } catch (error) {
                    console.warn('勤怠履歴画面の更新に失敗:', error);
                }
            }
            
            if (window.calendarScreen) {
                console.log('カレンダー画面を更新中...');
                try {
                    if (typeof window.calendarScreen.loadCalendarData === 'function') {
                        await window.calendarScreen.loadCalendarData();
                    }
                    if (typeof window.calendarScreen.generateCalendar === 'function') {
                        window.calendarScreen.generateCalendar();
                    }
                    console.log('カレンダー画面の更新完了');
                } catch (error) {
                    console.warn('カレンダー画面の更新に失敗:', error);
                }
            }
            
            if (window.dashboardScreen) {
                console.log('ダッシュボード画面を更新中...');
                try {
                    if (typeof window.dashboardScreen.loadTodayAttendance === 'function') {
                        await window.dashboardScreen.loadTodayAttendance();
                    }
                    console.log('ダッシュボード画面の更新完了');
                } catch (error) {
                    console.warn('ダッシュボード画面の更新に失敗:', error);
                }
            }
            
            console.log('打刻修正申請後の画面更新が完了しました');
        } catch (error) {
            console.warn('打刻修正申請後の画面更新に失敗しました:', error);
        }
    }

    /**
     * アラート表示
     * @param {string} message - メッセージ
     * @param {string} type - アラートタイプ
     */
    showAlert(message, type = 'info') {
        const alertContainer = document.getElementById('alertContainer');
        if (!alertContainer) return;

        const alertDiv = document.createElement('div');
        alertDiv.className = `alert alert-${type} alert-dismissible fade show`;
        alertDiv.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;

        alertContainer.appendChild(alertDiv);

        setTimeout(() => {
            if (alertDiv.parentNode) {
                alertDiv.parentNode.removeChild(alertDiv);
            }
        }, 5000);
    }

    expandDateRange(startStr, endStr) {
        const start = this.parseDate(startStr);
        const end = this.parseDate(endStr || startStr);
        if (!start || !end) {
            return [];
        }
        const dates = [];
        const cursor = new Date(start.getTime());
        while (cursor.getTime() <= end.getTime()) {
            dates.push(this.formatDateString(cursor));
            cursor.setDate(cursor.getDate() + 1);
        }
        return dates;
    }

    async getActiveVacationConflicts(dateStrings) {
        if (!Array.isArray(dateStrings) || dateStrings.length === 0) {
            return [];
        }
        if (!window.currentEmployeeId) {
            return [];
        }

        const response = await fetchWithAuth.handleApiCall(
            () => fetchWithAuth.get(`/api/leave/requests/${window.currentEmployeeId}`),
            '休暇申請の取得に失敗しました'
        );

        let list = [];
        if (response && response.success && Array.isArray(response.data)) {
            list = response.data;
        } else if (Array.isArray(response)) {
            list = response;
        } else if (response && Array.isArray(response.requests)) {
            list = response.requests;
        }

        const dateSet = new Set(dateStrings);
        const conflicts = new Set();
        list.forEach((req) => {
            const status = (req?.status || '').toString().toUpperCase();
            if (!['PENDING', 'APPROVED'].includes(status)) {
                return;
            }

            const startDate = this.parseDate(req.startDate || req.date);
            const endDate = this.parseDate(req.endDate || req.date || req.startDate);
            if (!startDate || !endDate) {
                return;
            }

            const range = this.expandDateRange(
                this.formatDateString(startDate),
                this.formatDateString(endDate)
            );
            range.forEach((date) => {
                if (dateSet.has(date)) {
                    conflicts.add(date);
                }
            });
        });

        return Array.from(conflicts).sort();
    }

    parseDate(value) {
        const normalized = this.normalizeDateString(value);
        if (!normalized) {
            return null;
        }
        const [yearStr, monthStr, dayStr] = normalized.split('-');
        const year = parseInt(yearStr, 10);
        const month = parseInt(monthStr, 10);
        const day = parseInt(dayStr, 10);
        if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) {
            return null;
        }
        const date = new Date(year, month - 1, day);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    normalizeDateString(value) {
        if (!value) {
            return '';
        }
        if (value instanceof Date) {
            return this.formatDateString(value);
        }
        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (!trimmed) {
                return '';
            }
            if (trimmed.includes('T')) {
                return trimmed.split('T')[0];
            }
            return trimmed;
        }
        return '';
    }

    formatDateString(date) {
        if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
            return '';
        }
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    formatDateForDisplay(dateStr) {
        const normalized = this.normalizeDateString(dateStr);
        if (!normalized) {
            return '';
        }
        return normalized.replace(/-/g, '/');
    }
}

// グローバルインスタンスを作成
window.adjustmentScreen = new AdjustmentScreen();
