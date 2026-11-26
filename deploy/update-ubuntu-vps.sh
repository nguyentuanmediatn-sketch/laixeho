#!/usr/bin/env bash
set -euo pipefail

# Script cập nhật nhanh trên Ubuntu VPS sau mỗi lần push code mới lên GitHub
DOMAIN="${DOMAIN:-tuannv.site}"
API_DOMAIN="${API_DOMAIN:-api.${DOMAIN}}"
BRANCH="${BRANCH:-main}"
APP_DIR="/opt/laixeho"
WEB_ROOT="/var/www/laixeho/web-admin/dist"

cd "${APP_DIR}"
echo "==> Kéo code mới từ nhánh ${BRANCH}..."
git fetch origin "${BRANCH}"
git checkout "${BRANCH}"
git pull --ff-only origin "${BRANCH}"

echo "==> Cài đặt packages & build Backend..."
npm install --workspace=backend --workspace=web-admin
cd "${APP_DIR}/backend"
npx prisma generate
npx prisma db push --accept-data-loss
npm run build
pm2 restart laixeho-api --update-env

echo "==> Build & cập nhật Web Admin..."
cd "${APP_DIR}/web-admin"
VITE_API_URL="https://${API_DOMAIN}" npm run build
mkdir -p "${WEB_ROOT}"
rm -rf "${WEB_ROOT:?}"/*
cp -r "${APP_DIR}/web-admin/dist/"* "${WEB_ROOT}/"

echo "✅ Đã cập nhật thành công! Kiểm tra API:"
curl -fsS http://127.0.0.1:3005/trips/config && echo ""
