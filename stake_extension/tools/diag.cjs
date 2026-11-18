// tools/diag.cjs — อ่านไฟล์ diag ล่าสุดจาก Downloads แล้วสรุปให้ AI อ่าน (ผู้ใช้ไม่ต้องทำอะไร)
// ใช้: node tools/diag.cjs [โฟลเดอร์] [--all]
const fs = require('fs');
const path = require('path');

const dir = process.argv[2] && !process.argv[2].startsWith('--')
    ? process.argv[2]
    : 'C:/Users/Lenovo/Downloads';
const all = process.argv.includes('--all');

let files = [];
try {
    files = fs.readdirSync(dir)
        .filter(f => /^stake_diag_.*\.json$/.test(f))
        .map(f => ({ f: f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
        .sort((a, b) => b.t - a.t);
} catch (e) {
    console.log('อ่านโฟลเดอร์ไม่ได้: ' + e.message);
    process.exit(1);
}

const picks = all ? files.slice(0, 5) : files.slice(0, 1);
if (!picks.length) { console.log('ไม่พบไฟล์ stake_diag_*.json ใน ' + dir); process.exit(2); }

function hhmmss(ms) { const d = new Date(ms); return d.toLocaleString('th-TH'); }

for (const p of picks) {
    const full = path.join(dir, p.f);
    console.log('\n════════ ' + p.f + '  (' + hhmmss(p.t) + ') ════════');
    let j;
    try { j = JSON.parse(fs.readFileSync(full, 'utf8')); }
    catch (e) { console.log('ไฟล์เสีย/อ่านไม่ได้: ' + e.message); continue; }

    console.log('เวอร์ชัน: ' + j.version + ' | เวลา: ' + j.time + ' | entries: ' + j.entries + (j.instance ? ' | instance: ' + j.instance : ''));
    if (j.env) console.log(`env: ${j.env.url} | top=${j.env.topFrame} | ${j.env.viewport} | ${j.env.tz}`);
    if (j.config) {
        const c = j.config;
        console.log(`config: chance=${c.chance}% | base=${c.dynamicBase ? 'dynamic' : 'fixed'} | fib=${c.fibMax} | ลม: แพ้ ${c.lossTrigger} → ชนะ ${c.winTarget} | 0$ในช่อง=${c.zeroInField} | เพดานนอกเงื่อนไข=${c.capNonWin} (${c.maxRolls} ตา/${Math.round((c.maxMs || 0) / 1000)} วิ) | stall=${c.stallLimit} | เวลาเซสชัน=${c.sessionMaxMinutes} นาที`);
    }

    if (j.summary) {
        const s = j.summary;
        console.log(`สรุป: ไม้ ${s.bets} · ชนะ ${s.wins} · แพ้ ${s.losses} · P/L ${s.net} · ยอดคลาด ${s.gaps}`);
    }
    if (j.state) {
        const st = j.state;
        console.log(`สถานะ: step ${st.step}/${st.maxStep} · running=${st.running} · inBet=${st.inBet} · desync=${st.desyncStrikes}`);
        console.log(`แทงลม: mode=${st.virtualMode} เป้า=${st.virtualTarget} พักไม้=${st.parkedStep} (${st.parkedAmount}) ชนะติด=${st.virtualWinStreak} รวม=${st.virtualWinsInRun} ทอย=${st.virtualRolls} stall=${st.virtualStallCount}`);
        console.log(`ช่องยอด: "${st.fieldValue}" | เขียน 0 ในช่อง=${st.zeroInField} | ${st.zeroModeText}`);
    }

    if (j.stats) {
        const t = j.stats;
        console.log(`สถิติ: ไม้ ${t.bets} (จริง ${t.realBets}/ลม ${t.virtualBets}) · ชนะ ${t.wins} แพ้ ${t.losses} · latency จริง ${t.avgLatencyRealMs}ms / ลม ${t.avgLatencyVirtualMs}ms`);
        console.log(`เครือข่าย: คำขอ ${t.diceReq} · ตอบมีทอย ${t.respWithRoll} · ตอบไม่มีทอย ${t.respNoRoll} · ทอยซ้ำตัด ${t.dupBlocked} · ทอยใหม่ที่รับ ${t.rollSeen ?? 0} (มีคำขอ ${t.rollWithReq ?? 0})`);
        if (t.avgVirtualClickToReqMs !== null && t.avgVirtualClickToReqMs !== undefined) {
            console.log(`เวลาไม้ลม: คลิก→คำขอ ${t.avgVirtualClickToReqMs}ms · คำขอ→ทอย ${t.avgVirtualReqToRollMs}ms`);
        }
        console.log(`สุขภาพ: heal ${t.heals} · stall ${t.stalls} · desync ${t.desync} · ${t.sessionMinutes} นาที`);
    }

    // 🔎 VERIFY — สรุปว่าการแก้ล่าสุดทำงานจริงไหม (มีใน build 171+)
    if (j.verify) {
        const v = j.verify;
        console.log('\n— ตรวจการแก้ล่าสุด (verify) —');
        if (v.side) console.log(`   ฝั่ง: ต้องการ ${v.side.want} · กดบนเว็บ ${v.side.appliedOnPage} · เว็บตอบ ${v.side.lastServerCondition}/${v.side.lastServerTarget} | click ${v.side.clicks} · miss ${v.side.misses} · mismatch ${v.side.mismatches}`);
        if (v.recovery) console.log(`   คืนทุน: 2-WIN ok ${v.recovery.twoWinRecovered} · short ${v.recovery.twoWinShort} | BALANCE_RESET ${v.recovery.balanceReset} · BALANCE_SHORT ${v.recovery.balanceShort}`);
        if (v.virtual) console.log(`   แทงลม: เป้าชนะ ${v.virtual.lockTarget} (ตั้งไว้ ${v.virtual.winTarget}) · mode=${v.virtual.mode} · ออกแล้ว ${v.virtual.exits} ครั้ง`);
        if (v.ledger) console.log(`   ledger ล่าสุด: ${v.ledger.lastSide} ${v.ledger.lastTarget}`);
    }

    const an = j.analysis;
    if (an) {
        const list = Array.isArray(an) ? an : (an.findings || []);
        console.log('\n— วิเคราะห์อัตโนมัติ (' + list.length + ') —');
        if (!list.length) console.log('   (ไม่พบปัญหา)');
        for (const f of list.slice(0, 15)) {
            console.log('   • [' + (f.level || f.severity || 'info') + '] ' + (f.title || f.msg || JSON.stringify(f)) + (f.detail ? ' — ' + JSON.stringify(f.detail).slice(0, 300) : ''));
        }
    }

    const events = j.events || [];
    const important = events.filter(e => /STOP|VIRTUAL|DESYNC|HEAL|ERROR|PUMP|ZERO_DUP|STALL|NOBET|FIRST_BET|SIDE_|BALANCE_RESET|TWO_WIN/.test(e.type));
    console.log('\n— เหตุการณ์สำคัญ (' + important.length + ') —');
    for (const e of important.slice(-25)) {
        console.log('   ' + (e.time || '').slice(11, 19) + ' ' + e.type + ' ' + JSON.stringify(e.data || {}).slice(0, 260));
    }

    const bets = j.bets || [];
    console.log('\n— ไม้ล่าสุด (' + bets.length + ') —');
    for (const b of bets.slice(-20)) {
        const extra = [
            b.roll !== null && b.roll !== undefined ? 'ทอย ' + b.roll : null,
            b.target ? 'เป้า ' + b.target + '%' : null,
            b.cond || null,
            b.seq !== null && b.seq !== undefined ? 'seq ' + b.seq : null,
            b.latencyMs !== null && b.latencyMs !== undefined ? b.latencyMs + 'ms' : null
        ].filter(Boolean).join(' · ');
        console.log(`   #${b.n} ${(b.time || '').slice(11, 19)} ไม้ ${b.step} ยอด ${b.amount} ${b.win ? 'ชนะ' : 'แพ้'} Δ${b.delta} bal ${b.balance} [${b.source || ''}]${extra ? ' (' + extra + ')' : ''}`);
    }

    // 🔎 DOM ที่เห็นตอนหาปุ่มฝั่งไม่เจอ — เอาไว้ล็อก selector ให้ตรงกับหน้าเว็บจริง
    const missDom = events.filter(e => e.type === 'SIDE_CONTROL_MISS' && e.data && Array.isArray(e.data.dom)).pop();
    if (missDom) {
        console.log('\n— DOM รอบช่องเดิมพัน (ตอนหาปุ่ม UNDER ไม่เจอ) —');
        for (const d of missDom.data.dom.slice(0, 40)) {
            const extra = [d.testid ? 'testid=' + d.testid : null, d.role ? 'role=' + d.role : null, d.aria ? 'aria=' + d.aria : null, d.ph ? 'ph=' + d.ph : null, d.val ? 'val=' + d.val : null].filter(Boolean).join(' ');
            console.log(`   ${d.tag} "${d.text || ''}" ${extra} @${d.x},${d.y}`);
        }
    }

    // log ของกฎใหม่ (2-WIN / BALANCE RESET / ฝั่งเดิมพัน)
    const marks = (j.logs || []).filter(l => /2-WIN|BALANCE RESET|SIDE_CONTROL|SIDE_MISMATCH/.test(l.msg || ''));
    if (marks.length) {
        console.log('\n— log ตรวจสอบ (กฎใหม่) —');
        for (const l of marks.slice(-12)) console.log('   ' + (l.time || '').slice(11, 19) + ' ' + String(l.msg || '').slice(0, 220));
    }

    const z = events.filter(e => e.type === 'ZERO_REQUEST' || e.type === 'ZERO_RESULT' || e.type === 'ZERO_STALL');
    if (z.length) {
        console.log('\n— ทอยลม (ZERO_*) ล่าสุด 10 —');
        for (const e of z.slice(-10)) console.log('   ' + (e.time || '').slice(11, 19) + ' ' + e.type + ' ' + JSON.stringify(e.data || {}).slice(0, 200));
    }

    const snaps = events.filter(e => e.type === 'SNAP');
    if (snaps.length) {
        console.log('\n— SNAP (ทุก 60 วิ) ล่าสุด 4 —');
        for (const e of snaps.slice(-4)) console.log('   ' + (e.time || '').slice(11, 19) + ' ' + JSON.stringify(e.data || {}).slice(0, 220));
    }

    for (const e of events.filter(e => /DICE_EMPTY|SITE_ERROR|NOBET_PROBE|FIRST_BET/.test(e.type)).slice(-6)) {
        console.log('   ⚠ ' + (e.time || '').slice(11, 19) + ' ' + e.type + ' ' + JSON.stringify(e.data || {}).slice(0, 320));
    }

    const errs = events.filter(e => e.type === 'ERROR');
    if (errs.length) {
        console.log('\n— ERROR (' + errs.length + ') —');
        for (const e of errs.slice(-5)) console.log('   ' + JSON.stringify(e.data || {}).slice(0, 300));
    }
}
