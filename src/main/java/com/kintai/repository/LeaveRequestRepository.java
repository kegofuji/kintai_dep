package com.kintai.repository;

import com.kintai.entity.LeaveRequest;
import com.kintai.entity.LeaveStatus;
import com.kintai.entity.LeaveType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

@Repository
public interface LeaveRequestRepository extends JpaRepository<LeaveRequest, Long> {

    List<LeaveRequest> findByEmployeeIdOrderByCreatedAtDesc(Long employeeId);

    List<LeaveRequest> findByEmployeeIdAndStatusOrderByCreatedAtDesc(Long employeeId, LeaveStatus status);

    List<LeaveRequest> findByStatusOrderByCreatedAtDesc(LeaveStatus status);

    Optional<LeaveRequest> findByIdAndEmployeeId(Long id, Long employeeId);

    @Query("SELECT COUNT(lr) > 0 FROM LeaveRequest lr " +
            "WHERE lr.employeeId = :employeeId " +
            "AND lr.status IN ('PENDING', 'APPROVED') " +
            "AND lr.startDate <= :endDate " +
            "AND lr.endDate >= :startDate")
    boolean hasOverlappingRequest(@Param("employeeId") Long employeeId,
                                  @Param("startDate") LocalDate startDate,
                                  @Param("endDate") LocalDate endDate);

    @Query("SELECT COALESCE(SUM(lr.days), 0) FROM LeaveRequest lr " +
            "WHERE lr.employeeId = :employeeId " +
            "AND lr.leaveType = :leaveType " +
            "AND lr.status = 'APPROVED' " +
            "AND lr.startDate >= :startDate " +
            "AND lr.endDate <= :endDate")
    BigDecimal sumApprovedDaysInPeriod(@Param("employeeId") Long employeeId,
                                       @Param("leaveType") LeaveType leaveType,
                                       @Param("startDate") LocalDate startDate,
                                       @Param("endDate") LocalDate endDate);

    @Query("SELECT lr FROM LeaveRequest lr WHERE lr.employeeId = :employeeId " +
            "AND lr.leaveType = :leaveType " +
            "AND lr.status = 'PENDING' " +
            "AND lr.startDate <= :date " +
            "AND lr.endDate >= :date")
    List<LeaveRequest> findPendingRequestsOnDate(@Param("employeeId") Long employeeId,
                                                 @Param("leaveType") LeaveType leaveType,
                                                 @Param("date") LocalDate date);

    @Query("SELECT lr FROM LeaveRequest lr WHERE lr.employeeId = :employeeId " +
            "AND lr.status = 'PENDING' " +
            "AND lr.startDate <= :endDate " +
            "AND lr.endDate >= :startDate")
    List<LeaveRequest> findPendingRequestsInRange(@Param("employeeId") Long employeeId,
                                                  @Param("startDate") LocalDate startDate,
                                                  @Param("endDate") LocalDate endDate);
}
