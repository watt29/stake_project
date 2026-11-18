# tools/backup-version.ps1 - สคริปต์สำรองข้อมูล Extension อัตโนมัติตามเวอร์ชัน
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "Stop"

$extDir = Join-Path $PSScriptRoot "..\stake_extension"
$manifestPath = Join-Path $extDir "manifest.json"

if (!(Test-Path $manifestPath)) {
    Write-Host "❌ ไม่พบไฟล์ manifest.json ใน $extDir (ต้องมี stake_extension\manifest.json)" -ForegroundColor Red
    exit 1
}

$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
$ver = $manifest.version
$dateStr = (Get-Date).ToString("yyyyMMdd_HHmmss")
$backupDirName = "v$ver" + "_" + $dateStr

$backupRoot = Join-Path $PSScriptRoot "..\backups"
$targetDir = Join-Path $backupRoot $backupDirName

if (!(Test-Path $backupRoot)) {
    New-Item -ItemType Directory -Path $backupRoot | Out-Null
}

New-Item -ItemType Directory -Path $targetDir | Out-Null

Copy-Item -Path (Join-Path $extDir "*") -Destination $targetDir -Recurse -Force

Write-Host "`n========================================================" -ForegroundColor Green
Write-Host "       📦 สำรองข้อมูลเวอร์ชัน v$ver สำเร็จเรียบร้อย!" -ForegroundColor Yellow
Write-Host "========================================================" -ForegroundColor Green
Write-Host "โฟลเดอร์ปลายทาง: backups\$backupDirName" -ForegroundColor Cyan
Write-Host "จำนวนไฟล์ที่สำรอง: $( (Get-ChildItem -Path $targetDir -Recurse -File).Count ) ไฟล์`n"
