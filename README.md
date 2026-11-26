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

## Kiểm Thử Tự Động
- Backend unit tests: `npm --prefix backend test`
- Backend typecheck & build: `npm --prefix backend run typecheck && npm --prefix backend run build`
- Web Admin build: `npm --prefix web-admin run build`
- Mobile typecheck: `npm --prefix mobile-customer run typecheck` và `npm --prefix mobile-driver run typecheck`
