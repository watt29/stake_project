# Groq API — โมดูลเดียวจบ

ดึง "เฉพาะส่วน API" มาจาก `binance-sever-render-main/agent/ai_providers.py`
ตัด loguru / aiohttp / provider อื่นออกหมด — **ใช้ stdlib เท่านั้น ไม่ต้อง pip install**

## 1. เอา key
https://console.groq.com/keys → สมัครฟรี (ไม่ต้องใส่บัตร)

```bash
cp .env.example .env      # แล้วใส่ค่าใน .env
export GROQ_API_KEY=gsk_xxx      # หรือ Windows: set GROQ_API_KEY=gsk_xxx
```

## 2. ทดสอบ
```bash
python groq_client.py "สวัสดี แนะนำตัวสั้น ๆ"
```

## 3. ใช้ในโค้ด

```python
from groq_client import GroqClient, GroqError

c = GroqClient()                          # อ่าน key จาก env อัตโนมัติ

# ข้อความธรรมดา
print(c.ask("เขียนแคปชันขายกระเป๋าหนัง 3 แบบ", system="คุณคือนักเขียนคอนเทนต์"))

# บังคับ JSON (ได้ dict กลับมาเลย)
data = c.ask_json('ตอบ JSON: {"title": "...", "tags": ["..."]}'
                  ' สำหรับสินค้า: ไส้กรองน้ำพุแมว 4 ชิ้น')

# กำหนดโมเดลเอง
print(c.chat([{"role": "user", "content": "2+2=?"}],
             model="openai/gpt-oss-20b").text)

# ดู latency
r = c.chat([{"role": "user", "content": "ทดสอบ"}])
print(r.text, r.latency_ms, "ms")
```

## 4. ความสามารถที่มีให้

| ฟีเจอร์ | รายละเอียด |
|---|---|
| หมุน key หลายตัว | `GROQ_API_KEY`, `GROQ_API_KEY_2` … `_10` → เลือกตัวที่ถูกเรียกน้อยสุด |
| จำกัด RPM | 28 ครั้ง/นาที/key (free tier = 30) |
| Circuit breaker | key ที่โดน 429 จะถูกพัก 60 วินาที แล้วกลับมาใช้เอง |
| `reasoning_effort=low` | ใส่ให้อัตโนมัติเมื่อใช้โมเดล `gpt-oss` (ลด latency/token) |
| JSON mode | `ask_json()` บังคับ `response_format={"type":"json_object"}` |
| stdlib only | ใช้ `urllib` — ไม่ต้องลง `requests`/`openai`/`aiohttp` |

## 5. โมเดลที่แนะนำ (พ.ย. 2026)

| id | ราคา /1M tokens | ใช้เมื่อ |
|---|---|---|
| `openai/gpt-oss-120b` | $0.15 in / $0.60 out | งานคุณภาพ (ค่าเริ่มต้น) |
| `openai/gpt-oss-20b` | $0.075 / $0.30 | งานเร็ว/ปริมาณมาก |

> Free tier: 30 RPM · 1,000 requests/วัน · 8,000 tokens/นาที · 200,000 tokens/วัน
> `llama-3.3-70b-versatile` ถูกปิดสำหรับ Free/Developer ตั้งแต่ ส.ค. 2026 — อย่าใช้

## 6. ข้อผิดพลาดที่ raise

`GroqError` — ไม่มี key / ทุก key ติด rate limit / HTTP error / คำตอบไม่ใช่ JSON
จัดการด้วย `try/except GroqError` ในโค้ดที่เรียก
