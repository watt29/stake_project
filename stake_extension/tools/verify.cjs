// tools/verify.cjs — "log ตรวจ" รวมทุกอย่างไว้ที่เดียว
// ตรวจโค้ด (build/ค่าคงที่/guard ที่ต้องมี) + ตรวจไฟล์ diag → PASS / WARN / FAIL
//
// ใช้:
//   node tools/verify.cjs                                  ตรวจโค้ดอย่างเดียว
//   node tools/verify.cjs "D:/"                            ตรวจโค้ด + diag ล่าสุดในโฟลเดอร์
//   node tools/verify.cjs "D:/stake_diag_xxx.json"         ตรวจโค้ด + diag ไฟล์ที่ระบุ
//   node tools/verify.cjs "D:/" --log logs/my.log          กำหนดที่เก็บ log เอง
//
// Exit code: 0 = ผ่าน (ไม่มี FAIL) · 1 = มี FAIL · 2 = อ่านไฟล์ไม่ได้

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
let logPath = null;
const rest = [];
for (let i = 0; i < args.length; i++) {
    if (args[i] === '--log') { logPath = args[++i]; continue; }
    rest.push(args[i]);
}
const target = rest[0] || null;

const lines = [];
let fails = 0;
let warns = 0;

function out(line) { lines.push(line); console.log(line); }
function ok(cond, label, extra) {
    if (cond) out('✔ ' + label + (extra ? '   ' + extra : ''));
    else { fails++; out('✘ ' + label + (extra ? '   ' + extra : '')); }
}
function warn(cond, label, extra) {
    if (cond) out('✔ ' + label + (extra ? '   ' + extra : ''));
    else { warns++; out('⚠ ' + label + (extra ? '   ' + extra : '')); }
}
function info(line) { out('ℹ ' + line); }
function section(name) { out(''); out('── ' + name + ' ' + '─'.repeat(Math.max(0, 52 - name.length))); }

