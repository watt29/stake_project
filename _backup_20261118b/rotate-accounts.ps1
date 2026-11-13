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
    if ($res -and $res.reason) {
      Write-Log "[$i/$($Profiles.Count)] จบเซสชัน $name ($($res.reason))"
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
