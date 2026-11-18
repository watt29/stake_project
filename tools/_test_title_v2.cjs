#!/usr/bin/env node
// tools/_test_title_v2.cjs — ทดสอบ parser ของ title ที่บอทเขียน (รูปแบบ v2)
// ใช้: node tools/_test_title_v2.cjs
// ตรวจว่า title STAKE_DONE ถูกอ่านได้ทั้งรหัสจบ, P/L และส่วน [mem=.. dom=..] ที่ต่อท้ายด้วย " :: "

const cases = [
    { title: 'STAKE_DONE|R=WIN|P=0.42130|S=1|B=137 :: [mem=0.42130 dom=0.42130]', code: 'WIN', p: 0.4213, mem: 0.4213, dom: 0.4213 },
    { title: 'STAKE_DONE|R=NO_FUNDS|P=-0.00210|S=9|B=212 :: [mem=-0.00210 dom=-0.00210]', code: 'NO_FUNDS', p: -0.0021, mem: -0.0021, dom: -0.0021 },
    { title: 'STAKE_DONE|R=DESYNC|P=0.01000|S=3|B=42 :: [mem=0.01000 dom=0.31000]', code: 'DESYNC', p: 0.01, mem: 0.01, dom: 0.31 },
    { title: 'STAKE_DONE|R=MANUAL|P=0.00000|S=1|B=1', code: 'MANUAL', p: 0, mem: null, dom: null },
];

// คีย์เวิร์ดตาม AGENTS.md §10 (deriveStopCode แบบ case-insensitive)
const KEYWORDS = [
    ['take profit', 'WIN'], ['site cap', 'BET_CAP'], ['ladder', 'LADDER_EXHAUSTED'],
    ['max step', 'MAX_STEPS'], ['desync', 'DESYNC'], ['balance drift', 'DESYNC'], ['another tab', 'TAB_CONFLICT'],
    ['time limit', 'TIME'], ['recovery', 'TIME'], ['insufficient', 'NO_FUNDS'],
    ['no funds', 'NO_FUNDS'], ['failed to set bet', 'BET_FAIL'], ['user stop', 'MANUAL'], ['esc', 'MANUAL'],
];

function parseTitle(title) {
    const out = { code: null, p: null, mem: null, dom: null };
    const m = /STAKE_DONE/.test(title) ? title : null;
    if (!m) return out;

    const code = title.match(/R=([A-Za-z_]+)/);
    if (code) out.code = code[1].toUpperCase();

    const p = title.match(/\bP=(-?\d+(?:\.\d+)?)/);
    if (p) out.p = parseFloat(p[1]);

    const tail = title.split(' :: ')[1] || '';
    const mem = tail.match(/mem=(-?\d+(?:\.\d+)?)/);
    const dom = tail.match(/dom=(-?\d+(?:\.\d+)?)/);
    if (mem) out.mem = parseFloat(mem[1]);
    if (dom) out.dom = parseFloat(dom[1]);
    return out;
}

// สำรอง: ถ้า title ไม่มี R= ให้เดาจากคีย์เวิร์ดของ stop reason (English)
function deriveStopCode(reason) {
    const r = String(reason || '').toLowerCase();
    for (const [kw, code] of KEYWORDS) {
        if (r.includes(kw)) return code;
    }
    return 'OTHER';
}

let failed = 0;
for (const c of cases) {
    const got = parseTitle(c.title);
    const checks = [
        ['code', got.code, c.code],
        ['p', got.p, c.p],
        ['mem', got.mem, c.mem],
        ['dom', got.dom, c.dom],
    ];
    for (const [field, a, b] of checks) {
        const same = (a === b) || (typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < 1e-9);
        if (!same) {
            failed++;
            console.error(`FAIL ${field}: got ${a} want ${b}  <- ${c.title}`);
        }
    }
}

// ทดสอบ deriveStopCode
const reasons = [
    ['take profit reached', 'WIN'], ['balance drift', 'DESYNC'], ['time limit + profit >= 0', 'TIME'],
    ['recovery win at step 1', 'TIME'], ['insufficient balance', 'NO_FUNDS'], ['user stop', 'MANUAL'],
    ['weird thing', 'OTHER'],
];
for (const [r, want] of reasons) {
    const got = deriveStopCode(r);
    if (got !== want) { failed++; console.error(`FAIL deriveStopCode("${r}") = ${got} want ${want}`); }
}

if (failed) {
    console.error(`\n❌ ล้มเหลว ${failed} รายการ`);
    process.exit(1);
}
console.log(`✅ ผ่านทั้งหมด (${cases.length} title + ${reasons.length} reason)`);
