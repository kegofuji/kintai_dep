package com.kintai.entity;

/**
 * 休暇種別
 */
public enum LeaveType {
    PAID_LEAVE("有休"),
    SUMMER("夏季休暇"),
    WINTER("冬季休暇"),
    SPECIAL("特別休暇");

    private final String displayName;

    LeaveType(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }

    /**
     * ラベルから休暇種別を解決する（displayNameも許容）
     */
    public static LeaveType fromLabel(String label) {
        if (label == null) {
            throw new IllegalArgumentException("label is null");
        }
        final String normalized = label.trim();
        for (LeaveType type : values()) {
            if (type.name().equalsIgnoreCase(normalized) || type.displayName.equals(normalized)) {
                return type;
            }
        }
        throw new IllegalArgumentException("Unknown leave type: " + label);
    }
}
