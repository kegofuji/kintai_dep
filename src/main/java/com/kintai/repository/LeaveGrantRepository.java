package com.kintai.repository;

import com.kintai.entity.LeaveGrant;
import com.kintai.entity.LeaveType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;

@Repository
public interface LeaveGrantRepository extends JpaRepository<LeaveGrant, Long> {

    List<LeaveGrant> findByEmployeeIdAndLeaveType(Long employeeId, LeaveType leaveType);

    @Query("SELECT lg FROM LeaveGrant lg WHERE lg.employeeId = :employeeId " +
            "AND lg.leaveType = :leaveType " +
            "AND (lg.expiresAt IS NULL OR lg.expiresAt >= :today)")
    List<LeaveGrant> findActiveGrants(@Param("employeeId") Long employeeId,
                                      @Param("leaveType") LeaveType leaveType,
                                      @Param("today") LocalDate today);

    @Query("SELECT lg FROM LeaveGrant lg WHERE lg.employeeId = :employeeId " +
            "AND (lg.expiresAt IS NULL OR lg.expiresAt >= :today)")
    List<LeaveGrant> findActiveGrants(@Param("employeeId") Long employeeId,
                                      @Param("today") LocalDate today);

    @Query("SELECT lg FROM LeaveGrant lg WHERE lg.employeeId = :employeeId " +
            "AND lg.leaveType = 'SPECIAL' " +
            "AND lg.grantedAt <= :targetDate " +
            "AND (lg.expiresAt IS NULL OR lg.expiresAt >= :targetDate)")
    List<LeaveGrant> findSpecialGrantsCoveringDate(@Param("employeeId") Long employeeId,
                                                   @Param("targetDate") LocalDate targetDate);
}
