# Tuần 2 (Mốc 2): Luồng Chuyến Đi, Điều Phối, Media & Ví Tài Xế

**Mục tiêu Tuần 2:** Hoàn thiện toàn bộ luồng nghiệp vụ chuyến đi trên Backend, App Khách hàng và App Tài xế; bàn giao bản chạy thử (APK + TestFlight) để **Nghiệm thu Giai đoạn 1 (Thanh toán Đợt 2 – 40%)**.  
**Hạng mục SOW:** `[3]`, `[6]`, `[7]`, `[8]`, `[9]`, `[10]`.

---

## 1. Backend: Engine Điều Phối Đơn, Khóa Tài Xế & Ví (`[6]`, `[7]`, `[8]`)

### 1.1. Quản lý Vị trí Realtime & Trực tuyến
- WebSocket Gateway (Socket.IO + Redis Adapter):
  - Tài xế bật trực tuyến (`is_online = true`) → App gửi tọa độ định kỳ (5–10s hoặc khi di chuyển > 20m) qua WebSocket/HTTP.
  - Backend cập nhật Redis `GEOADD drivers:online <lng> <lat> <driver_id>` + cập nhật `drivers.lat, lng, location_at` (batch/throttle).
  - Khi tài xế nhận chuyến (`ACCEPTED`..`IN_PROGRESS`), emit tọa độ tài xế tới room `trip:<trip_id>` để App Khách hiển thị di chuyển realtime.

### 1.2. Thuật toán Điều phối Tuần tự & Khóa quyền nhận đơn
1. Khi có đơn mới (`status = SEARCHING`) từ App Khách hoặc Web Admin:
   - Query Redis `GEORADIUS` trong `radius_km` (3–5 km) từ `pickup_lat, pickup_lng`, sắp xếp gần → xa.
   - Lọc qua PostgreSQL các điều kiện bắt buộc:
     - `status = 'ACTIVE'` (đã duyệt, không bị Admin khóa)
     - `is_online = true`
     - `locked_until IS NULL OR locked_until <= NOW()`
     - `wallet.balance >= settings.min_wallet_balance`
     - Không có chuyến nào đang ở trạng thái `ACCEPTED | ARRIVED | IN_PROGRESS`
     - Chưa từng có `dispatch_offers` cho `trip_id` này.
2. Nếu **không còn tài xế phù hợp**:
   - Đổi `trips.status = 'NO_DRIVER'`, gửi Push Notification + WebSocket báo Khách hàng, đồng thời đẩy cảnh báo lên Web Admin.
3. Nếu **có tài xế gần nhất**:
   - Tạo `dispatch_offers` (`sent_at`, `expires_at = now + offer_timeout_sec`).
   - Gửi WebSocket event `trip:offer` + Push Notification (FCM/APNs kèm âm thanh chuẩn OS) cho tài xế.
   - Lên lịch BullMQ delayed job sau `offer_timeout_sec` giây (hết giờ).
4. **Xử lý phản hồi tài xế:**
   - **Nhận đơn (`ACCEPT`):** Dùng DB Transaction + lock hàng (`WHERE status = 'SEARCHING'`) → gán `driver_id`, đổi `trips.status = 'ACCEPTED'`, `offer.result = 'ACCEPTED'`, hủy delayed job timeout, thông báo Khách hàng.
   - **Từ chối (`REJECT`) hoặc Hết giờ (`TIMEOUT`):**
     - Cập nhật `offer.result = 'REJECTED' | 'TIMEOUT'`.
     - Khóa tài xế: set `drivers.locked_until = now + lock_minutes` và ghi bảng `driver_locks` (`offer_id`, `locked_from`, `locked_until`, `reason`).
     - Gửi thông báo cho tài xế biết thời gian bị khóa.
     - Tự động kích hoạt lại bước tìm tài xế kế tiếp cho `trip_id`.
   - *Lưu ý:* Hết thời gian `locked_until`, điều kiện query `locked_until <= NOW()` tự động cho phép tài xế nhận đơn trở lại (không cần đợi cron, nhưng vẫn có thể emit event mở khóa cho app).

### 1.3. Luồng Trạng Thái Chuyến & Ví Chiết Khấu
- State Machine chuẩn 7 trạng thái (Trang 5 Sơ đồ):
  - `SEARCHING` → `ACCEPTED` (Tài xế nhận)
  - `ACCEPTED` → `ARRIVED` (Tài xế bấm "Đã đến")
  - `ARRIVED` → `IN_PROGRESS` (Kiểm tra `trip_media` stage `PICKUP` có ≥ 1 ảnh `is_plate_photo = true` và ≥ 1 video → mới cho phép chuyển trạng thái)
  - `IN_PROGRESS` → `COMPLETED` (Kiểm tra `trip_media` stage `DROPOFF` có ≥ 1 ảnh → tính `final_price` nếu có đổi điểm trả → tính `commission_amount` → DB Transaction trừ `wallets.balance` & ghi `wallet_transactions` type `COMMISSION` → gửi Push báo số tiền khách trả & số dư ví mới)
  - `SEARCHING | ACCEPTED | ARRIVED` → `CANCELLED` (Khách chỉ được hủy trước khi `IN_PROGRESS`, tức trước khi tài xế nhận xe xong; Admin hủy được mọi lúc trước `COMPLETED`; lưu `cancelled_by`, `cancel_reason`).

