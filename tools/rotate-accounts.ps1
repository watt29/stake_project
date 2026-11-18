# tools/rotate-accounts.ps1 — ตัวขับรอบเซสชันของ stake_extension (สร้างใหม่ 2026-11-14)
# ต้องบันทึกไฟล์เป็น UTF-8 with BOM (0xEF,0xBB,0xBF) เสมอ เพราะมีภาษาไทย (Windows PowerShell 5.1)
#
# หลักการ: เปิด Chrome โปรไฟล์เดียว -> รอ title STAKE_DONE จากหน้าเว็บ -> ปิดแท็บ/หน้าต่าง -> พัก 180 วิ -> วนรอบใหม่

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "Continue"

# ---------- ตั้งค่า ----------
$ChromeExe        = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$GameUrl          = "https://stake.com/th/casino/games/stake-dice"
$Profiles         = @("Profile 4")        # ผู้ใช้สั่ง 2026-11-13: watt29 เท่านั้น
$SessionMinutes   = 20                    # เวลาเล่นต่อรอบ
$RecoveryExtraMinutes = 40                # พยุงต่อได้สูงสุด (ห้ามตัดขาดทุน)
$HardDeadlineMin  = 3                     # เกินนี้หลังครบกำหนด = บังคับปิด
$CooldownSeconds  = 0                     # ไม่พักเบรก (ผู้ใช้สั่งลบทิ้ง ลุยต่อทันที)
$PollMs           = 100                   # ต้อง <= 100ms ตาม AGENTS.md §7

# ---------- Win32: อ่าน title ของหน้าต่าง ----------
Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class WinTitle {
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);
    public const uint WM_CLOSE = 0x0010;
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    public static string TitleOf(IntPtr h) {
        var sb = new StringBuilder(1024);
        GetWindowText(h, sb, sb.Capacity);
        return sb.ToString();
    }
}
"@

function Get-ChromeTitles {
    $result = @()
    $callback = [WinTitle+EnumWindowsProc]{
        param($hWnd, $lParam)
        if ([WinTitle]::IsWindowVisible($hWnd)) {
            $procId = 0
            [void][WinTitle]::GetWindowThreadProcessId($hWnd, [ref]$procId)
            try {
                $p = Get-Process -Id $procId -ErrorAction Stop
                if ($p.ProcessName -eq "chrome") {
                    $t = [WinTitle]::TitleOf($hWnd)
                    if ($t) { $script:titles += $t }
                }
            } catch { }
        }
        return $true
    }
    $script:titles = @()
    [void][WinTitle]::EnumWindows($callback, [IntPtr]::Zero)
    return $script:titles
}

function Test-AnyTitle([string[]]$titles, [string]$needle) {
    foreach ($t in $titles) { if ($t -like "*$needle*") { return $true } }
    return $false
}

# แปลง title -> ผลรอบ + กำไร + ไม้ (ใช้คีย์เวิร์ดอังกฤษตาม deriveStopCode)
function Parse-DoneTitle([string[]]$titles) {
    foreach ($t in $titles) {
        if ($t -notlike "*STAKE_DONE*") { continue }
        $code = if ($t -match "R=([A-Z_]+)") { $matches[1].ToUpper() } else { "OTHER" }
        $pnlVal = $null
        if ($t -match "P=([+-]?[0-9]+(?:\.[0-9]+)?)") {
            try { $pnlVal = [double]$matches[1] } catch { $pnlVal = $null }
        }
        $stepVal = if ($t -match "S=([0-9]+)") { [int]$matches[1] } else { 1 }
        $betsVal = if ($t -match "B=([0-9]+)") { [int]$matches[1] } else { $null }
        $wagerVal = $null
        if ($t -match "W=([0-9]+(?:\.[0-9]+)?)") {
            try { $wagerVal = [double]$matches[1] } catch { $wagerVal = $null }
        }
        $maxStepVal = if ($t -match "MS=([0-9]+)") { [int]$matches[1] } else { $null }
        $maxDdVal = $null
        if ($t -match "MD=([0-9]+(?:\.[0-9]+)?)") {
            try { $maxDdVal = [double]$matches[1] } catch { $maxDdVal = $null }
        }
        return @{ code = $code; pnl = $pnlVal; step = $stepVal; bets = $betsVal; wagered = $wagerVal; maxStep = $maxStepVal; maxDd = $maxDdVal; title = $t }
    }
    return $null
}

