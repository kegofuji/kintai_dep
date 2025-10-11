/**
 * 休暇申請画面モジュール
 */
class VacationScreen {
    constructor() {
        this.vacationForm = null;
        this.vacationStartDate = null;
        this.vacationEndDate = null;
        this.vacationReason = null;
        this.leaveTypeSelect = null;
        this.balanceSummary = null;
        this.reasonLabel = null;
        this.reasonRequiredMark = null;
        this.specialNotice = null;
        this.prefillCancelButton = null;
        this.formTitle = null;

        this.listenersBound = false;
        this.remainingByType = {};
        this.activeGrantsByType = new Map();
        this.specialAllowedDates = new Set();

        this.leaveTypeDisplayMap = {
            PAID_LEAVE: '有休',
            SUMMER: '有休',
            WINTER: '有休',
            SPECIAL: '有休'
        };

        this.timeUnitDisplayMap = {
            FULL_DAY: '全日',
            HALF_AM: 'AM',
            HALF_PM: 'PM'
        };
    }

    /**
     * 初期化処理
     */
    async init() {
        this.initializeElements();
        this.setupEventListeners();
        this.clearPrefillState();
        await this.loadAllSupportingData();
    }

    /**
     * DOM要素の初期化
     */
    initializeElements() {
        this.vacationForm = document.getElementById('vacationForm');
        this.vacationStartDate = document.getElementById('vacationStartDate');
        this.vacationEndDate = document.getElementById('vacationEndDate');
        this.vacationReason = document.getElementById('vacationReason');
        this.leaveTypeSelect = document.getElementById('vacationTypeSelect');
        this.balanceSummary = document.getElementById('vacationBalanceSummary');
        this.reasonLabel = document.getElementById('vacationReasonLabel');
        this.reasonRequiredMark = document.getElementById('vacationReasonRequiredMark');
        this.specialNotice = document.getElementById('vacationSpecialNotice');
        this.prefillCancelButton = document.getElementById('vacationFormCancel');
        this.formTitle = document.getElementById('vacationFormTitle');
    }

    /**
     * イベントリスナー設定
     */
    setupEventListeners() {
        if (this.listenersBound) return;

        if (this.vacationForm) {
            this.vacationForm.addEventListener('submit', (e) => this.handleVacationSubmit(e));
        }

        if (this.leaveTypeSelect) {
            this.leaveTypeSelect.addEventListener('change', () => this.handleLeaveTypeChange());
        }

        if (this.vacationStartDate) {
            this.vacationStartDate.addEventListener('change', () => this.syncEndDateIfNeeded());
        }

        if (this.vacationEndDate) {
            this.vacationEndDate.addEventListener('change', () => this.handleDateRangeChange());
        }

        this.listenersBound = true;
    }

    /**
     * プレフィル解除
     */
    clearPrefillState() {
        if (this.formTitle) {
            this.formTitle.textContent = '休暇申請';
        }
        if (this.prefillCancelButton) {
            this.prefillCancelButton.style.display = 'none';
            this.prefillCancelButton.onclick = null;
        }
        if (this.leaveTypeSelect) {
            // 先頭の利用可能な選択肢を選択
            const availableOption = Array.from(this.leaveTypeSelect.options).find((opt) => !opt.disabled);
            if (availableOption) {
                this.leaveTypeSelect.value = availableOption.value;
            }
        }
        this.handleLeaveTypeChange();
    }