---

## 2. Ứng Dụng Khách Hàng (Flutter) (`[3]`)

- **Đăng nhập:** SĐT + OTP (tự động đọc SMS/nhập mã), lưu JWT an toàn (`flutter_secure_storage`).
- **Đặt chuyến 1 chạm:**
  - Tự xin quyền GPS, định vị điểm đón hiện tại + reverse geocode ra địa chỉ.
  - Cho phép di chuyển ghim trên bản đồ để chỉnh điểm đón.
  - Nhập điểm đến (autocomplete) → vẽ polyline lộ trình ngắn nhất & hiển thị `distance_km` + `estimated_price` (không bắt buộc nhập điểm đến nếu khách chỉ gọi 1 chạm).
  - Nút **"Gọi lái hộ"** → chuyển sang màn hình chờ tìm tài xế.
- **Theo dõi chuyến:**
  - Hiển thị trạng thái realtime (`Đang tìm` → `Tài xế đang đến` → `Đã đến` → `Đang chạy` → `Hoàn thành`).
  - Thẻ thông tin tài xế (Tên, ảnh, nút gọi điện `tel:` trực tiếp).
  - Nút **Hủy chuyến** (ẩn khi trạng thái sang `IN_PROGRESS`), có chọn/nhập lý do.
  - Tính năng đổi điểm đến khi đang chạy (gọi API cập nhật `dropoff` & tính lại `final_price`).
- **Xem Media & Lịch sử:**
  - Xem danh sách ảnh & phát video tình trạng xe (nhận xe & trả xe) của chuyến.
  - Danh sách lịch sử chuyến đi & chi tiết giá chốt.

---

## 3. Ứng Dụng Tài Xế (Flutter) (`[6]`, `[7]`, `[8]`, `[9]`, `[10]`)

- **Hồ sơ & Trạng thái:**
  - Form đăng ký/cập nhật hồ sơ (ảnh chân dung, CCCD 2 mặt, GPLX 2 mặt).
  - Màn hình chính hiển thị nút gạt **Trực tuyến / Ngoại tuyến** (chặn bật trực tuyến nếu chưa duyệt, đang bị khóa, hoặc ví < mức tối thiểu; hiển thị đồng hồ đếm ngược nếu đang bị khóa nhận đơn).
- **Nhận đơn:**
  - Lắng nghe WebSocket + FCM Push Notification kèm âm thanh.
  - Hiển thị popup/màn hình đơn mới với đồng hồ đếm ngược `N` giây, điểm đón, điểm đến, quãng đường, giá dự kiến, nút **Nhận đơn** / **Từ chối**.
- **Thực hiện chuyến & Media Check-in/Check-out:**
  - Nút **Mở dẫn đường** (deep link sang Google Maps / Apple Maps).
  - Nút **"Đã đến điểm đón"**.
  - **Nhận xe (`PICKUP`):** Chụp/quay trực tiếp bằng camera trong app (chặn chọn từ thư viện để đảm bảo tính xác thực theo Điều 2.6):
    - Tối đa `05` ảnh (bắt buộc tick/chụp 1 ảnh xe kèm biển số rõ nét `is_plate_photo`).
    - Tối đa `02` video quay quanh xe (giới hạn `≤ 60 giây/video`, nén video bằng `video_compress` trước khi upload).
    - Gắn metadata `lat`, `lng`, `taken_at`.
    - Hiển thị thanh tiến độ upload & nút **Thử lại** nếu mạng yếu.
    - Nút **"Bắt đầu chuyến"** chỉ sáng khi backend xác nhận đủ ảnh biển số + video.
  - **Trả xe (`DROPOFF`):** Bắt buộc chụp tối thiểu `01` ảnh bàn giao xe tại điểm trả trước khi bấm **"Hoàn thành"**.
  - Màn hình kết thúc: Hiển thị rõ **Số tiền khách cần thanh toán** & **Chiết khấu đã trừ ví**.
- **Ví tài xế:**
  - Xem số dư hiện tại, lịch sử giao dịch (`Nạp tiền`, `Chiết khấu`, `Điều chỉnh`).
  - Màn hình hướng dẫn chuyển khoản nạp tiền (thông tin STK Bên A + cú pháp nội dung CK).

---

## 4. Bàn Giao Chạy Thử & Nghiệm Thu Giai Đoạn 1

- Build **Android APK** (Firebase App Distribution / link tải trực tiếp).
- Build **iOS TestFlight** (Internal Testing trên tài khoản Apple Developer của Bên A).
- Kiểm tra end-to-end luồng: Đặt đơn → Điều phối 3–5 km → Từ chối/Khóa 30–60' → Nhận đơn → Chụp ảnh/video nhận xe → Bắt đầu → Đổi điểm trả / Hoàn thành + ảnh bàn giao → Trừ chiết khấu ví.
- **Ký biên bản Nghiệm thu Giai đoạn 1 → Thanh toán Đợt 2 (40% – 10.000.000đ).**
