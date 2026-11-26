#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# NOW Thái Nguyên – Lái Xe Hộ | Script cài đặt 1 chạm trên VPS Ubuntu 22.04/24.04
# Chạy với quyền root qua SSH:
#   curl -fsSL https://raw.githubusercontent.com/nguyentuanmediatn-sketch/laixeho/main/deploy/setup-ubuntu-vps.sh | sudo bash
# Hoặc sau khi clone repo:
#   sudo bash deploy/setup-ubuntu-vps.sh
# ==============================================================================

DOMAIN="${DOMAIN:-tuannv.site}"
API_DOMAIN="${API_DOMAIN:-api.${DOMAIN}}"
REPO_URL="${REPO_URL:-https://github.com/nguyentuanmediatn-sketch/laixeho.git}"
BRANCH="${BRANCH:-main}"
APP_DIR="/opt/laixeho"
WEB_ROOT="/var/www/laixeho/web-admin/dist"
BACKEND_PORT=3005

if [[ "$(id -u)" -ne 0 ]]; then
  echo "❌ Vui lòng chạy script bằng sudo hoặc tài khoản root."
  exit 1
fi

echo "==> [1/7] Cập nhật gói hệ thống & cài đặt công cụ cơ bản..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl git build-essential ca-certificates gnupg lsb-release debian-keyring debian-archive-keyring apt-transport-https openssl

echo "==> [2/7] Cài đặt Node.js 20 LTS, PostgreSQL, Redis, PM2..."
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | cut -d. -f1 | tr -d v)" -lt 20 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
apt-get install -y postgresql postgresql-contrib redis-server
systemctl enable --now postgresql redis-server

if ! command -v pm2 >/dev/null 2>&1; then
  npm install -g pm2
fi

echo "==> [3/7] Cài đặt Caddy (Auto HTTPS SSL Let's Encrypt)..."
if ! command -v caddy >/dev/null 2>&1; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg --yes
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  apt-get update -y
  apt-get install -y caddy
fi

echo "==> [4/7] Kéo mã nguồn từ GitHub (${BRANCH}) vào ${APP_DIR}..."
if [[ -d "${APP_DIR}/.git" ]]; then
  cd "${APP_DIR}"
  git fetch origin "${BRANCH}"
  git checkout "${BRANCH}"
  git pull --ff-only origin "${BRANCH}"
else
  git clone -b "${BRANCH}" "${REPO_URL}" "${APP_DIR}"
  cd "${APP_DIR}"
fi

echo "==> [5/7] Thiết lập PostgreSQL & file backend/.env..."
ENV_FILE="${APP_DIR}/backend/.env"
if [[ ! -f "${ENV_FILE}" ]]; then
  DB_PASS="$(openssl rand -hex 16)"
  JWT_SECRET="$(openssl rand -hex 32)"

  sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'laixeho') THEN
    CREATE ROLE laixeho LOGIN PASSWORD '${DB_PASS}';
  ELSE
    ALTER ROLE laixeho WITH PASSWORD '${DB_PASS}';
  END IF;
END
\$\$;
SQL

  if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='laixeho_db'" | grep -q 1; then
    sudo -u postgres createdb -O laixeho laixeho_db
  fi

  cat > "${ENV_FILE}" <<EOF
NODE_ENV=production
PORT=${BACKEND_PORT}
DATABASE_URL="postgresql://laixeho:${DB_PASS}@127.0.0.1:5432/laixeho_db"
REDIS_URL="redis://127.0.0.1:6379"
JWT_SECRET="${JWT_SECRET}"
CORS_ORIGIN="https://${DOMAIN},https://www.${DOMAIN}"
STORAGE_PROVIDER="local"
EOF
  chmod 600 "${ENV_FILE}"
  echo "✓ Đã tạo mới ${ENV_FILE} và database laixeho_db."
else
  echo "✓ Giữ nguyên ${ENV_FILE} đã tồn tại."
fi

echo "==> [6/7] Cài đặt dependencies, đẩy schema Prisma, seed & build Backend + Web Admin..."
cd "${APP_DIR}"
npm install --workspace=backend --workspace=web-admin

cd "${APP_DIR}/backend"
npx prisma generate
npx prisma db push --accept-data-loss
npm run prisma:seed
npm run build

cd "${APP_DIR}/web-admin"
VITE_API_URL="https://${API_DOMAIN}" npm run build
mkdir -p "${WEB_ROOT}"
rm -rf "${WEB_ROOT:?}"/*
cp -r "${APP_DIR}/web-admin/dist/"* "${WEB_ROOT}/"

echo "==> [7/7] Khởi chạy PM2 & cấu hình Caddy cho ${DOMAIN} và ${API_DOMAIN}..."
cd "${APP_DIR}/backend"
if pm2 describe laixeho-api >/dev/null 2>&1; then
  pm2 restart laixeho-api --update-env
else
  pm2 start dist/src/main.js --name laixeho-api --cwd "${APP_DIR}/backend"
fi
pm2 save
pm2 startup systemd -u root --hp /root >/dev/null 2>&1 || true

sed "s/tuannv\.site/${DOMAIN}/g" "${APP_DIR}/deploy/Caddyfile.tuannv.site" > /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile
systemctl enable --now caddy
systemctl reload caddy

if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  ufw allow 80/tcp >/dev/null || true
  ufw allow 443/tcp >/dev/null || true
fi

sleep 2
echo ""
echo "======================================================================"
echo "✅ TRIỂN KHAI HOÀN TẤT - NOW THÁI NGUYÊN LÁI XE HỘ"
echo "======================================================================"
echo "🌐 Web Admin:   https://${DOMAIN}   (mặc định: admin / admin123456 — ĐỔI MẬT KHẨU NGAY!)"
echo "🔌 API Server:  https://${API_DOMAIN}"
echo "🗺️  Share link:  https://${DOMAIN}/track/<token>"
echo "🧪 Kiểm tra API nội bộ:"
curl -fsS "http://127.0.0.1:${BACKEND_PORT}/trips/config" && echo ""
echo ""
echo "👉 Lần sau cập nhật code mới chỉ cần chạy: sudo bash ${APP_DIR}/deploy/update-ubuntu-vps.sh"
echo "======================================================================"