    /**
     * プレフィル
     */
    prefillForm({ startDate, endDate, reason, leaveType, timeUnit }) {
        if (!this.vacationForm) {
            this.init();
        }

        this.clearPrefillState();

        if (leaveType && timeUnit && this.leaveTypeSelect) {
            const candidate = `${leaveType}:${timeUnit}`;
            if (Array.from(this.leaveTypeSelect.options).some((opt) => opt.value === candidate)) {
                this.leaveTypeSelect.value = candidate;
            }
        }

        if (startDate && this.vacationStartDate) {
            this.vacationStartDate.value = this.normalizeDateString(startDate);
        }

        if (endDate && this.vacationEndDate) {
            this.vacationEndDate.value = this.normalizeDateString(endDate);
        }

        if (this.vacationReason) {
            this.vacationReason.value = reason || '';
        }

        if (this.formTitle) {
            this.formTitle.textContent = '休暇申請の再申請';
        }

        if (this.prefillCancelButton) {
            this.prefillCancelButton.style.display = 'inline-block';
            this.prefillCancelButton.onclick = () => {
                this.vacationForm?.reset();
                this.clearPrefillState();
            };
        }

        this.handleLeaveTypeChange();
    }

    /**
     * 補助データの読み込み
     */
    async loadAllSupportingData() {
        if (!window.currentEmployeeId) {
            return;
        }
        await Promise.all([
            this.loadRemainingVacationDays(),
            this.loadActiveGrants()
        ]);
        this.updateLeaveTypeAvailability();
        this.handleLeaveTypeChange();
    }

    /**
     * 残休暇日数読み込み
     */
    async loadRemainingVacationDays() {
        if (!window.currentEmployeeId || !this.balanceSummary) {
            return;
        }

        try {
            const data = await fetchWithAuth.handleApiCall(
                () => fetchWithAuth.get(`/api/leave/remaining/${window.currentEmployeeId}`),
                '休暇残数の取得に失敗しました'
            );

            if (data && data.success && data.remaining) {
                this.remainingByType = {};
                Object.entries(data.remaining).forEach(([key, value]) => {
                    const numeric = Number(value);
                    this.remainingByType[key] = Number.isFinite(numeric) ? numeric : 0;
                });
                this.renderBalanceSummary();
            } else {
                this.remainingByType = {};
                this.balanceSummary.textContent = '--';
            }
        } catch (error) {
            console.error('休暇残数取得エラー:', error);
            this.balanceSummary.textContent = '--';
        }
    }

    /**
     * 付与情報読み込み
     */
    async loadActiveGrants() {
        if (!window.currentEmployeeId) {
            return;
        }

        try {
            const data = await fetchWithAuth.handleApiCall(
                () => fetchWithAuth.get(`/api/leave/grants/${window.currentEmployeeId}`),
                '休暇付与情報の取得に失敗しました'
            );

            this.activeGrantsByType = new Map();
            this.specialAllowedDates = new Set();

            if (data && data.success && Array.isArray(data.data)) {
                data.data.forEach((grant) => {
                    const type = grant.leaveType;
                    if (!this.activeGrantsByType.has(type)) {
                        this.activeGrantsByType.set(type, []);
                    }
                    this.activeGrantsByType.get(type).push(grant);

                    if (type === 'SPECIAL') {
                        const grantedDate = this.normalizeDateString(grant.grantedAt);
                        const expiresAt = this.normalizeDateString(grant.expiresAt);
                        if (grantedDate) {
                            const today = new Date();
                            const grantDateObj = this.parseDate(grantedDate);
                            let isValid = !!grantDateObj;
                            if (isValid && expiresAt) {
                                const expires = this.parseDate(expiresAt);
                                isValid = expires && expires.getTime() >= today.setHours(0, 0, 0, 0);
                            }
                            if (isValid) {
                                this.specialAllowedDates.add(grantedDate);
                            }
                        }
                    }
                });
            }

            this.updateSpecialNotice();
        } catch (error) {
            console.error('休暇付与情報取得エラー:', error);
            this.activeGrantsByType = new Map();
            this.specialAllowedDates = new Set();
            this.updateSpecialNotice();
        }
    }

    /**
     * 残数サマリ描画
     */
    renderBalanceSummary() {
        if (!this.balanceSummary) {
            return;
        }

        const entries = [
            ['PAID_LEAVE', '有休'],
            ['SUMMER', '夏季'],
            ['WINTER', '冬季'],
            ['SPECIAL', '特別']
        ];

        const parts = entries.map(([key, label]) => {
            const value = this.getRemainingDays(key);
            return `${label}: ${value % 1 === 0 ? value : value.toFixed(1)}日`;
        });

        this.balanceSummary.textContent = parts.join(' / ');
    }

