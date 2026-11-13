# 📘 PROJECT GUIDE — Stake Dice Martingale 68% (ฉบับตรงกับโค้ดปัจจุบัน 100%)

> สำหรับ AI และนักพัฒนา: ข้อมูลทั้งหมดในเอกสารนี้อ้างอิงจากโค้ดจริงที่กำลังรันอยู่  
> **โค้ดหลัก:** `stake_extension/content.js` — `BUILD_STAMP = "2026.11.11+v2.0.0-unlimited-storage"`  
> **Manifest:** `stake_extension/manifest.json` — version `2.0.0`, Manifest V3 Dual-World (MAIN + ISOLATED + unlimitedStorage)  
> **บัญชีที่รันจริง:** Profile 1 (`Anda`), Profile 3 (`nattawat`), Profile 4 (`master`)

---

## 0. TL;DR — ภาพรวมใน 3 บรรทัด
1. บอทเล่นเกม **Stake Dice** ด้วยสูตร **Martingale +73.11% (โอกาสชนะฐาน 68% · ไม้ 7+ ปรับเป็น 70%)** โดยมีเงื่อนไขรีเซ็ตคือ **ชนะติดต่อกัน 3 ตา** รีเซ็ตกลับไม้ 1 ทันที
2. สลับทิศทาง Roll Over / Under ด้วยการ **Rewrite GraphQL request (`rewriteDiceRollBody`)** ที่ระดับ Network โดยตรง (ไม่คลิก DOM)
3. รันวนรอบละ **20 นาที** ตรวจ P/L เมื่อครบเวลา และทำ **Instant Profit Lock ทันที 0ms** เมื่อยอดเป็นบวก แล้วปิด Chrome พักเบรก **3 นาที (180 วินาที)** อัตโนมัติ

---

## 1. ข้อมูลการเงินและกลยุทธ์ (Current Core Strategy)

| ค่า | การตั้งค่า | ความหมาย / สูตร |
|---|---|---|
| **โอกาสชนะ** | `NORMAL_CHANCE = "68"` | ฐานล็อก 68% (Payout ~`99/68` = **1.4559x**) · ไม้ 7+ ที่ยังติดลบ = `70%` (ข้อยกเว้นที่อนุมัติ) |
| **ยอดฐานปกติ (ไม้ 1)** | `FIXED_BASE_BET = "0.0002"` | ยอดเริ่มต้นปกติในเซสชัน (`AUTO_MIN_BET = 0.00010`) |
| **ยอดฐานพยุง (ครบเวลาแล้วติดลบ)** | ไม่มี Recovery Boost | ใช้ยอดฐานเดิม `0.0002$` พยุงต่อ ไม่เร่งยอด |
| **สูตรทบเมื่อแพ้** | `MARTINGALE_PCT = 73.11` | ยอดถัดไป = ยอดก่อนหน้า × 1.7311 (`mStep++`) |
| **เงื่อนไขรีเซ็ต** | `MARTINGALE_RESET_WINS = 3` | ชนะติด 3 ตา รีเซ็ตกลับไม้ 1 ทันที |
| **การสลับด้าน** | `configAlternateRoll = true` | สลับ Under (`below 68.00`) / Over (`above 32.00`) อัตโนมัติ (ที่ 70% → Over `above 30.00`) |
| **รอบเวลาเล่น** | 20 นาที | มีระบบ Instant Profit Lock ตัดจบทันทีเมื่อบวก |
| **รอบเวลาพัก** | 3 นาที (180 วินาที) | ปิดหน้าต่าง Chrome คืนแรมให้ระบบ |

