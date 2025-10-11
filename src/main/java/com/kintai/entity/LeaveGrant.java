package com.kintai.entity;

import jakarta.persistence.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 休暇付与履歴
 */
@Entity
@Table(name = "leave_grants",
        indexes = {
                @Index(name = "idx_leave_grants_employee", columnList = "employee_id"),
                @Index(name = "idx_leave_grants_type", columnList = "leave_type")
        })
public class LeaveGrant {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "employee_id", nullable = false)
    private Long employeeId;

    @Enumerated(EnumType.STRING)
    @Column(name = "leave_type", nullable = false, length = 32)
    private LeaveType leaveType;

    @Column(name = "granted_days", nullable = false, precision = 6, scale = 2)
    private BigDecimal grantedDays = BigDecimal.ZERO;

    @Column(name = "granted_at", nullable = false)
    private LocalDate grantedAt;

    @Column(name = "expires_at")
    private LocalDate expiresAt;

    @Column(name = "granted_by")
    private Long grantedBy;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    public LeaveGrant() {
    }

    public LeaveGrant(Long employeeId,
                      LeaveType leaveType,
                      BigDecimal grantedDays,
                      LocalDate grantedAt,
                      LocalDate expiresAt,
                      Long grantedBy) {
        this.employeeId = employeeId;
        this.leaveType = leaveType;
        this.grantedDays = grantedDays == null ? BigDecimal.ZERO : grantedDays;
        this.grantedAt = grantedAt;
        this.expiresAt = expiresAt;
        this.grantedBy = grantedBy;
        this.createdAt = LocalDateTime.now();
    }

    @PrePersist
    protected void onCreate() {
        if (createdAt == null) {
            createdAt = LocalDateTime.now();
        }
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

    public BigDecimal getGrantedDays() {
        return grantedDays;
    }

    public void setGrantedDays(BigDecimal grantedDays) {
        this.grantedDays = grantedDays;
    }

    public LocalDate getGrantedAt() {
        return grantedAt;
    }

    public void setGrantedAt(LocalDate grantedAt) {
        this.grantedAt = grantedAt;
    }

    public LocalDate getExpiresAt() {
        return expiresAt;
    }

    public void setExpiresAt(LocalDate expiresAt) {
        this.expiresAt = expiresAt;
    }

    public Long getGrantedBy() {
        return grantedBy;
    }

    public void setGrantedBy(Long grantedBy) {
        this.grantedBy = grantedBy;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }

    public boolean isExpired(LocalDate today) {
        if (expiresAt == null) {
            return false;
        }
        return expiresAt.isBefore(today);
    }
}
