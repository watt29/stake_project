# 🤖 AI Agent Guidelines & Architecture Standards (Stake Dice Bot)
> เอกสารแนวปฏิบัติและสถาปัตยกรรมบังคับสำหรับ AI ทุกตัว (Antigravity, Claude, Cursor, Copilot) ที่เข้ามารับช่วงต่อในโปรเจกต์นี้

---

## 🚨 กฎเหล็กสูงสุดที่ห้ามฝ่าฝืนเด็ดขาด (CRITICAL INVARIANTS)

### 🛡️ กฎข้อที่ 0: โอกาสชนะฐาน 68% และข้อยกเว้น Step 7+ (70%) / Step 9+ (72%) แบบคงอัตราทบ +73.11%
> **🚨 บทเรียนราคาแพง (Incident 2026-11-12):**
> โค้ดเดิมเคยมีระบบ `Adaptive 72% Guard` ที่ปรับตัวคูณ Martingale ขึ้นเป็น +88.89% ต่อไม้ ทำให้ไม้ทบไต่ไปถึงไม้ 23 (-27.35 USDT) จนล้างพอร์ต
> 
> **คำสั่งล่าสุดที่ผู้ใช้อนุมัติ (v2.4.12):**
> - **โอกาสชนะฐานต้องล็อกที่ 68% (`NORMAL_CHANCE = "68"`)** และ**คงอัตราทบ Martingale เดิม `+73.11%/ไม้` ตลอดเวลา ห้ามปรับตัวคูณขึ้นเกิน +73.11% เด็ดขาด!**
> - **ไม้ที่ 7–8 (`mStep >= 7`):** เพิ่มโอกาสชนะเป็น **`70%`** (Under `70.00` / Over `30.00`)
> - **ไม้ที่ 9 ขึ้นไป (`mStep >= 9`):** หากยังไม่รีเซ็ต ให้เพิ่มโอกาสชนะเป็น **`72%`** (Under `72.00` / Over `28.00`)
> - **การกลับสู่ฐาน:** เมื่อออกจากไม้ลึก (`mStep < 7`) และกำไรเซสชันกลับมาเป็นบวก ($P/L \ge 0$) ให้สลับกลับสู่ **`68%`** ตามเดิม

---

## 1. เสาหลักสถาปัตยกรรมวิศวกรรมระดับสูง (Manifest V3 Core Pillars)

### 1.1 ความเร็วสูงสุด (Fast & 0ms Latency) ⚡
* **ฝังตัวใน MAIN World ตั้งแต่ `document_start`:**
  * กำหนด `"world": "MAIN"` และ `"run_at": "document_start"` ใน `manifest.json` เพื่อดักจับ `window.fetch` และ `Response.prototype.json` ใน Execution Context เดียวกับหน้าเว็บโดยตรงตั้งแต่วินาทีแรกก่อน DOM ถูกสร้างขึ้น
* **ตัด Overhead ของการส่ง Message (Zero-Latency):**
  * ประมวลผลและ Rewrite คำขอ GraphQL ใน Memory ได้ทันที โดยไม่ใช้ `window.postMessage` หรือ `chrome.runtime.sendMessage` สื่อสารข้าม Context ซึ่งสร้างความล่าช้า (Latency) หรือเสี่ยงต่อ Race Condition
* **อ่านข้อมูลด้วย `response.clone()`:**
  * ดึงผลลัพธ์การเดิมพันจาก Response โดยใช้ `.clone()` เพื่อไม่ให้กระทบหรือชะลอ Stream หลักของหน้าเว็บ

### 1.2 ความแม่นยำสูง (High Precision & Accuracy) 🎯
* **Direct GraphQL Rewrite:**
  * ดักจับคำขอ `mutation DiceRoll` และปรับแก้ไขค่า Payload ในคำขอเดิมพันโดยตรง (`rewriteDiceRollBody`) ก่อนคำขอถูกส่งไปยังเซิร์ฟเวอร์ (สลับ Over/Under: Condition `"above"` 32.00 / `"below"` 68.00) ห้ามคลิกปุ่ม DOM
