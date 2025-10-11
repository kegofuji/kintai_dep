package com.kintai.controller;

import com.kintai.entity.Employee;
import com.kintai.entity.AttendanceRecord;
import com.kintai.entity.AdjustmentRequest;
import com.kintai.entity.LeaveRequest;
import com.kintai.repository.EmployeeRepository;
import com.kintai.entity.UserAccount;
import com.kintai.repository.UserAccountRepository;
import com.kintai.repository.AttendanceRecordRepository;
import com.kintai.repository.AdjustmentRequestRepository;
import com.kintai.repository.LeaveRequestRepository;
import com.kintai.service.AuthService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 管理者向け 社員管理API
 */
@RestController
@RequestMapping("/api/admin/employee-management")
@CrossOrigin(origins = "*")
@Validated
public class AdminEmployeeController {

    @Autowired
    private EmployeeRepository employeeRepository;
    @Autowired
    private UserAccountRepository userAccountRepository;
    @Autowired
    private AttendanceRecordRepository attendanceRecordRepository;
    @Autowired
    private AdjustmentRequestRepository adjustmentRequestRepository;
    @Autowired
    private LeaveRequestRepository leaveRequestRepository;
    @Autowired
    private AuthService authService;

    @GetMapping
    public ResponseEntity<Map<String, Object>> listEmployees() {
        List<Employee> list = employeeRepository.findAll();
        Map<String, Object> body = new HashMap<>();
        body.put("success", true);
        body.put("data", list);
        return ResponseEntity.ok(body);
    }

    /**
     * 次の社員番号を取得
     */
    @GetMapping("/next-number")
    public ResponseEntity<Map<String, Object>> getNextEmployeeNumber() {
        try {
            String nextCode = generateEmployeeCode();
            // EMPプレフィックスを除去して番号のみを取得（ゼロパディングも除去）
            String nextNumber = nextCode.replace("EMP", "");
            // ゼロパディングを除去（"005" -> "5"）
            nextNumber = String.valueOf(Integer.parseInt(nextNumber));
            
            Map<String, Object> body = new HashMap<>();
            body.put("success", true);
            body.put("nextNumber", nextNumber);
            return ResponseEntity.ok(body);
        } catch (Exception e) {
            System.err.println("次の社員番号取得エラー: " + e.getMessage());
            Map<String, Object> body = new HashMap<>();
            body.put("success", false);
            body.put("message", "次の社員番号の取得に失敗しました");
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(body);
        }
    }