    /**
     * 特別休暇案内の更新
     */
    updateSpecialNotice() {
        if (!this.specialNotice) {
            return;
        }

        if (this.specialAllowedDates.size === 0) {
            this.specialNotice.classList.add('d-none');
            this.specialNotice.textContent = '';
            return;
        }

        const dates = Array.from(this.specialAllowedDates)
            .sort()
            .map((date) => this.formatDateForDisplay(date));
        this.specialNotice.classList.remove('d-none');
        this.specialNotice.classList.add('alert', 'alert-info');
        this.specialNotice.textContent = `特別休暇の申請可能日: ${dates.join(', ')}`;
    }

    /**
     * 休暇種別選択変更時の処理
     */
    handleLeaveTypeChange() {
        const { leaveType, timeUnit } = this.getSelectedLeaveType();
        const isPaidLeave = leaveType === 'PAID_LEAVE';
        const isHalfDay = timeUnit === 'HALF_AM' || timeUnit === 'HALF_PM';
        const isSpecial = leaveType === 'SPECIAL';

        if (this.vacationReason) {
            if (isPaidLeave) {
                this.vacationReason.required = true;
                this.vacationReason.placeholder = '休暇理由を入力してください';
                if (this.reasonRequiredMark) {
                    this.reasonRequiredMark.classList.remove('d-none');
                }
            } else {
                this.vacationReason.required = false;
                this.vacationReason.placeholder = '必要に応じて理由を入力してください（任意）';
                if (this.reasonRequiredMark) {
                    this.reasonRequiredMark.classList.add('d-none');
                }
            }
        }

        if (this.vacationEndDate) {
            const disableEndDate = isHalfDay || isSpecial;
            this.vacationEndDate.disabled = disableEndDate;
            if (disableEndDate && this.vacationStartDate && this.vacationStartDate.value) {
                this.vacationEndDate.value = this.vacationStartDate.value;
            }
        }

        if (this.specialNotice) {
            if (isSpecial) {
                if (this.specialAllowedDates.size > 0) {
                    this.specialNotice.classList.remove('d-none');
                } else {
                    this.specialNotice.classList.add('d-none');
                }
            } else if (this.specialAllowedDates.size === 0) {
                this.specialNotice.classList.add('d-none');
            }
        }
    }

    /**
     * 日付入力同期
     */
    syncEndDateIfNeeded() {
        if (!this.vacationStartDate || !this.vacationEndDate) {
            return;
        }
        const { leaveType, timeUnit } = this.getSelectedLeaveType();
        const isHalfDay = timeUnit === 'HALF_AM' || timeUnit === 'HALF_PM';
        const isSpecial = leaveType === 'SPECIAL';

        if (isHalfDay || isSpecial) {
            this.vacationEndDate.value = this.vacationStartDate.value;
        }
    }

    handleDateRangeChange() {
        // 範囲変更時の追加処理が必要な場合に備えたプレースホルダー
    }

    /**
     * 休暇種別の選択肢を更新
     */
    updateLeaveTypeAvailability() {
        if (!this.leaveTypeSelect) {
            return;
        }

        const options = Array.from(this.leaveTypeSelect.options);
        options.forEach((option) => {
            const { leaveType, timeUnit } = this.parseOptionValue(option.value);
            let canSelect = true;
            const remaining = this.getRemainingDays(leaveType);

            if (leaveType === 'PAID_LEAVE') {
                if (timeUnit === 'HALF_AM' || timeUnit === 'HALF_PM') {
                    canSelect = remaining >= 0.5;
                } else {
                    canSelect = remaining >= 1;
                }
            } else {
                canSelect = remaining >= 1;
            }

            if (leaveType === 'SPECIAL') {
                canSelect = canSelect && this.specialAllowedDates.size > 0;
            }

            option.disabled = !canSelect;
        });

        if (this.leaveTypeSelect && this.leaveTypeSelect.value) {
            const selectedOption = this.leaveTypeSelect.selectedOptions[0];
            if (selectedOption && selectedOption.disabled) {
                const fallback = options.find((opt) => !opt.disabled);
                if (fallback) {
                    this.leaveTypeSelect.value = fallback.value;
                }
            }
        }
    }

