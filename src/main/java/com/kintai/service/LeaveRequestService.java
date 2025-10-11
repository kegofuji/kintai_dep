package com.kintai.service;

import com.kintai.dto.LeaveRequestDto;
import com.kintai.entity.*;
import com.kintai.exception.VacationException;
import com.kintai.repository.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.*;

/**
 * 休暇申請サービス
 */
@Service
@Transactional
public class LeaveRequestService {

    private static final BigDecimal HALF_DAY = new BigDecimal("0.5");
    private static final BigDecimal ONE_DAY = BigDecimal.ONE;

    @Autowired
    private LeaveRequestRepository leaveRequestRepository;

    @Autowired
    private LeaveBalanceRepository leaveBalanceRepository;

    @Autowired
    private LeaveGrantRepository leaveGrantRepository;

    @Autowired
    private ApprovalRepository approvalRepository;

    @Autowired
    private EmployeeRepository employeeRepository;

    @Autowired
    private AdjustmentRequestRepository adjustmentRequestRepository;

    @Autowired
    private AdjustmentRequestService adjustmentRequestService;

    /**
     * 休暇申請を作成
     */
    public LeaveRequestDto createLeaveRequest(Long employeeId,
                                              LeaveType leaveType,
                                              LeaveTimeUnit timeUnit,
                                              LocalDate startDate,
                                              LocalDate endDate,
                                              String reason) {
        try {
            Employee employee = employeeRepository.findByEmployeeId(employeeId)
                    .orElseThrow(() -> new VacationException(VacationException.EMPLOYEE_NOT_FOUND, "従業員が見つかりません"));

            if (employee.isRetired()) {
                throw new VacationException(VacationException.RETIRED_EMPLOYEE, "退職済みの従業員です");
            }

            validateInputs(leaveType, timeUnit, startDate, endDate, reason);

            BigDecimal requestedDays = calculateRequestedDays(startDate, endDate, timeUnit);

            validateNoOverlaps(employeeId, startDate, endDate, leaveType, timeUnit);

            clearAdjustments(employeeId, startDate, endDate);

            LeaveBalance balance = ensureBalance(employee, leaveType);
            ensureSufficientBalance(balance, leaveType, requestedDays, startDate, endDate);

            LeaveRequest leaveRequest = new LeaveRequest(
                    employeeId,
                    leaveType,
                    timeUnit,
                    startDate,
                    endDate,
                    requestedDays,
                    reason
            );

            LeaveRequest saved = leaveRequestRepository.save(leaveRequest);

            LeaveRequestDto.LeaveData data = toDto(saved);
            String message = "休暇申請が完了しました";
            LeaveRequestDto response = new LeaveRequestDto(true, message, data);
            setUserInfo(response);
            return response;
        } catch (VacationException e) {
            throw e;
        } catch (Exception e) {
            throw new VacationException("INTERNAL_ERROR", "休暇申請に失敗しました: " + e.getMessage());
        }
    }

    /**
     * 休暇申請のステータスを更新
     */
    public LeaveRequestDto updateStatus(Long leaveRequestId,
                                        LeaveStatus newStatus,
                                        Long approverId,
                                        String comment) {
        try {
            LeaveRequest request = leaveRequestRepository.findById(leaveRequestId)
                    .orElseThrow(() -> new VacationException(VacationException.VACATION_NOT_FOUND, "申請が見つかりません"));

            LeaveStatus current = request.getStatus();
            if (current == newStatus) {
                throw new VacationException(VacationException.INVALID_STATUS_CHANGE, "同じステータスです");
            }

            switch (newStatus) {
                case APPROVED -> approveRequest(request, approverId);
                case REJECTED -> rejectRequest(request, approverId, comment);
                case CANCELLED -> cancelRequestByAdmin(request, approverId);
                default -> throw new VacationException(VacationException.INVALID_STATUS_CHANGE, "無効なステータスです");
            }

            LeaveRequest saved = leaveRequestRepository.save(request);
            recordApprovalHistory(saved, newStatus, approverId, comment);

            LeaveRequestDto.LeaveData data = toDto(saved);
            LeaveRequestDto response = new LeaveRequestDto(true,
                    String.format("申請を%sしました", newStatus.getDisplayName()),
                    data);
            setUserInfo(response);
            return response;
        } catch (VacationException e) {
            throw e;
        } catch (Exception e) {
            throw new VacationException("INTERNAL_ERROR", "休暇申請の更新に失敗しました: " + e.getMessage());
        }
    }

