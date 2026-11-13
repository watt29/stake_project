<#
  rotate-accounts.ps1 - ระบบรันบัญชีเดี่ยวอัตโนมัติ: Profile 4 (watt29)
#>

param(
  [string[]]$Profiles = @("Profile 4"),
  [string]$Url = "https://stake.com/th/casino/games/stake-dice",
  [int]$SessionMinutes = 20,
  [int]$RecoveryExtraMinutes = 40,
  [int]$PauseSeconds = 180,
  [string]$StopFile = "STOP_FLEET.txt",
  [switch]$KillIdleChrome = $true
)

$ErrorActionPreference = "Stop"

# ---------- 🧾 EXIT TRAP ----------
# เหตุผล: รอบ 14:35 วันนี้ (2026-11-06) สคริปต์หยุดกลางทางโดย log ไม่มีร่องรอยอะไรเลย
# → trap นี้เขียนสาเหตุ/บรรทัดที่พังลง log ตรง ๆ (ไม่พึ่ง Write-Log ที่อาจยังไม่ถูกประกาศ)
$script:LogPathGuess = Join-Path $PSScriptRoot "rotate-log.txt"
trap {
  $msg = "[{0}] ❌ หยุดกลางทาง: {1} | บรรทัด {2}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $_.Exception.Message, $_.InvocationInfo.ScriptLineNumber
  try { Add-Content -Path $script:LogPathGuess -Value $msg -Encoding UTF8 } catch {}
  Write-Host $msg -ForegroundColor Red
  break
}

# ---------- 🔒 SINGLE INSTANCE GUARD ----------
# เหตุผล: การเปิดสคริปต์ซ้ำระหว่างตัวเก่ายังเล่นอยู่ ทำให้ตัวใหม่เปิด Chrome ทับ
# แล้วผลของเซสชันเก่าหายไปทั้งก้อน (ไม่ถูกบันทึกใน ledger) - INC-20261105
$alreadyRunning = @()
try {
  $alreadyRunning = Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -match 'rotate-accounts\.ps1' }
} catch {}

# ⚠️ เตือนหน้าต่าง Stake/Dice ที่ค้างจากรอบก่อน (อ่านอย่างเดียว ไม่ปิดให้)
# เหตุผล: ถ้าแท็บเก่าโหลดโค้ดชุดเก่าอยู่ อาจเล่นต่อโดยไม่มีใครดูแลและไม่ถูกบันทึกใน ledger
try {
  $staleWins = @(Get-Process chrome -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -match 'Stake|Dice' })
  if ($staleWins.Count -gt 0) {
    Write-Host ""
    Write-Host "[WARN] พบหน้าต่าง Stake/Dice เปิดค้างอยู่ $($staleWins.Count) ใบ — แนะนำปิดก่อนเริ่มรอบใหม่" -ForegroundColor Yellow
    Write-Host "       (แท็บเก่าอาจยังใช้โค้ดชุดเก่า และผลของมันจะไม่ถูกบันทึกใน ledger)" -ForegroundColor Yellow
    Write-Host ""
  }
} catch {}

if ($alreadyRunning.Count -gt 0) {
  Write-Host ""
  Write-Host "[BLOCK] มีบอทตัวอื่นกำลังทํางานอยู่แล้ว (PID: $($alreadyRunning.ProcessId -join ', '))" -ForegroundColor Red
  Write-Host "        ห้ามเปิดซ้ำ - ปิดหน้าต่างบอทเดิมให้หมดก่อน แล้วค่อยเปิดใหม่" -ForegroundColor Yellow
  Write-Host "        (การเปิดซ้ำทำให้ผลเซสชันที่กำลังเล่นหายไปจาก ledger)" -ForegroundColor Yellow
  Write-Host ""
  exit 2
}

$script:runMutex = $null
try {
  $script:runMutex = New-Object System.Threading.Mutex($false, "Local\StakeRotateBot_SingleInstance")
  if (-not $script:runMutex.WaitOne(0)) {
    Write-Host "[BLOCK] มีบอทอินสแตนซ์อื่นถือสิทธิ์อยู่แล้ว - ยกเลิกการเปิดซ้ำ" -ForegroundColor Red
    exit 2
  }
} catch {
  Write-Host "[WARN] ตรวจ single-instance ด้วย mutex ไม่ได้: $($_.Exception.Message)" -ForegroundColor Yellow
}

# ---------- ค้นหา chrome.exe ----------
$chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
if (!(Test-Path $chrome)) {
  $chrome = Join-Path $env:LOCALAPPDATA "Google\Chrome\Application\chrome.exe"
}
if (!(Test-Path $chrome)) {
  Write-Host "[ERROR] ไม่พบ Google Chrome ในเครื่อง" -ForegroundColor Red
  exit 1
}

$winCloserCode = @"
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;

