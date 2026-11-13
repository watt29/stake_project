# คู่มือติดตั้ง OpenCode Browse (Windows) — ฉบับใช้งานได้จริง

> เขียนจากเครื่องจริง: Windows · Node v24.4.1 · npm 11.4.2 · browse **0.0.16** · Chrome
> ทุกคำสั่งในเอกสารนี้ผ่านการรันบนเครื่องนี้แล้ว และแนบผลลัพธ์จริงไว้ให้เทียบ

---

## 0. มันคืออะไร (อ่าน 30 วินาที)

Browse = **MCP server + ส่วนขยาย Chrome** ที่ให้ AI agent ใช้ **เบราว์เซอร์จริงของคุณ**
(แท็บ, login, ส่วนขยาย ครบ) โดยสั่งงานผ่าน Playwright

```
Agent (Claude Code / Cursor / Codex / …)
   │  MCP over stdio
   ▼
browse MCP server (CLI)
   │  HTTP + WebSocket 127.0.0.1:19988  (relay)
   ▼
Extension (chrome.debugger)  ──▶  แท็บจริงใน Chrome ของคุณ
```

จุดสำคัญ 3 ข้อ
1. **ไม่ต้องส่งคุกกี้/รหัสผ่านให้ AI** — agent ใช้ session ที่คุณล็อกอินอยู่แล้ว
2. **Handoff** — เจอ login / 2FA / หน้าจ่ายเงิน จะคืนแท็บให้คุณกดเอง แล้วรอจนกด **Continue**
3. **มี allowlist** — จำกัดได้ว่า session นั้นเปิดได้แค่โดเมนไหน

---

## 1. สิ่งที่ต้องมี

| ต้องมี | ตรวจด้วย | หมายเหตุ |
|---|---|---|
| Windows 10/11 | — | macOS/Linux ก็ใช้ได้ ต่างที่ path |
| **Chrome (แท้)** | เปิด `chrome://version` | Edge/Brave/Arc/Vivaldi/Opera/Chromium ก็รองรับ |
| Node.js **≥ 22.19** | `node -v` | เครื่องนี้: `v24.4.1` ✅ |
| npm | `npm -v` | เครื่องนี้: `11.4.2` ✅ |
| สิทธิ์ลง global package | — | `npm config get prefix` = `C:\Users\Lenovo\AppData\Roaming\npm` |

> ⚠️ **ห้ามใช้เบราว์เซอร์ที่ฝังมากับแอปอื่น** (เช่น Chromium ของ IDE หรือ browser panel ของแอป)
> Chrome Web Store จะขึ้นว่า **"Switch to Chrome to install extensions and themes"** และติดตั้งไม่ได้
> — เจอปัญหานี้มาแล้วบนเครื่องนี้

---

## 2. ขั้นที่ 1 — ติดตั้งส่วนขยายใน Chrome (ทำก่อนเสมอ)

ลิงก์ทางการ: **https://chromewebstore.google.com/detail/mfnicocicmmlkpjnaffgihfjhdgjkdjg**

1. เปิดลิงก์ **ใน Chrome ตัวจริง** (ไม่ใช่แท็บในแอป)
2. กด **เพิ่มลงใน Chrome / Add to Chrome** → **เพิ่มส่วนขยาย**
3. ปักหมุดไอคอน **browse** ไว้บน toolbar (คลิกขวาที่ไอคอน → Pin) — จะได้กด lend tab / เปิด Options ง่าย
4. เปิดหน้า onboarding ที่เด้งขึ้นมา — ยังไม่ต้องทำอะไรต่อ (ขั้น pairing อยู่ข้อ 4)

**ตรวจว่าเพิ่มแล้ว:** `chrome://extensions` → ต้องเห็นการ์ด **browse** เปิดใช้งานอยู่

---

## 3. ขั้นที่ 2 — ติดตั้ง CLI

```bash
npm install -g @opencode/browse
```

ผลลัพธ์จริงบนเครื่องนี้:
```
added 6 packages in 7s
```

ตรวจ:
```bash
browse --version     # → 0.0.16
```

> ทางเลือกอื่นจากหน้าผลิตภัณฑ์
> - PowerShell script: `irm https://opencode.ai/browse/install.ps1 | iex`
> - curl: `curl -fsSL https://opencode.ai/browse/install | bash`
> - Bun: `bun add -g @opencode/browse && browse install`
>
> ทั้งหมดจบที่คำสั่งเดียวกันคือ `browse install`