// ─────────────────────────────────────────────
// 0) ตรวจสูตรยอดเดิมพัน (K=2) ย้อนจาก ledger
//    หลักการ: เดินตาม state machine ของ content.js ทีละไม้ แล้วคำนวณ "ยอดที่ควรเป็น"
//    เทียบกับยอดจริงใน diag — ตรวจที่ "ยอดเงิน" จริง ไม่ใช่แค่เทียบข้อความโค้ด
// ─────────────────────────────────────────────
const MIN_BET = 0.00012;
function roundUpBet(v) {
    if (!(v > 0)) return MIN_BET;
    return v >= 0.01 ? Math.ceil(v * 1e4 - 1e-12) / 1e4 : Math.ceil(v * 1e8 - 1e-6) / 1e8;
}
// สูตรเดียวกับ calculateCurrentBetAmount() โหมด hybrid/K=2 (build 199+)
function expectedBet(step, streak, closeAll, deficit, base, skipStep2) {
    if (step === 1) return base;
    let raw;
    if (streak >= 1) raw = deficit > 0 ? deficit + base : base;          // Hit 2
    else if (closeAll && !(skipStep2 && step <= 2)) raw = deficit > 0 ? deficit + base : base; // Close-All (build 206: ยกเว้นไม้ 2)
    else raw = deficit > 0 ? (deficit / 2) + base : base;                // Hit 1 (ครึ่งหนี้)
    return Math.max(MIN_BET, roundUpBet(raw));
}
function auditBetFormula(bets, opts) {
    const skipStep2 = !!(opts && opts.closeAllSkipStep2);
    const res = {
        checked: 0, match: 0, bad: 0, skipped: 0, rows: [],
        step2Full: 0, step2Half: 0, step2Other: 0, step2FullHit2: 0, step2FullCloseAll: 0, cycles: 0
    };
    let base = null, cycleStart = null, step = 1, streak = 0, closeAll = false;
    for (const b of (bets || [])) {
        const amt = Number(b.amount);
        const bal = Number(b.balance);
        const delta = Number(b.delta);
        const isReal = b.source !== 'VIRTUAL' && isFinite(amt) && amt > 0;
        if (!isReal) continue;
        const balBefore = isFinite(bal) && isFinite(delta) ? bal - delta : null;

        if (b.step === 1) {
            // ไม้ 1 = ยอดฐานของรอบ → ล็อกฐาน/จุดเริ่มรอบ (ไม่รีเซ็ต streak เพราะโค้ดจริงไม่รีเซ็ต)
            base = amt; cycleStart = balBefore; step = 1; res.cycles++;
        } else if (base === null || cycleStart === null || balBefore === null) {
            res.skipped++; continue;
        } else {

            const deficit = Math.max(0, cycleStart - balBefore);
            const exp = expectedBet(b.step, streak, closeAll, deficit, base, skipStep2);
            const tol = exp >= 0.01 ? 1e-4 + 1e-9 : 1e-7;
            const diff = Math.abs(amt - exp);
            res.checked++;
            if (diff <= tol) res.match++;
            else {
                res.bad++;
                if (res.rows.length < 8) {
                    res.rows.push({
                        n: b.n, step: b.step, streak: streak, closeAll: closeAll,
                        deficit: +deficit.toFixed(8), base: +base.toFixed(8),
                        exp: +exp.toFixed(8), act: +amt.toFixed(8),
                        ratio: base > 0 ? +(amt / base).toFixed(2) : null
                    });
                }
            }
            if (b.step === 2) {
                const full = deficit > 0 ? deficit + base : base;
                const half = deficit > 0 ? (deficit / 2) + base : base;
                if (Math.abs(amt - roundUpBet(full)) <= tol) {
                    res.step2Full++;
                    // แยกเหตุผล: Hit 2 (ชนะไม้ 1 มาแล้ว) = ถูกต้องทุก build · Close-All ที่ไม้ 2 = กฎเก่า (build <206)
                    if (streak >= 1) res.step2FullHit2++; else res.step2FullCloseAll++;
                }
                else if (Math.abs(amt - roundUpBet(half)) <= tol) res.step2Half++;
                else res.step2Other++;
            }
        }

        // ── อัปเดต state ตามลำดับใน handleBetResult() ──
        const prevStreak = streak;
        if (b.win) {
            streak = streak > 0 ? streak + 1 : 1;
            closeAll = false;
            if (bal >= cycleStart - 1e-9) {
                // รีเซ็ตรอบ — ⚠️ โค้ดจริงไม่รีเซ็ต currentStreak → คงไว้ (สำคัญ: ไม้ 1 แพ้ต่อจากชนะ → Close-All)
                step = 1; cycleStart = bal; base = null; // ฐานใหม่รอไม้ 1 ถัดไป
            } else {
                step = Math.max(2, b.step - 1); // หนี้ยังเหลือ → ไม่ตกไปไม 1
            }
        } else {
            closeAll = (prevStreak >= 1);   // ชนะแล้วแพ้ → ธง Close-All
            streak = -1;
            step = Math.min(20, b.step + 1);
        }
    }
    return res;
}

out('════ log ตรวจ (verify) ════ ' + new Date().toISOString());
out('โปรเจกต์: ' + ROOT);

// ─────────────────────────────────────────────
// 1) ตรวจโค้ด
// ─────────────────────────────────────────────
section('โค้ด (content.js / manifest.json)');

let src = '';
try {
    src = fs.readFileSync(path.join(ROOT, 'content.js'), 'utf8');
} catch (e) {
    out('✘ อ่าน content.js ไม่ได้: ' + e.message);
    process.exit(2);
}

let manifest = null;
try {
    manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
} catch (e) {
    out('✘ อ่าน manifest.json ไม่ได้: ' + e.message);
    process.exit(2);
}

// syntax (compile only — ไม่รัน)
let syntaxOK = true;
let syntaxErr = '';
try { new Function(src); } catch (e) { syntaxOK = false; syntaxErr = e.message; }
ok(syntaxOK, 'content.js compile ผ่าน (ไม่มี syntax error)', syntaxOK ? '' : syntaxErr);

const mBuild = src.match(/const BUILD_NO\s*=\s*(\d+);/);
const buildNo = mBuild ? Number(mBuild[1]) : null;
const mVer = src.match(/const EXT_VERSION\s*=\s*["']([^"']+)["']/);
const extVer = mVer ? mVer[1] : null;