    /**
     * 社員による申請取消
     */
    public LeaveRequestDto cancelRequest(Long leaveRequestId, Long employeeId) {
        LeaveRequest request = leaveRequestRepository.findByIdAndEmployeeId(leaveRequestId, employeeId)
                .orElseThrow(() -> new VacationException(VacationException.VACATION_NOT_FOUND, "申請が見つかりません"));

        if (request.getStatus() == LeaveStatus.REJECTED || request.getStatus() == LeaveStatus.CANCELLED) {
            throw new VacationException(VacationException.VACATION_NOT_CANCELLABLE, "取消できない状態です");
        }

        if (request.getStatus() == LeaveStatus.APPROVED) {
            restoreBalance(request);
        }

        request.setStatus(LeaveStatus.CANCELLED);
        request.setRejectionComment(null);
        request.setApproverId(null);

        LeaveRequest saved = leaveRequestRepository.save(request);
        recordApprovalHistory(saved, LeaveStatus.CANCELLED, employeeId, "従業員による取消");

        LeaveRequestDto.LeaveData data = toDto(saved);
        LeaveRequestDto response = new LeaveRequestDto(true, "申請を取消しました", data);
        setUserInfo(response);
        return response;
    }

    @Transactional(readOnly = true)
    public List<LeaveRequest> getRequestsByEmployee(Long employeeId) {
        return leaveRequestRepository.findByEmployeeIdOrderByCreatedAtDesc(employeeId);
    }

    public Map<LeaveType, BigDecimal> getRemainingLeaveSummary(Long employeeId) {
        Map<LeaveType, BigDecimal> summary = new EnumMap<>(LeaveType.class);
        Employee employee = employeeRepository.findByEmployeeId(employeeId).orElse(null);
        for (LeaveType type : LeaveType.values()) {
            BigDecimal remaining;
            if (type == LeaveType.PAID_LEAVE && employee != null) {
                LeaveBalance balance = ensureBalance(employee, type);
                remaining = balance.getRemainingDays();
            } else {
                remaining = leaveBalanceRepository.findByEmployeeIdAndLeaveType(employeeId, type)
                        .map(LeaveBalance::getRemainingDays)
                        .orElse(BigDecimal.ZERO);
            }
            summary.put(type, remaining);
        }
        return summary;
    }

    @Transactional(readOnly = true)
    public BigDecimal getRemainingLeaveDays(Long employeeId, LeaveType leaveType) {
        Optional<LeaveBalance> balanceOpt = leaveBalanceRepository.findByEmployeeIdAndLeaveType(employeeId, leaveType);
        return balanceOpt.map(LeaveBalance::getRemainingDays).orElse(BigDecimal.ZERO);
    }

    @Transactional(readOnly = true)
    public List<LeaveBalance> getLeaveBalances(Long employeeId) {
        return leaveBalanceRepository.findByEmployeeId(employeeId);
    }

    @Transactional(readOnly = true)
    public List<LeaveGrant> getActiveGrants(Long employeeId) {
        return leaveGrantRepository.findActiveGrants(employeeId, LocalDate.now());
    }

    @Transactional(readOnly = true)
    public List<LeaveGrant> getActiveGrants(Long employeeId, LeaveType leaveType) {
        if (leaveType == null) {
            return getActiveGrants(employeeId);
        }
        return leaveGrantRepository.findActiveGrants(employeeId, leaveType, LocalDate.now());
    }

