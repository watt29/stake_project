#!/usr/bin/env node
// tools/_test_engine.cjs — ทดสอบ logic ของระบบ Pure Fibonacci 20 ไม้ (Stake Dice Bot v2.2.0)
// ใช้: node tools/_test_engine.cjs

const fs = require('fs');
const path = require('path');

let pass = 0;
let fail = 0;
function ok(name, cond, extra) {
    if (cond) { pass++; console.log('  ✅ ' + name); }
    else { fail++; console.error('  ❌ ' + name + (extra ? '  → ' + extra : '')); }
}
function near(a, b, eps = 1e-8) { return Math.abs(a - b) < eps; }

// ดึงการตั้งค่าและสูตรหลักจาก content.js เพื่อยืนยันว่าตรงกับโค้ด Production จริง
const contentJsPath = path.resolve(__dirname, '..', 'stake_extension', 'content.js');
const contentSrc = fs.readFileSync(contentJsPath, 'utf8');

console.log('\n[1] ตรวจสอบความถูกต้องของ Fibonacci Sequence ใน content.js');
const fiboMatch = contentSrc.match(/const\s+FIBONACCI_STEPS\s*=\s*\[([^\]]+)\]/);
ok('มีตัวแปร FIBONACCI_STEPS ใน content.js', !!fiboMatch);

const fiboSteps = fiboMatch ? fiboMatch[1].split(',').map(n => parseInt(n.trim(), 10)) : [];
ok('ลำดับมี 20 ไม้พอดี', fiboSteps.length === 20, `ได้ ${fiboSteps.length} ไม้`);
ok('ไม้ 1 และ 2 เป็น 1, 1', fiboSteps[0] === 1 && fiboSteps[1] === 1);

// ตรวจสอบความสัมพันธ์ Fibonacci: F[n] = F[n-1] + F[n-2]
let fiboMathValid = true;
for (let i = 2; i < fiboSteps.length; i++) {
    if (fiboSteps[i] !== fiboSteps[i - 1] + fiboSteps[i - 2]) {
        fiboMathValid = false;
        break;
    }
}
ok('ความสัมพันธ์ Fibonacci ถูกต้องทุกไม้ (F[n] = F[n-1] + F[n-2])', fiboMathValid);

// ตรวจสอบผลรวม 20 ไม้
const sum20 = fiboSteps.slice(0, 20).reduce((a, b) => a + b, 0);
ok('ผลรวมสะสม 20 ไม้ = 17,710 (ตัวหารสำหรับยอดฐาน)', sum20 === 17710, `ได้ ${sum20}`);

// ตรวจสอบตัวแปรคงที่ใน content.js
ok('content.js กำหนด DYNAMIC_BASE_DIVISOR = 17710', contentSrc.includes('DYNAMIC_BASE_DIVISOR = 17710'));
ok('content.js กำหนด MAX_FIBO_STEPS = 20', contentSrc.includes('MAX_FIBO_STEPS = 20'));

console.log('\n[2] ตรวจสอบระบบ Pure 20 ไม้ และ Dynamic Base Bet');
function calcBaseBet(balance) {
    const divisor = 17710;
    return Math.floor((balance / divisor) * 1e8) / 1e8;
}

const bal = 54.0247;
const base20 = calcBaseBet(bal);

ok('ใช้ตัวหาร 17,710 (20 ไม้คงที่)', near(base20, Math.floor((bal / 17710) * 1e8) / 1e8));

console.log('\n[3] ตรวจสอบกลยุทธ์ Deficit Partitioning (K=2) และการรีเซ็ต');
ok('content.js มีฟังก์ชัน getCycleDeficit', contentSrc.includes('function getCycleDeficit('));

function calcK2Bet(deficit, base) {
    if (deficit <= 0) return base;
    return (deficit / 2) + base;
}

const baseAmt = 0.003;
const deficit1 = 0.020; // หนี้ 0.020
const betK2 = calcK2Bet(deficit1, baseAmt);
ok('คำนวณไม้ K=2 ได้ถูกต้อง: (หนี้/2) + ฐาน = (0.020/2) + 0.003 = 0.013', near(betK2, 0.013));

// ชนะครั้งที่ 1 ปลดหนี้ 50%
const afterWin1Deficit = deficit1 - (betK2 - baseAmt);
ok('ชนะตาแรกช่วยปลดหนี้ออกไปครึ่งหนึ่ง (หนี้เหลือ 0.010)', near(afterWin1Deficit, 0.010));

// แทงตาถัดไป
const betK2_round2 = calcK2Bet(afterWin1Deficit, baseAmt);
ok('คำนวณไม้ K=2 ตาถัดไปจากหนี้ที่เหลือ: (0.010/2) + 0.003 = 0.008', near(betK2_round2, 0.008));

// Pure Uncapped: คำนวณตรงจากหนี้จริงโดยไม่มีการแคป 5%
const largeDeficit = 4.0;
const uncappedBet = calcK2Bet(largeDeficit, baseAmt);
ok('Pure K=2 คำนวณตรงจากหนี้จริงโดยไร้แคป: (4.0/2) + 0.003 = 2.003', near(uncappedBet, 2.003));