public class ChromeWindowCloser {
    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumWindowsProc enumProc, IntPtr lParam);
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll")]
    public static extern int GetClassName(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    [DllImport("user32.dll")]
    public static extern bool PostMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);

    public const uint WM_CLOSE = 0x0010;

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr GetStdHandle(int nStdHandle);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool GetConsoleMode(IntPtr hConsoleHandle, out uint lpMode);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool SetConsoleMode(IntPtr hConsoleHandle, uint dwMode);

    public static void DisableQuickEdit() {
        try {
            IntPtr hIn = GetStdHandle(-10);
            uint mode;
            if (GetConsoleMode(hIn, out mode)) {
                mode &= ~0x0040u;
                mode |= 0x0080u;
                SetConsoleMode(hIn, mode);
            }
        } catch {}
    }

    public static string[] FindHoldWindows() {
        List<string> titles = new List<string>();
        try {
            EnumWindows((hWnd, lParam) => {
                if (!IsWindowVisible(hWnd)) return true;

                StringBuilder classSb = new StringBuilder(256);
                GetClassName(hWnd, classSb, 256);
                if (classSb.ToString() != "Chrome_WidgetWin_1") return true;

                StringBuilder titleSb = new StringBuilder(512);
                GetWindowText(hWnd, titleSb, 512);
                string title = titleSb.ToString();
                if (title.IndexOf("STAKE_HOLD", StringComparison.OrdinalIgnoreCase) >= 0) {
                    titles.Add(title);
                }
                return true;
            }, IntPtr.Zero);
        } catch {}
        return titles.ToArray();
    }

    public static string[] FindDoneWindows() {
        List<string> titles = new List<string>();
        try {
            EnumWindows((hWnd, lParam) => {
                if (!IsWindowVisible(hWnd)) return true;

                StringBuilder classSb = new StringBuilder(256);
                GetClassName(hWnd, classSb, 256);
                if (classSb.ToString() != "Chrome_WidgetWin_1") return true;

                StringBuilder titleSb = new StringBuilder(512);
                GetWindowText(hWnd, titleSb, 512);
                string title = titleSb.ToString();
                if (title.IndexOf("STAKE_DONE", StringComparison.OrdinalIgnoreCase) >= 0) {
                    titles.Add(title);
                }
                return true;
            }, IntPtr.Zero);
        } catch {}
        return titles.ToArray();
    }

    public static int CloseOnlyStakeChromeWindows(int currentPid) {
        int closed = 0;
        try {
            EnumWindows((hWnd, lParam) => {
                if (!IsWindowVisible(hWnd)) return true;

                uint pid = 0;
                GetWindowThreadProcessId(hWnd, out pid);
                if (pid == 0 || pid == (uint)currentPid) return true;

                try {
                    var proc = System.Diagnostics.Process.GetProcessById((int)pid);
                    if (!proc.ProcessName.Equals("chrome", StringComparison.OrdinalIgnoreCase)) return true;
                } catch { return true; }

                StringBuilder classSb = new StringBuilder(256);
                GetClassName(hWnd, classSb, 256);
                if (classSb.ToString() != "Chrome_WidgetWin_1") return true;

                StringBuilder titleSb = new StringBuilder(512);
                GetWindowText(hWnd, titleSb, 512);
                string title = titleSb.ToString();

                if (title.IndexOf("Stake", StringComparison.OrdinalIgnoreCase) >= 0 ||
                    title.IndexOf("Dice", StringComparison.OrdinalIgnoreCase) >= 0 ||
                    title.IndexOf("STAKE_DONE", StringComparison.OrdinalIgnoreCase) >= 0) {
                    PostMessage(hWnd, WM_CLOSE, IntPtr.Zero, IntPtr.Zero);
                    closed++;
                }

                return true;
            }, IntPtr.Zero);
        } catch {}
        return closed;
    }
}
"@
Add-Type -TypeDefinition $winCloserCode -ErrorAction SilentlyContinue
try { [ChromeWindowCloser]::DisableQuickEdit() } catch {}

$stopPath = Join-Path $PSScriptRoot $StopFile
$log = Join-Path $PSScriptRoot "rotate-log.txt"

function Write-Log([string]$text) {
  $now = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
  $line = "$now  $text"
  Write-Host $line
  Add-Content -Path $log -Value $line -Encoding UTF8
}

$labels = @{
  "Profile 1"  = "Anda"
  "Profile 3"  = "nattawat"
  "Profile 4"  = "watt29"
  "Profile 11" = "wut1229"
  "Profile 18" = "AIForge"
  "Profile 26" = "watt28265"
}

# ---------- 🧾 LEDGER + DAILY LOSS CAP (ชั้น PowerShell — บอทไม่ต้องเก็บ state) ----------
# เหตุผลที่อยู่ชั้นนี้: content.js เป็น zero-footprint (ไม่เขียน storage) และมองไม่เห็นอีกโปรไฟล์
$ledgerCsv = Join-Path $PSScriptRoot "rotate-ledger.csv"

# โหลดการตั้งค่า Telegram จาก .env
function Load-EnvFile {
  $envPaths = @(
    (Join-Path $PSScriptRoot "..\.env"),
    (Join-Path $PSScriptRoot ".env")
  )
  foreach ($ep in $envPaths) {
    if (Test-Path $ep) {
      foreach ($line in (Get-Content $ep)) {
        $t = $line.Trim()
        if ($t -and -not $t.StartsWith("#") -and $t.Contains("=")) {
          $idx = $t.IndexOf("=")
          $k = $t.Substring(0, $idx).Trim()
          $v = $t.Substring($idx + 1).Trim().Trim('"').Trim("'")
          [System.Environment]::SetEnvironmentVariable($k, $v, "Process")
        }
      }
      break
    }
  }
}
Load-EnvFile