# รอจนได้สัญญาณหรือหมดเวลา — poll ทุก $PollMs
function Wait-ForSessionOrKey([int]$maxMinutes) {
    $deadline = (Get-Date).AddMinutes($maxMinutes)
    $seenHold = $false
    $lastRunTitle = ""
    $lastDeepStep = 0
    $dataDir = Join-Path $PSScriptRoot "..\data"
    $logsDir = Join-Path $PSScriptRoot "..\logs"
    $livePath = Join-Path $dataDir "live-status.txt"
    $deepLogPath = Join-Path $dataDir "deep-losses.log"
    $livePathLogs = Join-Path $logsDir "live-status.txt"
    $deepLogPathLogs = Join-Path $logsDir "deep-losses.log"
    while ((Get-Date) -lt $deadline) {
        $titles = Get-ChromeTitles
        $parsed = Parse-DoneTitle $titles
        if ($parsed) {
            return @{ done = $true; code = $parsed.code; pnl = $parsed.pnl; step = $parsed.step; bets = $parsed.bets; wagered = $parsed.wagered; maxStep = $parsed.maxStep; maxDd = $parsed.maxDd; title = $parsed.title }
        }
        foreach ($t in $titles) {
            if ($t -like "*STAKE_RUN|*" -and $t -ne $lastRunTitle) {
                $lastRunTitle = $t
                if (-not (Test-Path $dataDir)) { New-Item -ItemType Directory -Path $dataDir | Out-Null }
                if (-not (Test-Path $logsDir)) { New-Item -ItemType Directory -Path $logsDir | Out-Null }
                $nowStr = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
                Set-Content -Path $livePath -Value ("$nowStr | $t") -Encoding UTF8
                Set-Content -Path $livePathLogs -Value ("$nowStr | $t") -Encoding UTF8
                # กวาดไฟล์ log ของบอท (stake_diag_*.json) ที่ตกค้างใน D:\ เข้าโฟลเดอร์ logs อัตโนมัติ
                Get-ChildItem -Path "D:\" -Filter "stake_diag_*.json" -File -ErrorAction SilentlyContinue | ForEach-Object {
                    try { Move-Item -Path $_.FullName -Destination $logsDir -Force -ErrorAction SilentlyContinue } catch {}
                }
                if ($t -match "\|S=([0-9]+)") {
                    $curStep = [int]$matches[1]
                    if ($curStep -ge 8) {
                        Add-Content -Path $deepLogPath -Value ("$nowStr | $t") -Encoding UTF8
                        Add-Content -Path $deepLogPathLogs -Value ("$nowStr | $t") -Encoding UTF8
                        if ($curStep -gt $lastDeepStep) {
                            Write-Host "🚨 [$(Get-Date -Format 'HH:mm:ss')] แพ้ลึก ไม้ $curStep! $t" -ForegroundColor Red
                            $lastDeepStep = $curStep
                        }
                    } else {
                        $lastDeepStep = 0
                    }
                }
                break
            }
        }
        if (Test-AnyTitle $titles "STAKE_HOLD") {
            if (-not $seenHold) { Write-Host "⏳ [$(Get-Date -Format 'HH:mm:ss')] บอทกำลังพยุงกู้คืน (STAKE_HOLD) — ห้ามปิด" -ForegroundColor Yellow; $seenHold = $true }
            $deadline = (Get-Date).AddMinutes($RecoveryExtraMinutes)
        } else {
            $seenHold = $false
        }
        Start-Sleep -Milliseconds $PollMs
    }
    return @{ done = $false; code = $null; pnl = $null; step = $null; bets = $null; wagered = $null; title = $null }
}

