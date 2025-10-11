package com.kintai.entity;

/**
 * 休暇の時間単位
 */
public enum LeaveTimeUnit {
    FULL_DAY("全日", 1.0),
    HALF_AM("半休(AM)", 0.5),
    HALF_PM("半休(PM)", 0.5);

    private final String displayName;
    private final double days;

    LeaveTimeUnit(String displayName, double days) {
        this.displayName = displayName;
        this.days = days;
    }

    public String getDisplayName() {
        return displayName;
    }

    public double getDays() {
        return days;
    }

    /**
     * 選択肢文字列から時間単位を解決する。
     */
    public static LeaveTimeUnit fromLabel(String label) {
        if (label == null) {
            throw new IllegalArgumentException("label is null");
        }
        final String normalized = label.trim();
        for (LeaveTimeUnit unit : values()) {
            if (unit.name().equalsIgnoreCase(normalized) || unit.displayName.equals(normalized)) {
                return unit;
            }
        }
        throw new IllegalArgumentException("Unknown leave time unit: " + label);
    }
}
