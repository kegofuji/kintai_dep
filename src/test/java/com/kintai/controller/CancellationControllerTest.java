package com.kintai.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.kintai.dto.AdjustmentRequestDto;
import com.kintai.dto.LeaveRequestDto;
import com.kintai.entity.AdjustmentRequest;
import com.kintai.entity.AttendanceRecord;
import com.kintai.entity.Employee;
import com.kintai.entity.LeaveRequest;
import com.kintai.entity.LeaveStatus;
import com.kintai.entity.LeaveTimeUnit;
import com.kintai.entity.LeaveType;
import com.kintai.repository.AdjustmentRequestRepository;
import com.kintai.repository.AttendanceRecordRepository;
import com.kintai.repository.EmployeeRepository;
import com.kintai.repository.LeaveRequestRepository;
import com.kintai.service.AdjustmentRequestService;
import com.kintai.service.LeaveRequestService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
@org.springframework.test.context.TestExecutionListeners(
        listeners = {
                org.springframework.test.context.web.ServletTestExecutionListener.class,
                org.springframework.test.context.support.DirtiesContextBeforeModesTestExecutionListener.class,
                org.springframework.test.context.support.DependencyInjectionTestExecutionListener.class,
                org.springframework.test.context.support.DirtiesContextTestExecutionListener.class,
                org.springframework.test.context.transaction.TransactionalTestExecutionListener.class,
                org.springframework.test.context.jdbc.SqlScriptsTestExecutionListener.class
        },
        mergeMode = org.springframework.test.context.TestExecutionListeners.MergeMode.REPLACE_DEFAULTS
)
class CancellationControllerTest {

    @Autowired
    MockMvc mockMvc;

    @Autowired
    ObjectMapper objectMapper;

    @Autowired
    EmployeeRepository employeeRepository;

    @Autowired
    AdjustmentRequestService adjustmentRequestService;

    @Autowired
    LeaveRequestService leaveRequestService;

    @Autowired
    AdjustmentRequestRepository adjustmentRequestRepository;

    @Autowired
    AttendanceRecordRepository attendanceRecordRepository;

    @Autowired
    LeaveRequestRepository leaveRequestRepository;

    private Employee employee;
    private Employee approver;

    @BeforeEach
    void setUp() {
        employee = employeeRepository.save(new Employee("EMP-TST-001"));
        approver = employeeRepository.save(new Employee("EMP-TST-ADMIN"));
    }