* **State Recovery ป้องกันนับไม้ผิด (Stealth Storage):**
  * เมื่อหน้าเว็บถูกรีเฟรชหรือระบบถูกตัดรอบ สคริปต์จะดึงสถานะล่าสุดจาก Native Web Storage ผ่านคีย์พรางตา (`_st_view_prefs_v2`) มาทำไม้แก้ตัวต่อได้อย่างแม่นยำ โดยไม่เริ่มนับไม้ 1 ใหม่ให้เสียทุน และป้องกัน Web Telemetry / Anti-cheat ตรวจจับชื่อคีย์บอท
* **Bridge & Batching Queue เก็บสถิติระยะยาว:**
  * ส่งข้อมูลสถิติจาก MAIN World (`content.js`) ผ่าน `window.postMessage` ไปยัง ISOLATED World (`bridge.js`) เพื่อรวบรวมลงในหน่วยความจำ (Buffer Queue) และบันทึกลง `chrome.storage.local` แบบเป็นกลุ่ม (Batch) ทุก 5 วินาที หรือ 30 ไม้ เพื่อลดภาระ Chrome I/O และป้องกัน Race Condition
* **Human Jitter & Micro-Break (พรางพฤติกรรมมนุษย์ & Turbo Mode):**
  * สุ่มหน่วงเวลาระหว่างไม้ 60ms - 100ms แบบ Cryptographic Random (ความเร็วสูง เร่งขึ้น 2 เท่า ปลอดภัยสูงสุด)
  * พักสายตาสั้นๆ 0.8s ทุกๆ 60 - 80 ไม้ ป้องกันระบบ AI วิเคราะห์จับเป็นบอท
  * บังคับเปิด Instant Bet และโหมด ECO ตัดแอนิเมชันกราฟิกลูกเต๋า 100% ไร้โหลด CPU/GPU
* **Network Watchdog (เฝ้าระวังเน็ตหลุด/เซิร์ฟเวอร์ค้าง):**
  * หากส่งคำขอเดิมพันแล้วไม่ได้รับผลตอบกลับเกิน 15 วินาที ระบบจะบันทึก State ลง Stealth Storage อัตโนมัติและสั่งรีเฟรชหน้าเว็บ (F5) กู้คืนไม้เดิมต่อทันที ไม่ปล่อยให้หน้าค้าง

### 1.3 ความเสถียรและไร้ Error (Maximum Stability & Zero Invalidated Context Errors) 🛡️
* **ใช้ `window.localStorage` แทน `chrome.storage` ใน MAIN World:**
  * สคริปต์ที่รันใน MAIN World ไม่สามารถเข้าถึง `chrome.*` APIs ได้ การใช้ `window.localStorage` และ `sessionStorage` ของ DOM จึงช่วยป้องกันปัญหา `Uncaught Error: Extension context invalidated` ได้ 100% แม้มีการ Reload หรืออัปเดตส่วนขยาย
* **การทำความสะอาดทรัพยากร (Teardown & Cleanup):**
  * ล้าง `setInterval` / `setTimeout` ด้วย `clearInterval` / `clearTimeout`
  * ถอน Event Listeners ออกด้วย `AbortController` เมื่อจบงาน
  * ปลดล็อก `AudioContext` และ `screenWakeLock` ทันทีบน `stopSession()`, `pagehide`, และ `beforeunload` เพื่อป้องกัน Memory Leak และโค้ดค้างรัน
* **Instant Profit Lock คุมการตัดรอบ (0ms):**
  * เมื่อครบเวลาจำกัด 20 นาที ระบบจะตรวจ P/L ก่อนเสมอ และทันทีที่ยอดเงินเฉพาะเซสชันนั้นพลิกกลับมาเป็นบวก ($P/L \ge 0$) ให้สั่ง **หยุดเซสชันและล็อกกำไรทันที 0ms**

