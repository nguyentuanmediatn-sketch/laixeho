# Tuần 1 (Mốc 1): Phân Tích, Thiết Kế & Nền Tảng Hệ Thống

**Mục tiêu Tuần 1:** Hoàn tất chốt đặc tả & tham số Điều 6.1, duyệt UI/UX, dựng xong Hạ tầng Backend, Cơ sở dữ liệu (12 bảng), Xác thực OTP, và Phân hệ Bản đồ + Tính tiền theo khung giờ.  
**Hạng mục SOW:** `[1]`, `[2]`, `[4]`, `[5]`.

---

## 1. Ngày 1 – 2: Chốt Đặc Tả, Tham Số & Thiết Kế Giao Diện (`[1]`)

### 1.1. Workshop chốt tham số Điều 6.1 với Bên A
- Xác nhận bằng văn bản/email bộ tham số mặc định trong bảng `settings`:
  - `day_start`: `07:00`, `night_start`: `22:00`
  - `base_km`: `5`
  - `day_base`: `150000`, `day_per_km`: `10000`
  - `night_base`: `200000`, `night_per_km`: `15000`
  - Quy tắc làm tròn `distance_km` (đề xuất: làm tròn lên `0.1 km`, ví dụ `Math.ceil(km * 10) / 10`).
  - `commission_type` (`PERCENT` | `FIXED`), `commission_value`.
  - `radius_km` (mặc định `5`), `offer_timeout_sec` (mặc định `30`), `lock_minutes` (mặc định `30` hoặc `60`).
  - `min_wallet_balance`, `maintenance_fee` (`200000`), `remind_days_before` (`3`).
- Chốt bộ **test cases tính tiền mẫu** (ngày/đêm, `< 5 km` và `> 5 km`, đổi điểm trả giữa chuyến) làm chuẩn nghiệm thu.

### 1.2. Thiết kế UI/UX (Figma) & Trình Bên A duyệt
- **App Khách hàng (6 màn hình cốt lõi):**
  1. Đăng nhập SĐT + Nhập OTP.
  2. Trang chủ bản đồ: Tự định vị điểm đón (cho phép kéo ghim/chọn lại), ô nhập điểm đến (tùy chọn), hiển thị giá dự kiến, nút **"Gọi lái hộ"** 1 chạm.
  3. Màn hình đang tìm tài xế / theo dõi tài xế (thông tin tài xế, gọi điện, vị trí realtime, nút Hủy chuyến).
  4. Chi tiết chuyến đang chạy & xem ảnh/video tình trạng xe.
  5. Lịch sử chuyến đi & chi tiết hóa đơn từng chuyến.
  6. Hồ sơ cá nhân & điều khoản.
- **App Tài xế (8 màn hình cốt lõi):**
  1. Đăng nhập SĐT + OTP; Đăng ký hồ sơ (Họ tên, ảnh chân dung, ảnh CCCD, ảnh GPLX) + Trạng thái chờ duyệt.
  2. Trang chủ: Toggle Trực tuyến/Ngoại tuyến, hiển thị trạng thái khóa nhận đơn (đếm ngược nếu bị khóa) hoặc cảnh báo số dư ví / hạn phí duy trì.
  3. Popup/Màn hình nhận đơn mới: Điểm đón, điểm đến, khoảng cách, giá dự kiến, thanh đếm ngược `N` giây, nút **Nhận** / **Từ chối**.
  4. Màn hình thực hiện chuyến: Mở Google/Apple Maps dẫn đường, nút **"Đã đến"**.
  5. Màn hình kiểm tra nhận xe: Camera chụp ảnh (tối đa 5 ảnh, đánh dấu bắt buộc ảnh xe + biển số) & quay video quanh xe (tối đa 2 video, ≤ 60s), tiến độ upload, nút **"Bắt đầu chuyến"** (chỉ mở khi đủ điều kiện).
  6. Màn hình trả xe: Chụp tối thiểu 1 ảnh bàn giao xe, nút **"Hoàn thành"**, hiển thị số tiền khách cần trả.
  7. Ví tài xế: Số dư, lịch sử giao dịch (nạp/chiết khấu/điều chỉnh), hướng dẫn chuyển khoản nạp tiền.
  8. Thông báo & Trạng thái phí duy trì hàng tháng.
- **Web Admin (7 nhóm màn hình):**
  1. Đăng nhập Admin & Dashboard thống kê cơ bản (số chuyến, tổng tiền chuyến, chiết khấu, phí duy trì theo ngày/tháng).
  2. Tạo đơn thủ công (nhập SĐT, tên khách, tìm điểm đón/trả trên bản đồ, ghi chú, báo giá & đẩy điều phối).
  3. Quản lý Chuyến đi (lọc trạng thái, đặc biệt tab `NO_DRIVER` cần xử lý, xem chi tiết lộ trình & ảnh/video).
  4. Quản lý Tài xế (duyệt hồ sơ, khóa/mở tài khoản, xem lịch sử khóa nhận đơn, phí duy trì + nút xác nhận đã đóng phí).
  5. Quản lý Ví tài xế (xác nhận nạp tiền, điều chỉnh số dư bắt buộc nhập lý do).
  6. Quản lý Khách hàng.
  7. Cấu hình hệ thống (`settings`) + Nhật ký thay đổi (`audit_logs`).

---

## 2. Ngày 2 – 3: Hạ Tầng Backend, CSDL & Xác Thực (`[2]`)

### 2.1. Dựng Server & Môi trường
- Khởi tạo project **NestJS** (TypeScript) + **PostgreSQL (+ PostGIS)** + **Redis** + **Docker Compose** (cho dev/staging).
- Cấu hình lưu trữ **Cloudflare R2 / AWS S3** với API cấp `Presigned PUT URL` cho mobile upload trực tiếp.
- Cấu hình HTTPS, CORS, Rate Limiting, Global Exception Filter, Logging.