function Send-TelegramNotification([string]$message) {
  $token = [System.Environment]::GetEnvironmentVariable("TELEGRAM_BOT_TOKEN", "Process")
  $chatId = [System.Environment]::GetEnvironmentVariable("TELEGRAM_CHAT_ID", "Process")
  if (-not $token -or -not $chatId) { return }
  try {
    $uri = "https://api.telegram.org/bot$token/sendMessage"
    $body = @{
      chat_id = $chatId
      text = $message
      parse_mode = "HTML"
    } | ConvertTo-Json -Compress
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($body)
    Invoke-RestMethod -Uri $uri -Method Post -ContentType "application/json; charset=utf-8" -Body $bytes -TimeoutSec 10 -ErrorAction SilentlyContinue | Out-Null
  } catch { }
}

function Send-FleetDailySummary {
  if (!(Test-Path $ledgerCsv)) { return }
  $today = (Get-Date).ToString("yyyy-MM-dd")
  $rows = Import-Csv -Path $ledgerCsv -ErrorAction SilentlyContinue | Where-Object { $_.date -eq $today }
  if (!$rows -or $rows.Count -eq 0) { return }

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

  $lines = @()
  foreach ($acc in ($summary.Keys | Sort-Object)) {
    $s = $summary[$acc]
    $pnlStr = [string]::Format([System.Globalization.CultureInfo]::InvariantCulture, "{0:+0.00000;-0.00000;0.00000}", $s.pnl)
    $lines += "• <b>$($acc):</b> <code>$pnlStr USDT</code> ($($s.sessions) รอบ | $($s.wins)W/$($s.losses)L)"
  }
  $accDetails = $lines -join "`n"

  $grandSign = if ($grandTotal -ge 0) { "+" } else { "" }
  $grandIcon = if ($grandTotal -ge 0) { "🟢" } else { "🔴" }
  $grandStr = [string]::Format([System.Globalization.CultureInfo]::InvariantCulture, "{0:+0.00000;-0.00000;0.00000}", $grandTotal)
  $nowTime = (Get-Date).ToString("HH:mm")

  $tgMsg = "📊 <b>[Stake Dice] สรุปบัญชียอดรวมประจำวัน ($today)</b>`n" +
           "━━━━━━━━━━━━━━━━━━━`n" +
           "👤 <b>ผลงานแยกตามบัญชี:</b>`n$accDetails`n" +
           "━━━━━━━━━━━━━━━━━━━`n" +
           "🎯 <b>เซสชันทั้งหมด:</b> $totalSessions รอบ (ชนะ $totalWins / แพ้ $totalLosses)`n" +
           "💰 <b>กำไรสุทธิรวมวันนี้:</b> <b>$grandStr USDT</b> $grandIcon`n" +
           "🕒 <i>อัปเดตอัตโนมัติ: $nowTime น.</i>"

  Send-TelegramNotification $tgMsg
}

# เพดานขาดทุนรวมต่อบัญชีต่อวัน = 18.20865 USDT
# อ้างอิง: บันได Martingale +53% ที่ฐาน 0.00012 ไปถึงยอดสะสมนี้ที่ประมาณไม้ 26
# (ค่าเดิมถูกตั้งไว้ตอนยังใช้ Fibonacci 23 ไม้ ที่ฐาน 0.00015 — คงค่าไว้เพื่อไม่เปลี่ยนพฤติกรรม)
# ทำไมไม่ใช้ % ของทุน: บันไดที่ทบไปไกลกินทุนเกือบทั้งหมด -> เพดาน 1-2% จะตัดบันไดกลางทาง
$DailyLossLimit = 18.20865

function Init-Ledger {
  if (!(Test-Path $ledgerCsv)) {
    Add-Content -Path $ledgerCsv -Value "date,time,profile,account,session_id,pnl,reason" -Encoding UTF8
  }
}

function Get-DailyPnl([string]$profile) {
  if (!(Test-Path $ledgerCsv)) { return 0.0 }
  $today = (Get-Date).ToString("yyyy-MM-dd")
  $sum = 0.0
  try {
    foreach ($r in (Import-Csv -Path $ledgerCsv)) {
      if ($r.date -ne $today) { continue }
      if ($r.profile -ne $profile) { continue }
      $v = 0.0
      $okNum = [double]::TryParse($r.pnl, [System.Globalization.NumberStyles]::Float, [System.Globalization.CultureInfo]::InvariantCulture, [ref]$v)
      if ($okNum) { $sum += $v }
    }
  } catch { }
  return [math]::Round($sum, 5)
}