function Write-RoundLog([int]$round, [string]$profile, [string]$code, $pnl, $step, [int]$durSec, $bets, $wagered, [string]$title) {
    $dataDir = Join-Path $PSScriptRoot "..\data"
    $logsDir = Join-Path $PSScriptRoot "..\logs"
    if (-not (Test-Path $dataDir)) { New-Item -ItemType Directory -Path $dataDir | Out-Null }
    if (-not (Test-Path $logsDir)) { New-Item -ItemType Directory -Path $logsDir | Out-Null }
    $csvPath = Join-Path $dataDir "rotate-ledger.csv"
    $csvPathLogs = Join-Path $logsDir "rotate-ledger.csv"
    if (-not (Test-Path $csvPath)) {
        Set-Content -Path $csvPath -Value "timestamp,round,profile,code,pnl,step,duration_sec,bets,wagered,bps,title" -Encoding UTF8
    }
    if (-not (Test-Path $csvPathLogs)) {
        Set-Content -Path $csvPathLogs -Value "timestamp,round,profile,code,pnl,step,duration_sec,bets,wagered,bps,title" -Encoding UTF8
    }
    $ts = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    $pnlStr = if ($null -ne $pnl) { ([double]$pnl).ToString("0.00000", [System.Globalization.CultureInfo]::InvariantCulture) } else { "" }
    $stepStr = if ($null -ne $step) { "$step" } else { "" }
    $betsStr = if ($null -ne $bets) { "$bets" } else { "" }
    $wagerStr = if ($null -ne $wagered) { ([double]$wagered).ToString("0.0000", [System.Globalization.CultureInfo]::InvariantCulture) } else { "" }
    $bpsStr = if ($null -ne $bets -and $durSec -gt 0) { ([double]$bets / $durSec).ToString("0.00", [System.Globalization.CultureInfo]::InvariantCulture) } else { "" }
    $safeTitle = ($title -replace '"', '""')
    $line = "$ts,$round,$profile,$code,$pnlStr,$stepStr,$durSec,$betsStr,$wagerStr,$bpsStr,`"$safeTitle`""
    Add-Content -Path $csvPath -Value $line -Encoding UTF8
    Add-Content -Path $csvPathLogs -Value $line -Encoding UTF8
}

function Close-GameTabs {
    # ปิดเฉพาะหน้าต่างเกม Stake/Dice (ไม่ฆ่า Chrome หน้าต่างอื่น)
    $closed = 0
    $callback = [WinTitle+EnumWindowsProc]{
        param($hWnd, $lParam)
        if ([WinTitle]::IsWindowVisible($hWnd)) {
            $procId = 0
            [void][WinTitle]::GetWindowThreadProcessId($hWnd, [ref]$procId)
            try {
                $p = Get-Process -Id $procId -ErrorAction Stop
                if ($p.ProcessName -eq "chrome") {
                    $t = [WinTitle]::TitleOf($hWnd)
                    if ($t -and ($t -like "*Dice*" -or $t -like "*Stake*" -or $t -like "*STAKE_DONE*" -or $t -like "*STAKE_HOLD*")) {
                        [void][WinTitle]::PostMessage($hWnd, [WinTitle]::WM_CLOSE, [IntPtr]::Zero, [IntPtr]::Zero)
                        $script:closedCount++
                    }
                }
            } catch { }
        }
        return $true
    }
    $script:closedCount = 0
    [void][WinTitle]::EnumWindows($callback, [IntPtr]::Zero)
    if ($script:closedCount -gt 0) {
        Write-Host "🔒 ปิดหน้าต่างเกม $($script:closedCount) หน้าต่างเรียบร้อย" -ForegroundColor DarkGray
    }
}

function Start-Round([string]$profile) {
    $extPath = (Resolve-Path (Join-Path $PSScriptRoot "..\stake_extension")).Path
    $argList = @(
        "`"--profile-directory=$profile`"",
        "`"--load-extension=$extPath`"",
        "`"$GameUrl`""
    )
    if (Test-Path $ChromeExe) {
        Start-Process -FilePath $ChromeExe -ArgumentList $argList | Out-Null
    } else {
        Start-Process $GameUrl | Out-Null
    }
}

