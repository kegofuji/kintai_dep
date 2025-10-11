package com.kintai.entity;

import jakarta.persistence.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 休暇残数管理
 */
@Entity
@Table(name = "leave_balances",
        uniqueConstraints = @UniqueConstraint(columnNames = {"employee_id", "leave_type"}))
public class LeaveBalance {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "employee_id", nullable = false)
    private Long employeeId;

    @Enumerated(EnumType.STRING)
    @Column(name = "leave_type", nullable = false, length = 32)
    private LeaveType leaveType;

    @Column(name = "total_days", nullable = false, precision = 6, scale = 2)
    private BigDecimal totalDays = BigDecimal.ZERO;

    @Column(name = "used_days", nullable = false, precision = 6, scale = 2)
    private BigDecimal usedDays = BigDecimal.ZERO;

    @Column(name = "remaining_days", nullable = false, precision = 6, scale = 2)
    private BigDecimal remainingDays = BigDecimal.ZERO;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    public LeaveBalance() {
    }

    public LeaveBalance(Long employeeId, LeaveType leaveType) {
        this.employeeId = employeeId;
        this.leaveType = leaveType;
        this.updatedAt = LocalDateTime.now();
    }

    @PrePersist
    protected void onCreate() {
        if (updatedAt == null) {
            updatedAt = LocalDateTime.now();
        }
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Long getEmployeeId() {
        return employeeId;
    }

    public void setEmployeeId(Long employeeId) {
        this.employeeId = employeeId;
    }

    public LeaveType getLeaveType() {
        return leaveType;
    }

    public void setLeaveType(LeaveType leaveType) {
        this.leaveType = leaveType;
    }

    public BigDecimal getTotalDays() {
        return totalDays;
    }

    public void setTotalDays(BigDecimal totalDays) {
        this.totalDays = totalDays;
    }

    public BigDecimal getUsedDays() {
        return usedDays;
    }

    public void setUsedDays(BigDecimal usedDays) {
        this.usedDays = usedDays;
    }

    public BigDecimal getRemainingDays() {
        return remainingDays;
    }

    public void setRemainingDays(BigDecimal remainingDays) {
        this.remainingDays = remainingDays;
    }

    public LocalDateTime getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(LocalDateTime updatedAt) {
        this.updatedAt = updatedAt;
    }

    public void addToTotal(BigDecimal days) {
        if (days == null) return;
        this.totalDays = safeAdd(this.totalDays, days);
        this.remainingDays = safeAdd(this.remainingDays, days);
    }

    public void consume(BigDecimal days) {
        if (days == null) return;
        this.usedDays = safeAdd(this.usedDays, days);
        this.remainingDays = safeSubtract(this.remainingDays, days);
        if (this.remainingDays.signum() < 0) {
            this.remainingDays = BigDecimal.ZERO;
        }
    }

    public void restore(BigDecimal days) {
        if (days == null) return;
        this.usedDays = safeSubtract(this.usedDays, days);
        if (this.usedDays.signum() < 0) {
            this.usedDays = BigDecimal.ZERO;
        }
        this.remainingDays = safeAdd(this.remainingDays, days);
    }

    private BigDecimal safeAdd(BigDecimal base, BigDecimal addend) {
        if (base == null) {
            base = BigDecimal.ZERO;
        }
        if (addend == null) {
            addend = BigDecimal.ZERO;
        }
        return base.add(addend);
    }

    private BigDecimal safeSubtract(BigDecimal base, BigDecimal subtrahend) {
        if (base == null) {
            base = BigDecimal.ZERO;
        }
        if (subtrahend == null) {
            subtrahend = BigDecimal.ZERO;
        }
        return base.subtract(subtrahend);
    }
}