---

## 4. ขั้นที่ 3 — `browse install` (ตั้งค่า agent + จับคู่)

```bash
browse install -y
```

`-y` = ข้าม picker และตั้งค่าให้ agent ที่ตรวจพบอัตโนมัติ

### 4.1 มันแก้อะไรในเครื่องคุณ (สำคัญ — รู้ไว้ก่อนรัน)

เครื่องนี้ถูกเพิ่ม MCP server `browse` ลง **9 ที่**:

```
~/.claude.json                                    (Claude Code)
~/.cursor/mcp.json                                (Cursor)
~/.codex/config.toml                              (Codex)
~/AppData/Roaming/Code/User/mcp.json              (VS Code)
~/.codeium/windsurf/mcp_config.json               (Windsurf)
~/AppData/Roaming/Claude/claude_desktop_config.json (Claude Desktop)
~/.gemini/settings.json                           (Gemini CLI)
~/.copilot/mcp-config.json                        (GitHub Copilot CLI)
~/.gemini/config/mcp_config.json                  (Antigravity)
```

เนื้อหาที่เพิ่ม (รูปแบบ stdio มาตรฐาน):
```json
{ "mcpServers": { "browse": { "command": "browse", "args": ["mcp"] } } }
```

**อยากเลือกเฉพาะบาง agent** (แนะนำถ้าไม่อยากให้ทุกตัวเข้าถึงเบราว์เซอร์):
```bash
browse install -y -a claude cursor          # เฉพาะ Claude Code + Cursor
browse install -y -a '*'                    # ทุกตัว (เท่ากับ -y เดี่ยว ๆ)
```

**โหมดอัตโนมัติ/ไม่ต้องรอ** (ใช้ตอน script):
```bash
browse install -y --no-open --no-wait
```

---

## 5. ขั้นที่ 4 — จับคู่ (pairing)

### ทาง A: อัตโนมัติ (แนะนำ)
หลังติดตั้งส่วนขยายแล้ว รัน:
```bash
browse install -y --wait-seconds 60
```
มันจะเปิด **หน้าตั้งค่าของส่วนขยายพร้อมโค้ดฝังมาให้** แล้วรอเชื่อม — ปกติ **ไม่ต้องพิมพ์โค้ดเลย**

ผลลัพธ์จริงที่ได้บนเครื่องนี้:
```
✓ Opened browse in Google Chrome to connect it
Waiting for browse to connect (up to 45s; Ctrl+C to skip)…
✓ Connected to your browser. Ask your agent to open a page.
```

### ทาง B: จับคู่ด้วยโค้ด (ถ้าอัตโนมัติไม่ทำงาน)
```bash
browse pair --wait-seconds 120
```
จะพิมพ์โค้ด `XXXX-XXXX` (ใช้ได้ครั้งเดียว อายุ 10 นาที) แล้วรอ

ใน Chrome:
1. คลิกขวาที่ไอคอน **browse** → **Options**
2. กางหัวข้อ **advanced** (หรือกด **Pair with a code**)
3. ช่อง **Pairing code** → ใส่โค้ด → **Connect**

### ตรวจการจับคู่
```bash
browse pair --list
```
ผลจริงบนเครื่องนี้:
```
chrome-pc-1  Chrome on PC-1
  profile    6c65c470-8b6f-4b8f-ac9c-d30e117faecb
  paired     13/11/2569 17:47:21
```

---

## 6. ขั้นที่ 5 — ตรวจว่าทุกอย่างพร้อม (ห้ามข้าม)

### 6.1 `browse status`
```bash
browse status
```
ต้องเห็น:
```
Relay:            http://127.0.0.1:19988 (0.0.16)
Extension:        connected (0.0.16)
Extension protocol: 3 (compatible)
```

### 6.2 `browse doctor`
```bash
browse doctor
```
ต้องขึ้น **`Status: ok`** และ checklist `[ok]` ทุกบรรทัด (19 ข้อ) — เครื่องนี้ผ่านหมด

### 6.3 ทดสอบสั่งงานจริง (important)

สร้างไฟล์ `test-browse.js`:
```js
await page.goto('https://example.com', { waitUntil: 'domcontentloaded' });
return { title: await page.title(), url: page.url() };
```

รัน:
```bash
browse execute --rm --json --file test-browse.js
```

