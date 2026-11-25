# Hệ Thống Ứng Dụng Gọi Lái Xe Hộ

Monorepo triển khai đầy đủ 4 thành phần theo Hợp đồng & Sơ đồ đặc tả hệ thống:
1. `backend/` – NestJS + Prisma (PostgreSQL/PostGIS) + Redis + Socket.IO
2. `web-admin/` – React + TypeScript + Tailwind CSS + Vite
3. `mobile-customer/` – React Native (Expo) cho Khách hàng (Android & iOS)
4. `mobile-driver/` – React Native (Expo) cho Tài xế (Android & iOS)

## Hướng Dẫn Chạy Nhanh (Local / Staging)

### 1. Khởi động PostgreSQL & Redis
```bash
docker compose up -d
```

### 2. Cấu hình & Khởi tạo Backend
```bash
cp backend/.env.example backend/.env
cd backend
npm install
npx prisma generate
npx prisma migrate dev --name init
npm run prisma:seed
npm run start:dev
```
- Tài khoản Web Admin mặc định: `admin` / `admin123456`
- Số điện thoại bypass OTP dev (`123456`): `0900000001` (Khách), `0900000002` (Tài xế)

### 3. Chạy Web Admin
```bash
cd web-admin
npm install
npm run dev
```

### 4. Chạy Mobile Apps (Expo)
```bash
cd mobile-customer && npm install && npm start
cd mobile-driver && npm install && npm start
```

## Kiểm Thử Tự Động
- Backend unit tests: `npm --prefix backend test`
- Web Admin build: `npm --prefix web-admin run build`
- Mobile typecheck: `npm --prefix mobile-customer run typecheck` và `npm --prefix mobile-driver run typecheck`
