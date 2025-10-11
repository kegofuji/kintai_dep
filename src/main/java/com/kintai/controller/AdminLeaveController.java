package com.kintai.controller;

import com.kintai.dto.LeaveRequestDto;
import com.kintai.entity.LeaveRequest;
import com.kintai.entity.LeaveStatus;
import com.kintai.entity.LeaveType;
import com.kintai.exception.VacationException;
import com.kintai.repository.EmployeeRepository;
import com.kintai.repository.LeaveRequestRepository;
import com.kintai.service.LeaveRequestService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/admin/leave")
public class AdminLeaveController {

    @Autowired
    private LeaveRequestService leaveRequestService;

    @Autowired
    private LeaveRequestRepository leaveRequestRepository;

    @Autowired
    private EmployeeRepository employeeRepository;

    @PostMapping("/balances/adjust")
    public ResponseEntity<Map<String, Object>> adjustPaidLeave(@Valid @RequestBody AdjustBalanceRequest request) {
        if (request.getDeltaDays() == null || request.getDeltaDays().intValue() == 0) {
            return ResponseEntity.badRequest().body(error("INVALID_REQUEST", "増減日数を指定してください"));
        }
        return employeeRepository.findById(request.getEmployeeId())
                .map(emp -> {
                    int current = emp.getPaidLeaveAdjustment();
                    emp.setPaidLeaveAdjustment(current + request.getDeltaDays());
                    employeeRepository.save(emp);
                    leaveRequestService.refreshPaidLeaveBalance(emp.getEmployeeId());
                    Map<String, Object> body = new HashMap<>();
                    body.put("success", true);
                    body.put("message", "有給残数を調整しました");
                    body.put("adjustmentTotal", emp.getPaidLeaveAdjustment());
                    return ResponseEntity.ok(body);
                })
                .orElseGet(() -> ResponseEntity.status(HttpStatus.NOT_FOUND).body(error("NOT_FOUND", "従業員が見つかりません")));
    }