---

## 2. กฎกลยุทธ์และการเงิน (Current Standards v2.4.0 - Pure 68% Locked & Turbo 60-100ms & Instant Bet Zero-Animation)

* **การตั้งค่ากลยุทธ์หลัก (Pure 68% Safe Base):**
  * โอกาสชนะล็อกคงที่: **68%** (Payout 1.4559x, กำไรสุทธิ +45.59% ต่อการชนะ)
  * **ยอดฐานเดียวนิ่งสนิท (Single Invariant Base Bet):** **`0.0002$`** USDT ตลอดเวลา
    * ❌ **ถอดระบบ Recovery Boost ออก 100%:** ไม่มีการเร่งยอดเงินหลัง 20 นาทีเด็ดขาด ป้องกันพอร์ตแตก
    * เมื่อครบ 20 นาทีแล้วยังติดลบ ให้ใช้ยอดฐานเดิม **`0.0002$`** พยุงเล่นต่ออย่างใจเย็น
  * **สูตรทบไม้ Martingale (ที่ 68%):**
    * อัตราทบไม้เมื่อแพ้: **`+73.11%` ต่อไม้** (ตัวคูณ $\approx 1.7311\text{x}$)
    * ชนะติด 3 ตา (`currentStreak >= 3`) หรือชนะตามแผน รีเซ็ตกลับไม้ 1 ทันที
* **เป้าหมายกำไรต่อเซสชัน (Dynamic Random Target 0.35 – 0.65 USDT):**
  * โหมดเป้าหมายเริ่มต้น: **`🎯 USD`** (สุ่ม Dynamic ทุกรอบ พรางพฤติกรรม)
  * เป้าหมายกำไรต่อรอบ: **สุ่ม `0.35 – 0.65 USDT`** (สำหรับพอร์ตเล็ก < 3 USDT ปรับเพดานเซฟไม่เกิน 20% - 25% ของทุน: ยอดเงินน้อย กำไรน้อย)
  * **กลไกการตัดจบ (Instant Exit 0ms):** เมื่อกำไรในรอบนั้นแตะ **$\ge$ ค่าที่สุ่มได้** บอทจะหยุดเซสชันทันที ส่งสัญญาณ `STAKE_DONE|R=WIN|P=...` ให้ PowerShell ปิด Chrome และหมุนไปบัญชีถัดไปทันที **โดยไม่ต้องรอให้ครบ 20 นาที**
* **เวลาเซสชันสูงสุด (กรณีไม่ถึงเป้า):**
  * เล่นรอบละไม่เกิน **20 นาที** และพักเบรกคูลดาวน์ **3 นาที (180 วินาที)**
* **ขอบเขตการคำนวณ P/L:**
  * คำนวณเฉพาะ **Session P/L ของรอบนั้นๆ (`domBal - startBalance`) ไม่เหมารวมรอบก่อนหน้าหรือทั้งวันเด็ดขาด**

---

## 3. ลำดับขั้นตอน Instant Profit Lock & Safe Exit เมื่อครบ 20 นาที

1. **เริ่มแรกก่อนปิด:** ตรวจการขาดทุนในเซสชัน (`effectiveProfit = Math.max(profit, domBal - startBalance)`) จาก Memory และ DOM พร้อมกัน
2. **กรณีที่ 1: ยอดในเซสชันเป็นบวก ($P/L \ge 0$):**
   * ทันทีที่ยอดเงินรวมเฉพาะรอบนั้นพลิกกลับมาเป็นบวก ($P/L \ge 0$) ให้สั่ง **หยุดเซสชันทันที 0ms เพื่อล็อกกำไรเข้ากระเป๋า** โดยไม่ต้องรอไม้ 1