> ⚠️ **หมายเหตุคณิตศาสตร์ (สำคัญ — ห้ามมองข้าม):** ที่โอกาสชนะ **68%** (payout `99/68` = **1.4559x**) การกู้คืนไม้ที่เสียไปแล้วต้องทบเป็น **`2.194x`** และที่ **70%** (payout **1.4143x**) ต้องทบ **`2.414x`** — แต่โค้ดใช้ **`1.7311x (+73.11%)`** แปลว่าชนะกลับมาได้คืนเพียง ~79% ของไม้ที่เสีย บันไดจึงไต่ลึกขึ้นเรื่อยๆ
>
> ค่าคาดหวัง (EV) ของทุกไม้ยังติดลบ **≈ −1% ของยอดเดิมพันรวม** (`chance × payout − 1 = −0.01`) ทั้งที่ 68% และ 70% — สูตรจัดไม้เปลี่ยนได้แค่ความแปรปรวน ไม่เปลี่ยน EV (ผลจำลอง 20,000 เซสชันตามกฎในโค้ด: median +0.5 USDT/รอบ แต่เฉลี่ย −0.10 ถึง −0.17 USDT/รอบ และหางลบ −5 ถึง −15 USDT)

---

## 2. กฎการจบเซสชัน 20 นาที (Instant Profit Lock)

เมื่อครบ 20 นาที:
1. **ตรวจยอด P/L รวมในเซสชันก่อนเสมอ:**
   - **กรณีได้กำไร ($P/L \ge 0$):** **สั่งหยุดเซสชันและล็อกกำไรทันที 0ms** โดยไม่ต้องรอไม้ 1 และไม่ต้องรอชนะติด 3 ตาเด็ดขาด
   - **กรณีขาดทุน ($P/L < 0$):** พยุงต่อด้วยยอดฐานเดิม **`0.0002$`** (ไม่มี Recovery Boost ตามกฎ Infinite Patience) และเล่นจนยอดพลิกกลับมาบวก ($P/L \ge 0$) จึงสั่ง **หยุดเซสชันและล็อกกำไรทันที 0ms** เพื่อเข้าสู่ช่วงพัก 3 นาที

---

## 3. สถาปัตยกรรมทางเทคนิค (Technical Architecture)

1. **Dual-World Architecture (MAIN + ISOLATED):**
   - ฝั่ง MAIN World (`content.js`): ยิงคำสั่ง 0ms ใน Memory ของหน้าเว็บ
   - ฝั่ง ISOLATED World (`bridge.js`): จัดการ `chrome.storage.local` ด้วยระบบ **Batching Task Queue** บันทึกเป็นกลุ่มทุก 5 วินาที หรือ 30 ไม้ เพื่อลด Disk I/O ลง 96%
2. **Stealth Native Storage:**
   - พรางชื่อคีย์เป็น `_st_view_prefs_v2` ใน `window.localStorage` ไร้คำว่า bot หรือ martingale
3. **Human Jitter & Micro-Break:**
   - สุ่มหน่วงเวลา 120ms – 280ms พร้อมพักสายตา 1.8s – 3.2s ทุก 35–55 ไม้ ป้องกันการตรวจจับจาก AI
4. **Network Watchdog:**
   - เฝ้าระวัง 15 วินาที หากเน็ตหลุดหรือเว็บค้าง จะเซฟ State แล้ว Auto-Reload กลับมาเล่นต่ออัตโนมัติ
5. **Unified Resource Cleanup (Teardown):**
   - ฟังก์ชัน `teardownSessionResources()` ทำการล้าง Timers ทั้งหมด
   - ปลดล็อก Web Audio API Keep-Alive และ Screen WakeLock API
   - ถอน Event Listeners ผ่าน `AbortController` เมื่อปิดแท็บหรือจบเซสชัน

---

## 21. AUTO-INDEX (สร้างโดย `tools/gen-index.cjs` — ห้ามแก้ด้วยมือ)

ตารางนี้สร้างจาก `stake_extension/content.js` โดยตรง · รัน `node tools/gen-index.cjs` หลังแพตช์ทุกครั้ง
จะอัปเดตเลขบรรทัดทุกจุดในคู่มือ + ตารางนี้ + ตรวจว่า 3 สำเนามีฟังก์ชันตรงกัน