    public void applyGrant(Long employeeId,
                           LeaveType leaveType,
                           BigDecimal days,
                           LocalDate grantedAt,
                           LocalDate expiresAt,
                           Long grantedBy) {
        if (days == null || days.signum() <= 0) {
            throw new VacationException(VacationException.INVALID_REQUEST, "付与日数が不正です");
        }
        LeaveGrant grant = new LeaveGrant(employeeId, leaveType, days, grantedAt, expiresAt, grantedBy);
        leaveGrantRepository.save(grant);

        LeaveBalance balance = ensureBalance(employeeRepository.findByEmployeeId(employeeId)
                .orElseThrow(() -> new VacationException(VacationException.EMPLOYEE_NOT_FOUND, "従業員が見つかりません")),
                leaveType);
        balance.addToTotal(days);
        leaveBalanceRepository.save(balance);
    }

    private void validateInputs(LeaveType leaveType,
                                LeaveTimeUnit timeUnit,
                                LocalDate startDate,
                                LocalDate endDate,
                                String reason) {
        if (leaveType == null) {
            throw new VacationException(VacationException.INVALID_REQUEST, "休暇種別を選択してください");
        }
        if (timeUnit == null) {
            throw new VacationException(VacationException.INVALID_REQUEST, "取得単位を選択してください");
        }
        if (startDate == null || endDate == null) {
            throw new VacationException(VacationException.INVALID_DATE_RANGE, "開始日・終了日の両方を指定してください");
        }
        if (endDate.isBefore(startDate)) {
            throw new VacationException(VacationException.INVALID_DATE_RANGE, "終了日は開始日以降の日付にしてください");
        }

        if (leaveType != LeaveType.PAID_LEAVE && timeUnit != LeaveTimeUnit.FULL_DAY) {
            throw new VacationException(VacationException.INVALID_REQUEST, "半休は有休のみ選択できます");
        }

        if ((timeUnit == LeaveTimeUnit.HALF_AM || timeUnit == LeaveTimeUnit.HALF_PM) && !startDate.equals(endDate)) {
            throw new VacationException(VacationException.INVALID_DATE_RANGE, "半休は単日のみ申請できます");
        }

        if (leaveType == LeaveType.PAID_LEAVE && (reason == null || reason.trim().isEmpty())) {
            throw new VacationException(VacationException.INVALID_REQUEST, "理由を入力してください");
        }
    }

    private void validateNoOverlaps(Long employeeId,
                                    LocalDate startDate,
                                    LocalDate endDate,
                                    LeaveType leaveType,
                                    LeaveTimeUnit timeUnit) {
        if (leaveRequestRepository.hasOverlappingRequest(employeeId, startDate, endDate)) {
            throw new VacationException(VacationException.DUPLICATE_REQUEST, "同一期間に既存の申請があります");
        }

        if (leaveType == LeaveType.PAID_LEAVE && (timeUnit == LeaveTimeUnit.HALF_AM || timeUnit == LeaveTimeUnit.HALF_PM)) {
            List<LeaveRequest> sameDayPending = leaveRequestRepository
                    .findPendingRequestsOnDate(employeeId, leaveType, startDate);
            if (!sameDayPending.isEmpty()) {
                throw new VacationException(VacationException.DUPLICATE_REQUEST, "同一日に複数の半休は申請できません");
            }
        }
    }

    private void clearAdjustments(Long employeeId, LocalDate startDate, LocalDate endDate) {
        List<AdjustmentRequest> active = adjustmentRequestRepository
                .findActiveAdjustmentRequestsInPeriod(employeeId, startDate, endDate);
        for (AdjustmentRequest request : active) {
            adjustmentRequestService.cancelAdjustmentRequest(request.getAdjustmentRequestId(), employeeId);
        }
    }

    private LeaveBalance ensureBalance(Employee employee, LeaveType leaveType) {
        return leaveBalanceRepository.findByEmployeeIdAndLeaveType(employee.getEmployeeId(), leaveType)
                .orElseGet(() -> initializeBalance(employee, leaveType));
    }