3. **กรณีที่ 2: ยอดในเซสชันยังขาดทุน ($P/L < 0$):**
   * **พยุงเล่นต่อด้วยยอดฐานปกติ `0.0002$` เท่าเดิม** (ห้ามเร่งยอด ห้ามกระโดดเงินเด็ดขาด)
   * เล่นพยุงจนเข้าเงื่อนไข **ข้อใดข้อหนึ่ง** ต่อไปนี้ แล้วสั่ง **หยุดเซสชันทันที 0ms**:
     * ก) ยอดเงินรวมของเซสชันพลิกกลับมาแตะแดนบวก ($P/L \ge 0$)
     * ข) บอทกู้คืนสำเร็จจนกลับมาอยู่ที่ไม้ 1 และแทงชนะได้บวก (`mStep === 1 && isWin`) หรือ ชนะติดกันครบ 3 ตา (`currentStreak >= 3`)

---

## 4. กฎสำหรับสคริปต์ PowerShell (`rotate-accounts.ps1`)

1. **การเข้ารหัสไฟล์ (BOM Encoding):**
   * ไฟล์ `.ps1` ที่มีภาษาไทย **ต้องบันทึกด้วย UTF-8 with BOM (`0xEF, 0xBB, 0xBF`) เสมอ** ป้องกัน Windows PowerShell 5.1 เกิด Error ตัวหนังสือเพี้ยน
2. **ระบบความปลอดภัย 2 ชั้น (Double-Layer Safety):**
   * ชั้นที่ 1: ตรวจจับสัญญาณ `STAKE_DONE` จาก Title ของ Chrome ผ่าน Win32 API
   * ชั้นที่ 2 (Hard Deadline): หาก Chrome ไม่ส่งสัญญาณภายใน 3 นาทีหลังครบ 20 นาที PowerShell ต้องมีคำสั่ง `break` สั่ง **บังคับปิดหน้าต่าง Chrome ทันที** ป้องกันสคริปต์ค้างเติ่งในจอดำ
3. **ระบบหมุนเวียน 6 บัญชีอัตโนมัติ (Full 6-Account Fleet):**
   * `$Profiles = @("Profile 1", "Profile 3", "Profile 4", "Profile 11", "Profile 18", "Profile 26")`
   * วนลำดับ: **Anda (`Profile 1`) ➔ nattawat (`Profile 3`) ➔ master (`Profile 4`) ➔ wut1229 (`Profile 11`) ➔ AIForge (`Profile 18`) ➔ watt28265 (`Profile 26`)**
   * ระบบสุ่มเป้าหมายกำไร (Dynamic Target) และ Fast Zero-Funds Skip รองรับทั้ง 6 บัญชีอย่างปลอดภัย 100%

---

## 5. 🛡️ มาตรการคุ้มครองพอร์ตหลากหลายขนาด (Multi-Tier Portfolio Safety)

1. **รองรับทั้ง 6 บัญชีเต็มระบบ (Active 6-Account Fleet):**
   * ครอบคลุมพอร์ตทุนเล็กและทุนใหญ่ทุกระดับ (`Anda`, `nattawat`, `master`, `wut1229`, `AIForge`, `watt28265`)
   * **พอร์ตเล็ก (< 3 USDT):** ระบบปรับลดเป้ากำไรอัตโนมัติไม่เกิน 20% ของทุน (เช่น 0.12 – 0.19 USDT) "ยอดเงินน้อย กำไรน้อย" ถึงเป้าแล้วรีบตัดจบล็อกกำไรหนีทันที
   * **Fast Zero-Funds Skip:** หากบัญชีใดเงินไม่พอหรือเป็น 0 USDT บอทจะส่งสัญญาณข้ามไปบัญชีถัดไปอัตโนมัติภายใน 5 วินาที ไม่ปล่อยให้ค้างเติ่ง

---

## 6. 📦 กฎเหล็กการแก้ไขโค้ด: Versioning & Automated Backup SOP (บังคับ AI ทุกตัว 100%)

