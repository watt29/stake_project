# 📘 PROJECT GUIDE — Stake Dice Martingale 68% (ฉบับตรงกับโค้ดปัจจุบัน 100%)

> สำหรับ AI และนักพัฒนา: ข้อมูลทั้งหมดในเอกสารนี้อ้างอิงจากโค้ดจริงที่กำลังรันอยู่  
> **โค้ดหลัก:** `stake_extension/content.js` — `BUILD_STAMP = "2026.11.11+v2.0.0-unlimited-storage"`  
> **Manifest:** `stake_extension/manifest.json` — version `2.0.0`, Manifest V3 Dual-World (MAIN + ISOLATED + unlimitedStorage)  
> **บัญชีที่รันจริง:** Profile 1 (`Anda`), Profile 3 (`nattawat`), Profile 4 (`master`)

---

## 0. TL;DR — ภาพรวมใน 3 บรรทัด
1. บอทเล่นเกม **Stake Dice** ด้วยสูตร **Martingale +73.12% (โอกาสชนะฐาน 68% · ไม้ 7+ ปรับเป็น 70%)** โดยมีเงื่อนไขรีเซ็ตคือ **ชนะติดต่อกัน 3 ตา** รีเซ็ตกลับไม้ 1 ทันที
2. สลับทิศทาง Roll Over / Under ด้วยการ **Rewrite GraphQL request (`rewriteDiceRollBody`)** ที่ระดับ Network โดยตรง (ไม่คลิก DOM)
3. รันวนรอบละ **20 นาที** ตรวจ P/L เมื่อครบเวลา และทำ **Instant Profit Lock ทันที 0ms** เมื่อยอดเป็นบวก แล้วปิด Chrome พักเบรก **3 นาที (180 วินาที)** อัตโนมัติ

---

## 1. ข้อมูลการเงินและกลยุทธ์ (Current Core Strategy)

| ค่า | การตั้งค่า | ความหมาย / สูตร |
|---|---|---|
| **โอกาสชนะ** | `NORMAL_CHANCE = "68"` | ฐานล็อก 68% (Payout ~`99/68` = **1.4559x**) · ไม้ 7+ ที่ยังติดลบ = `70%` (ข้อยกเว้นที่อนุมัติ) |
| **ยอดฐานปกติ (ไม้ 1)** | `FIXED_BASE_BET = "0.00015"` | ยอดเริ่มต้นปกติในเซสชัน (`AUTO_MIN_BET = 0.00010`) |
| **ยอดฐานพยุง (ครบเวลาแล้วติดลบ)** | ไม่มี Recovery Boost | ใช้ยอดฐานเดิม `0.00015$` พยุงต่อ ไม่เร่งยอด |
| **สูตรทบเมื่อแพ้** | `MARTINGALE_PCT = 73.12` | ยอดถัดไป = ยอดก่อนหน้า × 1.7312 (`mStep++`) |
| **เงื่อนไขรีเซ็ต** | `MARTINGALE_RESET_WINS = 3` | ชนะติด 3 ตา รีเซ็ตกลับไม้ 1 ทันที |
| **การสลับด้าน** | `configAlternateRoll = true` | สลับ Under (`below 68.00`) / Over (`above 32.00`) อัตโนมัติ (ที่ 70% → Over `above 30.00`) |
| **รอบเวลาเล่น** | 20 นาที | มีระบบ Instant Profit Lock ตัดจบทันทีเมื่อบวก |
| **รอบเวลาพัก** | 3 นาที (180 วินาที) | ปิดหน้าต่าง Chrome คืนแรมให้ระบบ |

> ⚠️ **หมายเหตุคณิตศาสตร์ (สำคัญ — ห้ามมองข้าม):** ที่โอกาสชนะ **68%** (payout `99/68` = **1.4559x**) การกู้คืนไม้ที่เสียไปแล้วต้องทบเป็น **`2.194x`** และที่ **70%** (payout **1.4143x**) ต้องทบ **`2.414x`** — แต่โค้ดใช้ **`1.7312x (+73.12%)`** แปลว่าชนะกลับมาได้คืนเพียง ~79% ของไม้ที่เสีย บันไดจึงไต่ลึกขึ้นเรื่อยๆ
>
> ค่าคาดหวัง (EV) ของทุกไม้ยังติดลบ **≈ −1% ของยอดเดิมพันรวม** (`chance × payout − 1 = −0.01`) ทั้งที่ 68% และ 70% — สูตรจัดไม้เปลี่ยนได้แค่ความแปรปรวน ไม่เปลี่ยน EV (ผลจำลอง 20,000 เซสชันตามกฎในโค้ด: median +0.5 USDT/รอบ แต่เฉลี่ย −0.10 ถึง −0.17 USDT/รอบ และหางลบ −5 ถึง −15 USDT)

---

## 2. กฎการจบเซสชัน 20 นาที (Instant Profit Lock)

เมื่อครบ 20 นาที:
1. **ตรวจยอด P/L รวมในเซสชันก่อนเสมอ:**
   - **กรณีได้กำไร ($P/L \ge 0$):** **สั่งหยุดเซสชันและล็อกกำไรทันที 0ms** โดยไม่ต้องรอไม้ 1 และไม่ต้องรอชนะติด 3 ตาเด็ดขาด
   - **กรณีขาดทุน ($P/L < 0$):** พยุงต่อด้วยยอดฐานเดิม **`0.00015$`** (ไม่มี Recovery Boost ตามกฎ Infinite Patience) และเล่นจนยอดพลิกกลับมาบวก ($P/L \ge 0$) จึงสั่ง **หยุดเซสชันและล็อกกำไรทันที 0ms** เพื่อเข้าสู่ช่วงพัก 3 นาที

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
| 1  `setValue` | 46 |
| 2  `isButtonDisabled` | 55 |
| 3  `autoBetButton` | 59 |
| 4  `isAutoBetRunning` | 69 |
| 5  `panelRoot` | 81 |
| 6  `findAdvancedTab` | 92 |
| 7  `findAmountInput` | 100 |
| 8  `findLimitInput` | 107 |
| 9  `isTabActive` | 112 |
| 10  `clickTab` | 121 |
| 11  `ensureAdvancedOpen` | 133 |
| 12  `findChanceInput` | 164 |
| 13  `applyChance` | 185 |
| 14  `applyAmount` | 201 |
| 15  `startAutoBet` | 222 |
| 16  `stopAutoBet` | 245 |
| 17  `balance` | 253 |
| 18  `isDicePage` | 260 |
| 19  `armNow` | 273 |
| 20  `scheduleAutoStart` | 298 |
| 21  `tryAutoStart` | 304 |
| 22  `tick` | 331 |
| 23  `pushLog` | 372 |
| 24  `fmtPnl` | 377 |
| 25  `stateLine` | 379 |
| 26  `elapsedText` | 386 |
| 27  `clampPos` | 392 |
| 28  `placePanel` | 400 |
| 29  `loadPos` | 408 |
| 30  `savePos` | 416 |
| 31  `setText` | 421 |
| 32  `fillConfigInputs` | 428 |
| 33  `buildUI` | 436 |
| 34  `bindDrag` | 491 |
| 35  `toggleCollapse` | 535 |
| 36  `cancelAutoStart` | 544 |
| 37  `bindButtons` | 550 |
| 38  `render` | 580 |
| 39  `boot` | 602 |
<!-- AUTO-INDEX:END -->
