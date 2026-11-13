<#
  install-autostart.ps1 — ติดตั้ง/ยกเลิก "เปิดระบบเองตอนเปิดเครื่อง" (Windows Startup)

  ติดตั้ง:
    powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\install-autostart.ps1

  ติดตั้งพร้อมระบุโปรไฟล์:
    powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\install-autostart.ps1 `
      -Profiles "D:\stake8\p1,D:\stake8\p2"

  ยกเลิก:
    powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\install-autostart.ps1 -Uninstall

  หมายเหตุ: สร้างแค่ shortcut ในโฟลเดอร์ Startup ของผู้ใช้ปัจจุบัน (ไม่แก้ registry)
#>

param(
  [switch]$Uninstall,
  [string]$Profiles = "",
  [int]$Repeat = 0
)

$ErrorActionPreference = "Stop"

$startup = [Environment]::GetFolderPath("Startup")
$lnk = Join-Path $startup "StakeBot.lnk"

if ($Uninstall) {
  if (Test-Path $lnk) {
    Remove-Item $lnk -Force
    Write-Host "[OK] ยกเลิกการเปิดเองแล้ว: $lnk" -ForegroundColor Yellow
  } else {
    Write-Host "[i] ไม่พบ shortcut นี้ (ยังไม่ได้ติดตั้ง)" -ForegroundColor Gray
  }
  exit 0
}

$root = Split-Path -Parent $PSScriptRoot
$runner = Join-Path $PSScriptRoot "rotate-accounts.ps1"

if (!(Test-Path $runner)) {
  Write-Host "[ERROR] ไม่พบ $runner" -ForegroundColor Red
  exit 1
}

$argList = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Minimized -File "' + $runner + '"'
if ($Profiles -and $Profiles.Trim().Length -gt 0) {
  $quoted = ($Profiles.Split(",") | ForEach-Object { '"' + $_.Trim() + '"' }) -join ","
  $argList += " -Profiles $quoted"
}
if ($Repeat -gt 0) { $argList += " -Repeat $Repeat" }

$shell = New-Object -ComObject WScript.Shell
$sc = $shell.CreateShortcut($lnk)
$sc.TargetPath = "powershell.exe"
$sc.Arguments = $argList
$sc.WorkingDirectory = $root
$sc.WindowStyle = 7
$sc.Description = "Stake Dice Bot - เปิดหน้าเว็บเอง"
$sc.Save()

Write-Host "[OK] ติดตั้งแล้ว: $lnk" -ForegroundColor Green
Write-Host "     จะเปิด Chrome + หน้า Dice เองทุกครั้งที่เข้าสู่ Windows" -ForegroundColor Cyan
Write-Host "     (ยกเลิกได้ด้วยเมนู [5] ใน start-bot.bat)" -ForegroundColor Cyan