    private LeaveBalance initializeBalance(Employee employee, LeaveType leaveType) {
        LeaveBalance balance = new LeaveBalance(employee.getEmployeeId(), leaveType);
        switch (leaveType) {
            case PAID_LEAVE -> {
                int base = employee.getPaidLeaveBaseDays();
                int adjustment = employee.getPaidLeaveAdjustment();
                BigDecimal total = BigDecimal.valueOf(base + adjustment);
                balance.setTotalDays(total);
                balance.setRemainingDays(total);
            }
            default -> {
                balance.setTotalDays(BigDecimal.ZERO);
                balance.setRemainingDays(BigDecimal.ZERO);
            }
        }
        balance.setUsedDays(BigDecimal.ZERO);
        return leaveBalanceRepository.save(balance);
    }

    private void ensureSufficientBalance(LeaveBalance balance,
                                         LeaveType leaveType,
                                         BigDecimal requestedDays,
                                         LocalDate startDate,
                                         LocalDate endDate) {
        cleanupExpiredGrants(balance.getEmployeeId(), leaveType);

        BigDecimal remaining = balance.getRemainingDays();
        if (remaining.compareTo(requestedDays) < 0) {
            throw new VacationException(VacationException.INVALID_REQUEST, "残日数が不足しています");
        }

        if (leaveType == LeaveType.SUMMER || leaveType == LeaveType.WINTER) {
            List<LeaveGrant> grants = leaveGrantRepository.findActiveGrants(balance.getEmployeeId(), leaveType, LocalDate.now());
            if (grants.isEmpty()) {
                throw new VacationException(VacationException.INVALID_REQUEST, "この休暇の有効期限が切れています");
            }
        }

        if (leaveType == LeaveType.SPECIAL) {
            LocalDate cursor = startDate;
            while (!cursor.isAfter(endDate)) {
                List<LeaveGrant> grants = leaveGrantRepository.findSpecialGrantsCoveringDate(balance.getEmployeeId(), cursor);
                if (grants.isEmpty()) {
                    throw new VacationException(VacationException.INVALID_REQUEST, "特別休暇は管理者指定日以外では申請できません");
                }
                cursor = cursor.plusDays(1);
            }
        }
    }

    private void cleanupExpiredGrants(Long employeeId, LeaveType leaveType) {
        if (leaveType == LeaveType.PAID_LEAVE) {
            refreshPaidLeaveBalanceInternal(employeeId);
            return;
        }
        List<LeaveGrant> grants = leaveGrantRepository.findActiveGrants(employeeId, leaveType, LocalDate.now());
        BigDecimal activeTotal = grants.stream()
                .filter(g -> !g.isExpired(LocalDate.now()))
                .map(LeaveGrant::getGrantedDays)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        LeaveBalance balance = leaveBalanceRepository.findByEmployeeIdAndLeaveType(employeeId, leaveType)
                .orElse(null);
        if (balance == null) {
            return;
        }

        BigDecimal used = Optional.ofNullable(balance.getUsedDays()).orElse(BigDecimal.ZERO);
        BigDecimal remaining = activeTotal.subtract(used);
        if (remaining.signum() < 0) {
            remaining = BigDecimal.ZERO;
        }
        balance.setTotalDays(activeTotal);
        balance.setRemainingDays(remaining);
        leaveBalanceRepository.save(balance);
    }

    public void refreshPaidLeaveBalance(Long employeeId) {
        refreshPaidLeaveBalanceInternal(employeeId);
    }

    private void refreshPaidLeaveBalanceInternal(Long employeeId) {
        Employee employee = employeeRepository.findByEmployeeId(employeeId)
                .orElse(null);
        if (employee == null) {
            return;
        }
        LeaveBalance balance = leaveBalanceRepository
                .findByEmployeeIdAndLeaveType(employeeId, LeaveType.PAID_LEAVE)
                .orElseGet(() -> initializeBalance(employee, LeaveType.PAID_LEAVE));

        int base = employee.getPaidLeaveBaseDays();
        int adjustment = employee.getPaidLeaveAdjustment();
        BigDecimal total = BigDecimal.valueOf(base + adjustment);
        BigDecimal used = Optional.ofNullable(balance.getUsedDays()).orElse(BigDecimal.ZERO);
        BigDecimal remaining = total.subtract(used);
        if (remaining.signum() < 0) {
            remaining = BigDecimal.ZERO;
        }
        balance.setTotalDays(total);
        balance.setRemainingDays(remaining);
        leaveBalanceRepository.save(balance);
    }

