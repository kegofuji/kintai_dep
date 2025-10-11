-- 既存のvacation_requestsテーブルをleave_requestsに改名し、必要なカラムを追加
RENAME TABLE vacation_requests TO leave_requests;

-- 主キー列名を変更
ALTER TABLE leave_requests CHANGE COLUMN vacation_id id BIGINT AUTO_INCREMENT;

-- 休暇種別・取得単位・承認者IDを追加
ALTER TABLE leave_requests
    ADD COLUMN leave_type VARCHAR(32) NOT NULL DEFAULT 'PAID_LEAVE' AFTER employee_id,
    ADD COLUMN time_unit VARCHAR(16) NOT NULL DEFAULT 'FULL_DAY' AFTER leave_type,
    ADD COLUMN approver_id BIGINT NULL AFTER status;

-- daysカラムを少数に変更（半休対応）
ALTER TABLE leave_requests MODIFY COLUMN days DECIMAL(5,2) NOT NULL;

-- reasonカラムの長さ拡張
ALTER TABLE leave_requests MODIFY COLUMN reason VARCHAR(500);

-- 既存データを更新
UPDATE leave_requests SET leave_type = 'PAID_LEAVE' WHERE leave_type IS NULL;
UPDATE leave_requests SET time_unit = 'FULL_DAY' WHERE time_unit IS NULL;

-- 承認者IDの外部キー制約（オプション）
ALTER TABLE leave_requests
    ADD CONSTRAINT fk_leave_requests_approver
        FOREIGN KEY (approver_id) REFERENCES employees(employee_id);

-- 休暇残数テーブルの新設
CREATE TABLE leave_balances (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    employee_id BIGINT NOT NULL,
    leave_type VARCHAR(32) NOT NULL,
    total_days DECIMAL(6,2) NOT NULL DEFAULT 0,
    used_days DECIMAL(6,2) NOT NULL DEFAULT 0,
    remaining_days DECIMAL(6,2) NOT NULL DEFAULT 0,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_leave_balances_employee FOREIGN KEY (employee_id) REFERENCES employees(employee_id),
    CONSTRAINT uk_leave_balances_employee_type UNIQUE (employee_id, leave_type)
);

-- 休暇付与履歴テーブル
CREATE TABLE leave_grants (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    employee_id BIGINT NOT NULL,
    leave_type VARCHAR(32) NOT NULL,
    granted_days DECIMAL(6,2) NOT NULL,
    granted_at DATE NOT NULL,
    expires_at DATE NULL,
    granted_by BIGINT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_leave_grants_employee FOREIGN KEY (employee_id) REFERENCES employees(employee_id),
    CONSTRAINT fk_leave_grants_granter FOREIGN KEY (granted_by) REFERENCES employees(employee_id)
);

CREATE INDEX idx_leave_grants_employee ON leave_grants(employee_id);
CREATE INDEX idx_leave_grants_type ON leave_grants(leave_type);

-- 承認履歴テーブル
CREATE TABLE approvals (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    target_type VARCHAR(64) NOT NULL,
    target_id BIGINT NOT NULL,
    status VARCHAR(16) NOT NULL,
    approver_id BIGINT NULL,
    comment VARCHAR(500),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_approvals_approver FOREIGN KEY (approver_id) REFERENCES employees(employee_id)
);

CREATE INDEX idx_approvals_target ON approvals(target_type, target_id);
