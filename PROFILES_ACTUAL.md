# 🔍 ผลสแกนเครื่องนี้ — มีโปรไฟล์อะไรจริง

> ⚠️ **เอกสารประวัติศาสตร์ (สแกน 4 พ.ย. 2026)** — ผลสแกน ณ วันนั้น
> ปัจจุบัน `tools/rotate-accounts.ps1` ตั้งค่าเริ่มต้นไว้ที่ **`Profile 4` (master) โปรไฟล์เดียว** (`-Profiles @("Profile 4")`)
> ถ้าต้องการวนหลายบัญชี ต้องแก้ `-Profiles` และ `$labels` ในไฟล์นั้นเอง

> สแกนเมื่อ 4 พ.ย. 2026 · อ่านเฉพาะ **โครงสร้างโฟลเดอร์ + รายชื่อโปรไฟล์** (ไม่ได้เปิดคุกกี้/รหัสผ่าน)
> อีเมลถูกปิดบางส่วนเพื่อความปลอดภัย

---

## 1. สรุปสั้น

| คำถาม | คำตอบที่ตรวจพบ |
|---|---|
| มี `D:\stake8` ไหม | ❌ **ไม่มี** — ค่าเริ่มต้นเดิมของ `rotate-accounts.ps1` ชี้ที่ผิด |
| Chrome มีกี่โปรไฟล์ | **16 โปรไฟล์** (ใน `%LOCALAPPDATA%\Google\Chrome\User Data`) |
| มีโปรไฟล์ไหนติดตั้งปลั๊กอินบอทแล้ว | ✅ **3 โปรไฟล์ (3/16)** — `Profile 1`, `Profile 3`, `Profile 4` |
| "3 บัญชี" ของคุณคือ | ✅ **ยืนยันแล้ว** (ดู §2.1) — `Profile 1` / `Profile 3` / `Profile 4` |
| ทำไมไม่มี `Profile 2` | โฟลเดอร์นั้นเคยถูกลบไป Chrome เลยตั้งชื่อข้ามเป็น `Profile 3` (ปกติของ Chrome) |

> **สรุป:** ครบทั้ง 3 บัญชี — ปลั๊กอินติดตั้งแล้วในทั้ง `Profile 1/3/4` และไม่มีในอีก 13 โปรไฟล์ที่เหลือ
>
> ⚠️ **แก้ข้อมูลรอบแรก:** ตอนแรกผมสแกนเฉพาะไฟล์ `Preferences` จึงรายงานผิดว่า "ไม่พบปลั๊กอินเลย"
> ความจริง Chrome รุ่นนี้เก็บรายการปลั๊กอินไว้ใน **`Secure Preferences`** — ต้องตรวจทั้งสองไฟล์
> (แก้ใน `tools/rotate-accounts.ps1` แล้ว → ฟังก์ชัน `Test-HasBotExtension` ตรวจ 2 ไฟล์)

---

## 2.1 สามบัญชีที่ใช้จริง (ยืนยันโดยผู้ใช้)

| ลำดับ | โฟลเดอร์ | ชื่อที่เห็นใน Chrome | บัญชี | ปลั๊กอินบอท |
|---|---|---|---|---|
| บัญชี 1 | `Profile 1` | **Anda** (Person 2) | `regency2919` | ✅ ติดตั้งแล้ว |
| บัญชี 2 | `Profile 3` | **nattawat** (Work) | `natawatonline1989` | ✅ ติดตั้งแล้ว |
| บัญชี 3 | `Profile 4` | **master** (Person 1) | `regency1229` | ✅ ติดตั้งแล้ว |

> ล็อกไว้ใน `tools/rotate-accounts.ps1` แล้ว (`$DefaultProfiles`) → รัน `start-bot.bat` เมนู `[2]` จะวน 3 บัญชีนี้ตามลำดับ 1 → 2 → 3
> เปลี่ยนบัญชีในอนาคต: แก้ `$DefaultProfiles` และ `$DefaultLabels` ในไฟล์นั้น

---

## 2. รายชื่อโปรไฟล์ที่พบ

| โฟลเดอร์ | ชื่อที่ตั้งไว้ | บัญชี (ปิดบางส่วน) | ปลั๊กอินบอท |
|---|---|---|---|
| `Profile 1` | Person 2 | reg***@gmail.com | - |
| `Profile 4` | Person 1 | reg***@gmail.com | - |
| `Profile 3` | Work | nat***@gmail.com | - |
| `Profile 6` | ณัฐมนต์ | ay7***@gmail.com | - |
| `Profile 9` | สำรวย | rua***@gmail.com | - |
| `Profile 11` | wut1229 | g81***@gmail.com | - |
| `Profile 15` | Huan Khuen | hua***@gmail.com | - |
| `Profile 16` | jr | jrd***@gmail.com | - |
| `Profile 17` | DevCraft | dev***@gmail.com | - |
| `Profile 18` | AIForge | aif***@gmail.com | - |
| `Profile 25` | Veo | veo***@gmail.com | - |
| `Profile 26` | **watt** | wat***@gmail.com | - |
| `Profile 27` | LawBuddy | law***@gmail.com | - |
| `Profile 29` | jee | jee***@gmail.com | - |
| `Profile 31` | Prapavarin | pra***@gmail.com | - |
| `Profile 33` | Dev | dev***@gmail.com | - |

