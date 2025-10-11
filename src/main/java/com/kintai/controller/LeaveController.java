package com.kintai.controller;

import com.kintai.dto.LeaveRequestDto;
import com.kintai.entity.LeaveRequest;
import com.kintai.entity.LeaveStatus;
import com.kintai.entity.LeaveTimeUnit;
import com.kintai.entity.LeaveType;
import com.kintai.exception.VacationException;
import com.kintai.service.LeaveRequestService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.*;

@RestController
@RequestMapping("/api/leave")
@Validated
public class LeaveController {

    @Autowired
    private LeaveRequestService leaveRequestService;

    @PostMapping("/requests")
    public ResponseEntity<LeaveRequestDto> createLeaveRequest(@Valid @RequestBody CreateRequest request) {
        try {
            LeaveType leaveType = LeaveType.fromLabel(request.getLeaveType());
            LeaveTimeUnit timeUnit = LeaveTimeUnit.fromLabel(
                    request.getTimeUnit() != null ? request.getTimeUnit() : resolveDefaultTimeUnit(leaveType));

            LeaveRequestDto response = leaveRequestService.createLeaveRequest(
                    request.getEmployeeId(),
                    leaveType,
                    timeUnit,
                    request.getStartDate(),
                    request.getEndDate(),
                    request.getReason()
            );
            return ResponseEntity.ok(response);
        } catch (VacationException e) {
            LeaveRequestDto error = new LeaveRequestDto(false, e.getErrorCode(), e.getMessage());
            return ResponseEntity.badRequest().body(error);
        } catch (IllegalArgumentException e) {
            LeaveRequestDto error = new LeaveRequestDto(false, "INVALID_REQUEST", e.getMessage());
            return ResponseEntity.badRequest().body(error);
        } catch (Exception e) {
            LeaveRequestDto error = new LeaveRequestDto(false, "INTERNAL_ERROR", "休暇申請に失敗しました");
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(error);
        }
    }

    @PutMapping("/requests/{leaveRequestId}/status")
    public ResponseEntity<LeaveRequestDto> updateStatus(@PathVariable Long leaveRequestId,
                                                        @Valid @RequestBody StatusUpdateRequest request) {
        try {
            LeaveStatus status = parseStatus(request.getStatus());
            LeaveRequestDto response = leaveRequestService.updateStatus(
                    leaveRequestId,
                    status,
                    request.getApproverId(),
                    request.getComment()
            );
            return ResponseEntity.ok(response);
        } catch (VacationException e) {
            LeaveRequestDto error = new LeaveRequestDto(false, e.getErrorCode(), e.getMessage());
            return ResponseEntity.badRequest().body(error);
        } catch (IllegalArgumentException e) {
            LeaveRequestDto error = new LeaveRequestDto(false, "INVALID_STATUS", e.getMessage());
            return ResponseEntity.badRequest().body(error);
        } catch (Exception e) {
            LeaveRequestDto error = new LeaveRequestDto(false, "INTERNAL_ERROR", "休暇申請ステータスの更新に失敗しました");
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(error);
        }
    }

    @PostMapping("/requests/{leaveRequestId}/cancel")
    public ResponseEntity<LeaveRequestDto> cancelRequest(@PathVariable Long leaveRequestId,
                                                         @Valid @RequestBody CancelRequest request) {
        try {
            LeaveRequestDto response = leaveRequestService.cancelRequest(leaveRequestId, request.getEmployeeId());
            return ResponseEntity.ok(response);
        } catch (VacationException e) {
            LeaveRequestDto error = new LeaveRequestDto(false, e.getErrorCode(), e.getMessage());
            return ResponseEntity.badRequest().body(error);
        } catch (Exception e) {
            LeaveRequestDto error = new LeaveRequestDto(false, "INTERNAL_ERROR", "休暇申請の取消に失敗しました");
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(error);
        }
    }

    @GetMapping("/requests/{employeeId}")
    public ResponseEntity<Map<String, Object>> listRequests(@PathVariable Long employeeId) {
        try {
            List<LeaveRequest> requests = leaveRequestService.getRequestsByEmployee(employeeId);
            Map<String, Object> body = new HashMap<>();
            body.put("success", true);
            body.put("data", requests);
            body.put("count", requests.size());
            return ResponseEntity.ok(body);
        } catch (Exception e) {
            Map<String, Object> body = new HashMap<>();
            body.put("success", true);
            body.put("data", Collections.emptyList());
            body.put("count", 0);
            return ResponseEntity.ok(body);
        }
    }

    @GetMapping("/remaining/{employeeId}")
    public ResponseEntity<Map<String, Object>> remainingSummary(@PathVariable Long employeeId) {
        try {
            Map<LeaveType, java.math.BigDecimal> summary = leaveRequestService.getRemainingLeaveSummary(employeeId);
            Map<String, Object> body = new HashMap<>();
            body.put("success", true);
            Map<String, Object> values = new LinkedHashMap<>();
            summary.forEach((type, value) -> values.put(type.name(), value));
            body.put("remaining", values);
            return ResponseEntity.ok(body);
        } catch (Exception e) {
            Map<String, Object> body = new HashMap<>();
            body.put("success", false);
            body.put("message", "残数の取得に失敗しました");
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(body);
        }
    }