    /**
     * 社員追加（同時にログインアカウント作成）
     * 指定がない項目は自動補完するため、最低限 username と password があれば作成可能。
     */
    @PostMapping(value = "", consumes = "application/json", produces = "application/json")
    public ResponseEntity<Map<String, Object>> addEmployee(@RequestBody AddEmployeeRequest req) {
        try {
            System.out.println("社員追加リクエスト受信: " + (req != null ? req.toString() : "null"));
            
            if (req == null || req.username == null || req.password == null) {
                System.out.println("必須パラメータ不足: username=" + (req != null ? req.username : "null") + ", password=" + (req != null ? "[設定済み]" : "null"));
                Map<String, Object> body = new HashMap<>();
                body.put("success", false);
                body.put("message", "username と password は必須です");
                return ResponseEntity.badRequest().body(body);
            }

            // バリデーションを先に実行
            // パスワードの最小長チェックのみ（強度チェックは撤廃）
            if (req.password.length() < 4) {
                System.out.println("パスワード長不足: " + req.password.length());
                Map<String, Object> body = new HashMap<>();
                body.put("success", false);
                body.put("message", "パスワードは4文字以上で入力してください");
                return ResponseEntity.badRequest().body(body);
            }

            // ユーザー名の重複チェックは不要（自動生成のため）

            // 社員コードを自動生成（EMP + 3桁番号）
            String employeeCode = generateEmployeeCode();
            System.out.println("生成された社員コード: " + employeeCode);
            
            // ユーザー名はemp + 番号の形式（既存データと一貫性を保つ）
            // EMP001 -> emp1, EMP002 -> emp2 の形式に変換
            String numberPart = employeeCode.substring(3); // "001" -> "1"
            String username = "emp" + Integer.parseInt(numberPart);
            
            // 社員コードの重複チェックは既にgenerateEmployeeCode内で実施済み

            // 社員作成
            System.out.println("社員作成開始...");
            Employee emp = new Employee(employeeCode);
            emp = employeeRepository.save(emp);
            System.out.println("社員作成完了: ID=" + emp.getEmployeeId());

            // ログインアカウント作成（社員ロール）
            System.out.println("ユーザーアカウント作成開始...");
            String encoded = authService.encodePassword(req.password);
            UserAccount account = new UserAccount(username, encoded, UserAccount.UserRole.EMPLOYEE, emp.getEmployeeId());
            userAccountRepository.save(account);
            System.out.println("ユーザーアカウント作成完了: ID=" + account.getId());

            // 新規社員の勤怠データをクリア（念のため）
            clearNewEmployeeData(emp.getEmployeeId());
            System.out.println("新規社員の勤怠データをクリアしました: EmployeeID=" + emp.getEmployeeId());

            Map<String, Object> body = new HashMap<>();
            body.put("success", true);
            body.put("message", "社員とユーザーアカウントを作成しました");
            body.put("employeeId", emp.getEmployeeId());
            body.put("data", emp);
            System.out.println("社員追加処理完了");
            return ResponseEntity.ok(body);
        } catch (Exception e) {
            System.err.println("社員追加エラー: " + e.getClass().getSimpleName() + " - " + e.getMessage());
            e.printStackTrace();
            Map<String, Object> body = new HashMap<>();
            body.put("success", false);
            body.put("message", "作成に失敗しました: " + e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(body);
        }
    }

    private String generateEmployeeCode() {
        // 社員コードを「EMP」で固定し、番号を自動採番（既存データと一貫性を保つ）
        String baseCode = "EMP";
        
        // 重複チェックとカウンター付加（1からスタート）
        int counter = 1;
        String employeeCode;
        do {
            // 3桁のゼロパディングで統一（EMP001, EMP002, ...）
            employeeCode = baseCode + String.format("%03d", counter);
            counter++;
        } while (employeeRepository.findByEmployeeCode(employeeCode).isPresent());
        
        return employeeCode;
    }

    /**
     * 新規社員の勤怠データをクリアする
     * @param employeeId 社員ID
     */
    private void clearNewEmployeeData(Long employeeId) {
        try {
            // 勤怠記録を削除
            List<AttendanceRecord> attendanceRecords = attendanceRecordRepository.findByEmployeeIdOrderByAttendanceDateDesc(employeeId);
            attendanceRecordRepository.deleteAll(attendanceRecords);
            
            // 打刻修正申請を削除
            List<AdjustmentRequest> adjustmentRequests = adjustmentRequestRepository.findByEmployeeIdOrderByCreatedAtDesc(employeeId);
            adjustmentRequestRepository.deleteAll(adjustmentRequests);
            
            // 休暇申請を削除
            List<LeaveRequest> leaveRequests = leaveRequestRepository.findByEmployeeIdOrderByCreatedAtDesc(employeeId);
            leaveRequestRepository.deleteAll(leaveRequests);
            
            System.out.println("新規社員の勤怠データをクリア完了: EmployeeID=" + employeeId);
        } catch (Exception e) {
            System.err.println("新規社員の勤怠データクリアエラー: " + e.getMessage());
            // エラーが発生しても社員作成は継続する
        }
    }

    /**
     * 在籍状態の切替（復職/退職）
     */
    @PutMapping("/{employeeId}/status")
    public ResponseEntity<Map<String, Object>> updateStatus(@PathVariable Long employeeId, @RequestBody StatusUpdateRequest req) {
        return employeeRepository.findById(employeeId)
                .map(emp -> {
                    boolean isActive = req.isActive != null ? req.isActive : Boolean.TRUE;
                    emp.setIsActive(isActive);
                    // retirementDateフィールドは削除されたため、isActiveフラグのみで管理
                    employeeRepository.save(emp);
                    
                    // UserAccountのenabledフラグも更新
                    userAccountRepository.findByEmployeeId(employeeId)
                            .ifPresent(userAccount -> {
                                userAccount.setEnabled(isActive);
                                userAccountRepository.save(userAccount);
                            });
                    
                    Map<String, Object> body = new HashMap<>();
                    body.put("success", true);
                    body.put("message", isActive ? "復職処理が完了しました" : "退職処理が完了しました");
                    return ResponseEntity.ok(body);
                })
                .orElseGet(() -> {
                    Map<String, Object> body = new HashMap<>();
                    body.put("success", false);
                    body.put("message", "従業員が見つかりません");
                    return ResponseEntity.status(HttpStatus.NOT_FOUND).body(body);
                });
    }

    /**
     * 互換: 旧退職処理エンドポイント
     */
    @PutMapping("/{employeeId}/deactivate")
    public ResponseEntity<Map<String, Object>> deactivate(@PathVariable Long employeeId) {
        StatusUpdateRequest req = new StatusUpdateRequest();
        req.isActive = false;
        return updateStatus(employeeId, req);
    }

    /**
     * 社員削除（データベースから完全削除）
     */
    @DeleteMapping("/{employeeId}")
    public ResponseEntity<Map<String, Object>> deleteEmployee(@PathVariable Long employeeId) {
        try {
            // 社員が存在するかチェック
            if (!employeeRepository.existsById(employeeId)) {
                Map<String, Object> body = new HashMap<>();
                body.put("success", false);
                body.put("message", "従業員が見つかりません");
                return ResponseEntity.status(HttpStatus.NOT_FOUND).body(body);
            }

            // 関連するUserAccountを先に削除
            userAccountRepository.findByEmployeeId(employeeId)
                    .ifPresent(userAccount -> {
                        userAccountRepository.delete(userAccount);
                        System.out.println("Deleted user account for employee ID: " + employeeId);
                    });

            // 社員データを削除
            employeeRepository.deleteById(employeeId);
            System.out.println("Deleted employee with ID: " + employeeId);

            Map<String, Object> body = new HashMap<>();
            body.put("success", true);
            body.put("message", "社員データを削除しました");
            return ResponseEntity.ok(body);
        } catch (Exception e) {
            System.err.println("社員削除エラー: " + e.getClass().getSimpleName() + " - " + e.getMessage());
            e.printStackTrace();
            Map<String, Object> body = new HashMap<>();
            body.put("success", false);
            body.put("message", "削除に失敗しました: " + e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(body);
        }
    }

    /** リクエストDTO */
    public static class StatusUpdateRequest {
        public Boolean isActive;
    }

    /** 追加用DTO */
    public static class AddEmployeeRequest {
        public String employeeCode;
        public String username; // ログインID（必須）
        public String password; // 平文→エンコード（必須）
        
        @Override
        public String toString() {
            return "AddEmployeeRequest{" +
                    "employeeCode='" + employeeCode + '\'' +
                    ", username='" + username + '\'' +
                    ", password='[設定済み]'" +
                    '}';
        }
    }
}

