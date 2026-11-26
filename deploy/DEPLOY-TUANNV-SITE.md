# Hướng dẫn triển khai lên VPS Ubuntu qua SSH (`tuannv.site`)

Hệ thống **NOW Thái Nguyên – Lái Xe Hộ** đã có sẵn script tự động cài toàn bộ stack (Node.js 20, PostgreSQL, Redis, PM2, Caddy auto-HTTPS SSL) cho domain tạm **`tuannv.site`**.

## Bước 1: Trỏ DNS tên miền `tuannv.site` về IP VPS
Tạo 2 bản ghi **A Record** (tắt proxy cam nếu dùng Cloudflare trong lúc Caddy cấp SSL lần đầu, hoặc bật Full SSL):
- `@` (`tuannv.site`) → `<IP_VPS_UBUNTU>`
- `www` (`www.tuannv.site`) → `<IP_VPS_UBUNTU>`
- `api` (`api.tuannv.site`) → `<IP_VPS_UBUNTU>`

## Bước 2: SSH vào VPS Ubuntu & chạy lệnh cài 1 chạm
```bash
ssh root@<IP_VPS_UBUNTU>
```
Sau khi vào VPS, chạy duy nhất 1 lệnh:
```bash
curl -fsSL https://raw.githubusercontent.com/nguyentuanmediatn-sketch/laixeho/main/deploy/setup-ubuntu-vps.sh | sudo bash
```
Script sẽ tự động:
1. Cài Node.js 20, PostgreSQL, Redis, PM2 và Caddy SSL.
2. Tạo database `laixeho_db` + mật khẩu ngẫu nhiên & `JWT_SECRET` bảo mật tại `/opt/laixeho/backend/.env`.
3. Clone repo từ nhánh `main`, chạy `prisma db push` + `seed`, build Backend & Web Admin (`VITE_API_URL=https://api.tuannv.site`).
4. Bật PM2 chạy ngầm `laixeho-api` (tự khởi động lại khi reboot VPS) và cấu hình Caddy tự xin chứng chỉ HTTPS cho `tuannv.site` và `api.tuannv.site`.

## Bước 3: Kiểm tra sau khi cài xong
- **Web Admin**: `https://tuannv.site` (tài khoản mặc định `admin` / `admin123456`)
- **Backend API**: `https://api.tuannv.site/trips/config`
- **App Khách hàng & App Tài xế**: Bấm biểu tượng cài đặt Server trên màn hình đăng nhập và nhập `https://api.tuannv.site` (hoặc build APK gắn sẵn `EXPO_PUBLIC_API_URL=https://api.tuannv.site`).
- **Xem log Backend**: `pm2 logs laixeho-api`

## Cập nhật code mới sau này (1 lệnh)
```bash
sudo bash /opt/laixeho/deploy/update-ubuntu-vps.sh
```

## Chuyển sang tên miền chính thức sau này
1. Trỏ DNS tên miền mới về IP VPS.
2. Chạy lại trên VPS: `DOMAIN=tenmienmoi.vn sudo bash /opt/laixeho/deploy/setup-ubuntu-vps.sh`
3. Vào **Web Admin → Cấu hình & Nhật ký → Tên miền công khai chia sẻ hành trình** đổi thành `https://tenmienmoi.vn` → bấm **Lưu cấu hình**.
