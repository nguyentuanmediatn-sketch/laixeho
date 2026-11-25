# Tuần 3 (Mốc 3): Web Admin, Nhắc Phí Duy Trì, UAT, Phát Hành & Bàn Giao

**Mục tiêu Tuần 3:** Hoàn thiện Web Admin & tính năng nhắc phí duy trì, kiểm thử UAT toàn hệ thống trên môi trường thực tế, phát hành lên Google Play & App Store, đào tạo và bàn giao toàn bộ sản phẩm để **Nghiệm thu tổng thể (Thanh toán Đợt 3 – 30%)**.  
**Hạng mục SOW:** `[11]`, `[12]`, `[13]`, `[14]`, `[15]`.

---

## 1. Tính Năng Nhắc Phí Duy Trì (`[11]`)

- **Backend Cron Job** (chạy hàng ngày lúc `08:00` sáng giờ VN):
  - Quét bảng `drivers` có `status = 'ACTIVE'` và `fee_due_date`:
    - Nếu còn `<= remind_days_before` (mặc định 3 ngày) đến hạn và chưa đóng kỳ hiện tại → tạo bản ghi `maintenance_fees` (`UNPAID`), gửi Push Notification nhắc trước hạn cho tài xế.
    - Nếu đã quá `fee_due_date` → cập nhật `maintenance_fees.status = 'OVERDUE'`, gửi Push Notification nhắc quá hạn hàng ngày cho tài xế; hiển thị nhãn **"Quá hạn"** nổi bật trên Web Admin.
- **App Tài xế:** Màn hình trạng thái phí duy trì (hạn đóng tiếp theo, số tiền `200.000đ/tháng`, trạng thái Đã đóng / Sắp đến hạn / Quá hạn, hướng dẫn đóng phí).
- **Web Admin:** Nút **"Xác nhận đã đóng phí"** trên hồ sơ tài xế / danh sách phí → cập nhật `maintenance_fees.status = 'PAID'`, `paid_at`, `confirmed_by_admin_id`, và tự động cộng `+1 tháng` vào `drivers.fee_due_date`.

---

## 2. Web Admin Hoàn Chỉnh (React / Next.js) (`[12]`, `[13]`, `[14]`)

- **12. Cấu hình Hệ thống (`settings`):**
  - Form chỉnh sửa: Giá mở cửa ngày/đêm, Đơn giá/km ngày/đêm, Mốc km mở cửa (5 km), Khung giờ ngày/đêm, Quy tắc làm tròn km, Chiết khấu (% hoặc cố định), Bán kính tìm tài xế, Thời gian chờ nhận đơn (N giây), Thời gian khóa nhận đơn (phút), Số dư ví tối thiểu, Mức phí duy trì & số ngày nhắc trước.
  - Mọi thay đổi đều ghi vào bảng `audit_logs` (`admin_id`, `before`, `after`, `created_at`) và có giao diện xem lịch sử thay đổi.
- **13. Tạo đơn thủ công:**
  - Form cho điều phối viên nhập: SĐT khách, Tên khách (tự tìm hoặc tạo mới `customers`), Điểm đón & Điểm trả (tích hợp Map Autocomplete + ghim bản đồ), Ghi chú.
  - Hệ thống tính giá dự kiến và tự động đẩy vào luồng điều phối `SEARCHING` giống hệt đơn từ App Khách.
  - Theo dõi trạng thái đơn realtime trên danh sách.
