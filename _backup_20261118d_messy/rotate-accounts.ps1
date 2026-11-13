<#
  rotate-accounts.ps1 - วนลูป 3 บัญชีอัตโนมัติ 100% (Zero Click & Crash-Proof)
  Profile 1 (Anda) -> Profile 3 (nattawat) -> Profile 4 (master)
#>

param(
  [string[]]$Profiles = @("Profile 1", "Profile 3", "Profile 4"),
  [string]$Url = "https://stake.com/th/casino/games/stake-dice",
  [int]$SessionMinutes = 35,
  [int]$PauseSeconds = 180,
  [string]$StopFile = "STOP_FLEET.txt"
)

$ErrorActionPreference = "Stop"

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

$stopPath = Join-Path $PSScriptRoot $StopFile
$log = Join-Path $PSScriptRoot "rotate-log.txt"

function Write-Log([string]$text) {
  $now = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
  $line = "$now  $text"
  Write-Host $line
  Add-Content -Path $log -Value $line -Encoding UTF8
}

$labels = @{
  "Profile 1" = "Anda"
  "Profile 3" = "nattawat"
  "Profile 4" = "master"
}

# ---------- 🧾 LEDGER + DAILY LOSS CAP (ชั้น PowerShell — บอทไม่ต้องเก็บ state) ----------
# เหตุผลที่อยู่ชั้นนี้: content.js เป็น zero-footprint (ไม่เขียน storage) และมองไม่เห็นอีกโปรไฟล์
$ledgerCsv = Join-Path $PSScriptRoot "rotate-ledger.csv"

# เพดานขาดทุนรวมต่อบัญชีต่อวัน = บันไดเต็ม 22 ไม้ (75,023 หน่วย x 0.00015 = 11.25345 USDT)
# ทำไมไม่ใช้ % ของทุน: บันได 1 รอบใช้ ~75% ของทุน -> เพดาน 1-2% จะตัดบันไดกลางทาง
$DailyLossLimit = 11.25345

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