    /**
     * 休暇申請送信処理
     */
    async handleVacationSubmit(e) {
        e.preventDefault();

        if (!window.currentEmployeeId) {
            this.showAlert('従業員IDが取得できません', 'danger');
            return;
        }

        const { leaveType, timeUnit } = this.getSelectedLeaveType();
        const startDate = this.vacationStartDate?.value || '';
        const endDate = this.vacationEndDate?.value || startDate;
        const reasonRaw = this.vacationReason?.value || '';
        const reason = reasonRaw.trim();

        if (!startDate || !endDate) {
            this.showAlert('開始日・終了日の両方を指定してください', 'warning');
            return;
        }

        const isPaidLeave = leaveType === 'PAID_LEAVE';
        if (isPaidLeave && !reason) {
            this.showAlert('有休の場合は理由を入力してください', 'warning');
            this.vacationReason?.focus();
            return;
        }

        if (!this.validateDateRange()) {
            return;
        }

        const requestDates = this.expandDateRange(startDate, endDate);
        try {
            const conflicts = await this.getActiveAdjustmentConflicts(requestDates);
            if (conflicts.length > 0) {
                const displayDates = conflicts.map((date) => this.formatDateForDisplay(date)).filter(Boolean);
                const dateLabel = displayDates.length > 0 ? `対象日（${displayDates.join(', ')}）` : '対象日';
                this.showAlert(`${dateLabel}には打刻修正申請が存在します。休暇申請するには、打刻修正申請を取消してください。`, 'warning');
                return;
            }
        } catch (error) {
            console.error('打刻修正申請状況の確認に失敗しました:', error);
            this.showAlert('打刻修正申請状況の確認に失敗しました。時間をおいて再度お試しください。', 'danger');
            return;
        }

        const leaveLabel = this.leaveTypeDisplayMap[leaveType] || leaveType;
        const unitLabelRaw = this.timeUnitDisplayMap[timeUnit] || '';
        const unitLabel = unitLabelRaw;

        const displayStart = this.formatDateForDisplay(startDate);
        const displayEnd = this.formatDateForDisplay(endDate);
        const rangeText = displayStart === displayEnd ? displayStart : `${displayStart} 〜 ${displayEnd}`;
        const summaryLabel = unitLabel ? `${leaveLabel}（${unitLabel}）` : leaveLabel;
        const confirmMessage = `休暇種別: ${summaryLabel}\n対象日: ${rangeText}\n休暇申請を送信します。よろしいですか？`;

        const confirmHandler = window.employeeDialog?.confirm;
        if (confirmHandler) {
            const { confirmed } = await confirmHandler({
                title: '休暇申請',
                message: confirmMessage.replace(/\n/g, '\n'),
                confirmLabel: '申請する',
                cancelLabel: 'キャンセル'
            });
            if (!confirmed) {
                return;
            }
        } else if (!window.confirm(confirmMessage)) {
            return;
        }

        try {
            const payload = {
                employeeId: window.currentEmployeeId,
                leaveType,
                timeUnit,
                startDate,
                endDate,
                reason: reason || null
            };

            const data = await fetchWithAuth.handleApiCall(
                () => fetchWithAuth.post('/api/leave/requests', payload),
                '休暇申請に失敗しました'
            );

            this.showAlert(data.message || '休暇申請が完了しました', 'success');
            this.vacationForm?.reset();
            this.clearPrefillState();

            await this.loadAllSupportingData();
            await this.refreshAllScreens();
        } catch (error) {
            this.showAlert(error.message || '休暇申請に失敗しました', 'danger');
        }
    }

