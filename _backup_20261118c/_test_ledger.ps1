# ทดสอบ logic ledger/daily cap โดยไม่เปิด Chrome
$ErrorActionPreference = "Stop"
$failed = 0
function Check([string]$name, [bool]$cond, [string]$detail) {
  if ($cond) { Write-Host ("PASS  " + $name) -ForegroundColor Green }
  else { Write-Host ("FAIL  " + $name + "  (" + $detail + ")") -ForegroundColor Red; $script:failed++ }
}

$tmp = Join-Path $env:TEMP ("ledgertest_" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $tmp | Out-Null

# ดึงบล็อกจริงจาก rotate-accounts.ps1 มาทดสอบ (ไม่ใช้ไฟล์ fragment)
$ps1Path = Join-Path $PSScriptRoot "rotate-accounts.ps1"
$ps1Raw = Get-Content -Raw -LiteralPath $ps1Path
$sIdx = $ps1Raw.IndexOf('$ledgerCsv = Join-Path')
$eIdx = $ps1Raw.IndexOf('function Wait-ForSessionOrKey')
if ($sIdx -lt 0 -or $eIdx -lt 0 -or $eIdx -le $sIdx) { throw "ตัดบล็อกไม่ได้ s=$sIdx e=$eIdx" }
$block = $ps1Raw.Substring($sIdx, $eIdx - $sIdx)
# แทนที่บรรทัดที่พึ่ง $PSScriptRoot ด้วย path ชั่วคราว (กันเขียนทับไฟล์จริง)
$tmpCsv = Join-Path $tmp "rotate-ledger.csv"
$block = $block.Replace('$ledgerCsv = Join-Path $PSScriptRoot "rotate-ledger.csv"', ('$ledgerCsv = ' + "'" + $tmpCsv + "'"))
Invoke-Expression $block
Check "โหลดฟังก์ชันครบ" ((Get-Command Get-DailyPnl -ErrorAction SilentlyContinue) -ne $null -and $ledgerCsv -eq $tmpCsv) "ledgerCsv=$ledgerCsv"

# --- ledger ---
Init-Ledger
Check "สร้าง CSV + header" (Test-Path $ledgerCsv) "ไม่พบไฟล์"

Add-LedgerRow "Profile 1" "Anda" "P1-1" -11.2 "SESSION_MAX_LOSS"
Add-LedgerRow "Profile 1" "Anda" "P1-2" 0.42 "WIN"
Add-LedgerRow "Profile 3" "nattawat" "P3-1" -11.25345 "TIMEOUT_NO_DONE"

# ลองเขียนซ้ำด้วย session_id เดิม (ต้องไม่เกิดแถวใหม่)
Add-LedgerRow "Profile 1" "Anda" "P1-1" -99 "DUP_TEST"
Add-LedgerRow "Profile 3" "nattawat" "P3-1" -99 "DUP_TEST"

$p1 = Get-DailyPnl "Profile 1"
$p3 = Get-DailyPnl "Profile 3"
$p4 = Get-DailyPnl "Profile 4"
Check "รวม P/L Profile 1 = -10.78" ([math]::Abs($p1 - (-10.78)) -lt 1e-6) "ได้ $p1"
Check "รวม P/L Profile 3 = -11.25345" ([math]::Abs($p3 - (-11.25345)) -lt 1e-6) "ได้ $p3"
Check "Profile 4 ยังไม่มีข้อมูล = 0" ($p4 -eq 0) "ได้ $p4"

# แถวใน CSV ต้องมี 7 คอลัมน์ และตัวเลขใช้จุดทศนิยม
$rows = Import-Csv -Path $ledgerCsv
Check "จำนวนแถว = 3" ($rows.Count -eq 3) "ได้ $($rows.Count)"
Check "คอลัมน์ pnl ใช้จุด" ($rows[2].pnl -eq "-11.25345") "ได้ $($rows[2].pnl)"
Check "reason ถูกบันทึก" ($rows[2].reason -eq "TIMEOUT_NO_DONE") "ได้ $($rows[2].reason)"

# --- cap decision ---
Check "Profile 3 ถึงเพดาน -> ต้องข้าม" ((Get-DailyPnl "Profile 3") -le -$DailyLossLimit) "ไม่ถึง"
Check "Profile 1 ยังไม่ถึงเพดาน -> ต้องเล่นต่อ" (-not ((Get-DailyPnl "Profile 1") -le -$DailyLossLimit)) "โดนข้ามผิด"

# --- parse title ---
$t1 = "STAKE_DONE|R=WIN|P=0.42000|S=3|D=2026-11-04 :: Anda (ถึงเป้ากำไร)"
$a = Parse-DoneTitle $t1
Check "parse WIN" ($a.ok -and $a.code -eq "WIN" -and [math]::Abs($a.pnl - 0.42) -lt 1e-9 -and $a.step -eq 3) "ได้ $($a | Out-String)"

$t2 = "STAKE_DONE|R=LADDER_EXHAUSTED|P=-11.25345|S=22|D=2026-11-04 :: Anda (แพ้ครบ)"
$b = Parse-DoneTitle $t2
Check "parse ติดลบ" ($b.ok -and $b.code -eq "LADDER_EXHAUSTED" -and [math]::Abs($b.pnl - (-11.25345)) -lt 1e-9) "ได้ $($b | Out-String)"

$t3 = "ครบเวลาเพดานเซสชัน (Auto-Switch)"
$c = Parse-DoneTitle $t3
Check "ไม่มี STAKE_DONE -> ok=false (นับเป็น UNKNOWN)" (-not $c.ok) "ได้ ok=$($c.ok)"

# title ยาว (ชื่อบัญชี + ข้อความไทย) ต้องยัง parse ได้
$t4 = ("STAKE_DONE|R=SESSION_MAX_LOSS|P=-11.25000|S=22|D=2026-11-04 :: " + ("x" * 200))
$d = Parse-DoneTitle $t4
Check "parse title ยาว" ($d.ok -and $d.code -eq "SESSION_MAX_LOSS") "ได้ ok=$($d.ok)"

Remove-Item -Recurse -Force $tmp
if ($failed -eq 0) { Write-Host "`nผล: ผ่านทั้งหมด" -ForegroundColor Green; exit 0 }
else { Write-Host "`nผล: ล้มเหลว $failed" -ForegroundColor Red; exit 1 }