**ข้อสังเกต:** `Profile 26` ชื่อ **watt** — น่าจะเป็นบัญชี Stake ที่ใช้ชื่อ `watt29` (จากบันทึกก่อนหน้า) แต่ **ยังไม่ยืนยัน** ให้ดูป้าย `👤` ในหน้าต่างนั้นอีกที

---

## 3. สิ่งที่ต้องทำต่อ (3 ขั้น)

### ขั้น 1 — 3 โปรไฟล์ ✅ เลือกแล้ว
default ในสคริปต์คือ `Profile 1` (Anda) → `Profile 3` (nattawat) → `Profile 4` (master) ไม่ต้องแก้ไฟล์อีก

### ขั้น 2 — ติดตั้งปลั๊กอิน ✅ เสร็จแล้วทั้ง 3
`Profile 1`, `Profile 3`, `Profile 4` พบ `stake_extension` ใน `Secure Preferences` ครบ

> **เช็คเร็ว ๆ ในแต่ละหน้าต่าง:** หัวแผงต้องขึ้น `🎯 DYNAMIC 22-STEP` + เลขบิลด์ `2026.11.18+30`
> ถ้าไม่ขึ้น → `chrome://extensions` ↻ (ปุ่มรีเฟรชการ์ด) แล้ว F5 หน้าเว็บ
>
> **มีอะไรเปลี่ยนในไฟล์หลังติดตั้ง:** ต้องกด ↻ การ์ดปลั๊กอินทุกครั้ง ไม่งั้น Chrome ยังใช้โค้ดเก่า

### ขั้น 3 — รันตัววนบัญชี
```powershell
# ไม่ต้องระบุอะไร = วน 3 บัญชีที่ล็อกไว้ (Anda -> nattawat -> master)
powershell -ExecutionPolicy Bypass -File .\tools\rotate-accounts.ps1

# วนทุกโปรไฟล์ที่ Chrome มี (16 อัน)
powershell -ExecutionPolicy Bypass -File .\tools\rotate-accounts.ps1 -All

# ระบุเอง
powershell -ExecutionPolicy Bypass -File .\tools\rotate-accounts.ps1 -Profiles "Profile 26","Profile 11"
```

**โหมดการรอ (สำคัญ):** เพราะคุณใช้ Chrome ปกติ (ทุกโปรไฟล์อยู่ใน User Data เดียว) การรอ "จนปิดหน้าต่าง" เชื่อถือไม่ได้ → สคริปต์จึงใช้โหมด **`enter`** คือ *จบเซสชันแล้วกลับมากด Enter ที่หน้าต่าง PowerShell* เพื่อไปบัญชีถัดไป

| โหมด | เหมาะกับ |
|---|---|
| `-WaitMode enter` (ค่าเริ่มต้น) | Chrome ปกติ (กรณีของคุณ) |
| `-WaitMode close` | เคสแยกโฟลเดอร์ด้วย `--user-data-dir` (เช่น `D:\stake8\p1`) |

---

## 4. ถ้าอยากกลับไปใช้แบบแยกโฟลเดอร์ (`D:\stake8`)

ข้อดี: รอจนปิดหน้าต่างได้อัตโนมัติ (โหมด `close`) และแยกข้อมูลกันจริง
ข้อเสีย: ต้องติดตั้งปลั๊กอินใหม่ในทุกโฟลเดอร์ + ล็อกอินใหม่

```powershell
1..3 | ForEach-Object { New-Item -ItemType Directory -Force -Path "D:\stake8\p$_" | Out-Null }
# แล้วเปิด Chrome ด้วย --user-data-dir=D:\stake8\p1 (ครั้งแรก) เพื่อสร้างโปรไฟล์
```

---

## 5. ข้อจำกัดของการสแกนครั้งนี้

- ตรวจเฉพาะ **Chrome ปกติ** — ถ้าคุณติดตั้งปลั๊กอินใน **Edge / Chrome for Testing / โปรไฟล์อื่น** จะไม่เจอ
- ตรวจด้วยการค้นคำว่า `stake_extension` ในไฟล์ `Preferences` ของแต่ละโปรไฟล์ (ไม่เปิดข้อมูลล็อกอิน)
- จำนวนโปรไฟล์อาจเปลี่ยนได้ถ้าคุณเพิ่ม/ลบโปรไฟล์ภายหลัง — รันสคริปต์ซ้ำได้เลย มันตรวจใหม่ทุกครั้ง
