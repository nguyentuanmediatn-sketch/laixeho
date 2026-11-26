# Đồng bộ nhanh toàn bộ file khóa bí mật (Keystore + Firebase) từ VPS về máy mới
# Yêu cầu: đã cài SSH alias "ubuntu" (qua cloudflared) trên máy tính mới.
# Cách chạy trên PowerShell từ thư mục gốc repo laixeho:
#   .\scripts\sync-secrets-from-vps.ps1

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$KeystoreDir = Join-Path $RepoRoot "keystore"
New-Item -ItemType Directory -Force -Path $KeystoreDir | Out-Null

Write-Host "=== Đang kéo 4 file bí mật từ VPS (/home/tuannv/laixeho-secrets) ==="
cmd /c "scp -o BatchMode=yes -o ConnectTimeout=25 ubuntu:/home/tuannv/laixeho-secrets/now-thainguyen-release.keystore `"$KeystoreDir\now-thainguyen-release.keystore`""
cmd /c "scp -o BatchMode=yes -o ConnectTimeout=25 ubuntu:/home/tuannv/laixeho-secrets/keystore.properties `"$KeystoreDir\keystore.properties`""
cmd /c "scp -o BatchMode=yes -o ConnectTimeout=25 ubuntu:/home/tuannv/laixeho-secrets/google-services.json `"$KeystoreDir\google-services.json`""
cmd /c "scp -o BatchMode=yes -o ConnectTimeout=25 ubuntu:/home/tuannv/laixeho-secrets/firebase-service-account.json `"$KeystoreDir\firebase-service-account.json`""

# Tự cập nhật đường dẫn tuyệt đối storeFile theo đúng máy tính hiện tại
$ksAbsFwd = (Join-Path $KeystoreDir "now-thainguyen-release.keystore").Replace("\", "/")
$propsPath = Join-Path $KeystoreDir "keystore.properties"
$propsContent = Get-Content $propsPath | ForEach-Object {
  if ($_ -match "^storeFile=") { "storeFile=$ksAbsFwd" } else { $_ }
}
Set-Content -Path $propsPath -Value $propsContent -Encoding ASCII

# Copy google-services.json và firebase-service-account.json vào đúng vị trí build/chạy
Copy-Item -Force "$KeystoreDir\google-services.json" "$RepoRoot\mobile-driver\android\app\google-services.json"
Copy-Item -Force "$KeystoreDir\google-services.json" "$RepoRoot\mobile-customer\android\app\google-services.json"
Copy-Item -Force "$KeystoreDir\firebase-service-account.json" "$RepoRoot\backend\firebase-service-account.json"

Write-Host "=== HOÀN TẤT! Máy mới đã sẵn sàng build Release APK (có Firebase FCM) & chạy Backend ==="
