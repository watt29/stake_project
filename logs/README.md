# 📁 Stake Dice Bot - Logs Directory

โฟลเดอร์สำหรับเก็บไฟล์ Log และประวัติการทำงานของบอท Stake Dice:

| ชื่อไฟล์ | รูปแบบ | รายละเอียด |
|---|---|---|
| `live-status.txt` | TXT | สถานะการเดินไม้แบบ Real-Time อัปเดตทุก 5 วินาที (`STAKE_RUN`, P/L, Step, Speed, Radar) |
| `deep-losses.log` | LOG | บันทึกประวัติเฉพาะไม้ลึก (เมื่อแทงไปถึงไม้ 8 ขึ้นไป) เพื่อวิเคราะห์ก้อนแพ้คั่นกลาง |
| `rotate-ledger.csv` | CSV | สรุปผลการเล่นจบรอบ (timestamp, round, profile, code, pnl, step, duration_sec, bets, wagered, bps, title) |

---
*อัปเดตและซิงค์อัตโนมัติแบบเรียลไทม์โดย `tools/rotate-accounts.ps1`*
