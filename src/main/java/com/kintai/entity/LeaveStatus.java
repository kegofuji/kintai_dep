package com.kintai.entity;

/**
 * 休暇申請ステータス
 */
public enum LeaveStatus {
    PENDING("申請中"),
    APPROVED("承認済"),
    REJECTED("却下"),
    CANCELLED("取消");

    private final String displayName;

    LeaveStatus(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
