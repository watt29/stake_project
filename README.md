# 🎲 Stake Dice Martingale 68% Bot (Chrome Extension MV3)

> **Current Build:** `2026.11.11+v2.0.0-unlimited-storage` | **Extension Version:** `2.0.0`  
> **Accounts:** Profile 1 (`Anda`), Profile 3 (`nattawat`), Profile 4 (`master`)  
> **Architecture Guidelines for AI:** [`AGENTS.md`](AGENTS.md) | [`stake_extension/AGENTS.md`](stake_extension/AGENTS.md)

บอทเดิมพันอัตโนมัติสำหรับเกม **Dice** บน stake.com ทำงานในรูปแบบ **Chrome Extension (Manifest V3 Dual-World: MAIN + ISOLATED)** ผสานการควบคุมผ่าน PowerShell Orchestrator

---

## 📊 ข้อมูลกลยุทธ์และการเงิน (Current Standards)

| พารามิเตอร์ | ค่าที่กำหนด | คำอธิบาย |
|---|---|---|
| **โอกาสชนะ (Win Chance)** | **`68%`** | ล็อกตายตัว (Payout ~`99/68` = **1.4559x**) |
| **ยอดฐานปกติ (ไม้ 1)** | **`0.0002$`** | ยอดเริ่มต้นปกติในเซสชัน (ขั้นต่ำเว็บ `0.00010$`) |
| **ยอดฐานตอนพยุง (Hold)** | **`0.0002$`** | ไม่มี Recovery Boost — ใช้ฐานเดิมคงที่เมื่อครบ 20 นาทีแล้วยังติดลบ |20 นาทีแล้วยังติดลบ |
| **สูตร Martingale** | **`+73.11%`** | เมื่อแพ้ ยอดถัดไป = ยอดก่อนหน้า × 1.7311 (`mStep++`) |
| **เงื่อนไขรีเซ็ตกลับไม้ 1** | **ชนะติด 3 ตา** | เมื่อ `currentStreak >= 3` รีเซ็ตกลับไม้ 1 ทันที |
| **การสลับด้าน (Roll Side)** | **Under / Over** | บังคับสลับที่ระดับ Network GraphQL (`below 68` / `above 32`) |
| **ระยะเวลาเซสชัน** | **20 นาที** | เล่นรอบละ 20 นาที |
| **ระยะเวลาพักเบรก** | **3 นาที (180 วินาที)** | ปิด Chrome พักเครื่อง คืนแรมให้ Windows |

---

## 🛑 กฎการจบเซสชัน 20 นาที (Instant Profit Lock)

เมื่อเล่นครบ 20 นาที บอทจะตัดสินใจตามลำดับดังนี้:
1. **ตรวจยอด P/L รวมในเซสชันก่อนเสมอ:**
   - **กรณีได้กำไร ($P/L \ge 0$):** **หยุดเซสชันและล็อกกำไรทันที 0ms** โดยไม่ต้องรอไม้ 1 และไม่ต้องรอชนะติด 3 ตาเด็ดขาด
   - **กรณีขาดทุน ($P/L < 0$):** พยุงต่อด้วยยอดฐานเดิม **`0.0002$`** (ไม่เร่งยอดตามกฎ Infinite Patience) และเล่นจนกว่ายอดจะพลิกกลับมาบวก ($P/L \ge 0$) จึงสั่ง **หยุดเซสชันและล็อกกำไรทันที 0ms** เพื่อเข้าสู่ช่วงพัก 3 นาที

---

## 🛠️ จุดเด่นด้านสถาปัตยกรรม (Stealth & Zero-Leak)

1. **Dual-World Architecture:** ฝั่ง MAIN World ทำงาน 0ms ใน Memory หน้าเว็บ ขณะที่ฝั่ง ISOLATED World (`bridge.js`) จัดการ `chrome.storage.local`
2. **Batching Task Queue:** บันทึกสถิติลง Storage ทุก 5 วินาที หรือ 30 ไม้ ลด Disk I/O ลง 96%
3. **Stealth Native Storage:** ใช้คีย์พรางตา `_st_view_prefs_v2` ใน `window.localStorage` ไร้คำว่า bot หรือ martingale
4. **Human Jitter & Micro-Break:** สุ่มหน่วงเวลา 120ms – 280ms พร้อมพักสายตา 1.8s – 3.2s ทุก 35–55 ไม้ พรางตัวจาก AI ตรวจจับ
5. **Network Watchdog:** เฝ้าระวังเน็ตหลุด/ค้าง 15 วินาที พร้อมระบบ Auto-Reload & Resume อัตโนมัติ
6. **Teardown Cleanup:** คืน RAM, ปิด AudioContext, Release WakeLock, และถอน Event Listeners ทุกครั้งที่ปิดแท็บ
7. **PowerShell Double Safety:** สคริปต์ `rotate-accounts.ps1` บันทึกด้วย UTF-8 BOM มีระบบ Hard Deadline ป้องกันหน้าต่างค้าง

---

## 🚀 วิธีเริ่มใช้งาน

ดับเบิลคลิกไฟล์:
```bat
start-bot.bat
```
และตรวจสอบรายงานผลประจำวันได้ด้วย:
```powershell
powershell -ExecutionPolicy Bypass -File .\tools\show-summary.ps1
```