- **14. Quản lý Nghiệp vụ & Thống kê:**
  - **Quản lý Tài xế:** Danh sách lọc theo trạng thái (`Chờ duyệt`, `Hoạt động`, `Đang khóa`, `Quá hạn phí`). Xem ảnh CCCD/GPLX, bấm **Duyệt** hoặc **Khóa/Mở khóa** tài khoản; xem lịch sử chuyến, lịch sử bị khóa nhận đơn (`driver_locks`), số dư ví, lịch sử phí duy trì.
  - **Quản lý Ví:** Danh sách yêu cầu/tài xế cần nạp; nút **Xác nhận nạp tiền** (nhập số tiền, ghi chú); nút **Điều chỉnh số dư** (bắt buộc nhập lý do, lưu `wallet_transactions` + `audit_logs`).
  - **Quản lý Khách hàng & Chuyến đi:** Danh sách khách hàng; danh sách chuyến đi lọc theo trạng thái (ưu tiên highlight đơn `NO_DRIVER` để Admin liên hệ xử lý), xem chi tiết lộ trình trên bản đồ, giá dự kiến/chốt, chiết khấu, và **xem/tải ảnh & phát video nhận/trả xe**.
  - **Thống kê cơ bản:** Biểu đồ/bảng tổng hợp theo ngày / tháng: Tổng số chuyến hoàn thành, Tổng tiền chuyến, Tổng chiết khấu, Tổng phí duy trì đã thu.

---

## 3. Kiểm Thử Nghiệm Thu (UAT) & Tối Ưu (`[15]`)

- **Kiểm thử chức năng theo Tiêu chí nghiệm thu (Điều 5 Phụ lục 02):**
  - Test toàn bộ luồng trên thiết bị thật Android & iOS (4G/Wi-Fi yếu, chuyển app ra nền, tắt/bật GPS).
  - Kiểm tra bộ chuyến mẫu tính tiền (ngày/đêm, `<5km`, `>5km`, đổi điểm trả).
  - Kiểm tra trừ chiết khấu ví chính xác, chặn nhận đơn khi ví < tối thiểu, khóa đúng thời gian cấu hình khi từ chối/hết giờ, chặn "Bắt đầu chuyến" khi thiếu ảnh biển số hoặc video.
  - Kiểm tra không còn Critical Bug.
- **Tối ưu & Bảo mật:**
  - Rà soát HTTPS, phân quyền API (`Customer` không xem được dữ liệu `Driver`/`Admin` và ngược lại), kiểm tra backup tự động PostgreSQL hàng ngày.

---

## 4. Triển Khai Production, Phát Hành Store & Bàn Giao (`[15]`)

- **Triển khai Production:**
  - Cấu hình Server chính thức, Domain + SSL cho Web Admin & API, PostgreSQL + Redis + R2/S3 production, Monitoring/Logs, Backup định kỳ.
- **Phát hành App Store & Google Play (bằng tài khoản của Bên A):**
  - Chuẩn bị Store Listing (icon, screenshots, mô tả, Privacy Policy URL, tài khoản test OTP cho reviewer).
  - Submit bản Release lên **Google Play Console** (Internal/Closed test nếu tài khoản mới cần 12 tester 14 ngày theo chính sách Google, hoặc Production nếu tài khoản tổ chức/cũ) & **Apple App Store Connect**.
  - *(Lưu ý: Thời gian Apple/Google xét duyệt không tính vào 3 tuần hợp đồng theo Điều 2.2).*
- **Đào tạo & Bàn giao (Điều 4.3 Hợp đồng):**
  - Tổ chức buổi đào tạo sử dụng Web Admin & vận hành hệ thống cho đội ngũ Bên A.
  - Bàn giao toàn bộ:
    1. Mã nguồn (Source Code Git repository) của Backend, Web Admin, App Khách, App Tài xế.
    2. Tài liệu hướng dẫn cài đặt, cấu hình deploy (`.env` template, Docker/Server setup), vận hành & backup.
    3. Tài liệu hướng dẫn sử dụng (Admin & Tài xế/Khách).
    4. Sơ đồ đặc tả hệ thống & tài khoản quản trị cấp cao.
- **Ký Biên bản nghiệm thu tổng thể & Thanh lý hợp đồng → Thanh toán Đợt 3 (30% – 7.500.000đ).**