    @PostMapping("/requests/{leaveRequestId}/decision")
    public ResponseEntity<Map<String, Object>> decideRequest(@PathVariable Long leaveRequestId,
                                                             @Valid @RequestBody DecisionRequest request) {
        try {
            Long approverId = Optional.ofNullable(request.getApproverId()).orElseGet(this::resolveApproverId);
            LeaveStatus status = request.isApproved() ? LeaveStatus.APPROVED : LeaveStatus.REJECTED;
            LeaveRequestDto dto = leaveRequestService.updateStatus(leaveRequestId, status, approverId, request.getComment());

            Map<String, Object> body = new HashMap<>();
            body.put("success", true);
            body.put("message", request.isApproved() ? "休暇申請を承認しました" : "休暇申請を却下しました");
            body.put("data", dto.getData());
            return ResponseEntity.ok(body);
        } catch (VacationException e) {
            Map<String, Object> body = new HashMap<>();
            body.put("success", false);
            body.put("errorCode", e.getErrorCode());
            body.put("message", e.getMessage());
            return ResponseEntity.badRequest().body(body);
        } catch (Exception e) {
            Map<String, Object> body = new HashMap<>();
            body.put("success", false);
            body.put("message", "休暇申請処理中にエラーが発生しました: " + e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(body);
        }
    }

    @GetMapping("/requests/pending")
    public ResponseEntity<Map<String, Object>> pendingRequests() {
        List<LeaveRequest> pending = leaveRequestRepository.findByStatusOrderByCreatedAtDesc(LeaveStatus.PENDING);
        Map<String, Object> body = new HashMap<>();
        body.put("success", true);
        body.put("data", pending);
        body.put("count", pending.size());
        return ResponseEntity.ok(body);
    }

    @PostMapping("/grants")
    public ResponseEntity<Map<String, Object>> grantLeave(@Valid @RequestBody GrantRequest request) {
        try {
            LeaveType leaveType = LeaveType.fromLabel(request.getLeaveType());
            BigDecimal days = request.getGrantedDays();
            LocalDate grantedOn = request.getGrantedDate();
            LocalDate expiresAt = request.getExpiresAt();
            Long approverId = resolveApproverId();

            List<Long> targetEmployees = resolveTargetEmployees(request);
            if (targetEmployees.isEmpty()) {
                throw new VacationException(VacationException.INVALID_REQUEST, "付与対象の従業員が見つかりません");
            }

            if (leaveType == LeaveType.SPECIAL) {
                if (request.getSpecificDates() == null || request.getSpecificDates().isEmpty()) {
                    throw new VacationException(VacationException.INVALID_REQUEST, "特別休暇の日付を指定してください");
                }
                for (Long employeeId : targetEmployees) {
                    for (LocalDate specificDate : request.getSpecificDates()) {
                        leaveRequestService.applyGrant(
                                employeeId,
                                leaveType,
                                BigDecimal.ONE,
                                specificDate,
                                specificDate,
                                approverId
                        );
                    }
                }
            } else {
                for (Long employeeId : targetEmployees) {
                    leaveRequestService.applyGrant(
                            employeeId,
                            leaveType,
                            days,
                            grantedOn,
                            expiresAt,
                            approverId
                    );
                }
            }

            Map<String, Object> body = new HashMap<>();
            body.put("success", true);
            body.put("message", "休暇を付与しました");
            body.put("distributedCount", targetEmployees.size());
            return ResponseEntity.ok(body);
        } catch (VacationException e) {
            Map<String, Object> body = new HashMap<>();
            body.put("success", false);
            body.put("errorCode", e.getErrorCode());
            body.put("message", e.getMessage());
            return ResponseEntity.badRequest().body(body);
        } catch (Exception e) {
            Map<String, Object> body = new HashMap<>();
            body.put("success", false);
            body.put("message", "休暇付与に失敗しました: " + e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(body);
        }
    }

    private Long resolveApproverId() {
        try {
            Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
            if (authentication != null && authentication.getPrincipal() instanceof com.kintai.entity.UserAccount userAccount) {
                return userAccount.getEmployeeId();
            }
        } catch (Exception ignored) {
        }
        return null;
    }

    private List<Long> resolveTargetEmployees(GrantRequest request) {
        if (request.getScope() == GrantScope.ALL) {
            return employeeRepository.findAll()
                    .stream()
                    .map(com.kintai.entity.Employee::getEmployeeId)
                    .collect(Collectors.toList());
        }
        if (request.getEmployeeIds() == null) {
            return Collections.emptyList();
        }
        Set<Long> existing = employeeRepository.findAllById(request.getEmployeeIds())
                .stream()
                .map(com.kintai.entity.Employee::getEmployeeId)
                .collect(Collectors.toSet());
        return request.getEmployeeIds()
                .stream()
                .filter(existing::contains)
                .collect(Collectors.toList());
    }

    public static class DecisionRequest {
        private boolean approved;
        private Long approverId;
        private String comment;

        public boolean isApproved() {
            return approved;
        }

        public void setApproved(boolean approved) {
            this.approved = approved;
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

    public static class GrantRequest {
        @NotBlank(message = "休暇種別は必須です")
        private String leaveType;
        @NotNull(message = "付与日数は必須です")
        @DecimalMin(value = "0.5", message = "0.5日以上で指定してください")
        private BigDecimal grantedDays;
        @NotNull(message = "付与日を指定してください")
        private LocalDate grantedDate;
        private LocalDate expiresAt;
        @NotNull(message = "付与対象を指定してください")
        private GrantScope scope;
        private List<Long> employeeIds;
        private List<LocalDate> specificDates;

        public String getLeaveType() {
            return leaveType;
        }

        public void setLeaveType(String leaveType) {
            this.leaveType = leaveType;
        }

        public BigDecimal getGrantedDays() {
            return grantedDays;
        }

        public void setGrantedDays(BigDecimal grantedDays) {
            this.grantedDays = grantedDays;
        }

        public LocalDate getGrantedDate() {
            return grantedDate;
        }

        public void setGrantedDate(LocalDate grantedDate) {
            this.grantedDate = grantedDate;
        }

        public LocalDate getExpiresAt() {
            return expiresAt;
        }

        public void setExpiresAt(LocalDate expiresAt) {
            this.expiresAt = expiresAt;
        }

        public GrantScope getScope() {
            return scope;
        }

        public void setScope(GrantScope scope) {
            this.scope = scope;
        }

        public List<Long> getEmployeeIds() {
            return employeeIds;
        }

        public void setEmployeeIds(List<Long> employeeIds) {
            this.employeeIds = employeeIds;
        }

        public List<LocalDate> getSpecificDates() {
            return specificDates;
        }

        public void setSpecificDates(List<LocalDate> specificDates) {
            this.specificDates = specificDates;
        }
    }

    public enum GrantScope {
        ALL,
        INDIVIDUAL
    }

    public static class AdjustBalanceRequest {
        @NotNull(message = "従業員IDは必須です")
        private Long employeeId;
        @NotNull(message = "増減日数は必須です")
        private Integer deltaDays;
        private String reason;

        public Long getEmployeeId() {
            return employeeId;
        }

        public void setEmployeeId(Long employeeId) {
            this.employeeId = employeeId;
        }

        public Integer getDeltaDays() {
            return deltaDays;
        }

        public void setDeltaDays(Integer deltaDays) {
            this.deltaDays = deltaDays;
        }

        public String getReason() {
            return reason;
        }

        public void setReason(String reason) {
            this.reason = reason;
        }
    }

    private Map<String, Object> error(String code, String message) {
        Map<String, Object> body = new HashMap<>();
        body.put("success", false);
        body.put("errorCode", code);
        body.put("message", message);
        return body;
    }
}
