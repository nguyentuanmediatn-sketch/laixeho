#!/usr/bin/env bash
# Đồng bộ nhanh toàn bộ file khóa bí mật (Keystore + Firebase) từ VPS về máy Linux/macOS mới
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
KS_DIR="$REPO_ROOT/keystore"
mkdir -p "$KS_DIR"

echo "=== Đang kéo 4 file bí mật từ VPS (/home/tuannv/laixeho-secrets) ==="
scp -o BatchMode=yes -o ConnectTimeout=25 \
  ubuntu:/home/tuannv/laixeho-secrets/now-thainguyen-release.keystore \
  ubuntu:/home/tuannv/laixeho-secrets/keystore.properties \
  ubuntu:/home/tuannv/laixeho-secrets/google-services.json \
  ubuntu:/home/tuannv/laixeho-secrets/firebase-service-account.json \
  "$KS_DIR/"

chmod 600 "$KS_DIR"/*
sed -i.bak "s|^storeFile=.*|storeFile=$KS_DIR/now-thainguyen-release.keystore|" "$KS_DIR/keystore.properties" && rm -f "$KS_DIR/keystore.properties.bak"

cp -f "$KS_DIR/google-services.json" "$REPO_ROOT/mobile-driver/android/app/google-services.json"
cp -f "$KS_DIR/google-services.json" "$REPO_ROOT/mobile-customer/android/app/google-services.json"
cp -f "$KS_DIR/firebase-service-account.json" "$REPO_ROOT/backend/firebase-service-account.json"

echo "=== HOÀN TẤT! Máy mới đã sẵn sàng build Release APK (có Firebase FCM) & chạy Backend ==="