    @Test
    void cancelPendingAdjustmentRequest() throws Exception {
        LocalDate targetDate = LocalDate.of(2025, 9, 1);
        AdjustmentRequestDto dto = new AdjustmentRequestDto(
                employee.getEmployeeId(),
                targetDate,
                LocalDateTime.of(2025, 9, 1, 9, 0),
                LocalDateTime.of(2025, 9, 1, 18, 0),
                "申請理由"
        );
        AdjustmentRequest adjustmentRequest = adjustmentRequestService.createAdjustmentRequest(dto);

        String payload = objectMapper.writeValueAsString(
                Map.of(
                        "adjustmentRequestId", adjustmentRequest.getAdjustmentRequestId(),
                        "employeeId", employee.getEmployeeId()
                ));

        mockMvc.perform(post("/api/cancel/adjustment")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(payload))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));

        AdjustmentRequest updated = adjustmentRequestRepository.findById(adjustmentRequest.getAdjustmentRequestId()).orElseThrow();
        assertThat(updated.getStatus()).isEqualTo(AdjustmentRequest.AdjustmentStatus.CANCELLED);
    }

    @Test
    void cancelApprovedAdjustmentRequestRestoresOriginalAttendance() throws Exception {
        LocalDate targetDate = LocalDate.of(2025, 9, 2);
        LocalDateTime originalClockIn = LocalDateTime.of(2025, 9, 2, 8, 30);
        LocalDateTime originalClockOut = LocalDateTime.of(2025, 9, 2, 17, 30);

        AttendanceRecord attendanceRecord = new AttendanceRecord(employee.getEmployeeId(), targetDate);
        attendanceRecord.setClockInTime(originalClockIn);
        attendanceRecord.setClockOutTime(originalClockOut);
        attendanceRecordRepository.save(attendanceRecord);

        AdjustmentRequestDto dto = new AdjustmentRequestDto(
                employee.getEmployeeId(),
                targetDate,
                LocalDateTime.of(2025, 9, 2, 9, 0),
                LocalDateTime.of(2025, 9, 2, 18, 0),
                "理由"
        );
        AdjustmentRequest adjustmentRequest = adjustmentRequestService.createAdjustmentRequest(dto);

        adjustmentRequestService.approveAdjustmentRequest(adjustmentRequest.getAdjustmentRequestId(), approver.getEmployeeId());

        String payload = objectMapper.writeValueAsString(
                Map.of(
                        "adjustmentRequestId", adjustmentRequest.getAdjustmentRequestId(),
                        "employeeId", employee.getEmployeeId()
                ));

        mockMvc.perform(post("/api/cancel/adjustment")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(payload))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));

        AdjustmentRequest updated = adjustmentRequestRepository.findById(adjustmentRequest.getAdjustmentRequestId()).orElseThrow();
        assertThat(updated.getStatus()).isEqualTo(AdjustmentRequest.AdjustmentStatus.CANCELLED);

        AttendanceRecord reverted = attendanceRecordRepository
                .findByEmployeeIdAndAttendanceDate(employee.getEmployeeId(), targetDate)
                .orElseThrow();
        assertThat(reverted.getClockInTime()).isEqualTo(originalClockIn);
        assertThat(reverted.getClockOutTime()).isEqualTo(originalClockOut);
    }

    @Test
    void cancelPendingLeaveRequest() throws Exception {
        LocalDate start = LocalDate.of(2025, 9, 3);
        LeaveRequestDto requestDto = leaveRequestService.createLeaveRequest(
                employee.getEmployeeId(),
                LeaveType.PAID_LEAVE,
                LeaveTimeUnit.FULL_DAY,
                start,
                start,
                "有休理由");

        LeaveRequestDto.LeaveData responseData = (LeaveRequestDto.LeaveData) requestDto.getData();
        Long leaveRequestId = responseData.getLeaveRequestId();
        String payload = objectMapper.writeValueAsString(
                Map.of(
                        "leaveRequestId", leaveRequestId,
                        "employeeId", employee.getEmployeeId()
                ));

        mockMvc.perform(post("/api/cancel/leave")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(payload))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));

        LeaveRequest updated = leaveRequestRepository.findById(leaveRequestId).orElseThrow();
        assertThat(updated.getStatus()).isEqualTo(LeaveStatus.CANCELLED);
    }

    @Test
    void cancelApprovedLeaveRequest() throws Exception {
        LocalDate start = LocalDate.of(2025, 9, 4);
        LocalDate end = start.plusDays(1);
        LeaveRequestDto requestDto = leaveRequestService.createLeaveRequest(
                employee.getEmployeeId(),
                LeaveType.PAID_LEAVE,
                LeaveTimeUnit.FULL_DAY,
                start,
                end,
                "連休理由");

        LeaveRequestDto.LeaveData responseData = (LeaveRequestDto.LeaveData) requestDto.getData();
        Long leaveRequestId = responseData.getLeaveRequestId();
        leaveRequestService.updateStatus(leaveRequestId, LeaveStatus.APPROVED, approver.getEmployeeId(), null);

        String payload = objectMapper.writeValueAsString(
                Map.of(
                        "leaveRequestId", leaveRequestId,
                        "employeeId", employee.getEmployeeId()
                ));

        mockMvc.perform(post("/api/cancel/leave")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(payload))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));

        LeaveRequest updated = leaveRequestRepository.findById(leaveRequestId).orElseThrow();
        assertThat(updated.getStatus()).isEqualTo(LeaveStatus.CANCELLED);
    }

    @Test
    void canCreateLeaveRequestOnWeekend() {
        LocalDate sunday = LocalDate.of(2025, 9, 7);

        LeaveRequestDto response = leaveRequestService.createLeaveRequest(
                employee.getEmployeeId(),
                LeaveType.PAID_LEAVE,
                LeaveTimeUnit.FULL_DAY,
                sunday,
                sunday,
                "休日申請");

        assertThat(response.isSuccess()).isTrue();
        LeaveRequestDto.LeaveData data = (LeaveRequestDto.LeaveData) response.getData();
        assertThat(data.getDays().intValue()).isEqualTo(1);
        assertThat(data.getStartDate()).isEqualTo(sunday);
        assertThat(data.getEndDate()).isEqualTo(sunday);
    }

    @Test
    void canCreateLeaveRequestIncludingWeekendCountsCalendarDays() {
        LocalDate start = LocalDate.of(2025, 9, 4); // 木曜日
        LocalDate end = LocalDate.of(2025, 9, 7);   // 日曜日まで

        LeaveRequestDto response = leaveRequestService.createLeaveRequest(
                employee.getEmployeeId(),
                LeaveType.PAID_LEAVE,
                LeaveTimeUnit.FULL_DAY,
                start,
                end,
                "長期休暇");

        LeaveRequestDto.LeaveData data = (LeaveRequestDto.LeaveData) response.getData();
        assertThat(data.getDays().intValue()).isEqualTo(4);
        assertThat(data.getStartDate()).isEqualTo(start);
        assertThat(data.getEndDate()).isEqualTo(end);
    }

    @Test
    void canCreateAdjustmentRequestOnHoliday() {
        LocalDate sunday = LocalDate.of(2025, 9, 7);
        AdjustmentRequestDto dto = new AdjustmentRequestDto(
                employee.getEmployeeId(),
                sunday,
                LocalDateTime.of(2025, 9, 7, 9, 0),
                LocalDateTime.of(2025, 9, 7, 18, 0),
                "休日打刻修正"
        );

        AdjustmentRequest adjustmentRequest = adjustmentRequestService.createAdjustmentRequest(dto);

        assertThat(adjustmentRequest).isNotNull();
        assertThat(adjustmentRequest.getTargetDate()).isEqualTo(sunday);
        assertThat(adjustmentRequest.getNewClockIn()).isEqualTo(dto.getNewClockIn());
        assertThat(adjustmentRequest.getNewClockOut()).isEqualTo(dto.getNewClockOut());
    }

    @Test
    void apiAllowsAdjustmentRequestOnWeekend() throws Exception {
        LocalDate sunday = LocalDate.of(2025, 9, 7);

        String payload = objectMapper.writeValueAsString(
                Map.of(
                        "employeeId", employee.getEmployeeId().toString(),
                        "date", sunday.toString(),
                        "clockInDate", sunday.toString(),
                        "clockInTime", "09:00",
                        "clockOutDate", sunday.toString(),
                        "clockOutTime", "18:00",
                        "reason", "API休日申請"
                )
        );

        mockMvc.perform(post("/api/attendance/adjustment-request")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(payload))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.message").value("打刻修正が完了しました"));
    }
}
