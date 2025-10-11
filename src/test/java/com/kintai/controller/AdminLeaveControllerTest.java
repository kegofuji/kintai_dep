package com.kintai.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.kintai.dto.LeaveRequestDto;
import com.kintai.entity.Employee;
import com.kintai.entity.LeaveRequest;
import com.kintai.entity.LeaveStatus;
import com.kintai.entity.LeaveTimeUnit;
import com.kintai.entity.LeaveType;
import com.kintai.repository.EmployeeRepository;
import com.kintai.repository.LeaveRequestRepository;
import com.kintai.service.LeaveRequestService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class AdminLeaveControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private EmployeeRepository employeeRepository;

    @Autowired
    private LeaveRequestService leaveRequestService;

    @Autowired
    private LeaveRequestRepository leaveRequestRepository;

    private Employee employee;
    private Employee employee2;
    private Employee approver;

    @BeforeEach
    void setUp() {
        employee = employeeRepository.save(new Employee("EMP-ADMIN-001"));
        employee2 = employeeRepository.save(new Employee("EMP-ADMIN-002"));
        approver = employeeRepository.save(new Employee("EMP-ADMIN-APPROVER"));
    }

    @Test
    void grantSpecialWithoutDatesReturnsBadRequest() throws Exception {
        Map<String, Object> payload = Map.of(
                "leaveType", "SPECIAL",
                "grantedDays", 1,
                "grantedDate", LocalDate.now().toString(),
                "scope", "ALL"
        );

        mockMvc.perform(post("/api/admin/leave/grants")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(payload)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("特別休暇の日付を指定してください"));
    }

    @Test
    void grantSeasonalLeaveToIndividualsSuccess() throws Exception {
        Map<String, Object> payload = Map.of(
                "leaveType", "SUMMER",
                "grantedDays", 3,
                "grantedDate", LocalDate.now().toString(),
                "expiresAt", LocalDate.now().plusMonths(1).toString(),
                "scope", "INDIVIDUAL",
                "employeeIds", List.of(employee.getEmployeeId(), employee2.getEmployeeId())
        );

        mockMvc.perform(post("/api/admin/leave/grants")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(payload)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.distributedCount").value(2));

        var remaining = leaveRequestService.getRemainingLeaveSummary(employee.getEmployeeId());
        assertThat(remaining.get(LeaveType.SUMMER)).isEqualByComparingTo("3");
    }

    @Test
    void pendingRequestsEndpointReturnsCreatedLeave() throws Exception {
        LocalDate start = LocalDate.now().plusDays(3);
        LeaveRequestDto dto = leaveRequestService.createLeaveRequest(
                employee.getEmployeeId(),
                LeaveType.PAID_LEAVE,
                LeaveTimeUnit.FULL_DAY,
                start,
                start.plusDays(1),
                "夏季前休暇");

        mockMvc.perform(get("/api/admin/leave/requests/pending"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.count").value(1))
                .andExpect(jsonPath("$.data[0].leaveType").value("PAID_LEAVE"))
                .andExpect(jsonPath("$.data[0].id").value(((LeaveRequestDto.LeaveData) dto.getData()).getLeaveRequestId()));
    }

    @Test
    void decisionEndpointApprovesLeaveRequest() throws Exception {
        LocalDate start = LocalDate.now().plusDays(2);
        LeaveRequestDto dto = leaveRequestService.createLeaveRequest(
                employee.getEmployeeId(),
                LeaveType.PAID_LEAVE,
                LeaveTimeUnit.FULL_DAY,
                start,
                start,
                "承認テスト");

        Long requestId = ((LeaveRequestDto.LeaveData) dto.getData()).getLeaveRequestId();

        Map<String, Object> payload = Map.of(
                "approved", true,
                "approverId", approver.getEmployeeId()
        );

        mockMvc.perform(post("/api/admin/leave/requests/" + requestId + "/decision")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(payload)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));

        LeaveRequest updated = leaveRequestRepository.findById(requestId).orElseThrow();
        assertThat(updated.getStatus()).isEqualTo(LeaveStatus.APPROVED);
    }

    @Test
    void adjustBalanceEndpointIncrementsPaidLeaveAdjustment() throws Exception {
        int beforeAdjustment = employeeRepository.findById(employee.getEmployeeId())
                .orElseThrow()
                .getPaidLeaveAdjustment();

        Map<String, Object> payload = Map.of(
                "employeeId", employee.getEmployeeId(),
                "deltaDays", 2,
                "reason", "テスト調整"
        );

        mockMvc.perform(post("/api/admin/leave/balances/adjust")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(payload)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.adjustmentTotal").value(beforeAdjustment + 2));

        int updatedAdjustment = employeeRepository.findById(employee.getEmployeeId())
                .orElseThrow()
                .getPaidLeaveAdjustment();
        assertThat(updatedAdjustment).isEqualTo(beforeAdjustment + 2);

        var remaining = leaveRequestService.getRemainingLeaveSummary(employee.getEmployeeId());
        BigDecimal expectedRemaining = BigDecimal.valueOf(employee.getPaidLeaveBaseDays() + updatedAdjustment);
        assertThat(remaining.get(LeaveType.PAID_LEAVE)).isEqualByComparingTo(expectedRemaining);
    }
}
