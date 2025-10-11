package com.kintai.service;

import com.kintai.entity.AttendanceRecord;
import com.kintai.entity.Employee;
import com.kintai.repository.AttendanceRecordRepository;
import com.kintai.repository.EmployeeRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * 管理者機能サービス
 */
@Service
@Transactional
public class AdminService {
    
    @Autowired
    private EmployeeRepository employeeRepository;
    
    @Autowired
    private AttendanceRecordRepository attendanceRecordRepository;
    
    /**
     * 全社員一覧取得
     * @return 社員一覧
     */
    public List<Employee> getAllEmployees() {
        return employeeRepository.findAll();
    }
    
    /**
     * 勤怠承認処理
     * @param employeeId 従業員ID
     * @param yearMonth 年月（yyyy-MM形式）
     * @return 承認成功の場合true
     */
    public boolean approveAttendance(Long employeeId, String yearMonth) {
        try {
            // 該当月の勤怠記録を取得
            String[] parts = yearMonth.split("-");
            int year = Integer.parseInt(parts[0]);
            int month = Integer.parseInt(parts[1]);
            List<AttendanceRecord> records = attendanceRecordRepository.findByEmployeeAndMonth(employeeId, year, month);
            
            if (records.isEmpty()) {
                return false;
            }
            
            // 勤怠記録を承認済みに更新
            for (AttendanceRecord record : records) {
                record.setAttendanceFixedFlag(true);
            }
            attendanceRecordRepository.saveAll(records);
            
            return true;
        } catch (Exception e) {
            e.printStackTrace();
            return false;
        }
    }
}
