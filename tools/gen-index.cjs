#!/usr/bin/env node
/**
 * tools/gen-index.cjs — สร้าง/อัปเดตดัชนีฟังก์ชันใน PROJECT_GUIDE.md จากซอร์สจริง
 *
 * ใช้:  node tools/gen-index.cjs
 * ผลลัพธ์:
 *   1) เขียนเลขบรรทัดของทุก `` `ชื่อฟังก์ชัน` (NNN) `` ในคู่มือให้ตรงกับ content.js
 *   2) สร้างตาราง AUTO-INDEX (ทุกฟังก์ชัน + บรรทัด) ระหว่าง marker สองตัว
 *   3) รายงานชื่อที่คู่มืออ้างถึงแต่ไม่มีในโค้ด (stale) และฟังก์ชันใหม่ที่ยังไม่มีในคู่มือ
 *
 * กติกา: อย่าแก้เนื้อหาระหว่าง AUTO-INDEX marker ด้วยมือ — สคริปต์จะทับ
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const CODE = path.join(ROOT, "stake_simple_ext", "content.js");
const FILES = [CODE];
const DOC = path.join(ROOT, "PROJECT_GUIDE.md");

const START = "<!-- AUTO-INDEX:START -->";
const END = "<!-- AUTO-INDEX:END -->";

const FUNC_RE = /^\s{4}(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/;

function scan(file) {
  const map = new Map();
  fs.readFileSync(file, "utf8").split("\n").forEach((line, i) => {
    const m = line.match(FUNC_RE);
    if (m && !map.has(m[1])) map.set(m[1], i + 1);
  });
  return map;
}

const map = scan(CODE);
if (!map.size) {
  console.error("ไม่พบฟังก์ชันใน " + CODE);
  process.exit(1);
}

// ---- ตรวจว่า 3 สำเนามีลำดับฟังก์ชันเหมือนกัน (กัน patch ตกหล่น) ----
const drifts = [];
for (const f of FILES) {
  const other = scan(f);
  if (other.size !== map.size) drifts.push(path.basename(f) + ": " + other.size + " ฟังก์ชัน (คาด " + map.size + ")");
  for (const [name, line] of map) {
    if (!other.has(name)) drifts.push(path.basename(f) + ": ขาด " + name);
    else if (other.get(name) !== line) drifts.push(path.basename(f) + ": " + name + " บรรทัด " + other.get(name) + " ≠ " + line);
  }
}

let doc = fs.readFileSync(DOC, "utf8");
let changed = 0;
const stale = [];
const mentioned = new Set();

doc = doc.replace(/`([A-Za-z_$][\w$]*)`\s*\((\d{1,4})\)/g, (full, name, oldNum) => {
  const real = map.get(name);
  if (!real) { stale.push(name); return full; }
  mentioned.add(name);
  if (String(real) !== oldNum) { changed++; return "`" + name + "` (" + real + ")"; }
  return full;
});

// ช่วงบรรทัดของกลุ่มฟังก์ชัน
function range(prefix) {
  const hits = [];
  for (const [name, line] of map) if (name.startsWith(prefix)) hits.push(line);
  return hits.length ? [Math.min(...hits), Math.max(...hits)] : null;
}
const nist = range("nist");
if (nist) doc = doc.replace(/`nist\*`\s*\(\d+[–-]\d+\)/, "`nist*` (" + nist[0] + "–" + nist[1] + ")");
const helpers = ["erfc", "lnGamma", "chiSquareP"].map((n) => map.get(n)).filter(Boolean);
if (helpers.length === 3) {
  doc = doc.replace(/`erfc`\/`lnGamma`\/`chiSquareP`\s*\(\d+[–-]\d+\)/,
    "`erfc`/`lnGamma`/`chiSquareP` (" + Math.min(...helpers) + "–" + Math.max(...helpers) + ")");
}

// ---- สร้าง AUTO-INDEX ----
const entries = Array.from(map.entries());
const rows = entries.map(([name, line]) => "| `" + name + "` | " + line + " |");
const block = START + "\n" +
  "| # | ฟังก์ชัน | บรรทัด |\n|---|---|---|\n" +
  rows.map((r, i) => "| " + (i + 1) + " " + r.slice(1)).join("\n") +
  "\n" + END;

const autoSection = "## 21. AUTO-INDEX (สร้างโดย `tools/gen-index.cjs` — ห้ามแก้ด้วยมือ)\n\n" +
  "ตารางนี้สร้างจาก `stake_simple_ext/content.js` โดยตรง · รัน `node tools/gen-index.cjs` หลังแพตช์ทุกครั้ง\n" +
  "จะอัปเดตเลขบรรทัดทุกจุดในคู่มือ + ตารางนี้ + ตรวจว่า 3 สำเนามีฟังก์ชันตรงกัน\n\n";

if (doc.indexOf(START) >= 0 && doc.indexOf(END) > doc.indexOf(START)) {
  const re = new RegExp(START.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[\\s\\S]*?" + END.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  doc = doc.replace(re, block);
} else {
  doc = doc.replace(/\s*$/, "\n\n---\n\n" + autoSection + block + "\n");
}

fs.writeFileSync(DOC, doc, "utf8");

const missing = entries.filter(([name]) => !mentioned.has(name)).map(([name]) => name);
console.log("ฟังก์ชันทั้งหมด: " + map.size);
console.log("อัปเดตเลขบรรทัด: " + changed + " จุด");
console.log("คู่มืออ้างถึงแต่ไม่มีในโค้ด (stale): " + (stale.length ? stale.join(", ") : "ไม่มี"));
console.log("ฟังก์ชันที่ยังไม่ถูกอ้างในเนื้อคู่มือ: " + (missing.length ? missing.length + " ตัว (" + missing.slice(0, 8).join(", ") + (missing.length > 8 ? ", …" : "") + ")" : "ไม่มี"));
console.log("สำเนา 3 ไฟล์ตรงกัน: " + (drifts.length ? "ไม่ตรง — " + drifts.slice(0, 5).join(" | ") : "ใช่"));
