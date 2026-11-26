# Hướng dẫn triển khai tạm lên domain `tuannv.site`

Hệ thống **NOW Thái Nguyên – Lái Xe Hộ** đã được cấu hình sẵn để chạy tạm trên `tuannv.site`, và về sau đổi sang tên miền chính thức chỉ mất 1 phút (không cần sửa code app).

## 1. Trỏ DNS trên nhà cung cấp tên miền (`tuannv.site`)
Tạo 2 bản ghi **A Record** trỏ về IP VPS của bạn:
- `@` (`tuannv.site`) → `<IP_VPS>`
- `api` (`api.tuannv.site`) → `<IP_VPS>`

## 2. Biến môi trường Backend (`backend/.env`)
```env
PORT=3005
DATABASE_URL=postgresql://laixeho:<MAT_KHAU_MANH>@127.0.0.1:5432/laixeho_db
JWT_SECRET=<CHUOI_BI_MAT_64_KY_TU>
CORS_ORIGIN=https://tuannv.site
STORAGE_PROVIDER=local
```

## 3. Build Web Admin trỏ API về `https://api.tuannv.site`
```bash
cd web-admin
VITE_API_URL=https://api.tuannv.site npm run build
```

## 4. Cài Caddy (tự cấp chứng chỉ SSL HTTPS miễn phí)
Copy file [Caddyfile.tuannv.site](./Caddyfile.tuannv.site) vào `/etc/caddy/Caddyfile` và reload:
```bash
sudo systemctl reload caddy
```

Khi đó:
- Web Admin: `https://tuannv.site`
- Backend API & Socket.IO: `https://api.tuannv.site` (nhập URL này trong nút cài đặt Server ở màn hình đăng nhập App Khách & App Tài xế, hoặc build APK với `EXPO_PUBLIC_API_URL=https://api.tuannv.site`)
- Link chia sẻ hành trình cho người thân: `https://tuannv.site/track/<shareToken>`

## 5. Khi chuyển sang tên miền chính thức sau này
1. Đổi `tuannv.site` trong `Caddyfile` và DNS sang tên miền mới.
2. Vào **Web Admin → Cấu hình & Nhật ký → Tên miền công khai chia sẻ hành trình** đổi sang `https://<ten-mien-moi>` → bấm **Lưu cấu hình** (link chia sẻ hành trình cập nhật tức thì không cần build lại app).