> **🚨 ข้อบังคับสูงสุดสำหรับ AI ทุกตัว (Antigravity, Claude, Cursor, Copilot, ChatGPT) ที่เข้ามาแก้ไขโปรเจกต์นี้:**
> **ห้ามแก้ไขไฟล์โค้ดแล้วจบงานโดยไม่มีการสร้างเวอร์ชันและแบ็กอัปเด็ดขาด** ทุกครั้งที่มีการแก้ไข ปรับปรุง หรือเพิ่มฟังก์ชันใหม่ AI จะต้องปฏิบัติตาม 3 ขั้นตอนนี้ทันที:

1. **สำรองเวอร์ชันก่อนหน้า (Automated Snapshot Backup):**
   * รันคำสั่งสำรองไฟล์ไปยังโฟลเดอร์ `backups/` ทันที:
     ```powershell
     powershell -ExecutionPolicy Bypass -File ..\tools\backup-version.ps1
     ```
2. **ปรับเลขเวอร์ชันเสมอ (Semantic Version Bump):**
   * อัปเกรดเลขเวอร์ชันใน `manifest.json` ทุกครั้งที่มีการแก้โค้ด (เช่น `2.3.2` ➔ `2.3.3`)
   * ตรวจสอบว่า Build Stamp / Version ใน `content.js` แสดงผลตรงกัน
3. **ตรวจสอบความถูกต้องก่อนส่งมอบ (Syntax & Integrity Check):**
   * ต้องรันคำสั่งตรวจสอบ Syntax เสมอ:
     ```powershell
     node -c "content.js"
     ```
   * ห้ามส่งมอบงานที่มี Syntax Error หรือทำให้บอทค้างเด็ดขาด

---

## 7. ⏱️ มาตรฐานการปิดเซสชันและป้องกัน Race Condition (Zero-Race Exit Standard)

1. **Title Persistence Grace Period ($\ge$ 2,500ms):**
   * เมื่อจบเซสชันใน `content.js` ต้องคงค่า `document.title` ที่มี `STAKE_DONE` ไว้อย่างน้อย **2,500 มิลลิวินาที** ก่อนส่งคำขอปิดแท็บ
2. **Background Tab Removal Delay ($\ge$ 500ms):**
   * ใน `background.js` เมื่อได้รับคำสั่ง `CLOSE_SESSION_TAB` ต้องหน่วงเวลาอย่างน้อย **500 มิลลิวินาที** ก่อนรัน `chrome.tabs.remove(tabId)`
3. **High-Frequency PowerShell Polling (100ms):**
   * ใน `rotate-accounts.ps1` (`Wait-ForSessionOrKey`) ลูปตรวจสอบ Win32 Title ต้องตั้งหน่วงเวลาไม่เกิน **100 มิลลิวินาที** (`Start-Sleep -Milliseconds 100`)

---

## 8. 🛑 กฎเหล็กห้ามตัดขาดทุน (No Forced Cut-Loss / Infinite Patience Invariant)

> **คำสั่งเด็ดขาดจากผู้ใช้: "ไม่เอา ตัดขาดทุน"**

1. **ห้ามใส่โค้ดตัดขาดทุน (No Stop-Loss):**
   * ห้าม AI ตัวใดใส่เพดาน Cut-Loss หรือบังคับหยุดขณะติดลบเด็ดขาด บอทต้องได้รับอนุญาตให้สู้ไม้แก้ตัวและกู้คืนจนยอดเซสชันกลับมาเป็นบวก ($P/L \ge 0$)
2. **ขยายเวลาพยุงใน PowerShell (`$RecoveryExtraMinutes = 40`):**
   * ใน `tools/rotate-accounts.ps1` กำหนดเวลาพยุงเพิ่มอย่างน้อย **40 นาที**
   * ตรวจจับสัญญาณ `STAKE_HOLD` ผ่าน Win32 Title หากบอทยังพยุงกู้คืนอยู่ PowerShell ห้ามปิดหน้าต่างหรือปรับแพ้เด็ดขาด
