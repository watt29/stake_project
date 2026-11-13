<#
  rotate-accounts.ps1 - รันบัญชี Master (Profile 4: regency1229)
#>

param(
  [string[]]$Profiles = @("Profile 4"),
  [string]$Url = "https://stake.com/th/casino/games/stake-dice",
  [int]$SessionMinutes = 20,
  [int]$RecoveryExtraMinutes = 90,  # เพดานพยุง: ถ้าบอทขอhold (ยังขาดทุน) เลื่อนเพดานออกได้สูงสุดกี่นาที
  [int]$PauseSeconds = 45,      # เดิม 180 — ลดเวลาตายระหว่างรอบ (เพิ่มจำนวนรอบต่อชั่วโมง); ตั้ง 180 กลับได้ถ้าต้องการพักนาน
  [string]$StopFile = "STOP_FLEET.txt"
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
  "Profile 4" = "master"
}

# ---------- 🧾 LEDGER + DAILY LOSS CAP (ชั้น PowerShell — บอทไม่ต้องเก็บ state) ----------
# เหตุผลที่อยู่ชั้นนี้: content.js เป็น zero-footprint (ไม่เขียน storage) และมองไม่เห็นอีกโปรไฟล์
$ledgerCsv = Join-Path $PSScriptRoot "rotate-ledger.csv"

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


function Wait-ForSessionOrKey([int]$MaxSeconds = 2100, [int]$RecoveryExtraSeconds = 5400) {
  $startAt = Get-Date
  $deadline = $startAt.AddSeconds($MaxSeconds)
  $result = @{ reason = "จบเซสชันตามแผน"; account = "" }
  $lastShowMin = -1
  $timeWarned = $false

  while ($true) {
    $now = Get-Date
    $remSec = [int]($deadline - $now).TotalSeconds
    $remMin = [math]::Ceiling($remSec / 60)
    if ($remMin -ne $lastShowMin -and $remSec % 60 -eq 0 -and $remSec -gt 0) {
      $lastShowMin = $remMin
      Write-Host "     [⏱️ เวลาคงเหลือเซสชัน: $remMin นาที]" -ForegroundColor DarkGray
    }

    if ($now -ge $deadline -and -not $timeWarned) {
      $timeWarned = $true
      Write-Host "     [⏱️ ครบเวลาเซสชันแล้ว — รอให้บอทชนะติดต่อกัน 3 ตาและจบรอบปลอดภัย (กลับไม้ 1) ก่อนปิดหน้าต่าง (ห้ามปิดตอนกำลังแก้ไม้)]" -ForegroundColor Yellow
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

    # ตรวจจับสัญญาณจบเซสชันจาก Title ของหน้าต่าง Chrome (เมื่อบอทชนะติด 3 ตา รีเซ็ตกลับไม้ 1 หรือถึงเป้าหมายแล้ว)
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
Write-Log "=== เริ่มระบบบัญชี Master (regency1229) ==="

# ปิดหน้าต่าง Stake ที่ค้างจากรอบก่อนก่อนเริ่มรอบแรก (กัน 2 บอทเดิมพันบัญชีเดียวกัน)
try {
  $staleWins = [ChromeWindowCloser]::CloseOnlyStakeChromeWindows($PID)
  if ($staleWins -gt 0) { Write-Log "[START] ปิดหน้าต่าง Stake ที่ค้างจากรอบก่อน $staleWins หน้าต่าง" }
} catch {}

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
    Write-Host "     [AUTO] ระบบทำงานอัตโนมัติ 100% บอทจะวนเล่นรอบละ 20 นาที (พัก 3 นาที) บัญชี Master บัญชีเดียว" -ForegroundColor Green

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

    Write-Log "[$i/$($Profiles.Count)] พัก $PauseSeconds วินาที ก่อนเปิดรอบถัดไป (บัญชีเดิม Master)..."
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
