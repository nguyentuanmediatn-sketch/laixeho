# Hệ Thống Ứng Dụng Gọi Lái Xe Hộ

Monorepo triển khai đầy đủ 4 thành phần theo Hợp đồng & Sơ đồ đặc tả hệ thống:
1. `backend/` – NestJS + Prisma (PostgreSQL) + Redis (có in-memory fallback) + Socket.IO (JWT Auth) + Upload Media (Local PUT / S3 / R2) + Bản đồ (OpenStreetMap OSRM/Photon/Nominatim miễn phí + adapter Goong/Google Maps)
2. `web-admin/` – React + TypeScript + Tailwind CSS + Vite + Leaflet Map + Realtime Alert
3. `mobile-customer/` – React Native (Expo 52) cho Khách hàng (Android & iOS)
4. `mobile-driver/` – React Native (Expo 52) cho Tài xế (Android & iOS)

## Hướng Dẫn Chạy Nhanh (Local / Staging)

### 1. Khởi động PostgreSQL & Redis
```bash
docker compose up -d
```
*(Hoặc trỏ `DATABASE_URL` trong `backend/.env` tới PostgreSQL local; Backend tự fallback in-memory nếu chưa bật Redis).*

### 2. Cấu hình & Khởi tạo Backend
```bash
cp backend/.env.example backend/.env
cd backend
npm install
npx prisma generate
npx prisma db push
npm run prisma:seed
npm run build
npm run start:prod   # hoặc npm run start:dev
```
- **Web Admin mặc định:** `admin` / `admin123456`
- **Tài khoản demo (OTP bypass `123456`):**
  - Khách hàng: `0900000001`
  - Tài xế 1 (ACTIVE, ví 500.000đ): `0900000002`
  - Tài xế 2 (ACTIVE, ví 300.000đ): `0900000003`
- **Chuyển nhà cung cấp Bản đồ / Lưu trữ khi Production:**
  - `MAP_PROVIDER`: `osm` (mặc định miễn phí) | `goong` (`GOONG_API_KEY`) | `google` (`GOOGLE_MAPS_API_KEY`)
  - `STORAGE_PROVIDER`: `local` (mặc định lưu tại `backend/uploads/`) | `r2` | `s3`

### 3. Chạy Web Admin
```bash
cd web-admin
npm install
npm run dev
```

### 4. Build APK Android (Test trên MuMu / Điện thoại thật)
Yêu cầu: JDK 17/21 và `ANDROID_HOME` (Android SDK Platform 35, Build-Tools 35.0.0).
```bash
# App Khách hàng
cd mobile-customer
npm install
npx expo prebuild --platform android --no-install
cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a,x86_64

# App Tài xế
cd mobile-driver
npm install
npx expo prebuild --platform android --no-install
cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a,x86_64
```
Kết nối máy ảo MuMu tới Backend local trên máy tính (ví dụ cổng `3005`):
```bash
adb reverse tcp:3005 tcp:3005
adb install -r builds/laixeho-customer.apk
adb install -r builds/laixeho-driver.apk
```
*(Trong màn hình đăng nhập của cả 2 app có mục **⚙ Cấu hình Server** để đổi URL Backend trực tiếp không cần build lại APK).*

## Làm Việc Trên Máy Tính Khác & Build Production (`now.tuannv.site` / `api.tuannv.site`)

Toàn bộ mã nguồn (kể cả cấu hình Android native, chuông báo `trip_alert.wav`, icon, manifest bảo mật) đều đã đồng bộ trên GitHub. Các tệp khóa nhạy cảm (**Release Keystore** và **Firebase FCM**) được lưu an toàn tại `/home/tuannv/laixeho-secrets/` trên VPS (không đẩy lên GitHub để tránh lộ khóa).

Trên bất kỳ máy tính mới nào (đã cấu hình SSH alias `ubuntu`):
```powershell
git clone https://github.com/nguyentuanmediatn-sketch/laixeho.git
cd laixeho
npm install

# Kéo toàn bộ 4 file khóa bí mật (Keystore + Firebase) từ VPS vào đúng thư mục
.\scripts\sync-secrets-from-vps.ps1   # Windows (hoặc ./scripts/sync-secrets-from-vps.sh trên macOS/Linux)
```
Build 2 file APK Release chính thức (ký bằng `now-thainguyen-release.keystore` + nhúng sẵn Firebase FCM):
```powershell
$env:EXPO_PUBLIC_API_URL = "https://api.tuannv.site"
$env:NODE_ENV = "production"
cd mobile-driver\android && .\gradlew.bat assembleRelease "-PreactNativeArchitectures=arm64-v8a,armeabi-v7a,x86_64" --no-daemon
cd ..\..\mobile-customer\android && .\gradlew.bat assembleRelease "-PreactNativeArchitectures=arm64-v8a,armeabi-v7a,x86_64" --no-daemon
```
- **Web Admin Production:** `https://now.tuannv.site`
- **Backend API & Socket.IO:** `https://api.tuannv.site`
- **Trang tải APK:** `https://now.tuannv.site/apk/`
- **Firebase Project:** `now-thai-nguyen` (FCM v1, gói `vn.laixeho.customer` & `vn.laixeho.driver`, Release SHA-1: `86:48:7C:F2:12:22:75:52:E3:68:14:6A:0F:5E:E4:36:77:A7:43:06`)

## Kiểm Thử Tự Động
- Backend unit tests: `npm --prefix backend test`
- Backend typecheck & build: `npm --prefix backend run typecheck && npm --prefix backend run build`
- Web Admin build: `npm --prefix web-admin run build`
- Mobile typecheck: `npm --prefix mobile-customer run typecheck` và `npm --prefix mobile-driver run typecheck`