    /**
     * 日付範囲のバリデーション
     */
    validateDateRange() {
        if (!this.vacationStartDate || !this.vacationEndDate) {
            return true;
        }

        const startDate = this.vacationStartDate.value;
        const endDate = this.vacationEndDate.value || startDate;
        const start = this.parseLocalDate(startDate);
        const end = this.parseLocalDate(endDate);

        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
            this.showAlert('有効な日付を入力してください', 'warning');
            return false;
        }

        if (end < start) {
            this.showAlert('終了日は開始日以降の日付を選択してください', 'warning');
            this.vacationEndDate.focus();
            return false;
        }

        const { leaveType, timeUnit } = this.getSelectedLeaveType();
        const requestedDays = this.calculateRequestedDays(start, end, timeUnit);
        if (requestedDays <= 0) {
            this.showAlert('申請期間の日付が不正です', 'warning');
            return false;
        }

        const remaining = this.getRemainingDays(leaveType);
        if (remaining < requestedDays) {
            const label = this.leaveTypeDisplayMap[leaveType] || leaveType;
            this.showAlert(`申請日数（${requestedDays}日）が${label}の残日数（${remaining}日）を超えています`, 'warning');
            return false;
        }

        // 特別休暇は指定日のみ
        if (leaveType === 'SPECIAL') {
            const selectedDates = this.expandDateRange(startDate, endDate);
            const invalid = selectedDates.filter((date) => !this.specialAllowedDates.has(date));
            if (invalid.length > 0) {
                this.showAlert('特別休暇は管理者が指定した日以外では申請できません', 'warning');
                return false;
            }
        }

        // 夏季・冬季休暇は有効期間内のみ
        if (leaveType === 'SUMMER' || leaveType === 'WINTER') {
            const selectedDates = this.expandDateRange(startDate, endDate);
            const grants = this.activeGrantsByType.get(leaveType) || [];
            const invalid = selectedDates.filter((date) => !this.isDateCoveredByGrant(date, grants));
            if (invalid.length > 0) {
                this.showAlert('選択した期間に有効な休暇付与がありません', 'warning');
                return false;
            }
        }

