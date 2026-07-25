# กติกาบังคับสำหรับ AI — Stake Project 3

เอกสารนี้คือข้อเท็จจริงและขอบเขตการแก้ไขของโปรเจกต์ ณ ปัจจุบัน
AI ทุกตัวต้องอ่านเอกสารนี้ก่อนแก้ไฟล์ใด ๆ และต้องตรวจโค้ดปัจจุบันก่อนลงมือเสมอ

## หลักการห้ามเดาและข้อบังคับเคร่งครัด

> [!CAUTION]
> **คำสั่งเด็ดขาดจากผู้ใช้:** AI ทุกตัวห้ามแก้ไขโค้ดมั่วๆ สเปะสะปะ หรือปรับโครงสร้างไฟล์โดยไม่ได้รับคำสั่งตรงจากผู้ใช้เด็ดขาด การแก้ไขทุกครั้งต้องเป็นไปตามความต้องการที่ระบุชัดเจนเท่านั้น!

1. ห้ามแก้จากความจำ, จากเอกสารเก่า, หรือจากชื่อฟังก์ชันที่คาดเดาเอง
2. ห้ามเขียนทับหรือปรับโครงสร้าง `dice_bot_utf8.py` ทั้งไฟล์ หากผู้ใช้ไม่ได้สั่งชัดเจน
3. แก้เฉพาะจุดที่ตรวจพบในโค้ดและเกี่ยวข้องกับคำขอเท่านั้น
4. ก่อนแก้ logic ต้องอ่านครบ 5 จุด: โหลด state, คำนวณก่อนเดิมพัน, รับผล, บันทึก state, และ dashboard/log
5. ห้ามเปลี่ยนสูตรเดินเงิน, หรือจำนวนบัญชี เพียงเพราะกำลังแก้เรื่องอื่น
6. เมื่อมีข้อมูลไม่พอ ให้รายงานสิ่งที่พบและขอคำสั่งเพิ่ม ห้ามสร้างเงื่อนไขใหม่เอง
7. AI ทุกตัวต้องฟังคำสั่งและทำตามคำสั่งอย่างเคร่งครัด ห้ามแก้ไขโค้ดนอกเหนือจากที่ได้รับการสั่งการ ห้ามมโน ห้ามคิดเอง หากสงสัยหรือไม่เข้าใจให้ถามกลับผู้ใช้ทันที

## ไฟล์หลักและหน้าที่

| ความต้องการ | แก้ที่ใด | ห้ามแตะโดยไม่จำเป็น |
|---|---|---|
| เดิมพัน, เดินเงิน, แทงลม, ยอดเงิน, dashboard | `dice_bot_utf8.py` | `switch_controller.py`, config ทั้งหมด |
| การหมุน 8 บัญชี, เวลาสลับ, การพักเมื่อเงินไม่พอ | `switch_controller.py` | สูตรเดิมพันใน `dice_bot_utf8.py` |
| ปุ่มเปิดระบบหมุน | `start_rotation.bat` | ไม่ล้างประวัติอัตโนมัติ |
| เปิดบัญชีเดียว | `run_bot.bat` | ไม่เปลี่ยน logic บอท |
| ค่าเฉพาะบัญชี เช่น cookie, base bet, win chance | `config.json`, `config_account2.json` … `config_account8.json` | ห้ามคัดลอกค่าไปทุกบัญชี หากผู้ใช้ไม่ได้ระบุ |
| สถิติและสถานะที่รันอยู่ | `dice_stats*.json`, `dice_events*.log` | ห้ามแก้ด้วยมือระหว่างบอทรัน |
| ล้างข้อมูลทุกบัญชี | `reset_history.py` | ห้ามรันเองเด็ดขาด ต้องมีคำสั่งผู้ใช้ชัดเจน |

## พฤติกรรมที่ตกลงไว้ในปัจจุบัน

### เงินไม่พอ

- ถ้ายอดเริ่มต้นเป็น 0 หรือยอดต่ำกว่า `planned_bet`: ห้ามส่งเดิมพันจริง
- บอทบันทึก `rotation_status = "INSUFFICIENT_FUNDS"` แล้วจบการทำงานของบัญชีนั้น
- ตัวหมุนตรวจสถานะนี้ทุก 5 วินาที แล้วปิดกลุ่มปัจจุบันเพื่อไปกลุ่มถัดไป
- เมื่อเริ่มบัญชีใหม่ ตัวหมุนตั้งสถานะเป็น `STARTING` ก่อน เพื่อไม่ให้ใช้สถานะเงินไม่พอเก่าตัดสินผิด

### การหมุนบัญชี

- มี 8 บัญชี แบ่ง 4 กลุ่ม กลุ่มละ 2: A (1–2), B (3–4), C (5–6), D (7–8)
- `start_rotation.bat` เรียก `switch_controller.py`; เวลาปกติ 10 นาทีต่อกลุ่ม
- กลุ่มที่ขาดทุน session ต้องไม่สลับจนผลรวม session ของทุกบัญชีในกลุ่มไม่ติดลบ
- dashboard ของแต่ละบัญชีอยู่ใน console แยกหน้าต่าง
- ห้ามใช้ `taskkill /IM chrome.exe`; ให้หยุดเฉพาะ process tree ของบอทในกลุ่ม

## ขั้นตอนบังคับก่อนส่งงาน

1. ตรวจเฉพาะไฟล์และบรรทัดที่เกี่ยวข้องด้วยการค้นหา/อ่านโค้ด
2. ใช้การแก้แบบเป็นจุด ไม่แทนที่ข้อความกว้าง ๆ หรือ regex ครอบทั้งไฟล์
3. หลังแก้ `dice_bot_utf8.py`, config หรือ `.bat` ให้ตรวจ syntax ด้วย `python -m py_compile dice_bot_utf8.py`
4. การทดสอบต้องเป็น simulation เท่านั้น; ห้ามรัน live เพื่อทดสอบ
5. รายงานให้ชัดว่าแก้ไฟล์ใด พฤติกรรมที่เปลี่ยนคืออะไร และทดสอบถึงระดับใด

## ข้อห้ามด้านข้อมูลและความปลอดภัย

- ห้ามเปิดเผย token, cookies, proxy หรือข้อมูลบัญชีจาก config/log
- ห้าม reset history, ลบ log, แก้ cookie หรือเปลี่ยนยอดเงิน โดยไม่มีคำสั่งตรงจากผู้ใช้
- ห้ามแก้ `dice_stats*.json` ระหว่างบอททำงาน ยกเว้นกลไกใน `switch_controller.py` ที่ตั้ง `rotation_status = "STARTING"`
- หากเอกสารอื่นขัดกับเอกสารนี้หรือโค้ดปัจจุบัน: ถือว่าโค้ดปัจจุบันเป็นข้อเท็จจริง และแจ้งผู้ใช้ก่อนแก้



## undetected_chromedriver Initialization Rules

> [!CAUTION]
> NEVER revert the uc.Chrome initialization back to standard options.add_argument("--user-data-dir=...") or rely on version_main=xxx.

When initializing undetected_chromedriver, you MUST use the manual pre-patching workflow to prevent deadlocks and max() iterable errors:
1. Use ChromeDriverManager().install() to fetch the base executable.
2. Use shutil.copy to place it in the %APPDATA%\undetected_chromedriver directory.
3. Manually patch it using undetected_chromedriver.patcher.Patcher.
4. Pass the patched path directly via driver_executable_path=... in uc.Chrome().
5. Pass the profile directory directly via user_data_dir=... (Do NOT use options.add_argument).
