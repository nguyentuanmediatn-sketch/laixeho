# Kế Hoạch Triển Khai Hệ Thống App Lái Xe Hộ

**Ngày lập:** 2026-11-25  
**Tài liệu căn cứ:**
- [Hop_dong_App_Lai_Xe_Ho.docx](file:///c:/Users/hacke/Desktop/LaiXeHo/Hop_dong_App_Lai_Xe_Ho.docx) (Hợp đồng, Phụ lục 01 & Phụ lục 02 SOW)
- [So_do_dac_ta_he_thong_lai_xe_ho.drawio](file:///c:/Users/hacke/Desktop/LaiXeHo/So_do_dac_ta_he_thong_lai_xe_ho.drawio) (9 trang đặc tả kiến trúc, luồng, trạng thái, công thức, ví & ERD)

---

## 1. Tổng Quan Dự Án & Phạm Vi

- **Mục tiêu:** Xây dựng và triển khai trọn bộ hệ thống gọi lái xe hộ gồm **4 thành phần**:
  1. **Ứng dụng Khách hàng** (Android & iOS)
  2. **Ứng dụng Tài xế** (Android & iOS)
  3. **Web Admin** (Trình duyệt máy tính)
  4. **Máy chủ Backend, CSDL, Lưu trữ Media & Tích hợp bên thứ ba**
- **Thời gian cam kết:** **03 tuần làm việc** (tính từ ngày Bên A thanh toán Đợt 1; không tính thời gian Apple/Google duyệt app).
- **Giá trị hợp đồng:** 25.000.000 VNĐ (chưa VAT, chưa gồm phí hạ tầng & dịch vụ bên thứ ba).
- **Tiến độ thanh toán:**
  - **Đợt 1 (30% – 7.500.000đ):** Ký hợp đồng (mốc khởi động 3 tuần).
  - **Đợt 2 (40% – 10.000.000đ):** Nghiệm thu Giai đoạn 1 (cuối Tuần 2 – bản chạy thử APK & TestFlight).
  - **Đợt 3 (30% – 7.500.000đ):** Nghiệm thu tổng thể (cuối Tuần 3 – Web Admin, Production, Store, bàn giao).

---

## 2. Kiến Trúc & Đề Xuất Công Nghệ (Theo Sơ Đồ Trang 1 & 8)

| Thành phần | Công nghệ đề xuất | Vai trò chính |
|---|---|---|
| **Mobile Apps (Khách + Tài xế)** | **Flutter** (hoặc React Native) | 1 codebase cho Android & iOS, tối ưu tốc độ phát triển trong 3 tuần; hỗ trợ tốt Camera/Video nén, GPS nền, Google/Goong Map SDK, FCM/APNs. |
| **Web Admin** | **React / Next.js** (Ant Design / Tailwind) | Dashboard quản trị, cấu hình tham số, tạo đơn thủ công, duyệt tài xế, đối soát ví/phí duy trì, xem ảnh/video chuyến. |
| **Backend API & Realtime** | **Node.js / NestJS** (TypeScript) | REST API (HTTPS), WebSocket (Socket.IO) điều phối đơn & vị trí realtime, Cron/Queue (BullMQ/Redis). |
| **Cơ sở dữ liệu** | **PostgreSQL (+ PostGIS)** | 12 bảng nghiệp vụ theo ERD Trang 8 (`customers`, `drivers`, `admins`, `trips`, `trip_media`, `dispatch_offers`, `driver_locks`, `wallets`, `wallet_transactions`, `maintenance_fees`, `settings`, `notifications`, `audit_logs`). |
| **Cache / GEO / Queue** | **Redis** | Lưu tọa độ tài xế (`GEO`), hàng đợi đếm ngược offer (N giây), khóa tài xế tự động (TTL). |
| **Lưu trữ Media** | **Cloudflare R2 / AWS S3** | Lưu ảnh CCCD/GPLX, ảnh/video nhận & trả xe (presigned URL để app upload trực tiếp, giảm tải Backend). |
| **Dịch vụ bên thứ 3** | **Goong / Google Maps**, **eSMS / Twilio**, **FCM / APNs** | Đo quãng đường ô tô ngắn nhất + Geocoding; gửi SMS OTP; Push notification. |

> [!IMPORTANT]
> **Khuyến nghị chọn Monorepo:** Tổ chức code thành `backend/`, `web-admin/`, `mobile-customer/`, `mobile-driver/` (hoặc shared packages cho types/constants) để dễ bảo trì và bàn giao Source Code sạch sẽ cho Bên A theo Điều 4.3.

---

## 3. Lộ Trình 3 Tuần & Phân Rã Giai Đoạn (15 Hạng Mục SOW)

| Giai đoạn | Thời gian | Hạng mục SOW (Phụ lục 01) | Đầu ra & Mốc nghiệm thu | Chi tiết |
|---|---|---|---|---|
| **Tuần 1 (Mốc 1)** | Ngày 1 – 5 | `[1]` Phân tích & thiết kế UI<br>`[2]` Backend/API & OTP<br>`[4]` Đo khoảng cách bản đồ<br>`[5]` Tính tiền theo khung giờ | - Chốt tham số Điều 6.1<br>- UI/UX 2 App + Web Admin được duyệt<br>- Server, DB (12 bảng), API Auth OTP, Map & Pricing chạy ổn định | [phase-01-foundation-backend-map.md](file:///c:/Users/hacke/Desktop/LaiXeHo/plans/20261125-1055-lai-xe-ho-app/phase-01-foundation-backend-map.md) |
| **Tuần 2 (Mốc 2)** | Ngày 6 – 10 | `[3]` App Khách gọi 1 chạm<br>`[6]` Ví tài xế & chiết khấu<br>`[7]` Nhận đơn bán kính 3–5km<br>`[8]` Khóa quyền nhận đơn<br>`[9]` Ảnh/video nhận xe<br>`[10]` Ảnh hoàn thành chuyến | - Luồng chuyến đi end-to-end hoạt động<br>- Build bản chạy thử Android (APK) & iOS (TestFlight)<br>- **Nghiệm thu GĐ1 (Thanh toán Đợt 2 – 40%)** | [phase-02-trip-flow-apps.md](file:///c:/Users/hacke/Desktop/LaiXeHo/plans/20261125-1055-lai-xe-ho-app/phase-02-trip-flow-apps.md) |
| **Tuần 3 (Mốc 3)** | Ngày 11 – 15 | `[11]` Nhắc phí duy trì 200k/tháng<br>`[12]` Cấu hình giá & chiết khấu<br>`[13]` Tạo đơn thủ công<br>`[14]` Quản lý tổng thể & thống kê<br>`[15]` Kiểm thử, deploy, bàn giao | - Web Admin hoàn chỉnh + Cron nhắc phí<br>- UAT & sửa lỗi trên môi trường thật<br>- Deploy Production + Submit Google Play / App Store<br>- Đào tạo & bàn giao Source/Docs<br>- **Nghiệm thu tổng thể (Thanh toán Đợt 3 – 30%)** | [phase-03-admin-deploy-handover.md](file:///c:/Users/hacke/Desktop/LaiXeHo/plans/20261125-1055-lai-xe-ho-app/phase-03-admin-deploy-handover.md) |

---

## 4. Checklist Điều Kiện Cần Từ Bên A Trước Khi Code (Điều 6 Hợp Đồng)

Để không bị trễ tiến độ 3 tuần (Điều 2.2), cần chốt ngay trong **Ngày 1–2 của Tuần 1**:

1. **Tham số nghiệp vụ (Điều 6.1):**
   - Quy tắc làm tròn quãng đường (ví dụ: làm tròn lên `0,1 km`).
   - Mức chiết khấu mặc định (`%` hay số tiền cố định).
   - Bán kính tìm tài xế mặc định (ví dụ: `5 km`, cấu hình được `3–5 km`).
   - Thời gian chờ tài xế xác nhận đơn (`N` giây, ví dụ `30s`).
   - Thời gian khóa quyền nhận đơn khi từ chối/hết giờ (ví dụ `30` hoặc `60` phút).
   - Số dư ví tối thiểu để được nhận đơn (ví dụ `100.000đ`).
   - Thông tin tài khoản ngân hàng nhận nạp ví & phí duy trì (hiển thị hướng dẫn trong App Tài xế).
   - Số ngày nhắc phí duy trì trước hạn (mặc định `3 ngày`, mức phí `200.000đ/tháng`).
2. **Tài sản & Tài khoản bên thứ 3 (Điều 3.1 & 6.2):**
   - Logo, bộ nhận diện thương hiệu, tên chính thức của 2 App.
   - Nội dung Điều khoản sử dụng & Chính sách quyền riêng tư (bắt buộc để duyệt Store).
   - Tài khoản Google Play Console (25 USD) & Apple Developer Program (99 USD/năm hoặc 85 USD qua Bên B).
   - Nhà cung cấp Bản đồ (khuyên dùng **Goong Maps** cho Việt Nam để tiết kiệm chi phí hơn Google Maps) & SMS OTP (eSMS / SpeedSMS / Twilio).
   - VPS/Cloud Server, Domain cho Web Admin, Object Storage (Cloudflare R2 / S3).

---

## 5. Ranh Giới Ngoài Phạm Vi (Không Làm Trong Hợp Đồng Này)

Theo Mục 3 Phụ lục 01 & Điều 4 Phụ lục 02, **tuyệt đối không đưa vào scope 3 tuần** để tránh trượt tiến độ:
- Cổng thanh toán online cho khách; nạp ví tự động VietQR / đối soát ngân hàng tự động (chỉ làm Admin xác nhận thủ công).
- Tự động trừ phí duy trì vào ví hoặc tự động khóa tài khoản khi quá hạn phí (chỉ nhắc thông báo + đánh dấu Quá hạn trên Web Admin).
- Phí chờ, phí thêm điểm dừng, đặt lịch trước, chọn loại hộp số (AT/MT/xe điện).
- Chuông báo đơn kiểu cuộc gọi đến / màn hình khóa toàn màn hình (chỉ dùng Push Notification + âm thanh chuẩn OS).
- Bản đồ giám sát toàn bộ tài xế trên Web Admin, đánh giá 2 chiều, chat/gọi ẩn số, link chia sẻ hành trình, đóng dấu GPS/timestamp lên ảnh/video.

---

## 6. Rủi Ro Kỹ Thuật & Phương Án Giảm Thiểu

| Rủi ro | Tác động | Phương án xử lý |
|---|---|---|
| **Apple App Store từ chối duyệt** (thiếu Privacy Policy, tài khoản test, hoặc lý do background location) | Trễ phát hành iOS | Chuẩn bị sẵn tài khoản demo (OTP bypass cho số test của Apple Review), giải trình rõ mục đích `Location Always/WhenInUse` cho tài xế, có Privacy Policy URL trước khi submit. |
| **Video quay quanh xe dung lượng lớn, mạng 4G yếu** | Treo/lỗi upload, không bấm được "Bắt đầu chuyến" | Nén video trên client (720p, bitrate vừa phải, giới hạn `≤ 60s`), upload thẳng lên S3/R2 bằng Presigned URL, có thanh tiến độ & cơ chế retry từng file. |
| **Điều phối đơn đồng thời / Race condition** | 2 tài xế cùng nhận 1 đơn hoặc mất đồng bộ đếm ngược | Dùng Redis lock / atomic DB transaction (`UPDATE trips SET driver_id = ... WHERE id = ... AND status = 'SEARCHING'`) để đảm bảo chỉ 1 tài xế nhận được đơn. |
| **Tiến độ 3 tuần rất gấp** | Chậm nghiệm thu | Dùng Flutter cho 2 app (tái sử dụng UI kit, map widget, OTP auth, network layer), UI tối giản sạch đẹp, bám sát đúng 15 hạng mục SOW. |