        return true;
    }

    /**
     * 選択中の休暇種別と単位を取得
     */
    getSelectedLeaveType() {
        if (!this.leaveTypeSelect || !this.leaveTypeSelect.value) {
            return { leaveType: 'PAID_LEAVE', timeUnit: 'FULL_DAY' };
        }
        return this.parseOptionValue(this.leaveTypeSelect.value);
    }

    parseOptionValue(value) {
        if (!value.includes(':')) {
            return { leaveType: value, timeUnit: 'FULL_DAY' };
        }
        const [leaveType, timeUnit] = value.split(':');
        return {
            leaveType: leaveType || 'PAID_LEAVE',
            timeUnit: timeUnit || 'FULL_DAY'
        };
    }

    /**
     * 休暇残数取得
     */
    getRemainingDays(leaveType) {
        if (!leaveType || !this.remainingByType) {
            return 0;
        }
        const value = this.remainingByType[leaveType];
        if (typeof value === 'number') {
            return Math.max(0, Math.round(value * 10) / 10);
        }
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
            return Math.max(0, Math.round(parsed * 10) / 10);
        }
        return 0;
    }

    /**
     * 申請日数計算
     */
    calculateRequestedDays(start, end, timeUnit) {
        if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
            return 0;
        }
        if (timeUnit === 'HALF_AM' || timeUnit === 'HALF_PM') {
            return 0.5;
        }

        let count = 0;
        const cursor = new Date(start.getTime());
        while (cursor <= end) {
            count += 1;
            cursor.setDate(cursor.getDate() + 1);
        }
        return count;
    }

    /**
     * 指定日が付与期間内か判定
     */
    isDateCoveredByGrant(dateString, grants) {
        if (!Array.isArray(grants) || grants.length === 0) {
            return false;
        }
        const target = this.parseDate(dateString);
        if (!target) {
            return false;
        }
        return grants.some((grant) => {
            const grantStart = this.parseDate(grant.grantedAt) || target;
            const grantEnd = grant.expiresAt ? this.parseDate(grant.expiresAt) : null;
            if (grantEnd) {
                return grantStart.getTime() <= target.getTime() && target.getTime() <= grantEnd.getTime();
            }
            return grantStart.getTime() <= target.getTime();
        });
    }

    /**
     * 他画面の更新
     */
    async refreshAllScreens() {
        try {
            if (window.historyScreen) {
                try {
                    if (typeof window.historyScreen.loadCalendarData === 'function') {
                        await window.historyScreen.loadCalendarData(true);
                    } else if (typeof window.historyScreen.loadAttendanceHistory === 'function') {
                        await window.historyScreen.loadAttendanceHistory();
                    }
                } catch (error) {
                    console.warn('勤怠履歴画面の更新に失敗:', error);
                }
            }

            if (window.calendarScreen) {
                try {
                    if (typeof window.calendarScreen.loadCalendarData === 'function') {
                        await window.calendarScreen.loadCalendarData();
                    }
                } catch (error) {
                    console.warn('カレンダー画面の更新に失敗:', error);
                }
            }

            if (window.dashboardScreen) {
                try {
                    if (typeof window.dashboardScreen.loadTodayAttendance === 'function') {
                        await window.dashboardScreen.loadTodayAttendance();
                    }
                } catch (error) {
                    console.warn('ダッシュボード画面の更新に失敗:', error);
                }
            }
        } catch (error) {
            console.warn('休暇申請後の画面更新に失敗しました:', error);
        }
    }

    /**
     * アラート表示
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

    async getActiveAdjustmentConflicts(dateStrings) {
        if (!Array.isArray(dateStrings) || dateStrings.length === 0 || !window.currentEmployeeId) {
            return [];
        }

        const response = await fetchWithAuth.handleApiCall(
            () => fetchWithAuth.get(`/api/attendance/adjustment/${window.currentEmployeeId}`),
            '打刻修正申請の取得に失敗しました'
        );

        let list = [];
        if (response && response.success && Array.isArray(response.data)) {
            list = response.data;
        } else if (Array.isArray(response)) {
            list = response;
        } else if (response && Array.isArray(response.adjustmentRequests)) {
            list = response.adjustmentRequests;
        }

        const dateSet = new Set(dateStrings);
        const conflicts = new Set();
        list.forEach((req) => {
            const status = (req?.status || '').toString().toUpperCase();
            if (!['PENDING', 'APPROVED'].includes(status)) {
                return;
            }

            this.collectAdjustmentDates(req).forEach((date) => {
                if (dateSet.has(date)) {
                    conflicts.add(date);
                }
            });
        });

        return Array.from(conflicts).sort();
    }

    collectAdjustmentDates(request) {
        const dates = new Set();
        const add = (value) => {
            const normalized = this.normalizeDateString(value);
            if (normalized) {
                dates.add(normalized);
            }
        };

        add(request?.targetDate);
        add(request?.date);
        add(request?.attendanceDate);
        add(request?.clockInDate);
        add(request?.clockOutDate);
        add(request?.startDate);
        add(request?.endDate);
        add(request?.originalClockIn);
        add(request?.originalClockOut);
        add(request?.newClockIn);
        add(request?.newClockOut);

        if (request?.targetDateStart && request?.targetDateEnd) {
            this.expandDateRange(request.targetDateStart, request.targetDateEnd)
                .forEach((date) => dates.add(date));
        }

        return Array.from(dates);
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

    parseLocalDate(value) {
        if (!value) return new Date(NaN);
        const [yearStr, monthStr, dayStr] = value.split('-');
        const year = parseInt(yearStr, 10);
        const month = parseInt(monthStr, 10);
        const day = parseInt(dayStr, 10);
        if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) {
            return new Date(NaN);
        }
        return new Date(year, month - 1, day);
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
window.vacationScreen = new VacationScreen();
