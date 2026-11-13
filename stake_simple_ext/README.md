# Stake Dice Autopilot (Simple) — v3.7.0

Chrome MV3 content script สำหรับหน้า Stake Dice — ใช้ **Auto Bet ของเว็บเอง** ไม่คำนวณ martingale เอง
ทำหน้าที่แค่: กดแท็บ *อัตโนมัติ* → กดแท็บ *ขั้นสูง* → ใส่ยอด + โอกาสชนะ → กดปุ่ม Auto Bet → หยุดเมื่อถึงเป้า

- แตะเฉพาะ DOM (`querySelector` / `click` / `input event`) — **ไม่มีการเรียก API, ไม่มี `fetch`/XHR, ไม่มี permission พิเศษ**
- ทำงานที่ `document_idle`, world `ISOLATED`
- โดเมนที่รัน: `stake.com`, `stake.us`, `stake.bet`, `stake.jp`, `stake.ee`, `stake.bz` (`stake-dice` path)

---

## ค่าที่ใช้อยู่ (v3.7.0)

| ค่า | ที่มา | ค่า |
|---|---|---|
| ยอดเดิมพันต่อไม้ | `baseAmount` | **0.0005** |
| โอกาสชนะ | `chance` | **67 %** (payout ≈ 1.4776x) |
| เป้ากำไร | `target` | **0.35** |
| จำนวนไม้ | `limitBets` | **0** (ไม่จำกัด) |
| เริ่มอัตโนมัติหลังโหลดหน้า | `AUTO_START_DELAY` | **5,000 ms** |
| ลองใหม่ถ้าหน้ายังไม่พร้อม | `AUTO_START_RETRY` | **2,000 ms** |
| รอบตรวจสถานะ | `TICK_MS` | **1,200 ms** |
| ระยะกันกดรัว | `CLICK_COOLDOWN` | **3,500 ms** |
| auto-start เปิดอยู่ | `AUTO_START` | **true** |

แก้ค่าเหล่านี้ได้ที่ต้นไฟล์ `content.js` (บรรทัด ~9–22) หรือแก้ในช่องบนแผงก่อนกด **Arm**

---

## โหลด / รีโหลด extension (Chrome)

1. เปิด `chrome://extensions`
2. เปิด **โหมดนักพัฒนา / Developer mode** (มุมขวาบน)
3. **ติดตั้งครั้งแรก**: กด **Load unpacked** → เลือกโฟลเดอร์ `D:\script stake\stake_simple_ext`
   **อัปเดตโค้ด**: กดปุ่ม **↻** ที่การ์ด แล้วรอ ~2 วินาที
4. เปิดแท็บใหม่ไปที่หน้า Dice: `https://stake.com/th/casino/games/stake-dice`
5. กด **Ctrl+Shift+R** (hard reload) ถ้าแผงยังไม่ขึ้น

### ตรวจว่าโหลดเวอร์ชันถูก
มุมขวาบนของหน้าจะมีแผง **Autopilot v3.7.0** — ตัวเลขนี้ต้องตรงกับ `manifest.json`
ถ้าเลขไม่ตรง = Chrome ยังโหลดโค้ดเก่า ให้กด ↻ (หรือ Remove → Load unpacked ใหม่)

---

## วิธีใช้

1. เปิดหน้า Dice แล้วปล่อยไว้ — ครบ 5 วิ จะเริ่มเอง (ปุ่มจะเปลี่ยนเป็น "หยุด")
2. ดูแถวสถานะบนแผง: `เปิดแล้ว` (แท็บขั้นสูง) / `เจอ` (ช่องโอกาสชนะ) / `ARM` หรือ `RUN`
3. **หยุดฉุกเฉิน** = ปุ่มแดงบนแผง (จะหยุด Auto Bet บนเว็บ + ปิด auto-start)
4. **Dump** = โยนรายการปุ่ม/ช่องบนหน้าเว็บลง Console (`F12`) ไว้ส่งให้ผมไล่บั๊ก

---

## อาการที่เจอบ่อย

| อาการ | สาเหตุ / วิธีแก้ |
|---|---|
| ไม่มีแผงขึ้นเลย | extension ไม่ได้โหลด / ยังไม่ได้กด ↻ / ยังไม่ hard reload |
| แผงขึ้นแต่เลขไม่ใช่ v3.7.0 | Chrome ยังรันโค้ดเก่า → ↻ ที่การ์ด |
| "ปุ่ม Auto Bet ถูกปิด (disabled)" | Stake ปิดปุ่มเอง — เช็กยอดเงินคงเหลือ/จำนวนไม้ หรือยังไม่ล็อกอิน |
| "รอหน้า Dice…" | ยังไม่อยู่หน้า Dice หรือหน้าโหลดไม่เสร็จ (ลองใหม่ทุก 2 วิ) |
| กดเริ่มแล้วไม่วิ่ง | ดู log 6 บรรทัดในแผง + Console `[autopilot]` |

---

## Backup / เวอร์ชัน

- สำรองก่อนแก้ทุกครั้ง: `powershell -ExecutionPolicy Bypass -File tools\backup-version.ps1` → `backups\v<version>_<timestamp>\`
- ตรวจ syntax: `node --check stake_simple_ext/content.js`
- อัปเดตสารบัญใน `PROJECT_GUIDE.md`: `node tools/gen-index.cjs` (ต้องได้ "สำเนา 3 ไฟล์ตรงกัน: ใช่")
- **ขึ้นเลขเวอร์ชันทั้ง `manifest.json` และ `const VERSION` ใน `content.js` พร้อมกันเสมอ**

> ⚠️ EV ของเกมยังเป็น −1% ต่อไม้ ไม่มีสูตรไหนให้กำไรระยะยาว — สคริปต์นี้แค่ทำให้ขั้นตอนอัตโนมัติ ไม่ได้เปลี่ยนขอบบ้าน
