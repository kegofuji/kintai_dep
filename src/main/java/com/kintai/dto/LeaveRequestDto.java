package com.kintai.dto;

import com.kintai.entity.LeaveStatus;
import com.kintai.entity.LeaveTimeUnit;
import com.kintai.entity.LeaveType;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 休暇申請レスポンスDTO
 */
public class LeaveRequestDto {

    private boolean success;
    private String message;
    private String errorCode;
    private Object data;
    private Long employeeId;
    private String username;

    public LeaveRequestDto() {
    }

    public LeaveRequestDto(boolean success, String message, LeaveData data) {
        this.success = success;
        this.message = message;
        this.data = data;
    }

    public LeaveRequestDto(boolean success, String errorCode, String message) {
        this.success = success;
        this.errorCode = errorCode;
        this.message = message;
    }

    public boolean isSuccess() {
        return success;
    }

    public void setSuccess(boolean success) {
        this.success = success;
    }

    public String getMessage() {
        return message;
    }

    public void setMessage(String message) {
        this.message = message;
    }

    public String getErrorCode() {
        return errorCode;
    }

    public void setErrorCode(String errorCode) {
        this.errorCode = errorCode;
    }

    public Object getData() {
        return data;
    }

    public void setData(Object data) {
        this.data = data;
    }

    public Long getEmployeeId() {
        return employeeId;
    }

    public void setEmployeeId(Long employeeId) {
        this.employeeId = employeeId;
    }

    public String getUsername() {
        return username;
    }

    public void setUsername(String username) {
        this.username = username;
    }

    public static class LeaveData {
        private Long leaveRequestId;
        private Long employeeId;
        private LeaveType leaveType;
        private LeaveTimeUnit timeUnit;
        private LocalDate startDate;
        private LocalDate endDate;
        private BigDecimal days;
        private LeaveStatus status;
        private String rejectionComment;
        private String reason;

        public LeaveData() {
        }

        public LeaveData(Long leaveRequestId,
                         Long employeeId,
                         LeaveType leaveType,
                         LeaveTimeUnit timeUnit,
                         LocalDate startDate,
                         LocalDate endDate,
                         BigDecimal days,
                         LeaveStatus status,
                         String reason,
                         String rejectionComment) {
            this.leaveRequestId = leaveRequestId;
            this.employeeId = employeeId;
            this.leaveType = leaveType;
            this.timeUnit = timeUnit;
            this.startDate = startDate;
            this.endDate = endDate;
            this.days = days;
            this.status = status;
            this.reason = reason;
            this.rejectionComment = rejectionComment;
        }

        public Long getLeaveRequestId() {
            return leaveRequestId;
        }

        public void setLeaveRequestId(Long leaveRequestId) {
            this.leaveRequestId = leaveRequestId;
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

        public LeaveTimeUnit getTimeUnit() {
            return timeUnit;
        }

        public void setTimeUnit(LeaveTimeUnit timeUnit) {
            this.timeUnit = timeUnit;
        }

        public LocalDate getStartDate() {
            return startDate;
        }

        public void setStartDate(LocalDate startDate) {
            this.startDate = startDate;
        }

        public LocalDate getEndDate() {
            return endDate;
        }

        public void setEndDate(LocalDate endDate) {
            this.endDate = endDate;
        }

        public BigDecimal getDays() {
            return days;
        }

        public void setDays(BigDecimal days) {
            this.days = days;
        }

        public LeaveStatus getStatus() {
            return status;
        }

        public void setStatus(LeaveStatus status) {
            this.status = status;
        }

        public String getRejectionComment() {
            return rejectionComment;
        }

        public void setRejectionComment(String rejectionComment) {
            this.rejectionComment = rejectionComment;
        }

        public String getReason() {
            return reason;
        }

        public void setReason(String reason) {
            this.reason = reason;
        }
    }
}
