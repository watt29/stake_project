// ตรวจโค้ดเชิงโครงสร้าง: หา TDZ, เรียกฟังก์ชันที่ไม่มีจริง, ตัวแปรที่ถูกลบแล้วยังถูกอ้าง, เส้นทางหยุด
const fs = require('fs');
const src = fs.readFileSync('content.js', 'utf8');
let fails = 0;
const ok = (c, label, extra) => { if (!c) fails++; console.log((c ? '✔ ' : '✘ ') + label + (extra ? '  ' + extra : '')); };

// 1) ตัวแปร/ค่าคงที่ที่ถูกลบไปแล้วแต่ยังถูกอ้าง
const removed = ['sessionLedger', 'sessionEvents', 'diagLog', 'diagContextSafe', 'safeJson', 'RESYNC_LIMIT', 'HEAL_LIMIT', 'virtualFieldZero', 'VIRTUAL_WRITE_ZERO_TO_FIELD', 'DESYNC_STRIKE_LIMIT_OLD'];
for (const name of removed) {
    const n = (src.match(new RegExp('\\b' + name + '\\b', 'g')) || []).length;
    ok(n === 0, `ไม่มีของเก่าค้าง: ${name}`, `(${n})`);
}

// 2) ฟังก์ชันที่ถูกเรียกต้องมีประกาศจริง
const declared = new Set();
for (const m of src.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g)) declared.add(m[1]);
for (const m of src.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g)) declared.add(m[1]);
const builtins = new Set(['if','for','while','switch','catch','return','typeof','function','new','do','else','try','async','await','constructor','super','alert','parseInt','parseFloat','isNaN','isFinite','setTimeout','setInterval','clearTimeout','clearInterval','requestAnimationFrame','fetch','String','Number','Boolean','Object','Array','Math','JSON','Date','Promise','Set','Map','Error','RegExp','Blob','URL','Event','KeyboardEvent','MouseEvent','PointerEvent','CustomEvent','MutationObserver','IntersectionObserver','BroadcastChannel','encodeURIComponent','decodeURIComponent','structuredClone','btoa','atob','copy','eval','Function','Symbol','Proxy','Reflect','BigInt','Intl','queueMicrotask']);
const missing = new Map();
for (const m of src.matchAll(/(?<![.\w$])([A-Za-z_$][\w$]*)\s*\(/g)) {
    const name = m[1];
    if (builtins.has(name) || declared.has(name)) continue;
    missing.set(name, (missing.get(name) || 0) + 1);
}
const missingList = [...missing.entries()].filter(([, c]) => c > 0);
ok(missingList.length === 0, 'ไม่มีการเรียกฟังก์ชันที่ไม่มีประกาศ', missingList.map(([n, c]) => `${n}×${c}`).join(', '));

// 3) TDZ ที่รู้จัก: ตัวแปร const ที่ถูกอ้างก่อนบรรทัดประกาศ (เฉพาะใน 40 บรรทัดก่อนหน้า)
const tdz = [];
const lines = src.split('\n');
for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s*(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=/);
    if (!m) continue;
    const name = m[1];
    for (let k = Math.max(0, i - 40); k < i; k++) {
        const re = new RegExp('(?<![.\\w$])' + name + '(?![\\w$])\\s*(?:\\)|,|\\})?');
        if (re.test(lines[k]) && !/^\s*\/\//.test(lines[k]) && !/const |let |var /.test(lines[k])) {
            tdz.push(`${name} @${k + 1} ก่อนประกาศ @${i + 1}`);
            break;
        }
    }
}
ok(tdz.length === 0, 'ไม่มีตัวแปรถูกใช้ก่อนประกาศ (TDZ)', tdz.slice(0, 5).join(' | '));

// 4) เส้นทางหยุดที่เหลือ (ควรมีแค่ตั้งใจ)
const stops = [...src.matchAll(/stopSession\(`?([^`,)]{0,60})/g)].map(m => m[1].trim());
console.log('\n— เส้นทาง stopSession ที่เหลือ —');
stops.forEach(s => console.log('   • ' + s.slice(0, 70)));

// 5) ฟังก์ชันสำคัญต้องมีครบ
for (const fn of ['executeNextBet', 'handleBetResult', 'shouldExitVirtualRun', 'resetVirtualRun', 'autoHeal', 'analyzeDiag', 'buildDiagExport', 'saveDiagToDisk', 'writeZeroToAmountInput', 'virtualZeroModeText', 'scheduleNextBet']) {
    ok(new RegExp('function\\s+' + fn + '\\s*\\(').test(src), `มีฟังก์ชัน ${fn}`);
}

// 6) safety net
ok(/window\.addEventListener\("unhandledrejection"/.test(src), 'มี unhandledrejection hook');
ok(/trace\("PUMP"/.test(src), 'มี PUMP กันเอนจินตาย');
ok(/try \{\s*\n\s*handleBetResult\(/.test(src), 'handleBetResult ถูกห่อ try/catch');

console.log(fails ? `\n${fails} ISSUE(S)` : '\nALL CLEAN');
process.exit(fails ? 1 : 0);
