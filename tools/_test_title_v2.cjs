// ทดสอบ buildDoneTitle: STAKE_DONE|R=..|P=..|S=..|D=yyyy-mm-dd :: <อ่านได้>
const fs = require('fs');
const vm = require('vm');

const src = fs.readFileSync('stake_extension/content.js', 'utf8').replace(/\r\n/g, '\n');
const a = src.indexOf('    function deriveStopCode(rStr)');
const b = src.indexOf('    function stopSession(reason');
if (a < 0 || b < 0) throw new Error('slice fail');
const code = src.slice(a, b);

function build(pnl, step, bal, start, account) {
  const sandbox = {
    getBalance: () => bal, currentBalance: bal, startBalance: start,
    profit: 0, realStep: step, mStep: step, accountName: account,
    String, Number, isFinite, Date,
  };
  vm.createContext(sandbox);
  vm.runInContext(code + '\nthis.__f = buildDoneTitle;', sandbox);
  return sandbox.__f;
}

const cases = [
  ['🎯 ถึงเป้ากำไร: +0.42 USDT', 0.42, 3, 15.42, 15, 'WIN'],
  ['🛑 [HARD STOP] แพ้ครบ 22 ไม้ติด!', -11.25345, 22, 3.74655, 15, 'LADDER_EXHAUSTED'],
  ['⏰ ครบเวลาและยอดเซสชันเป็นบวก', 0.1, 5, 15.1, 15, 'TIME'],
  ['🚨 หยุดฉุกเฉินด้วยปุ่ม ESC', 0, 1, 15, 15, 'MANUAL'],
  ['🚨 DESYNC: ยอดจริงต่าง 0.5', -0.2, 8, 14.8, 15, 'DESYNC'],
];

// R, P, S บังคับ · D ไม่บังคับ (รองรับทั้งฟอร์แมตมี/ไม่มี)
// หมายเหตุ: buildDoneTitle ในโค้ดปัจจุบันอ่านไม้จาก mStep (Martingale) ไม่ใช่ realStep
//          เคส LADDER_EXHAUSTED ยังทดสอบ mapping ของ deriveStopCode ได้ แม้โค้ดจะไม่มีเพดานไม้แล้ว
//          เคส SESSION_MAX_LOSS ถูกถอดออกจากเทสต์ เพราะ build 2026.11.18+64-nostop ถอดตัวตัดขาดทุนออกแล้ว
const RE = /^STAKE_DONE\|R=([A-Z_]+)\|P=(-?[0-9.]+)\|S=([0-9]+)(?:\|D=([0-9]{4}-[0-9]{2}-[0-9]{2}))?\s::/;

let fail = 0;
for (const [reason, pnl, step, bal, start, expCode] of cases) {
  const title = build(pnl, step, bal, start, 'Anda')(reason);
  const m = title.match(RE);
  const pnlOk = m && Math.abs(parseFloat(m[2]) - pnl) < 1e-9;
  const ok = !!(m && m[1] === expCode && pnlOk && parseInt(m[3], 10) === step &&
    title.indexOf('STAKE_DONE') === 0 && title.length <= 200);
  if (!ok) fail++;
  console.log((ok ? 'PASS' : 'FAIL') + ' | len=' + String(title.length).padStart(3) + ' | ' + title);
  if (!m) console.log('       !! regex ไม่ match');
  else if (m[1] !== expCode) console.log('       !! code=' + m[1] + ' คาด ' + expCode);
}

console.log(fail === 0 ? '\nผ่านทั้งหมด' : '\nล้มเหลว ' + fail);
process.exit(fail === 0 ? 0 : 1);