    @GetMapping("/balances/{employeeId}")
    public ResponseEntity<Map<String, Object>> getBalances(@PathVariable Long employeeId) {
        try {
            List<com.kintai.entity.LeaveBalance> balances = leaveRequestService.getLeaveBalances(employeeId);
            Map<String, Object> body = new HashMap<>();
            body.put("success", true);
            body.put("data", balances);
            body.put("count", balances.size());
            return ResponseEntity.ok(body);
        } catch (Exception e) {
            Map<String, Object> body = new HashMap<>();
            body.put("success", false);
            body.put("message", "休暇残数の取得に失敗しました");
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(body);
        }
    }

    @GetMapping("/grants/{employeeId}")
    public ResponseEntity<Map<String, Object>> getGrants(@PathVariable Long employeeId,
                                                         @RequestParam(name = "type", required = false) String type) {
        try {
            LeaveType leaveType = null;
            if (type != null && !type.isBlank()) {
                leaveType = LeaveType.fromLabel(type);
            }
            List<com.kintai.entity.LeaveGrant> grants = leaveRequestService.getActiveGrants(employeeId, leaveType);
            Map<String, Object> body = new HashMap<>();
            body.put("success", true);
            body.put("data", grants);
            body.put("count", grants.size());
            return ResponseEntity.ok(body);
        } catch (IllegalArgumentException e) {
            Map<String, Object> body = new HashMap<>();
            body.put("success", false);
            body.put("message", "無効な休暇種別です");
            return ResponseEntity.badRequest().body(body);
        } catch (Exception e) {
            Map<String, Object> body = new HashMap<>();
            body.put("success", false);
            body.put("message", "休暇付与情報の取得に失敗しました");
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(body);
        }
    }

    @GetMapping("/csrf-token")
    public ResponseEntity<Map<String, String>> getCsrfToken(HttpServletRequest request) {
        CsrfToken csrfToken = (CsrfToken) request.getAttribute(CsrfToken.class.getName());
        Map<String, String> tokenMap = new HashMap<>();
        tokenMap.put("token", csrfToken != null ? csrfToken.getToken() : "");
        return ResponseEntity.ok(tokenMap);
    }

    private String resolveDefaultTimeUnit(LeaveType leaveType) {
        return leaveType == LeaveType.PAID_LEAVE ? LeaveTimeUnit.FULL_DAY.name() : LeaveTimeUnit.FULL_DAY.name();
    }

    private LeaveStatus parseStatus(String raw) {
        if (raw == null) {
            throw new IllegalArgumentException("status is null");
        }
        String normalized = raw.trim().toUpperCase();
        switch (normalized) {
            case "APPROVE", "APPROVED", "承認" -> {
                return LeaveStatus.APPROVED;
            }
            case "REJECT", "REJECTED", "却下" -> {
                return LeaveStatus.REJECTED;
            }
            case "CANCEL", "CANCELLED", "CANCELED", "取消", "キャンセル" -> {
                return LeaveStatus.CANCELLED;
            }
            case "PENDING", "申請中" -> {
                return LeaveStatus.PENDING;
            }
            default -> {
                return LeaveStatus.valueOf(normalized);
            }
        }
    }

    public static class CreateRequest {
        @NotNull(message = "従業員IDは必須です")
        private Long employeeId;
        @NotBlank(message = "休暇種別は必須です")
        private String leaveType;
        private String timeUnit;
        @NotNull(message = "開始日は必須です")
        private LocalDate startDate;
        @NotNull(message = "終了日は必須です")
        private LocalDate endDate;
        private String reason;

        public Long getEmployeeId() {
            return employeeId;
        }

        public void setEmployeeId(Long employeeId) {
            this.employeeId = employeeId;
        }

        public String getLeaveType() {
            return leaveType;
        }

        public void setLeaveType(String leaveType) {
            this.leaveType = leaveType;
        }

        public String getTimeUnit() {
            return timeUnit;
        }

        public void setTimeUnit(String timeUnit) {
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

        public String getReason() {
            return reason;
        }

        public void setReason(String reason) {
            this.reason = reason;
        }
    }

    public static class StatusUpdateRequest {
        @NotBlank(message = "ステータスは必須です")
        private String status;
        private Long approverId;
        private String comment;

        public String getStatus() {
            return status;
        }

        public void setStatus(String status) {
            this.status = status;
        }

        public Long getApproverId() {
            return approverId;
        }

        public void setApproverId(Long approverId) {
            this.approverId = approverId;
        }

        public String getComment() {
            return comment;
        }

        public void setComment(String comment) {
            this.comment = comment;
        }
    }

    public static class CancelRequest {
        @NotNull(message = "従業員IDは必須です")
        private Long employeeId;

        public Long getEmployeeId() {
            return employeeId;
        }

        public void setEmployeeId(Long employeeId) {
            this.employeeId = employeeId;
        }
    }
}