function Wait-ForSessionOrKey([int]$MaxSeconds = 2100) {
  $deadline = (Get-Date).AddSeconds($MaxSeconds)
  $result = @{ reason = "ครบเวลาเพดานเซสชัน (Auto-Switch)"; account = "" }
  $lastShowMin = -1

  while ((Get-Date) -lt $deadline) {
    $remSec = [int]($deadline - (Get-Date)).TotalSeconds
    $remMin = [math]::Ceiling($remSec / 60)
    if ($remMin -ne $lastShowMin -and $remSec % 60 -eq 0 -and $remSec -gt 0) {
      $lastShowMin = $remMin
      Write-Host "     [⏱️ เวลาคงเหลือสูงสุดในบัญชีนี้: $remMin นาที]" -ForegroundColor DarkGray
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

    # ตรวจจับสัญญาณจบเซสชันจาก Title ของหน้าต่าง Chrome (เสถียร 100% ไม่พึ่งพอร์ตเครือข่าย)
    try {
      $doneWins = [ChromeWindowCloser]::FindDoneWindows()
      if ($doneWins -and $doneWins.Length -gt 0) {
        $result.reason = "จบเซสชันตามแผน ($($doneWins[0]))"
        break
      }
    } catch {}

    Start-Sleep -Milliseconds 800
  }

  return $result
}

Init-Ledger
Write-Log "=== เริ่มระบบวน 3 บัญชีอัตโนมัติ: Anda -> nattawat -> master ==="

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
      Write-Log "🛑 พบ STOP_FLEET - หยุดก่อนเปิดบัญชีถัดไป"
      break
    }

    $name = $p
    if ($labels.ContainsKey($p)) { $name = $labels[$p] }

    # 🛑 DAILY LOSS CAP — ขาดทุนสะสมวันนี้ของบัญชีนี้ถึงเพดานแล้ว = ข้ามทั้งวัน (ไม่เปิดหน้าต่างด้วยซ้ำ)
    $dayPnl = Get-DailyPnl $p
    if ($dayPnl -le -$DailyLossLimit) {
      Write-Log "[$i/$($Profiles.Count)] [SKIP] ข้าม $name ($p): ขาดทุนวันนี้ $dayPnl ถึงเพดานแล้ว"
      try { [Console]::Beep(1000, 600) } catch {}
      continue
    }

    # 🩺 PRE-FLIGHT — ตรวจโปรไฟล์ก่อนเปิด (Fail Fast ไม่ให้เสียเซสชันเปล่า)
    $pf = Test-ProfileReady $p
    if ($pf -ne "") {
      Write-Log "[$i/$($Profiles.Count)] [SKIP] ข้าม $name ($p): $pf"
      continue
    }

    $sid = $p.Replace(" ", "") + "-" + (Get-Date).ToString("yyyyMMdd-HHmmss")
    Write-Log "[$i/$($Profiles.Count)] กำลังเปิดบัญชี: $name ($p)"

    try {
      Start-Process -FilePath $chrome -ArgumentList @(
        "--profile-directory=`"$p`"",
        "--new-window",
        $Url
      ) | Out-Null
    } catch {
      Write-Log "[$i/$($Profiles.Count)] เปิดไม่สำเร็จ: $($_.Exception.Message)"
      continue
    }

    Write-Host ""
    Write-Host "  >> บอทกำลังทำงานใน: $name ($p) [เป้าหมาย: 5% ของทุน]" -ForegroundColor Cyan
    Write-Host "     [AUTO] ระบบทำงานอัตโนมัติ 100% ไม่ต้องคลิกใดๆ บอทจะวนสลับบัญชีเอง" -ForegroundColor Green

    # กำหนดเวลาเพดานเซสชัน (ค่าเริ่มต้น 35 นาที เผื่อเวลาให้ทำกำไร 5% ได้สบายๆ ไม่ตัดจบไวเกินไป)
    $maxWaitSec = $SessionMinutes * 60
    $res = Wait-ForSessionOrKey -MaxSeconds $maxWaitSec
    $titleText = ""
    if ($res -and $res.reason) {
      $titleText = [string]$res.reason
      Write-Log "[$i/$($Profiles.Count)] จบเซสชัน $name ($titleText)"
    }
    $parsed = Parse-DoneTitle $titleText
    if ($parsed.ok) {
      Add-LedgerRow $p $name $sid $parsed.pnl $parsed.code
      Write-Log "[$i/$($Profiles.Count)] [LEDGER] $name P/L=$($parsed.pnl) code=$($parsed.code) step=$($parsed.step) | วันนี้รวม=$(Get-DailyPnl $p)"
    } elseif ($titleText -match "STOP_FLEET") {
      # ผู้ใช้สั่งหยุดทั้งระบบเอง -> ไม่บันทึก ledger (ไม่ใช่ความล้มเหลว และไม่มีอะไรจะเล่นต่อ)
      Write-Log "[$i/$($Profiles.Count)] [STOP] ผู้ใช้สั่งหยุดทั้งระบบ — ไม่บันทึก ledger"
    } else {
      # ไม่มี STAKE_DONE = บอทค้าง/เน็ตหลุด/ลืมกด START/กด Enter ข้ามกลางเซสชัน
      # -> นับขาดทุนเต็มบันได (ด้านปลอดภัย ไม่ให้เพดานรั่ว) แต่แยก label ให้เห็นว่าเป็นข้อมูลไม่ครบ
      $nodoReason = "NO_DONE"
      if ($titleText -match "กดข้าม") { $nodoReason = "USER_SKIP" }
      Add-LedgerRow $p $name $sid (-$DailyLossLimit) $nodoReason
      Write-Log "[$i/$($Profiles.Count)] [WARN] ไม่พบ STAKE_DONE ($nodoReason) — นับเป็นขาดทุนเต็มบันได $(-$DailyLossLimit) | วันนี้รวม=$(Get-DailyPnl $p)"
    }

    # 🛑 ปิดเฉพาะหน้าต่าง Chrome ของ Stake ที่เพิ่งเล่นจบไป (ไม่แตะต้องหน้าต่าง CMD หรือโปรแกรมอื่นเด็ดขาด)
    Write-Log "[$i/$($Profiles.Count)] กำลังปิดหน้าต่าง Chrome Stake ของ $name..."
    $closedCount = 0
    try {
      $closedCount = [ChromeWindowCloser]::CloseOnlyStakeChromeWindows($PID)
    } catch {}
    Write-Log "[$i/$($Profiles.Count)] ปิดหน้าต่าง Chrome เรียบร้อย ($closedCount หน้าต่าง)"

    if (Test-Path $stopPath) { break }

    Write-Log "[$i/$($Profiles.Count)] พัก $PauseSeconds วินาที ก่อนเปิดบัญชีถัดไป..."
    if ($PauseSeconds -gt 0) {
      # แสดงนับถอยหลังการพักอย่างชัดเจน ไม่ค้าง
      $cooldownDeadline = (Get-Date).AddSeconds($PauseSeconds)
      while ((Get-Date) -lt $cooldownDeadline) {
        $rem = [int]($cooldownDeadline - (Get-Date)).TotalSeconds
        if ($rem % 30 -eq 0 -and $rem -gt 0) {
          Write-Host "     [⏳ กำลังพักคูลดาวน์: เหลือ $rem วินาที...]" -ForegroundColor Yellow
        }
        Start-Sleep -Seconds 1
      }
    }
  }
}

Write-Log "=== จบการทำงาน ==="