ผลจริงที่ได้:
```json
{ "ok": true,
  "value": { "title": "Example Domain", "url": "https://example.com/" },
  "session": { "id": "amber-comet-081", "browser": "chrome-pc-1", "connected": true } }
```

และใน Chrome จะมีแท็บ example.com เด้งขึ้นมา = **ใช้งานได้จริง**

---

## 7. การใช้งานประจำวัน

### 7.1 สั่งงานด้วย Playwright
```bash
browse execute --rm "await page.goto('https://amazon.com'); return await page.title();"
```

ตัวแปรที่ใช้ได้ในโค้ด: `page`, `context`, `snapshot()`, `ariaSnapshot()`, `handoff()`

อ่านค่าแบบ JSON เพื่อเอาไปใช้ต่อ:
```bash
browse execute --json --file script.js
```

### 7.2 Session (แยกงานไม่ให้ปนกัน)
```bash
browse session new research --allow-origin amazon.com,*.amazon.com
browse session list
browse session current
browse session use research
browse session allow amazon.com          # เปลี่ยน allowlist
browse session allow --clear             # ปลดล็อก
browse session delete research
```

`--read-only` = session ที่แค่อ่าน (แปะ/สกรอล/แคปได้ แต่ห้ามคลิก/นำทาง — ปลอดภัยสุด)

**ทดสอบว่า allowlist ทำงานจริง** (รันบนเครื่องนี้แล้ว): สร้าง session ที่อนุญาตแค่ `amazon.com` แล้วสั่งเปิด `example.com` →
```
browse: page.goto: Protocol error (Page.navigate): browse blocked Page.navigate:
session guide-test has a domain allowlist and example.com is not in the allowed origins
(amazon.com, *.amazon.com). Ask the user before widening it (session_allowlist / `session allow`).
```
= ระบบกันได้จริง ไม่ใช่แค่ตั้งค่าเฉย ๆ

### 7.3 ใช้แท็บที่คุณเปิดค้างไว้ (lend a tab)
กดปุ่ม toolbar **browse** บนแท็บที่ต้องการ → agent จะ `session_adopt` แท็บนั้นมาใช้ต่อ

### 7.4 เก็บหลักฐาน
```bash
browse recording start      # อัดวิดีโอแท็บ
browse recording stop       # ได้ไฟล์ WebM/MP4
browse network start        # ดัก traffic → HAR (ปิดข้อมูลอ่อนไหว)
browse network stop
browse journal --limit 30   # ดูว่า agent ทำอะไรไปบ้าง
```

### 7.5 Secrets (ให้ agent พิมพ์รหัสโดยไม่เห็นค่า)
```bash
browse secrets add amazon --origin https://amazon.com
browse secrets list
```
ในโค้ด: `secrets.type(locator, "amazon")` — ค่าจริงไม่เข้าไปใน context ของโมเดล

### 7.6 ตั้งค่าพฤติกรรม
```bash
browse settings get
browse settings set idleMinutes=30
```
ค่าจริงบนเครื่องนี้: `window=current · grouping=shared · idleMinutes=10 · cursor=off · humanInput=on · handoffNotifications=recording · autoUpdate=on`

---

## 8. Handoff — เมื่อ agent ต้องการให้คุณล็อกอิน

เมื่อ agent เปิดหน้า login / 2FA / ชำระเงิน:
1. แท็บจะถูกยกขึ้นมา + มีการ์ดแจ้งเตือน
2. **คุณล็อกอินเอง** (รหัส/OTP ไม่ผ่าน agent)
3. กด **Continue** → agent ทำงานต่อจากจุดเดิม

ตั้งค่าให้แจ้งเตือนทุกครั้งได้: `browse settings set handoffNotifications=always`

---

## 9. ความปลอดภัย

| กลไก | รายละเอียด |
|---|---|
| Relay token | `~/.local/share/browse/relay-token` (เครื่องนี้: `-rw-r--r--`, 44 bytes) — ทุก HTTP/CDP ต้องมี |
| Relay bind | `127.0.0.1` เท่านั้น (เปลี่ยนเป็น `0.0.0.0` ได้ด้วย `browse set hostname` เมื่อใช้ข้ามเครื่อง) |
| Pairing | โค้ดใช้ครั้งเดียว 10 นาที, ผิด 5 ครั้งยกเลิกทั้งหมด, แลกคีย์ด้วย ECDH |
| Restricted execute | ตัด `process` / `require` / `import()` / network ออก, จำกัด path, หยุดโค้ด sync ที่ ~2 วินาที |
| CDP guardrails | อ่านคุกกี้เฉพาะ host ของ session, ห้ามลบ cookie/cache, ห้ามปิดเบราว์เซอร์ |
| Allowlist | `browse session new --allow-origin ...` หรือ `browse session allow ...` |