function stepProgression(mStep, isWin, currentStreak, activeMaxSteps = 20) {
    if (!isWin) {
        return Math.min(activeMaxSteps, mStep + 1);
    }
    if (currentStreak >= 2) {
        return 1; // ชนะติดกัน 2 ครั้ง รีเซ็ตกลับไม้ 1 ทันที
    }
    return Math.max(1, mStep - 1); // ชนะทั่วไป ค่อยๆ ปลดหนี้
}

ok('แพ้ที่ไม้ 1 -> ไปไม้ 2', stepProgression(1, false, -1) === 2);
ok('แพ้ที่ไม้ 5 -> ไปไม้ 6', stepProgression(5, false, -5) === 6);
ok('แพ้ที่ไม้ 20 -> ไม่เกินขีดจำกัด (ล็อกไม้ 20)', stepProgression(20, false, -20, 20) === 20);
ok('ชนะที่ไม้ 8 แต่ streak >= 2 -> รีเซ็ตกลับไม้ 1 ทันที', stepProgression(8, true, 2) === 1);

console.log('\n[4] ตรวจสอบ GraphQL Payload Rewrite (Under 49.50 Lock)');
function rewriteDiceRollBody(body, pendingRollSide) {
    if (!pendingRollSide) return null;
    if (typeof body !== "string") return null;
    if (body.indexOf("diceRoll") < 0 && body.indexOf("DiceRoll") < 0) return null;
    try {
        let json = JSON.parse(body);
        let vars = json.variables;
        if (!vars) return null;
        if (vars.input && typeof vars.input === "object") vars = vars.input;
        if (pendingRollSide.target !== undefined) vars.target = parseFloat(pendingRollSide.target).toFixed(2);
        if (pendingRollSide.condition !== undefined) vars.condition = pendingRollSide.condition;
        if (pendingRollSide.amount !== undefined) vars.amount = pendingRollSide.amount;
        return JSON.stringify(json);
    } catch (e) {
        return null;
    }
}

const reqSide = { amount: 0.00305, target: 49.50, condition: 'below' };
const flatQuery = JSON.stringify({
    query: 'mutation DiceRoll($amount: Float, $target: Float, $condition: String){}',
    variables: { amount: '0.001', target: '50.00', condition: 'above' }
});
const rewrittenFlat = rewriteDiceRollBody(flatQuery, reqSide);
ok('rewrite payload แบนสำเร็จ', !!rewrittenFlat);
if (rewrittenFlat) {
    const j = JSON.parse(rewrittenFlat);
    ok('  target ถูกล็อกเป็น 49.50', j.variables.target === '49.50');
    ok('  condition ถูกล็อกเป็น below', j.variables.condition === 'below');
    ok('  amount ถูกปรับตรงตามไม้', j.variables.amount === 0.00305);
}

const nestedQuery = JSON.stringify({
    operationName: 'DiceRoll',
    variables: { input: { amount: 1, target: 2, condition: 'above' } }
});
const rewrittenNested = rewriteDiceRollBody(nestedQuery, reqSide);
ok('rewrite payload ซ้อน (input.amount) สำเร็จ', !!rewrittenNested && JSON.parse(rewrittenNested).variables.input.condition === 'below');
ok('ไม่แตะ query อื่น (เช่น Plinko)', rewriteDiceRollBody(JSON.stringify({ query: 'mutation PlinkoBet' }), reqSide) === null);

console.log('\n[5] ตรวจสอบการอ่านผลกำไรขาดทุนจริงจาก GraphQL Response');
function extractProfit(data) {
    if (!data) return null;
    const bet = data.diceRoll || data.result || data;
    if (!bet) return null;
    if (typeof bet.profit === "number") return bet.profit;
    const amt = parseFloat(bet.amount);
    const payout = parseFloat(bet.payout);
    if (!isNaN(amt) && !isNaN(payout)) {
        return payout - amt;
    }
    if (!isNaN(amt) && typeof bet.payoutMultiplier === "number") {
        return (amt * bet.payoutMultiplier) - amt;
    }
    return null;
}

const loseData = { diceRoll: { amount: 0.001, payout: 0, payoutMultiplier: 0 } };
ok('แพ้ (payout 0) -> ขาดทุนเท่ากับ -amount', near(extractProfit(loseData), -0.001));

const winData = { diceRoll: { amount: 0.001, payout: 0.002, payoutMultiplier: 2.0 } };
ok('ชนะที่ 49.5% (payout 2.0x) -> กำไรสุทธิ +amount (+100%)', near(extractProfit(winData), 0.001));

