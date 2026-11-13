# tools/show-summary.ps1 - แสดงสรุปรายงานผลการทำงานของบอททั้ง 5 บัญชี (พร้อมส่งเข้า Telegram)
[CmdletBinding()]
param(
    [switch]$Telegram
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "SilentlyContinue"

# โหลดการตั้งค่า Telegram จาก .env
function Load-EnvFile {
  $envPath = Join-Path (Split-Path $PSScriptRoot -Parent) ".env"
  if (Test-Path $envPath) {
    Get-Content $envPath | ForEach-Object {
      $line = $_.Trim()
      if ($line -and -not $line.StartsWith("#") -and $line.Contains("=")) {
        $parts = $line.Split("=", 2)
        [System.Environment]::SetEnvironmentVariable($parts[0].Trim(), $parts[1].Trim(), "Process")
      }
    }
  }
}
Load-EnvFile

function Send-TelegramMessage([string]$message) {
  $token = [System.Environment]::GetEnvironmentVariable("TELEGRAM_BOT_TOKEN", "Process")
  $chatId = [System.Environment]::GetEnvironmentVariable("TELEGRAM_CHAT_ID", "Process")
  if (-not $token -or -not $chatId) {
    Write-Host "⚠️ ไม่พบ TELEGRAM_BOT_TOKEN หรือ TELEGRAM_CHAT_ID ใน .env" -ForegroundColor Yellow
    return $false
  }
  try {
    $uri = "https://api.telegram.org/bot$token/sendMessage"
    $body = @{
      chat_id = $chatId
      text = $message
      parse_mode = "HTML"
    } | ConvertTo-Json -Compress
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($body)
    $res = Invoke-RestMethod -Uri $uri -Method Post -ContentType "application/json; charset=utf-8" -Body $bytes -TimeoutSec 10 -ErrorAction Stop
    return $true
  } catch {
    Write-Host "❌ ส่ง Telegram ล้มเหลว: $_" -ForegroundColor Red
    return $false
  }
}

$csvPath = Join-Path $PSScriptRoot "rotate-ledger.csv"
if (!(Test-Path $csvPath)) {
    Write-Host "`n❌ ไม่พบไฟล์ประวัติการเล่น: $csvPath`n" -ForegroundColor Red
    exit 0
}

$today = (Get-Date).ToString("yyyy-MM-dd")
$rows = Import-Csv -Path $csvPath | Where-Object { $_.date -eq $today }

Write-Host "`n========================================================" -ForegroundColor Cyan
Write-Host "       📊 สรุปรายงานผลการเดินเงินประจำวัน: $today" -ForegroundColor Yellow
Write-Host "========================================================" -ForegroundColor Cyan

if (!$rows -or $rows.Count -eq 0) {
    Write-Host "ยังไม่มีประวัติการเล่นสำหรับวันนี้ ($today)`n" -ForegroundColor Gray
    exit 0
}

$summary = @{}
$grandTotal = 0.0
$totalSessions = 0
$totalWins = 0
$totalLosses = 0

foreach ($r in $rows) {
    $acc = $r.account
    if ([string]::IsNullOrWhiteSpace($acc)) { $acc = $r.profile }
    
    $pnl = 0.0
    [double]::TryParse($r.pnl, [System.Globalization.NumberStyles]::Float, [System.Globalization.CultureInfo]::InvariantCulture, [ref]$pnl) | Out-Null
    
    if (!$summary.ContainsKey($acc)) {
        $summary[$acc] = @{ sessions = 0; wins = 0; losses = 0; pnl = 0.0 }
    }
    
    $summary[$acc].sessions++
    $summary[$acc].pnl += $pnl
    if ($pnl -ge 0) { $summary[$acc].wins++; $totalWins++ } else { $summary[$acc].losses++; $totalLosses++ }
    
    $grandTotal += $pnl
    $totalSessions++
}

Write-Host ""
Write-Host ("{0,-15} | {1,-10} | {2,-12} | {3,-12}" -f "บัญชี (Account)", "เซสชัน", "ชนะ / แพ้", "กำไรสุทธิ (USDT)") -ForegroundColor White
Write-Host ("-" * 58) -ForegroundColor DarkGray

$tgLines = @()
foreach ($acc in $summary.Keys | Sort-Object) {
    $s = $summary[$acc]
    $pnlStr = [string]::Format([System.Globalization.CultureInfo]::InvariantCulture, "{0:+0.00000;-0.00000;0.00000}", $s.pnl)
    $color = if ($s.pnl -ge 0) { "Green" } else { "Red" }
    
    Write-Host ("{0,-15} | {1,-10} | {2,-12} | " -f $acc, "$($s.sessions) รอบ", "$($s.wins)W / $($s.losses)L") -NoNewline
    Write-Host ("{0,12}" -f "$pnlStr USDT") -ForegroundColor $color
    
    $tgLines += "• <b>$($acc):</b> <code>$pnlStr USDT</code> ($($s.sessions) รอบ | $($s.wins)W/$($s.losses)L)"
}

Write-Host ("=" * 58) -ForegroundColor Cyan
$grandSign = if ($grandTotal -ge 0) { "+" } else { "" }
$grandColor = if ($grandTotal -ge 0) { "Green" } else { "Red" }
$grandStr = [string]::Format([System.Globalization.CultureInfo]::InvariantCulture, "{0:+0.00000;-0.00000;0.00000}", $grandTotal)

Write-Host ("รวมทุกบัญชีวันนี้: {0} เซสชัน ({1}W / {2}L)" -f $totalSessions, $totalWins, $totalLosses)
Write-Host "💰 กำไรสุทธิรวมวันนี้: " -NoNewline
Write-Host "$grandStr USDT" -ForegroundColor $grandColor -BackgroundColor Black
Write-Host "========================================================`n" -ForegroundColor Cyan

# สร้างข้อความสำหรับ Telegram
$accDetails = $tgLines -join "`n"
$nowTime = (Get-Date).ToString("HH:mm")
$grandIcon = if ($grandTotal -ge 0) { "🟢" } else { "🔴" }
$tgMessage = "📊 <b>[Stake Dice] สรุปบัญชียอดรวมประจำวัน ($today)</b>`n" +
             "━━━━━━━━━━━━━━━━━━━`n" +
             "👤 <b>ผลงานแยกตามบัญชี:</b>`n$accDetails`n" +
             "━━━━━━━━━━━━━━━━━━━`n" +
             "🎯 <b>เซสชันทั้งหมด:</b> $totalSessions รอบ (ชนะ $totalWins / แพ้ $totalLosses)`n" +
             "💰 <b>กำไรสุทธิรวมวันนี้:</b> <b>$grandStr USDT</b> $grandIcon`n" +
             "🕒 <i>อัปเดต: $nowTime น.</i>"

if ($Telegram) {
    Write-Host "📲 กำลังส่งรายงานสรุปยอดเข้า Telegram..." -ForegroundColor Cyan
    $sent = Send-TelegramMessage $tgMessage
    if ($sent) {
        Write-Host "✅ ส่งรายงานเข้า Telegram เรียบร้อยแล้ว!`n" -ForegroundColor Green
    }
} else {
    try {
        Write-Host "💡 กดปุ่ม 'T' เพื่อส่งรายงานเข้า Telegram (หรือกดปุ่มอื่นเพื่อออก): " -NoNewline -ForegroundColor Yellow
        $key = [Console]::ReadKey($true)
        if ($key.Key -eq [ConsoleKey]::T) {
            Write-Host "T" -ForegroundColor Green
            Write-Host "📲 กำลังส่งรายงานสรุปยอดเข้า Telegram..." -ForegroundColor Cyan
            $sent = Send-TelegramMessage $tgMessage
            if ($sent) {
                Write-Host "✅ ส่งรายงานเข้า Telegram เรียบร้อยแล้ว!`n" -ForegroundColor Green
            }
        } else {
            Write-Host ""
        }
    } catch {
        # Fallback if non-interactive
    }
}