**ข้อควรปฏิบัติ**
- ใช้กับ agent ที่คุณไว้ใจ — extension เห็นทุกแท็บที่ล็อกอิน
- ใส่ allowlist ก่อนสั่งงานยาว ๆ
- อย่าเปิด `OPENCODE_BROWSER_ALLOW_NODE=1` / `ALLOW_ALL_COOKIES=1` ถ้าไม่จำเป็นจริง (เป็น env-only switch)

---

## 10. แก้ปัญหา (จากที่เจอจริง)

| อาการ | สาเหตุ | วิธีแก้ |
|---|---|---|
| Web Store ขึ้น "Switch to Chrome to install extensions" | เปิดใน Chromium ที่ไม่ใช่ Chrome | เปิดลิงก์ใน Chrome ตัวจริง |
| `Extension: disconnected` | ยังไม่ได้เพิ่มส่วนขยาย / ยังไม่จับคู่ | ติดตั้งส่วนขยาย → `browse install -y --wait-seconds 60` |
| `Relay: stopped` | relay ยังไม่ถูกปลุก | รันคำสั่งใดก็ได้ เช่น `browse status` (มันสตาร์ทให้) หรือ `browse serve` |
| จับคู่ไม่ติดทั้งที่ลงแล้ว | extension โหลดโค้ดเก่า | `chrome://extensions` → ↻ ที่การ์ด browse |
| โค้ดอ่านไฟล์ `/tmp/...` ไม่ได้ (Windows) | Git Bash `/tmp` ≠ path ที่ Node มองเห็น | ใช้ path ในโปรเจกต์ เช่น `./out.json` |
| `execute` ค้างนาน | หน้ามี handoff หรือ page โหลดช้า | เพิ่ม `--timeout-ms 120000` |
| เปิดผิดแท็บ | มีหลาย target | ระบุ `--target-url amazon` หรือ `--target-index 0` |
| ต้องรีเซ็ต session | state เพี้ยน | `browse session reset` |
| ตรวจทั้งระบบ | — | `browse doctor` (ดู `[ok]/[fail]` ทุกรายการ) |

Log: `C:\Users\Lenovo\.local\state\browse\logs`

---

## 11. ถอนการติดตั้ง (สะอาดหมด)

```bash
browse pair --revoke chrome-pc-1     # ตัดการจับคู่เบราว์เซอร์
browse uninstall --yes               # ถอด relay + ไฟล์ใน ~/.local/share/browse + MCP config ทุก agent
npm uninstall -g @opencode/browse    # ถอด CLI
```
จากนั้น `chrome://extensions` → ลบการ์ด **browse**

---

## 12. ภาคผนวก — ค่าจริงบนเครื่องนี้

```
OS            Windows (Lenovo)
Node          v24.4.1
npm           11.4.2 (prefix C:\Users\Lenovo\AppData\Roaming\npm)
browse CLI    0.0.16  (build 2026-11-08T19:49:23.856Z)
Relay         http://127.0.0.1:19988
Extension     connected 0.0.16 · protocol 3
Paired        chrome-pc-1 · profile 6c65c470-8b6f-4b8f-ac9c-d30e117faecb
config        C:\Users\Lenovo\.config\browse
data          C:\Users\Lenovo\.local\share\browse
state/logs    C:\Users\Lenovo\.local\state\browse   (logs\)
cache         C:\Users\Lenovo\.cache\browse
doctor        Status: ok (19/19 checks)
```

### Checklist ผ่าน/ไม่ผ่าน
- [ ] Chrome มีส่วนขยาย browse และเปิดใช้งาน
- [ ] `browse --version` ขึ้นเลขเวอร์ชัน
- [ ] `browse status` → `Extension: connected`
- [ ] `browse pair --list` → เห็นชื่อเบราว์เซอร์
- [ ] `browse doctor` → `Status: ok`
- [ ] `browse execute --rm` เปิดแท็บได้จริง