### 2.2. Triển khai Cơ sở dữ liệu (12 bảng theo ERD Trang 8)
- Viết migration (Prisma hoặc TypeORM):
  1. `customers` (`id`, `phone` unique, `name`, `created_at`)
  2. `drivers` (`id`, `phone` unique, `name`, `avatar_url`, `id_card_urls`, `license_urls`, `status` [PENDING/ACTIVE/LOCKED], `is_online`, `lat`, `lng`, `location_at`, `locked_until`, `fee_due_date`)
  3. `admins` (`id`, `username` unique, `password_hash`, `name`, `role`)
  4. `trips` (`id`, `code` unique, `customer_id`, `driver_id`, `created_by_admin_id`, `pickup_*`, `dropoff_*`, `distance_km`, `route_polyline`, `time_slot`, `estimated_price`, `final_price`, `commission_amount`, `status`, `ordered_at`, `accepted_at`, `arrived_at`, `started_at`, `completed_at`, `cancelled_by`, `cancel_reason`)
  5. `trip_media` (`id`, `trip_id`, `type` [IMAGE/VIDEO], `stage` [PICKUP/DROPOFF], `is_plate_photo`, `url`, `size`, `duration_sec`, `lat`, `lng`, `taken_at`)
  6. `dispatch_offers` (`id`, `trip_id`, `driver_id`, `distance_to_pickup_km`, `sent_at`, `expires_at`, `result` [ACCEPTED/REJECTED/TIMEOUT])
  7. `driver_locks` (`id`, `driver_id`, `offer_id`, `locked_from`, `locked_until`, `reason`)
  8. `wallets` (`id`, `driver_id` unique 1-1, `balance`, `updated_at`)
  9. `wallet_transactions` (`id`, `wallet_id`, `type` [TOPUP/COMMISSION/ADJUSTMENT], `amount`, `balance_after`, `trip_id`, `admin_id`, `note`, `created_at`)
  10. `maintenance_fees` (`id`, `driver_id`, `period`, `amount`, `due_date`, `status` [UNPAID/PAID/OVERDUE], `paid_at`, `confirmed_by_admin_id`)
  11. `settings` (`key` PK, `value`, `updated_by`, `updated_at`) + Seed dữ liệu mặc định.
  12. `notifications` & `audit_logs`.

### 2.3. API Xác thực & Hồ sơ
- **OTP Flow (Khách & Tài xế):**
  - `POST /auth/otp/request`: Sinh OTP 6 số, lưu Redis TTL 3–5 phút, giới hạn spam (rate limit theo SĐT/IP), gọi provider SMS (eSMS/Twilio) + hỗ trợ số test bypass cho môi trường dev/Apple Review.
  - `POST /auth/otp/verify`: Trả về `accessToken` + `refreshToken` (JWT, phân biệt role `CUSTOMER` | `DRIVER`).
- **Admin Auth:** `POST /admin/auth/login` (username + bcrypt password).
- **Driver Onboarding:** `POST /driver/profile` (upload CCCD, GPLX, ảnh chân dung lên S3/R2, tạo record `wallets` với `balance = 0`, trạng thái `PENDING`).
- **Push Notification:** Tích hợp Firebase Admin SDK (FCM) + lưu `device_token` cho từng user.

---

## 3. Ngày 4 – 5: Tích Hợp Bản Đồ, Đo Quãng Đường & Tính Tiền (`[4]`, `[5]`)

### 3.1. Map Service (Adapter Pattern)
- Thiết kế `MapProviderInterface` để dễ đổi giữa **Goong Maps** / **Google Maps** / **VietMap** (theo Điều 5.5 Hợp đồng):
  - `geocode(address)` & `reverseGeocode(lat, lng)`
  - `autocomplete(query, lat, lng)`
  - `getShortestCarRoute(originLat, originLng, destLat, destLng)`:
    - Gọi Directions API chế độ `car` (`alternatives=true`).
    - Chọn lộ trình có `distance` nhỏ nhất.
    - Trả về `{ distance_km (đã làm tròn theo settings), duration_min, route_polyline }`.

### 3.2. Pricing Engine (`PricingService`)
- Đọc cấu hình từ bảng `settings` (cache Redis, invalidate khi Admin cập nhật):
  - Xác định `time_slot` dựa vào `ordered_at` (giờ VN `UTC+7`): nếu trong `[day_start, night_start)` → `DAY`, ngược lại → `NIGHT`.
  - Công thức:
    - Nếu `D <= base_km`: `price = base_price` (`150.000đ` ngày / `200.000đ` đêm).
    - Nếu `D > base_km`: `price = base_price + (D - base_km) * per_km_price`.
  - Tính chiết khấu: `COMMISSION = (type == PERCENT) ? price * value / 100 : value`.
- Expose API `POST /trips/estimate` cho App Khách & Web Admin.
- Viết Unit Test kiểm tra toàn bộ bộ chuyến mẫu (4 km ngày, 12 km ngày, 5 km đêm, 12 km đêm, đổi điểm trả).

---

## Tiêu Chí Hoàn Thành Tuần 1 (Mốc 1)
- [ ] Bên A duyệt thiết kế UI/UX 2 App & Web Admin và chốt văn bản tham số Điều 6.1.
- [ ] Backend deploy lên môi trường Staging, kết nối DB + Redis + S3/R2 thành công.
- [ ] API đăng nhập OTP, tạo hồ sơ tài xế, đo đường & tính tiền pass 100% test cases mẫu.