    private BigDecimal calculateRequestedDays(LocalDate startDate, LocalDate endDate, LeaveTimeUnit timeUnit) {
        if (timeUnit == LeaveTimeUnit.HALF_AM || timeUnit == LeaveTimeUnit.HALF_PM) {
            return HALF_DAY;
        }
        long days = java.time.temporal.ChronoUnit.DAYS.between(startDate, endDate) + 1;
        if (days <= 0) {
            throw new VacationException(VacationException.INVALID_DATE_RANGE, "申請期間の日付が不正です");
        }
        return BigDecimal.valueOf(days);
    }

    private void approveRequest(LeaveRequest request, Long approverId) {
        if (request.getStatus() != LeaveStatus.PENDING) {
            throw new VacationException(VacationException.INVALID_STATUS_CHANGE, "承認できない状態です");
        }
        consumeBalance(request);
        request.setStatus(LeaveStatus.APPROVED);
        request.setApproverId(approverId);
        request.setRejectionComment(null);
    }

    private void rejectRequest(LeaveRequest request, Long approverId, String comment) {
        if (comment == null || comment.trim().isEmpty()) {
            throw new VacationException(VacationException.INVALID_REQUEST, "却下理由は必須です");
        }
        if (request.getStatus() != LeaveStatus.PENDING) {
            throw new VacationException(VacationException.INVALID_STATUS_CHANGE, "却下できない状態です");
        }
        request.setStatus(LeaveStatus.REJECTED);
        request.setApproverId(approverId);
        request.setRejectionComment(comment.trim());
    }

    private void cancelRequestByAdmin(LeaveRequest request, Long approverId) {
        if (request.getStatus() == LeaveStatus.APPROVED) {
            restoreBalance(request);
        }
        request.setStatus(LeaveStatus.CANCELLED);
        request.setApproverId(approverId);
        request.setRejectionComment(null);
    }

    private void consumeBalance(LeaveRequest request) {
        LeaveBalance balance = leaveBalanceRepository
                .findByEmployeeIdAndLeaveType(request.getEmployeeId(), request.getLeaveType())
                .orElseThrow(() -> new VacationException(VacationException.INVALID_REQUEST, "残数情報が見つかりません"));
        balance.consume(request.getDays());
        leaveBalanceRepository.save(balance);
    }

    private void restoreBalance(LeaveRequest request) {
        LeaveBalance balance = leaveBalanceRepository
                .findByEmployeeIdAndLeaveType(request.getEmployeeId(), request.getLeaveType())
                .orElse(null);
        if (balance == null) {
            return;
        }
        balance.restore(request.getDays());
        leaveBalanceRepository.save(balance);
    }

    private void recordApprovalHistory(LeaveRequest request,
                                       LeaveStatus newStatus,
                                       Long approverId,
                                       String comment) {
        Approval approval = new Approval(
                "LEAVE_REQUEST",
                request.getId(),
                newStatus,
                approverId,
                comment
        );
        approvalRepository.save(approval);
    }

    private LeaveRequestDto.LeaveData toDto(LeaveRequest request) {
        return new LeaveRequestDto.LeaveData(
                request.getId(),
                request.getEmployeeId(),
                request.getLeaveType(),
                request.getTimeUnit(),
                request.getStartDate(),
                request.getEndDate(),
                request.getDays().setScale(2, RoundingMode.HALF_UP),
                request.getStatus(),
                request.getReason(),
                request.getRejectionComment()
        );
    }

    private void setUserInfo(LeaveRequestDto response) {
        try {
            Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
            if (authentication != null && authentication.getPrincipal() instanceof UserAccount userAccount) {
                response.setEmployeeId(userAccount.getEmployeeId());
                response.setUsername(userAccount.getUsername());
            }
        } catch (Exception ignored) {
        }
    }
}