# ---------- ลูปรอบ ----------
$round = 0
$totalPnl = 0.0
while ($true) {
    $round++
    $profile = $Profiles[0]
    $roundStart = Get-Date
    Write-Host "`n===== รอบที่ $round · $profile · $(Get-Date -Format 'HH:mm:ss') =====" -ForegroundColor Cyan

    Start-Round $profile

    $maxWait = $SessionMinutes + $RecoveryExtraMinutes + $HardDeadlineMin
    $res = Wait-ForSessionOrKey $maxWait
    $durSec = [int]((Get-Date) - $roundStart).TotalSeconds

    if (-not $res.done) {
        Write-Host "⚠️ [$(Get-Date -Format 'HH:mm:ss')] หมดเวลา (hard deadline) — บังคับปิดเพื่อไม่ให้ค้างจอดำ" -ForegroundColor Red
        Close-GameTabs
        Write-RoundLog $round $profile "HARD_TIMEOUT" $null $null $durSec $null $null "hard deadline"
    } else {
        $pnlText = "n/a"
        $pnlColor = "Green"
        if ($null -ne $res.pnl) {
            $pVal = [double]$res.pnl
            $totalPnl += $pVal
            $sign = if ($pVal -ge 0) { "+" } else { "" }
            $pnlText = "$sign$($pVal.ToString('0.00000', [System.Globalization.CultureInfo]::InvariantCulture)) USDT"
            if ($pVal -lt 0) { $pnlColor = "Red" }
        }
        $tSign = if ($totalPnl -ge 0) { "+" } else { "" }
        $totalText = "$tSign$($totalPnl.ToString('0.00000', [System.Globalization.CultureInfo]::InvariantCulture)) USDT"
        $durMin = [math]::Floor($durSec / 60)
        $durRem = $durSec % 60
        $betsInfo = if ($null -ne $res.bets -and $durSec -gt 0) {
            $bpsVal = ([double]$res.bets / $durSec).ToString("0.00", [System.Globalization.CultureInfo]::InvariantCulture)
            " | ตา=$($res.bets) (${bpsVal} ตา/วิ)"
        } else { "" }
        $wagerInfo = if ($null -ne $res.wagered) {
            " | Wager=$([double]$res.wagered | ForEach-Object { $_.ToString('0.0000', [System.Globalization.CultureInfo]::InvariantCulture) })"
        } else { "" }
        $deepInfo = if ($null -ne $res.maxStep) {
            $ddTxt = if ($null -ne $res.maxDd) { ([double]$res.maxDd).ToString('0.0000', [System.Globalization.CultureInfo]::InvariantCulture) } else { "n/a" }
            " | Maxไม้=$($res.maxStep) | DD=$ddTxt"
        } else { "" }
        Write-Host "✅ [$(Get-Date -Format 'HH:mm:ss')] จบรอบ: $($res.code) | P=$pnlText | ไม้=$($res.step)$deepInfo$betsInfo$wagerInfo | ใช้เวลา=${durMin}m${durRem}s | สะสม=$totalText" -ForegroundColor $pnlColor
        Write-RoundLog $round $profile $res.code $res.pnl $res.step $durSec $res.bets $res.wagered $res.title
        Start-Sleep -Milliseconds 600
        Close-GameTabs
        if ($res.code -eq "NO_FUNDS") {
            Write-Host "🚫 ยอดไม่พอ — ข้ามรอบเร็ว (5 วิ)" -ForegroundColor Yellow
            Start-Sleep -Seconds 5
            continue
        }
    }

    # ลบการพักเบรกทิ้งตามคำสั่งผู้ใช้ (ลุยต่อรอบใหม่ทันที)
    Write-Host "🚀 ลุยต่อรอบใหม่ทันที (ไม่พักเบรก)..." -ForegroundColor Green
}