<!-- AUTO-INDEX:START -->
| # | ฟังก์ชัน | บรรทัด |
|---|---|---|
| 1  `findRollObject` | 33 |
| 2  `findBalanceValue` | 57 |
| 3  `handlePossibleRollData` | 91 |
| 4  `rewriteDiceRollBody` | 113 |
| 5  `scanForAccountName` | 162 |
| 6  `maybeCaptureAccount` | 187 |
| 7  `setAccountNameManually` | 198 |
| 8  `syncAccountBadge` | 207 |
| 9  `log` | 313 |
| 10  `applyEcoStyles` | 322 |
| 11  `getEffectiveChance` | 361 |
| 12  `syncChanceBoostState` | 364 |
| 13  `generateDynamicTarget` | 430 |
| 14  `trackRollValue` | 467 |
| 15  `getSurvivalProbabilityText` | 476 |
| 16  `getBetRateText` | 482 |
| 17  `sendStatToBridge` | 510 |
| 18  `clearAllBotHistory` | 667 |
| 19  `startNetworkWatchdog` | 744 |
| 20  `stopNetworkWatchdog` | 770 |
| 21  `runPerformanceSelfHealing` | 791 |
| 22  `teardownSessionResources` | 812 |
| 23  `startAudioKeepAliveNode` | 875 |
| 24  `stopAudioKeepAliveNode` | 897 |
| 25  `enableAudioKeepAlive` | 909 |
| 26  `requestScreenWakeLock` | 929 |
| 27  `clearTimers` | 941 |
| 28  `parseBalanceElement` | 960 |
| 29  `getBalance` | 986 |
| 30  `openManualTab` | 1039 |
| 31  `ensureManualTab` | 1053 |
| 32  `setInput` | 1057 |
| 33  `getBetButton` | 1128 |
| 34  `getGamePanel` | 1167 |
| 35  `isElUsable` | 1186 |
| 36  `isNotAmountField` | 1197 |
| 37  `numberInputsIn` | 1205 |
| 38  `resolveChanceInput` | 1220 |
| 39  `resolveAmountInput` | 1238 |
| 40  `resolveBetButton` | 1277 |
| 41  `probeDomHealth` | 1304 |
| 42  `stAdd` | 1328 |
| 43  `runSelfTest` | 1332 |
| 44  `domTestIdSignature` | 1420 |
| 45  `domFingerprintReport` | 1438 |
| 46  `checkDomDrift` | 1453 |
| 47  `domStrategyNote` | 1484 |
| 48  `writeVerified` | 1493 |
| 49  `amountCandidates` | 1512 |
| 50  `learnAmountInput` | 1535 |
| 51  `learnChanceInput` | 1549 |
| 52  `betButtonCandidates` | 1568 |
| 53  `learnBetButton` | 1606 |
| 54  `rotateBetButton` | 1614 |
| 55  `isBetButtonReady` | 1625 |
| 56  `clickBetButton` | 1632 |
| 57  `getBaseBet` | 1642 |
| 58  `formatBetAmount` | 1648 |
| 59  `calculateCurrentBetAmount` | 1656 |
| 60  `registerBalanceSync` | 1678 |
| 61  `registerBalanceMismatch` | 1689 |
| 62  `refreshBetLimits` | 1716 |
| 63  `effectiveMinBet` | 1733 |
| 64  `trackRngRoll` | 1747 |
| 65  `erfc` | 1754 |
| 66  `normalCdf` | 1763 |
| 67  `gammaLower` | 1767 |
| 68  `gammaIncompleteUpper` | 1779 |
| 69  `lnGamma` | 1801 |
| 70  `chiSquareP` | 1813 |
| 71  `rngBits` | 1818 |
| 72  `nistMonobit` | 1823 |
| 73  `nistBlockFrequency` | 1831 |
| 74  `nistRuns` | 1846 |
| 75  `nistLongestRun` | 1860 |
| 76  `nistCusum` | 1884 |
| 77  `nistApEn` | 1907 |
| 78  `nistDFT` | 1926 |
| 79  `nistSerial` | 1952 |
| 80  `nistMatrixRank` | 1977 |
| 81  `poissonPmf` | 2013 |
| 82  `nistNonOverlappingTemplate` | 2020 |
| 83  `nistOverlappingTemplate` | 2062 |
| 84  `nistUniversal` | 2096 |
| 85  `berlekampMassey` | 2127 |
| 86  `nistLinearComplexity` | 2145 |
| 87  `rngWalk` | 2186 |
| 88  `nistRandomExcursions` | 2203 |
| 89  `nistRandomExcursionsVariant` | 2227 |
| 90  `runRngAudit` | 2245 |
| 91  `isAmountApplied` | 2281 |
| 92  `applyRollSide` | 2292 |
| 93  `snapshotScroll` | 2310 |
| 94  `restoreScroll` | 2326 |
| 95  `applyBetSettings` | 2347 |
| 96  `ledgerRecord` | 2364 |
| 97  `ledgerSummaryByStep` | 2395 |
| 98  `ledgerSummary` | 2407 |
| 99  `copyLedger` | 2423 |
| 100  `initTabGuard` | 2443 |
| 101  `peerIsRunning` | 2471 |
| 102  `broadcastTabState` | 2475 |
| 103  `sniffBetLimits` | 2488 |
| 104  `initAutoStartSequence` | 2530 |
| 105  `cancelAutoStart` | 2605 |
| 106  `toggleAutoStart` | 2616 |
| 107  `getHumanJitterDelay` | 2636 |
| 108  `scheduleNextBet` | 2647 |
| 109  `handleTakeProfitHit` | 2665 |
| 110  `effectiveProfitTarget` | 2702 |
| 111  `syncTargetModeBadge` | 2709 |
| 112  `toggleTargetMode` | 2721 |
| 113  `executeNextBet` | 2733 |
| 114  `getLatestBadgeInfo` | 2849 |
| 115  `isGreenRgb` | 2866 |
| 116  `isBadgeWinning` | 2878 |
| 117  `waitForBetCompletion` | 2908 |
| 118  `applyBetBalance` | 3082 |
| 119  `handleBetResult` | 3123 |
| 120  `findInstantBetLabel` | 3270 |
| 121  `readToggleState` | 3290 |
| 122  `dicePageUrl` | 3317 |
| 123  `isOnDicePage` | 3327 |
| 124  `goToDicePage` | 3335 |
| 125  `isAuthPage` | 3352 |
| 126  `maybeAutoGoDice` | 3362 |
| 127  `syncAutoGoDiceBadge` | 3375 |
| 128  `ensureInstantBet` | 3383 |
| 129  `stopSessionTimer` | 3457 |
| 130  `startSessionTimer` | 3473 |
| 131  `enterRecoveryHold` | 3509 |
| 132  `stopRecoveryHold` | 3517 |
| 133  `publishRecoveryHold` | 3527 |
| 134  `syncSessionTimeBadge` | 3542 |
| 135  `cycleSessionTimeLimit` | 3549 |
| 136  `buildSessionSummary` | 3556 |
| 137  `copySummaryToClipboard` | 3577 |
| 138  `startSession` | 3591 |
| 139  `deriveStopCode` | 3689 |
| 140  `buildDoneTitle` | 3707 |
| 141  `stopSession` | 3729 |
| 142  `setSafeText` | 3813 |
| 143  `setSafeStyle` | 3817 |
| 144  `formatNumber` | 3821 |
| 145  `flashHudAlert` | 3829 |
| 146  `updateStatusText` | 3849 |
| 147  `syncHUDInputs` | 3856 |
| 148  `updateUI` | 3865 |
| 149  `performUIUpdate` | 3877 |
| 150  `createStealthPanel` | 4123 |
| 151  `toggleEcoMode` | 4512 |
| 152  `setMinimizePanel` | 4521 |
| 153  `toggleMinimizePanel` | 4539 |
| 154  `makeDraggable` | 4543 |
| 155  `init` | 4578 |
<!-- AUTO-INDEX:END -->