ok(buildNo !== null, 'มี BUILD_NO ใน content.js', buildNo !== null ? 'build ' + buildNo : '');
ok(/session: \{\s*\n\s*bets: PERF\.bets/.test(src), 'diag มีบล็อก session (สรุปทั้งเซสชัน ไม่ขึ้นกับบัฟเฟอร์)', 'build 200+');
ok(/maxDrawdown: parseFloat\(Number\(maxDrawdown/.test(src) && /maxDrawdownPct:/.test(src) && /peakBalance: \(peakBalance === null/.test(src), 'diag มี DD สูงสุดของเซสชัน (maxDrawdown/maxDrawdownPct/peakBalance)', 'build 207+');
ok(/id="sniperMiniTime"/.test(src) && /function updateMiniTimer\(\)/.test(src), 'แผงย่อมีนาฬิกาเวลาทำงาน/เวลาที่เหลือ', 'build 203+');
ok(/function applyAutoMini\(collapse\)/.test(src) && /applyAutoMini\(true\);/.test(src) && /applyAutoMini\(false\);/.test(src), 'mini bar อัตโนมัติ: เริ่มแทงย่อเอง/หยุดแล้วขยายกลับ', 'build 204+');
ok((src.match(/perfReset\(/g) || []).length >= 3, 'perfReset ถูกเรียกครบ 3 เส้นทาง (manual / auto-start / resume)', 'count=' + (src.match(/perfReset\(/g) || []).length);
ok(extVer !== null && manifest.version === extVer, 'version ใน manifest ตรงกับ EXT_VERSION',
    'manifest=' + manifest.version + ' ext=' + extVer);
const title = (manifest.action && manifest.action.default_title) || '';
ok(buildNo !== null && title.indexOf('build ' + buildNo) >= 0, 'title บน HUD ตรงกับ build',
    title);

// ค่าคงที่ของโหมดแทงลม (build 192)
ok(/const VIRTUAL_ROLL_WAIT_MS = 1000;/.test(src), 'ไม้ 0$ รอทอย 1,000 ms');
ok(/const VIRTUAL_NUDGE_MAX = 3;/.test(src) && /const VIRTUAL_NUDGE_AT_MS = 250;/.test(src),
    'คลิกซ้ำ 3 ครั้งที่ 250/500/750 ms');
ok(/const VIRTUAL_WRITE_SETTLE_MS = 180;/.test(src),
    'รอ 180 ms หลังเขียนช่อง 0 ก่อนคลิก (คลิกทันทีถูกเมิน)');
ok(/nudges < VIRTUAL_NUDGE_MAX && waited >= VIRTUAL_NUDGE_AT_MS \* \(nudges \+ 1\) && serverRollSeq === dispatchRollSeq/.test(src),
    'เงื่อนไขคลิกซ้ำอิง "ยังไม่มีทอยใหม่" (ไม่ใช่สัญญาณคำขอ)');

// guard สำคัญ
ok(/stallTimer = setTimeout\(function \(\)/.test(src), 'มีตัวตัดสิน STALL อิสระ (ไม้ 0$ ไม่ค้าง 12 วิ)');
ok(/const hardTimer = setTimeout\(function \(\)/.test(src) && /HANG_TIMER/.test(src),
    'มี per-bet hard timeout (HANG_TIMER) ไม่พึ่ง setInterval');
ok(/const maxTimeout = 3000;/.test(src), 'ไม้จริงที่คลิกไม่ติดจบใน 3 วิ (ไม่รอ 6 วิ)');
ok(/function lastBetSignal\(\)/.test(src), 'มี lastBetSignal() (สัญญาณคำขอสำรอง)');
ok(/ZERO_SWITCH_BLOCK/.test(src), 'มี guard กันสลับ "ยอดจริงในช่อง" ตอน rewrite ตาย (กันเงินจริงหลุด)');
ok(/const sideOK = \(pageSideApplied === currentRollSide\)/.test(src),
    'การข้าม applyBetSettings เช็ก "ฝั่งตรง" ด้วย');
ok(/document\.addEventListener\("visibilitychange"/.test(src), 'watchdog ตรวจซ้ำเมื่อแท็บกลับมาแสดง');
ok(/perf: perfSnapshot\(\)/.test(src), 'มี PERF ใน diag (stats.perf)');

// ─────────────────────────────────────────────
// 2) ตรวจ diag (ถ้าระบุ)
// ─────────────────────────────────────────────
let diagFile = null;
if (target) {
    try {
        const st = fs.statSync(target);
        if (st.isDirectory()) {
            const cands = fs.readdirSync(target)
                .filter(f => /^stake_diag_.*\.json$/.test(f))
                .map(f => ({ f: path.join(target, f), t: fs.statSync(path.join(target, f)).mtimeMs }))
                .sort((a, b) => b.t - a.t);
            if (cands.length) diagFile = cands[0].f;
        } else {
            diagFile = target;
        }
    } catch (e) {
        out('✘ อ่าน path ที่ระบุไม่ได้: ' + e.message);
    }
}

if (!target) {
    info('ไม่ได้ระบุ diag — ตรวจโค้ดอย่างเดียว (ใส่ path ได้ เช่น node tools/verify.cjs "D:/")');
} else if (!diagFile) {
    warn(false, 'ไม่พบไฟล์ stake_diag_*.json ใน path ที่ระบุ');
} else {
    section('diag: ' + path.basename(diagFile));
    let j = null;
    try { j = JSON.parse(fs.readFileSync(diagFile, 'utf8')); }
    catch (e) { out('✘ อ่าน diag ไม่ได้: ' + e.message); }

    if (j) {
        const events = Array.isArray(j.events) ? j.events : [];
        const types = events.map(e => e.type || e.k);
        const count = (t) => types.filter(x => x === t).length;

        info('version: ' + j.version + ' · time: ' + j.time + ' · events: ' + events.length);

        const expectVer = (extVer && buildNo !== null) ? (extVer + '+' + buildNo) : null;
        warn(!expectVer || j.version === expectVer, 'diag รัน build ล่าสุด',
            'diag=' + j.version + ' โค้ด=' + expectVer);

        const hang = count('HANG');
        const stall = count('ZERO_STALL');
        const nudge = count('ZERO_NUDGE');
        const vclick = count('ZERO_CLICK');
        const errs = count('ERROR');
        const swBlock = count('ZERO_SWITCH_BLOCK');
        const hardHit = count('HANG_TIMER');

        ok(errs === 0, 'ไม่มี ERROR ในเซสชัน', 'ERROR=' + errs);

        if (vclick === 0) {
            info('เซสชันนี้ยังไม่มีไม้ 0$ — ข้ามการตรวจความเร็ว/ค้างของโหมดลม');
        } else {
            ok(hang === 0, 'ไม่มี HANG ในช่วงแทงลม', 'HANG=' + hang);
            info('ZERO_STALL=' + stall + (stall === 0 ? ' (ไม่มีไม้ที่พลาดทอย — ดีที่สุด)' : ''));
            ok(nudge <= vclick * 3, 'คลิกซ้ำไม่เกิน 3 ครั้งต่อไม้ 0$',
                'ZERO_NUDGE=' + nudge + ' / ZERO_CLICK=' + vclick);
            const vresult = count('ZERO_RESULT');
            // การตัดทอน diag ที่ขอบบัฟเฟอร์อาจเก็บ RESULT แต่ตัด CLICK ตัวแรกออก → อัตรา >100%
            const vok = Math.min(vresult, vclick);
            const rate = vclick ? vok / vclick : 1;
            const overCount = vresult > vclick;
            const db = parseInt(String(j.version || '').split('+')[1] || '0', 10) || 0;
            if (db >= 197) {
                ok(rate >= 0.75, 'ไม้ 0$ ได้ทอยจริง ≥75%',
                    'สำเร็จ ' + vok + '/' + vclick + ' = ' + Math.round(rate * 100) + '%' +
                    (overCount ? ' (RESULT มากกว่า CLICK ' + (vresult - vclick) + ' รายการ — ขอบบัฟเฟอร์ diag)' : ''));
            } else if (rate < 0.75) {
                info('ไม้ 0$ สำเร็จ ' + vresult + '/' + vclick + ' = ' + Math.round(rate * 100) +
                    '% (ตรวจเข้มเฉพาะ build 197+)');
            }
            if (stall === 0 && hang > 0) out('ℹ STALL=0 แต่มี HANG — ตัวตัดสิน STALL ยังไม่ทำงาน');
            if (swBlock > 0) info('ZERO_SWITCH_BLOCK=' + swBlock + ' (ปกติ: rewrite amount=0 ตาย → ไม่สลับไปยอดจริง)');
            if (hardHit > 0) info('HANG_TIMER=' + hardHit + ' ครั้ง (มีไม้ไม่จบตามเวลา — ดู elapsed ใน event)');
        }

        const perf = j.stats && j.stats.perf;
        const diagBuild = parseInt(String(j.version || '').split('+')[1] || '0', 10) || 0;
        if (!perf) {
            const msg = 'diag ยังไม่มี stats.perf (PERF เริ่มมีตั้งแต่ build 191)';
            if (diagBuild && diagBuild < 191) info(msg + ' — ไฟล์เก่า ปกติ');
            else warn(false, msg, 'ต้อง build ≥191 และจบไม้อย่างน้อย 1 ไม้');
        } else if (!perf.bets) {
            // ไฟล์ start = ถ่ายตอนกด START (ยังไม่มีไม้) → ไม่ใช่ปัญหา
            info('PERF ยังไม่มีข้อมูลไม้ (ไฟล์ start ถ่ายก่อนไม้แรก) — ข้ามการตรวจความเร็ว');
        } else {
            const vw = perf.virtual && perf.virtual.avgWaitMs;
            ok(typeof perf.avgPrepMs === 'number' && perf.avgPrepMs < 100, 'prep ต่อไม้ < 100 ms',
                'avgPrep=' + perf.avgPrepMs + 'ms max=' + perf.maxPrepMs + 'ms');
            ok(typeof perf.shareWaitPct === 'number', 'มีสัดส่วนการรอ (shareWaitPct)',
                'wait=' + perf.shareWaitPct + '% cpu=' + perf.shareCpuPct + '%');
            // PERF ต้องรีเซ็ตทุก START — ถ้านับสะสมข้ามเซสชัน ตัวเลขจะไม่ตรงจำนวนรอบ
            // ⚠️ จำนวนไม้จริง = session.bets (build 200+) หรือ n ของไม้ล่าสุด เพราะบัฟเฟอร์ diag เก็บแค่ 1500 event สุดท้าย
            const sess = j.session || null;
            if (sess && sess.perfResumed) info('PERF รอบนี้เริ่มนับจากจุด resume (เซสชันกู้คืนหลังรีเฟรช) — ไม่เทียบคกับจำนวนไม้ทั้งเซสชัน');
            const maxN = (j.bets || []).reduce((m, b) => Math.max(m, Number(b.n) || 0), 0);
            const trueBets = Math.max(sess ? (sess.bets || 0) : 0, maxN);
            const bufBets = (j.summary && j.summary.bets) || 0;
            if (trueBets > 0 && !(sess && sess.perfResumed)) {
                warn(Math.abs((perf.bets || 0) - trueBets) <= Math.max(5, Math.round(trueBets * 0.15)),
                    'perf.bets ตรงกับจำนวนรอบของเซสชัน (ไม่สะสมข้ามเซสชัน)',
                    'perf=' + perf.bets + ' คาด≈' + trueBets);
            }
            if (trueBets > bufBets + 5) {
                info('diag ถูกตัดทอน: เห็นไม้ในไฟล์ ' + bufBets + '/' + trueBets +
                    ' (บัฟเฟอร์เก็บแค่ท้ายเซสชัน — ตัวเลข summary จึงเป็นเฉพาะช่วงท้าย)');
            }
            if (typeof vw === 'number') {
                ok(vw <= 1000, 'ไม้ 0$ รอ ≤1,000 ms (เป้า 660-800)', 'avgWait=' + vw + 'ms');
                warn(vw <= 1500, 'ไม้ 0$ รอไม่เกิน 1,500 ms', 'avgWait=' + vw + 'ms');
            } else {
                info('ยังไม่มีข้อมูล PERF ของไม้ 0$');
            }
        }

        // ── ตรวจยอดเดิมพันจริง vs สูตร K=2 ที่คำนวณย้อนจาก ledger ──
        const betRuleBuild = parseInt(String(j.version || '').split('+')[1] || '0', 10) || 0;
        const fa = auditBetFormula(j.bets || [], { closeAllSkipStep2: betRuleBuild >= 206 });
        info('สูตรที่ใช้เทียบ: ' + (betRuleBuild >= 206 ? 'build 206+ (ไม้ 2 ยกเว้น Close-All → ครึ่งหนี้)' : 'ก่อน 206 (Close-All ทำงานที่ไม้ 2 ด้วย)'));
        if (fa.checked > 0) {
            ok(fa.bad === 0, 'ยอดเดิมพันตรงสูตร K=2 (คำนวณย้อนจาก ledger)',
                'ตรวจ ' + fa.checked + ' ไม้ · ตรง ' + fa.match + ' · ไม่ตรง ' + fa.bad +
                ' (ข้าม ' + fa.skipped + ' ไม้ช่วงต้นรอบ · ' + fa.cycles + ' รอบ)');
            if (fa.step2Full + fa.step2Half + fa.step2Other > 0) {
                info('ไม้ 2: เต็มหนี้ ' + fa.step2Full + ' ครั้ง (Hit 2 ชนะไม้ 1 มาแล้ว ' + fa.step2FullHit2 +
                    ' · Close-All ' + fa.step2FullCloseAll + ') · ครึ่งหนี้ ' + fa.step2Half + ' ครั้ง · อื่น ๆ ' + fa.step2Other);
                if (betRuleBuild >= 206 && fa.step2FullCloseAll > 0) {
                    fail('build ≥206 แต่ไม้ 2 ยังมี Close-All เต็มหนี้ ' + fa.step2FullCloseAll + ' ครั้ง (ควรเป็นครึ่งหนี้)');
                }
            }
            for (const r of fa.rows) {
                info('ไม้ n=' + r.n + ' step=' + r.step + ' streak=' + r.streak + ' closeAll=' + (r.closeAll ? 1 : 0) +
                    ' หนี้=' + r.deficit + ' ฐาน=' + r.base +
                    ' → คาด ' + r.exp + ' จริง ' + r.act + ' (' + r.ratio + 'x ฐาน)');
            }
            if (fa.checked > 10 && fa.bad / fa.checked > 0.5) {
                info('ยอดไม่ตรงสูตรเกินครึ่ง — อาจเป็นโหมด Fibonacci หรือ ledger เริ่มกลางรอบ (ไม่ใช่ FAIL ของเงิน)');
            }
        } else {
            info('ledger ไม่พอตรวจสูตร (ต้องมีไม้จริงในรอบที่เริ่มในไฟล์อย่างน้อย 2 ไม้)');
        }

        const s = j.summary || {};
        ok((s.gaps || 0) === 0, 'summary.gaps = 0', 'gaps=' + (s.gaps || 0));
        if (j.session) {
            const S = j.session;
            info('ผลทั้งเซสชัน (ตัวนับจริง): ไม้ ' + (S.bets || 0) + ' (จริง ' + (S.realBets || 0) + ' · ลม ' + (S.virtualBets || 0) +
                ') · ชนะ ' + (S.wins || 0) + ' · แพ้ ' + (S.losses || 0) + ' · P/L ' + (S.net || 0) +
                ' · maxStep ' + (S.maxStep || 0) + ' · ' + (S.minutes || 0) + ' นาที');
            if (S.truncated) info('หมายเหตุ: ไม้ในช่วงท้ายในไฟล์เท่านั้นที่มีรายละเอียด (bets/events)');
            // 📉 DD สูงสุดของเซสชัน (build 207+) — วัดจากยอดพีคที่เคยสูงสุด
            if (typeof S.maxDrawdown === 'number') {
                const pk = (typeof S.peakBalance === 'number') ? S.peakBalance : null;
                info('DD สูงสุด ' + S.maxDrawdown.toFixed(6) + '$' +
                    (pk ? ' = ' + (S.maxDrawdownPct || 0) + '% ของยอดพีค ' + pk.toFixed(4) : '') +
                    (S.net >= 0 ? ' · จบเซสชันเป็นบวก (DD ไม่ทำให้แตะ 0)' : ' · จบติดลบ'));
                ok(S.maxDrawdown >= 0 && (!pk || S.maxDrawdown <= pk + 1e-9),
                    'ค่า DD สมเหตุสมผล (ไม่ติดลบ และไม่เกินยอดพีค)',
                    'DD=' + S.maxDrawdown + (pk ? ' / peak=' + pk : ''));
            } else {
                info('diag นี้ไม่มี DD (ต้องรัน build 207+ ขึ้นไป)');
            }
        } else {
            info('ผลเซสชัน (เฉพาะไม้ในไฟล์): ไม้ ' + (s.bets || 0) + ' · ชนะ ' + (s.wins || 0) + ' · แพ้ ' + (s.losses || 0) + ' · P/L ' + (s.net || 0));
        }
    }
}

// ─────────────────────────────────────────────
// 3) สรุป + เขียน log
// ─────────────────────────────────────────────
section('สรุป');
out((fails === 0 ? '✅ ผ่าน' : '❌ มีปัญหา') + ' — FAIL ' + fails + ' · WARN ' + warns);

const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '');
const finalLog = logPath || path.join(ROOT, 'logs', 'verify-' + stamp + '.log');
try {
    fs.mkdirSync(path.dirname(finalLog), { recursive: true });
    fs.writeFileSync(finalLog, lines.join('\n') + '\n', 'utf8');
    console.log('\n📝 บันทึก log: ' + finalLog);
} catch (e) {
    console.log('\n⚠ เขียน log ไม่ได้: ' + e.message);
}

process.exit(fails === 0 ? 0 : 1);