function Add-LedgerRow([string]$profile, [string]$account, [string]$sid, [double]$pnl, [string]$reason) {
  # กันนับซ้ำ: ถ้า session_id นี้มีอยู่แล้ว ไม่เขียนซ้ำ
  if ($sid -ne "") {
    try {
      foreach ($r in (Import-Csv -Path $ledgerCsv -ErrorAction Stop)) {
        if ($r.session_id -eq $sid) { return }
      }
    } catch { }
  }
  $now = Get-Date
  $p = [string]::Format([System.Globalization.CultureInfo]::InvariantCulture, "{0:0.#####}", $pnl)
  $line = $now.ToString("yyyy-MM-dd") + "," + $now.ToString("HH:mm:ss") + "," + $profile + "," + $account + "," + $sid + "," + $p + "," + $reason
  Add-Content -Path $ledgerCsv -Value $line -Encoding UTF8
  try {
    $syncPy = Join-Path $PSScriptRoot "sync_stake_db.py"
    if (Test-Path $syncPy) {
      Start-Process -FilePath "python" -ArgumentList "`"$syncPy`"" -WindowStyle Hidden -NoNewWindow
    }
  } catch { }
}

function Parse-DoneTitle([string]$title) {
  $out = @{ ok = $false; code = ""; pnl = 0.0; step = 0 }
  if ($title -match 'STAKE_DONE\|R=([A-Z_]+)\|P=(-?[0-9.]+)\|S=([0-9]+)\|D=([0-9\-]+)') {
    $out.ok = $true
    $out.code = $Matches[1]
    $v = 0.0
    $okNum = [double]::TryParse($Matches[2], [System.Globalization.NumberStyles]::Float, [System.Globalization.CultureInfo]::InvariantCulture, [ref]$v)
    if ($okNum) { $out.pnl = $v }
    $st = 0
    $okInt = [int]::TryParse($Matches[3], [ref]$st)
    if ($okInt) { $out.step = $st }
  } elseif ($title -match 'STAKE_HOLD\|P=(-?[0-9.]+)\|W=(-?[0-9]+)\|S=([0-9]+)') {
    $out.ok = $true
    $out.code = "HOLD_CUT"
    $v = 0.0
    $okNum = [double]::TryParse($Matches[1], [System.Globalization.NumberStyles]::Float, [System.Globalization.CultureInfo]::InvariantCulture, [ref]$v)
    if ($okNum) { $out.pnl = $v }
    $st = 0
    $okInt = [int]::TryParse($Matches[3], [ref]$st)
    if ($okInt) { $out.step = $st }
  }
  return $out
}

function Test-ProfileReady([string]$profile) {
  $base = Join-Path $env:LOCALAPPDATA "Google\Chrome\User Data"
  $dir = Join-Path $base $profile
  if (!(Test-Path $dir)) { return "ไม่พบโฟลเดอร์โปรไฟล์ ($dir)" }
  if (!(Test-Path (Join-Path $dir "Secure Preferences"))) { return "ไม่พบ Secure Preferences (โปรไฟล์นี้ยังไม่เคยถูกเปิด)" }
  return ""
}


function Wait-ForSessionOrKey([int]$MaxSeconds = 1200, [int]$RecoveryExtraSeconds = 180) {
  $startAt = Get-Date
  $deadline = $startAt.AddSeconds($MaxSeconds)
  $hardDeadline = $startAt.AddSeconds($MaxSeconds + $RecoveryExtraSeconds)
  $result = @{ reason = "จบเซสชันตามแผน"; account = "" }
  $lastShowMin = -1
  $lastHoldShowSec = -1
  $timeWarned = $false
  $wasHolding = $false
  $holdLostSince = $null
  $lastHoldTitle = ""

  while ($true) {
    $now = Get-Date
    $remSec = [int]($deadline - $now).TotalSeconds
    $remMin = [math]::Ceiling($remSec / 60)
    if ($remMin -ne $lastShowMin -and $remSec % 60 -eq 0 -and $remSec -gt 0) {
      $lastShowMin = $remMin
      Write-Host "     [⏱️ เวลาคงเหลือเซสชัน: $remMin นาที]" -ForegroundColor DarkGray
    }

    if ($now -ge $deadline) {
      if (-not $timeWarned) {
        $timeWarned = $true
        Write-Host "     [⏱️ ครบเวลา 20 นาที — รอรับสัญญาณ STAKE_DONE เพื่อปิดล็อกกำไร 0ms ทันที]" -ForegroundColor Yellow
      }
      $remHardSec = [int]($hardDeadline - $now).TotalSeconds
      if ($remHardSec % 30 -eq 0 -and $remHardSec -gt 0 -and $remHardSec -ne $lastHoldShowSec) {
        $lastHoldShowSec = $remHardSec
        Write-Host "     [⏳ กำลังรอปิดล็อกกำไร/ผ่อนผันแก้ไม้: เหลือเวลาสูงสุด $remHardSec วินาที...]" -ForegroundColor DarkYellow
      }
    }

    try {
      if ([Console]::KeyAvailable) {
        $k = [Console]::ReadKey($true)
        if ($k.Key -eq [ConsoleKey]::Enter) {
          $result.reason = "กดข้ามด้วย Enter"
          break
        }
      }
    } catch {}

    if (Test-Path $stopPath) {
      $result.reason = "STOP_FLEET"
      break
    }

    # 1. ตรวจจับสัญญาณจบเซสชันจาก Title ของหน้าต่าง Chrome (STAKE_DONE)
    try {
      $doneWins = [ChromeWindowCloser]::FindDoneWindows()
      if ($doneWins -and $doneWins.Length -gt 0) {
        $result.reason = "จบเซสชันตามแผน ($($doneWins[0]))"
        break
      }
    } catch {}

    # 1.1 ตรวจสอบสถานะกำลังพยุงแก้ไม้ (STAKE_HOLD)
    try {
      $holdWins = [ChromeWindowCloser]::FindHoldWindows()
      if ($holdWins -and $holdWins.Length -gt 0) {
        if ($now.Second % 20 -eq 0 -and $now.Millisecond -lt 850) {
          Write-Host "     [🩹 บอทกำลังพยุงจบไม้: $($holdWins[0])]" -ForegroundColor Yellow
        }
      }
    } catch {}

    # 2. 🛑 เพดานเวลาเด็ดขาด: ครบ 20 นาที (+ผ่อนผันแก้ไม้) -> ถ้าบอทยังพยุงแก้ไม้อยู่ (STAKE_HOLD) ให้แก้มือต่อจนกว่าจะชนะ ไม่ตัดจบกลางคัน
    if ($now -ge $hardDeadline) {
      $isStillHolding = $false
      try {
        $activeHold = [ChromeWindowCloser]::FindHoldWindows()
        if ($activeHold -and $activeHold.Length -gt 0) {
          $isStillHolding = $true
          $wasHolding = $true
          $holdLostSince = $null
          $lastHoldTitle = $activeHold[0]
          if ($now.Second % 20 -eq 0 -and $now.Millisecond -lt 150) {
            Write-Host "     [⏳ บอทกำลังพยุงแก้ไม้ ($($activeHold[0])) — ให้เวลาแก้มือต่อจนกว่าจะชนะ ไม่ตัดจบกลางคัน...]" -ForegroundColor Yellow
          }
        }
      } catch {}

      if (-not $isStillHolding) {
        if ($wasHolding) {
          if ($null -eq $holdLostSince) {
            $holdLostSince = $now
            Write-Host "     [🔄 สัญญาณ STAKE_HOLD หายชั่วคราว (อาจกำลังรีเฟรชกู้คืน) — รอ 30 วินาทีก่อนตัดสินใจ...]" -ForegroundColor DarkYellow
          }
          if (($now - $holdLostSince).TotalSeconds -lt 30) {
            Start-Sleep -Milliseconds 100
            continue
          }
        }
        Write-Host "     [🛑 ครบกำหนดเวลาสูงสุด — สั่งปิดหน้าต่างและเริ่มพักเบรก 3 นาทีทันที]" -ForegroundColor Red
        try {
          $doneWins = [ChromeWindowCloser]::FindDoneWindows()
          if ($doneWins -and $doneWins.Length -gt 0) {
            $result.reason = "จบเซสชันตามแผน ($($doneWins[0]))"
          } elseif ($lastHoldTitle) {
            $result.reason = "ครบเวลาสูงสุดระหว่างพยุง ($lastHoldTitle)"
          } else {
            $result.reason = "ครบเวลาสูงสุด (ตัดจบอัตโนมัติ)"
          }
        } catch {
          $result.reason = "ครบเวลาสูงสุด (ตัดจบอัตโนมัติ)"
        }
        break
      }
    }

    Start-Sleep -Milliseconds 100
  }

  return $result
}

Init-Ledger
Write-Log "=== เริ่มระบบรันบัญชีเดี่ยวอัตโนมัติ: watt29 (Profile 4) ==="

# ปิดหน้าต่าง Stake ที่ค้างจากรอบก่อนก่อนเริ่มรอบแรก (กัน 2 บอทเดิมพันบัญชีเดียวกัน)
try {
  $staleWins = [ChromeWindowCloser]::CloseOnlyStakeChromeWindows($PID)
  if ($staleWins -gt 0) { Write-Log "[START] ปิดหน้าต่าง Stake ที่ค้างจากรอบก่อน $staleWins หน้าต่าง" }
} catch {}

# ---------- 🧹 คืน RAM/GPU: เก็บ Chrome ที่ค้างหลังจบรอบ ----------
# เหตุผล: ปิดหน้าต่าง Stake แล้ว Chrome ยังเหลือโปรเซสเบื้องหลัง (gpu/renderer/utility)
#          กินแรมและไฟต่อเนื่อง -> รอให้หน้าต่างปิดจริงก่อน แล้วเก็บเฉพาะตอนที่ไม่มีหน้าต่าง Chrome ใดเปิดอยู่
function Close-IdleChromeProcesses([int]$WaitSeconds = 10) {
  $deadline = (Get-Date).AddSeconds($WaitSeconds)
  while ((Get-Date) -lt $deadline) {
    $wins = @(Get-Process chrome -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle })
    if ($wins.Count -eq 0) { break }
    Start-Sleep -Milliseconds 500
  }
  $left = @(Get-Process chrome -ErrorAction SilentlyContinue)
  if ($left.Count -eq 0) { return 0 }
  $wins = @($left | Where-Object { $_.MainWindowTitle })
  if ($wins.Count -gt 0) { return -1 }   # มีหน้าต่าง Chrome อื่นเปิดอยู่ = ไม่แตะ
  $n = 0
  foreach ($proc in $left) {
    try { Stop-Process -Id $proc.Id -Force -ErrorAction Stop; $n++ } catch {}
  }
  return $n
}

# 🧹 เคลียร์โปรเซส Chrome ที่ค้างเบื้องหลังแบบไม่มีหน้าต่าง (Zombie Chrome) เพื่อป้องกันอาการ Chrome เปิดไม่ได้/ปิดเอง
try {
  $zombieCleaned = Close-IdleChromeProcesses -WaitSeconds 2
  if ($zombieCleaned -gt 0) { Write-Log "[START] 🧹 เคลียร์ Chrome ตกค้างเบื้องหลัง $zombieCleaned โปรเซส เพื่อเปิดหน้าต่างใหม่ได้อย่างราบรื่น" }
} catch {}

function Get-FreeMemMB {
  try {
    $os = Get-CimInstance Win32_OperatingSystem -ErrorAction Stop
    return [int]($os.FreePhysicalMemory / 1024)
  } catch { return -1 }
}

# การตั้งค่าความถี่ Telegram (ค่าเริ่มต้น 3 ชั่วโมงต่อครั้ง)
$notifyIntervalHours = 3
$envInterval = [System.Environment]::GetEnvironmentVariable("TELEGRAM_NOTIFY_INTERVAL_HOURS", "Process")
if ($envInterval -and [double]::TryParse($envInterval, [ref]$null)) {
  $notifyIntervalHours = [double]$envInterval
}

$lastNotifyTime = (Get-Date)
$batchSessionCount = 0
$batchPnl = 0.0
$batchWins = 0
$batchLosses = 0

Write-Log "ตั้งค่าการแจ้งเตือน Telegram: สรุปผลทุก $notifyIntervalHours ชั่วโมง (แจ้งเตือนฉุกเฉินทันทีหากมี Error)"

$pass = 0
while ($true) {
  $pass++
  Write-Log "--- รอบที่ $pass ---"

  if (Test-Path $stopPath) {
    Write-Log "🛑 พบ STOP_FLEET - จบการทำงาน"
    break
  }

  $i = 0
  foreach ($p in $Profiles) {
    $i++
    if (Test-Path $stopPath) {
      Write-Log "🛑 พบ STOP_FLEET - หยุดก่อนเปิดรอบถัดไป"
      break
    }

    $name = $p
    if ($labels.ContainsKey($p)) { $name = $labels[$p] }

    # ปลดล็อก Profile 4 (master) ให้หมุนเวียน 3 บัญชีตามปกติ

    # 🛑 DAILY LOSS CAP ถูกปลดออกถาวรตามกฎ Infinite Patience (ไม่ตัดขาดทุน / ไม่ข้ามบัญชี)
    $dayPnl = Get-DailyPnl $p

    # 🩺 PRE-FLIGHT — ตรวจโปรไฟล์ก่อนเปิด (Fail Fast ไม่ให้เสียเซสชันเปล่า)
    $pf = Test-ProfileReady $p
    if ($pf -ne "") {
      Write-Log "[$i/$($Profiles.Count)] [SKIP] ข้าม $name ($p): $pf"
      continue
    }

    $sid = $p.Replace(" ", "") + "-" + (Get-Date).ToString("yyyyMMdd-HHmmss")
    # 💾 ด่านแรม: ถ้าเครื่องเหลือน้อย ให้รอคืนสูงสุด 60 วิ ก่อนเปิด Chrome (ไม่ข้ามรอบ)
    $freeMb = Get-FreeMemMB
    if ($freeMb -ge 0 -and $freeMb -lt 600) {
      Write-Log "[$i/$($Profiles.Count)] [WARN] แรมว่างเหลือ $freeMb MB — รอคืนความจำสูงสุด 60 วิ"
      $memDeadline = (Get-Date).AddSeconds(60)
      while ((Get-Date) -lt $memDeadline) {
        Start-Sleep -Seconds 5
        $freeMb = Get-FreeMemMB
        if ($freeMb -ge 600) { break }
      }
      Write-Log "[$i/$($Profiles.Count)] แรมว่างตอนเริ่มรอบ: $freeMb MB"
    }
    Write-Log "[$i/$($Profiles.Count)] กำลังเปิดบัญชี: $name ($p)"

    # ตรวจสอบก่อนเปิด: หากมีโปรเซส Chrome ไร้หน้าต่างค้างอยู่ ให้เก็บกวาดก่อนเพื่อไม่ให้เกิดอาการเปิดแล้วปิดตัวเอง
    try {
      $headlessWins = @(Get-Process chrome -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle })
      if ($headlessWins.Count -eq 0) {
        $null = Close-IdleChromeProcesses -WaitSeconds 1
      }
    } catch {}

    $stakeProc = $null
    try {
      $extPath = (Resolve-Path (Join-Path $PSScriptRoot "..\stake_extension")).Path
      $stakeProc = Start-Process -FilePath $chrome -ArgumentList @(
        "--profile-directory=`"$p`"",
        "--load-extension=`"$extPath`"",
        "--new-window",
        $Url
      ) -PassThru
    } catch {
      Write-Log "[$i/$($Profiles.Count)] เปิดไม่สำเร็จ: $($_.Exception.Message)"
      continue
    }

    Write-Host ""
    Write-Host "  >> บอทกำลังทำงานใน: $name ($p) [เป้าหมาย: สุ่ม 0.35 - 0.65 USDT หรือครบ 20 นาที]" -ForegroundColor Cyan
    Write-Host "     [AUTO] ระบบสลับ 5 บัญชีอัตโนมัติ: วนรอบละ 20 นาที (พัก 3 นาที) [Anda <-> nattawat <-> master <-> wut1229 <-> AIForge <-> watt28265]" -ForegroundColor Green

    # กำหนดเวลาเพดานเซสชัน (ค่าเริ่มต้น 20 นาที ตาม -SessionMinutes ของสคริปต์)
    $maxWaitSec = $SessionMinutes * 60
    $res = Wait-ForSessionOrKey -MaxSeconds $maxWaitSec -RecoveryExtraSeconds ($RecoveryExtraMinutes * 60)
    $titleText = ""
    if ($res -and $res.reason) {
      $titleText = [string]$res.reason
      Write-Log "[$i/$($Profiles.Count)] จบเซสชัน $name ($titleText)"
    }
    $parsed = Parse-DoneTitle $titleText
    if ($parsed.ok) {
      Add-LedgerRow $p $name $sid $parsed.pnl $parsed.code
      $dailyTotal = Get-DailyPnl $p
      Write-Log "[$i/$($Profiles.Count)] [LEDGER] $name P/L=$($parsed.pnl) code=$($parsed.code) step=$($parsed.step) | วันนี้รวม=$dailyTotal"
      
      # สะสมสถิติสำหรับสรุปผลตามรอบเวลา (Batch Summary ทุก 3 ชั่วโมง)
      $batchSessionCount++
      $pnlVal = 0.0
      [double]::TryParse($parsed.pnl, [ref]$pnlVal) | Out-Null
      $batchPnl += $pnlVal
      if ($pnlVal -ge 0) { $batchWins++ } else { $batchLosses++ }

      # 📱 ส่งแจ้งเตือนเข้า Telegram ทุกครั้งที่เล่นจบรอบทันที (Real-Time Notification)
      $pnlSign = if ($pnlVal -ge 0) { "+" } else { "" }
      $pnlIcon = if ($pnlVal -ge 0) { "🟢" } else { "🔴" }
      $dailySign = if ($dailyTotal -ge 0) { "+" } else { "" }
      
      $nextP = if ($i -lt $Profiles.Count) { $Profiles[$i] } else { $Profiles[0] }
      $nextN = if ($labels.ContainsKey($nextP)) { $labels[$nextP] } else { $nextP }
      
      $isZeroFunds = ($parsed.code -eq "NO_FUNDS" -and [Math]::Abs([double]$parsed.pnl) -lt 0.0001)
      $pauseText = if ($isZeroFunds) { "⏩ บัญชี 0 USDT ข้ามไปเปิด $nextN ทันทีใน 5 วินาที..." } else { "⏳ พัก $PauseSeconds วินาที ก่อนเปิด $nextN..." }

      $tgMsg = "🎲 <b>[Stake Dice] จบเซสชัน: $name ($p)</b>`n" +
               "$pnlIcon กำไรในรอบนี้: <b>$pnlSign$($parsed.pnl) USDT</b> ($($parsed.code))`n" +
               "📈 รวมวันนี้ ($name): <b>$dailySign$dailyTotal USDT</b>`n" +
               "🎯 ไม้จบ: ไม้ $($parsed.step)`n" +
               "$pauseText"
      Send-TelegramNotification $tgMsg
      Write-Log "[$i/$($Profiles.Count)] [TG] ส่งแจ้งเตือนผลเซสชัน $name เข้า Telegram เรียบร้อยแล้ว" 
    } elseif ($titleText -match "STOP_FLEET") {
      # ผู้ใช้สั่งหยุดทั้งระบบเอง -> ไม่บันทึก ledger (ไม่ใช่ความล้มเหลว และไม่มีอะไรจะเล่นต่อ)
      Write-Log "[$i/$($Profiles.Count)] [STOP] ผู้ใช้สั่งหยุดทั้งระบบ — ไม่บันทึก ledger"
      Send-TelegramNotification "🛑 <b>[Stake Dice]</b> ผู้ใช้สั่งหยุดบอททั้งระบบ ($name)"
    } else {
      # ไม่มี STAKE_DONE = บอทค้าง/เน็ตหลุด/ลืมกด START/กด Enter ข้ามกลางเซสชัน
      # -> นับขาดทุนเต็มบันได (ด้านปลอดภัย ไม่ให้เพดานรั่ว) แต่แยก label ให้เห็นว่าเป็นข้อมูลไม่ครบ
      $nodoReason = "NO_DONE"
      if ($titleText -match "กดข้าม") { $nodoReason = "USER_SKIP" }
      Add-LedgerRow $p $name $sid (-$DailyLossLimit) $nodoReason
      $dailyTotal = Get-DailyPnl $p
      Write-Log "[$i/$($Profiles.Count)] [WARN] ไม่พบ STAKE_DONE ($nodoReason) — นับเป็นขาดทุนเต็มบันได $(-$DailyLossLimit) | วันนี้รวม=$dailyTotal"
      Send-TelegramNotification "⚠️ <b>[Stake Dice] แจ้งเตือนเซสชัน $name</b>`n❌ ไม่พบ STAKE_DONE ($nodoReason)`n📉 บันทึกขาดทุนเพดาน: <b>-$DailyLossLimit USDT</b>`n📈 รวมวันนี้ ($p): <b>$dailyTotal USDT</b>"
    }

    # 🛑 ปิดเฉพาะหน้าต่าง Chrome ของ Stake ที่เพิ่งเล่นจบไป (ไม่แตะต้องหน้าต่าง CMD หรือโปรแกรมอื่นเด็ดขาด)
    Write-Log "[$i/$($Profiles.Count)] กำลังปิดหน้าต่าง Chrome Stake ของ $name..."
    $closedCount = 0
    try {
      $closedCount = [ChromeWindowCloser]::CloseOnlyStakeChromeWindows($PID)
    } catch {}
    Write-Log "[$i/$($Profiles.Count)] ปิดหน้าต่าง Chrome เรียบร้อย ($closedCount หน้าต่าง)"

    # 🧹 INTELLIGENT STAKE PROCESS TREE KILLER: เก็บกวาดโปรเซสลูกของหน้าต่าง Stake นี้โดยเฉพาะ
    if ($stakeProc -and -not $stakeProc.HasExited) {
      try {
        $spid = $stakeProc.Id
        $children = @(Get-CimInstance Win32_Process -Filter "ParentProcessId = $spid" -ErrorAction SilentlyContinue)
        foreach ($c in $children) {
          try { Stop-Process -Id $c.ProcessId -Force -ErrorAction SilentlyContinue } catch {}
        }
        Stop-Process -Id $spid -Force -ErrorAction SilentlyContinue
      } catch {}
    }

    # 💾 MEMORY SELF-HEALING: สั่งคืน RAM ให้ Windows ทันที
    try {
      [System.GC]::Collect()
      [System.GC]::WaitForPendingFinalizers()
    } catch {}
    # 🧹 ตรวจ Chrome ที่ค้างหลังปิดหน้าต่าง — ค่าเริ่มต้น "อ่านอย่างเดียว"
    # ⚠️ บทเรียนจริง (6 พ.ย. 2026): เช็ค "ไม่มีหน้าต่าง" ด้วย MainWindowTitle ไม่แม่น
    #    จังหวะที่ Chrome กำลังเปิด/ปิดหน้าต่าง ค่าอ่านได้ว่าง -> เคยฆ่า Chrome ที่กำลังเดิมพันอยู่
    #    จึงต้องสั่งเองด้วย -KillIdleChrome เท่านั้น
    if ($KillIdleChrome) {
      $idleClosed = Close-IdleChromeProcesses -WaitSeconds 10
      if ($idleClosed -gt 0) {
        Write-Log "[$i/$($Profiles.Count)] 🧹 เก็บ Chrome ที่ค้างเบื้องหลัง $idleClosed โปรเซส (คืน RAM/GPU)"
      } elseif ($idleClosed -lt 0) {
        Write-Log "[$i/$($Profiles.Count)] มีหน้าต่าง Chrome อื่นเปิดอยู่ — ไม่แตะโปรเซสที่เหลือ"
      }
    } else {
      $leftChrome = @(Get-Process chrome -ErrorAction SilentlyContinue)
      if ($leftChrome.Count -gt 0) {
        $leftMem = [int](($leftChrome | Measure-Object WorkingSet64 -Sum).Sum / 1MB)
        Write-Log "[$i/$($Profiles.Count)] ยังเหลือ Chrome $($leftChrome.Count) โปรเซส ($leftMem MB) — ไม่ปิดให้"
      }
    }

    if (Test-Path $stopPath) { break }

    $nextProfile = if ($i -lt $Profiles.Count) { $Profiles[$i] } else { $Profiles[0] }
    $nextName = if ($labels.ContainsKey($nextProfile)) { $labels[$nextProfile] } else { $nextProfile }
    
    # ⚡ FAST ZERO-FUNDS SKIP: ถ้าบัญชีไม่มีเงินตั้งแต่แรก (P/L = 0 และรหัส NO_FUNDS) ไม่ต้องพัก 180 วิ ให้สลับไปบัญชีถัดไปใน 5 วิ
    $actualPause = $PauseSeconds
    $isZeroFunds = ($parsed.code -eq "NO_FUNDS" -and [Math]::Abs([double]$parsed.pnl) -lt 0.0001)
    if ($isZeroFunds) {
      $actualPause = 5
      Write-Log "[$i/$($Profiles.Count)] ⏩ บัญชี $name ไม่มีเงิน (0 USDT) -> ข้ามไปเปิด $nextName ทันทีใน 5 วินาที"
    } else {
      Write-Log "[$i/$($Profiles.Count)] พัก $actualPause วินาที ก่อนสลับไปเปิดบัญชีถัดไป ($nextName)..."
    }

    if ($actualPause -gt 0) {
      # แสดงนับถอยหลังการพักอย่างชัดเจน ไม่ค้าง
      $cooldownDeadline = (Get-Date).AddSeconds($actualPause)
      while ((Get-Date) -lt $cooldownDeadline) {
        $rem = [int]($cooldownDeadline - (Get-Date)).TotalSeconds
        if ($rem % 30 -eq 0 -and $rem -gt 0) {
          Write-Host "     [⏳ กำลังพักคูลดาวน์: เหลือ $rem วินาที...]" -ForegroundColor Yellow
        }
        Start-Sleep -Seconds 1
      }
    }
  }

  # 📊 ส่งสรุปรายงานยอดรวมพอร์ตทุกบัญชีประจำวันเข้า Telegram เมื่อหมุนเวียนครบรอบ
  Send-FleetDailySummary
  Write-Log "--- 📊 ส่งสรุปรายงานพอร์ตทุกบัญชีประจำวันเข้า Telegram เรียบร้อยแล้ว (จบรอบที่ $pass) ---"
}

Write-Log "=== จบการทำงาน ==="
