// ทดสอบ buildDoneTitle โดยไม่ต้องรันบนเว็บจริง
const fs = require('fs');
const vm = require('vm');

const src = fs.readFileSync('stake_extension/content.js', 'utf8').replace(/\r\n/g, '\n');
const a = src.indexOf('    function deriveStopCode(rStr)');
const b = src.indexOf('    function stopSession(reason');
if (a < 0 || b < 0 || b <= a) throw new Error('slice fail a=' + a + ' b=' + b);
const code = src.slice(a, b);

function build(pnl, step, bal, start, account) {
  const sandbox = {
    getBalance: () => bal,
    currentBalance: bal,
    startBalance: start,
    profit: 0,
    realStep: step,
    accountName: account,
    String, Number, isFinite, Date,
  };
  vm.createContext(sandbox);
  vm.runInContext(code + '\nthis.__f = buildDoneTitle;', sandbox);
  return sandbox.__f;
}

const cases = [
  ['🎯 ถึงเป้ากำไร: +0.42 USDT (Hit & Run สำเร็จ!)', 0.42, 3, 15.42, 15],
  ['🛑 ตัดขาดทุนเซสชัน: ขาดทุน 11.25$ ถึงเพดาน 11.25$', -11.25, 22, 3.75, 15],
  ['🛑 [HARD STOP] แพ้ครบ 22 ไม้ติด!', -11.25345, 22, 3.74655, 15],
  ['⏰ ครบเวลาและยอดเซสชันเป็นบวก', 0.1, 5, 15.1, 15],
  ['🚨 DESYNC: ยอดจริงต่าง 0.5 จากที่คำนวณ 3 ครั้งติด', -0.2, 8, 14.8, 15],
  ['🚨 หยุดฉุกเฉินด้วยปุ่ม ESC', 0, 1, 15, 15],
  ['🔒 พบอีกแท็บกำลังเดิมพัน', -0.01, 2, 14.99, 15],
  ['🛑 ยอดไม้ 0.5$ เกินเพดานเว็บ 0.3$', -0.01, 6, 14.99, 15],
];

const RE = /STAKE_DONE\|R=([A-Z_]+)\|P=(-?[0-9.]+)\|S=([0-9]+)\|D=([0-9]{4}-[0-9]{2}-[0-9]{2})/;

let fail = 0;
for (const [reason, pnl, step, bal, start] of cases) {
  const title = build(pnl, step, bal, start, 'Anda')(reason);
  const m = title.match(RE);
  const pnlOk = m && Math.abs(parseFloat(m[2]) - pnl) < 1e-9;
  const ok = !!(m && m[1] && pnlOk && parseInt(m[3], 10) === step && m[4].length === 10 && title.indexOf('STAKE_DONE') === 0);
  if (!ok) fail++;
  console.log((ok ? 'PASS' : 'FAIL') + ' | len=' + String(title.length).padStart(3) + ' | ' + title);
  if (m) console.log('       code=' + m[1] + ' pnl=' + m[2] + ' step=' + m[3] + ' day=' + m[4]);
  if (title.length > 200) { console.log('       !! ยาวเกิน 200 (GetWindowText เพดาน 512)'); fail++; }
}
console.log(fail === 0 ? '\nผล: ผ่านทั้งหมด ' + cases.length + ' เคส' : '\nผล: ล้มเหลว ' + fail);
process.exit(fail === 0 ? 0 : 1);