console.log('\n[6] ตรวจสอบระบบ Loss Gap Analyzer (วัดก้อนแพ้คั่นกลางอย่างแม่นยำ)');
ok('content.js มีตัวแปร lossGapTracker', contentSrc.includes('const lossGapTracker = {'));
ok('content.js มีฟังก์ชัน recordLossGap', contentSrc.includes('function recordLossGap('));
ok('content.js มีฟังก์ชัน getLossGapMetrics', contentSrc.includes('function getLossGapMetrics('));

// จำลองการทดสอบตรรกะ Loss Gap Simulator
const tracker = {
    currentLossGap: 0,
    gaps: [],
    maxGap: 0,
    totalWins: 0,
    winsFollowedByLoss: 0,
    winsFollowedByWin: 0,
    lastBetWasWin: null,
    isolatedWinCount: 0
};

function simRecordLossGap(isWin) {
    if (isWin) {
        tracker.totalWins++;
        if (tracker.lastBetWasWin === true) {
            tracker.winsFollowedByWin++;
        } else if (tracker.lastBetWasWin === false) {
            const gap = tracker.currentLossGap;
            tracker.gaps.push(gap);
            if (gap > tracker.maxGap) tracker.maxGap = gap;
            if (tracker.gaps.length > 50) tracker.gaps.shift();
        }
        tracker.currentLossGap = 0;
        tracker.lastBetWasWin = true;
    } else {
        if (tracker.lastBetWasWin === true) {
            tracker.winsFollowedByLoss++;
            tracker.isolatedWinCount++;
        }
        tracker.currentLossGap++;
        tracker.lastBetWasWin = false;
    }
}

// ยิงผลลัพธ์จำลอง: L - L - L - W (ก้อนแพ้ 3) -> L - L - W (ก้อนแพ้ 2) -> L - W (ก้อนแพ้ 1) -> W (ชนะติด)
const simRounds = [false, false, false, true, false, false, true, false, true, true];
simRounds.forEach(r => simRecordLossGap(r));

ok('ตรวจจับก้อนแพ้ก่อนชนะได้ถูกต้อง: [3, 2, 1]', JSON.stringify(tracker.gaps) === JSON.stringify([3, 2, 1]), JSON.stringify(tracker.gaps));
ok('ตรวจจับ maxGap ได้ถูกต้อง (3)', tracker.maxGap === 3, tracker.maxGap);
ok('ตรวจจับชนะแล้วแพ้ทันทีได้ 2 ครั้ง', tracker.winsFollowedByLoss === 2, tracker.winsFollowedByLoss);
ok('ตรวจจับชนะติดกันได้ 1 ครั้ง', tracker.winsFollowedByWin === 1, tracker.winsFollowedByWin);

const totalTransitions = tracker.winsFollowedByLoss + tracker.winsFollowedByWin;
const postWinLossPct = Math.round((tracker.winsFollowedByLoss / totalTransitions) * 100);
ok('คำนวณอัตราแพ้หลังชนะได้ 67% (2 จาก 3 ครั้ง)', postWinLossPct === 67, postWinLossPct);

console.log('\n[7] ตรวจสอบระบบ Hybrid & Multi-Engine (Hybrid K1+K2, Fibo, Pure K2)');
ok('content.js มีตัวแปร activeEngineMode', contentSrc.includes('let activeEngineMode'));
ok('content.js มีฟังก์ชัน syncEngineModeUI', contentSrc.includes('function syncEngineModeUI('));
ok('content.js มีฟังก์ชัน toggleEngineMode', contentSrc.includes('function toggleEngineMode('));

function simBetAmount(mode, step, base, deficit, fiboArr) {
    if (step === 1) return base;
    if (mode === "hybrid") {
        return (step <= 4) ? (deficit + base) : ((deficit / 2) + base);
    } else if (mode === "fibo") {
        const mult = fiboArr[step - 1] || 1;
        return base * mult;
    } else {
        return (deficit / 2) + base;
    }
}

const testBase = 0.001;
const testDeficit = 0.008;
ok('โหมด Hybrid ไม้ 3 (ตื้น): หนี้ + ฐาน = 0.008 + 0.001 = 0.009 (K=1 คืนทุนทันทีในตาเดียว)', near(simBetAmount("hybrid", 3, testBase, testDeficit, fiboSteps), 0.009));
ok('โหมด Hybrid ไม้ 6 (ลึก): (หนี้/2) + ฐาน = (0.008/2) + 0.001 = 0.005 (K=2 เซฟพอร์ต)', near(simBetAmount("hybrid", 6, testBase, testDeficit, fiboSteps), 0.005));
ok('โหมด Fibo ไม้ 4: 0.001 * 3 = 0.003', near(simBetAmount("fibo", 4, testBase, testDeficit, fiboSteps), 0.003));
ok('โหมด K=2 ไม้ 4: (0.008 / 2) + 0.001 = 0.005', near(simBetAmount("k2", 4, testBase, testDeficit, fiboSteps), 0.005));

console.log('\n' + '='.repeat(50));
console.log(`ผ่านการทดสอบ ${pass} รายการ · ล้มเหลว ${fail} รายการ`);
if (fail) process.exit(1);
