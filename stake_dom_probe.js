/* ============================================================================
   stake_dom_probe.js — เก็บข้อมูล DOM ของ Stake Dice (อ่านอย่างเดียว)
   ----------------------------------------------------------------------------
   วิธีใช้
     1) เปิด stake.com → เกม Dice → เลือกโหมด Manual
     2) กด F12 → แท็บ Console
     3) วางโค้ดทั้งหมดนี้ แล้วกด Enter
     4) จะได้ JSON และถูกคัดลอกลงคลิปบอร์ดอัตโนมัติ → ส่งกลับมาให้ตรวจ

   ความปลอดภัย
     - ไม่กดเดิมพัน / ไม่แก้ค่าในช่อง / ไม่แตะเงิน
     - ไม่อ่าน cookie, localStorage, session token หรือข้อมูลบัญชี
     - ไม่ส่งข้อมูลออกอินเทอร์เน็ต (ไม่มีการเรียก fetch/XHR เลย)
   ========================================================================== */
(() => {
  'use strict';

  const q = (sel) => { try { return document.querySelector(sel); } catch (e) { return null; } };
  const rectOf = (el) => { const r = el.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; };

  const info = (el) => {
    if (!el) return null;
    const r = rectOf(el);
    return {
      tag: el.tagName.toLowerCase(),
      value: el.value,
      min: el.getAttribute('min'),
      max: el.getAttribute('max'),
      step: el.getAttribute('step'),
      type: el.type || null,
      inputmode: el.inputMode || null,
      testid: el.getAttribute('data-testid'),
      aria: el.getAttribute('aria-label'),
      visible: r.w > 1 && r.h > 1,
      size: r.w + 'x' + r.h,
      disabled: !!el.disabled
    };
  };

  // ---------- 1. องค์ประกอบหลักที่บอทต้องใช้ ----------
  const amount = q('input[data-testid="input-game-amount"]')
    || q('[data-testid="input-game-amount"] input')
    || q('input[data-analytics="input-game-amount"]')
    || q('input[data-testid="bet-amount"]')
    || q('[data-testid="bet-amount"] input');

  const chance = q('input[data-testid="chance"]')
    || q('[data-testid="chance"] input')
    || q('input[data-testid="input-game-chance"]')
    || q('[data-testid="input-game-chance"] input');

  const betBtn = q('button[data-testid="bet-button"]')
    || q('button[data-analytics="bet-button"]')
    || q('button[data-analytics="game-bet-button"]')
    || q('button[data-testid="game-play-button"]');

  // ---------- 2. ช่องตัวเลขทั้งหมด (สำหรับ auto-adapt) ----------
  const numberInputs = Array.from(document.querySelectorAll(
    'input[type="number"], input[inputmode="decimal"], input[inputmode="numeric"], input:not([type])'
  )).filter((el) => el.type !== 'hidden').map(info);

  // ---------- 3. ปุ่มทั้งหมด (ตัดข้อความยาว) ----------
  const buttons = Array.from(document.querySelectorAll('button')).slice(0, 60).map((b) => {
    const r = rectOf(b);
    return {
      text: (b.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 28),
      testid: b.getAttribute('data-testid'),
      aria: b.getAttribute('aria-label'),
      disabled: !!b.disabled,
      ariaDisabled: b.getAttribute('aria-disabled'),
      visible: r.w > 1 && r.h > 1,
      size: r.w + 'x' + r.h
    };
  });

  // ---------- 4. data-testid ที่มีในหน้า (ช่วยเดาโครงสร้างใหม่) ----------
  const testids = Array.from(document.querySelectorAll('[data-testid]'))
    .map((e) => e.getAttribute('data-testid'))
    .filter((v, i, a) => v && a.indexOf(v) === i)
    .sort()
    .slice(0, 150);

  // ---------- 5. ตัวเลือกยอดเงิน (ช่วยแก้ getBalance) ----------
  const balanceCandidates = Array.from(document.querySelectorAll('span, div'))
    .filter((e) => e.children.length === 0)
    .map((e) => {
      const t = (e.textContent || '').trim().replace(/,/g, '');
      const n = /^\d+(\.\d+)?$/.test(t) ? parseFloat(t) : null;
      return n === null ? null : {
        text: (e.textContent || '').trim().slice(0, 20),
        value: n,
        testid: e.getAttribute('data-testid'),
        cls: (e.className || '').toString().slice(0, 48),
        inHeader: !!e.closest('header, nav')
      };
    })
    .filter(Boolean)
    .slice(0, 20);

  // ---------- 6. บริบทอื่น ๆ ----------
  const panel = q('[data-testid="game-frame"]')
    || q('[data-testid="game-sidebar"]')
    || q('[data-testid="dice-game"]');
  const hasInstantBet = Array.from(document.querySelectorAll('span, label, div'))
    .some((n) => n.children.length <= 1 && /^(เดิมพันในทันที|instant\s*bet)$/i.test((n.textContent || '').trim()));
  const manualTab = q('button[data-testid="manual-tab"]') || q('button[data-analytics="manual-bet-button"]');

  const report = {
    probe: 'stake_dom_probe@1',
    time: new Date().toISOString(),
    url: location.href.replace(/([?&](?:token|session|key)=)[^&]+/gi, '$1***'),

    // สรุปที่สำคัญที่สุด
    summary: {
      panelFound: !!panel,
      amountInput: amount ? 'OK' : 'MISSING',
      chanceInput: chance ? 'OK' : 'MISSING',
      betButton: betBtn ? 'OK' : 'MISSING',
      amountHasMinMax: !!(amount && (amount.getAttribute('min') || amount.getAttribute('max'))),
      amountHasStep: !!(amount && amount.getAttribute('step')),
      payoutFieldFound: !!q('input[data-testid="payout"]') || !!q('[data-testid="payout"] input'),
      hasForm: !!(amount && amount.closest('form')),
      manualTab: manualTab ? 'OK' : 'MISSING',
      instantBetToggle: hasInstantBet ? 'found' : 'not found'
    },

    amount: info(amount),
    chance: info(chance),
    betButton: betBtn ? {
      text: (betBtn.textContent || '').trim(),
      testid: betBtn.getAttribute('data-testid'),
      disabled: !!betBtn.disabled,
      ariaDisabled: betBtn.getAttribute('aria-disabled'),
      size: rectOf(betBtn).w + 'x' + rectOf(betBtn).h,
      inForm: !!betBtn.closest('form')
    } : null,
    numberInputs,
    buttons,
    testids,
    balanceCandidates,
    panelHTML: panel ? panel.outerHTML.slice(0, 1500) : null
  };

  // ---------- แสดงผล ----------
  const s = report.summary;
  console.log('%c🧩 STAKE DOM PROBE', 'font-weight:bold;font-size:14px;color:#00e676');
  console.log(
    'แผงเกม[' + (s.panelFound ? '✓' : '✗') + '] ' +
    'ช่องยอด[' + s.amountInput + '] ' +
    'ช่องโอกาส[' + s.chanceInput + '] ' +
    'ปุ่มเดิมพัน[' + s.betButton + '] ' +
    'min/max[' + (s.amountHasMinMax ? '✓' : '✗') + '] ' +
    'form[' + (s.hasForm ? '✓' : '✗') + ']'
  );
  if (report.amount) console.table([report.amount]);
  if (report.betButton) console.log('ปุ่มเดิมพัน:', report.betButton);
  console.log('ช่องตัวเลขทั้งหมด:', numberInputs.length, '| ปุ่ม:', buttons.length, '| testid:', testids.length);
  console.log('--- JSON (คัดลอกแล้ว) ---');
  console.log(JSON.stringify(report, null, 2));

  const json = JSON.stringify(report);
  try {
    if (typeof copy === 'function') { copy(json); console.log('✅ คัดลอก JSON ลงคลิปบอร์ดแล้ว — วางส่งกลับมาได้เลย'); }
    else { console.log('ℹ️ เบราว์เซอร์นี้ไม่มี copy() — ให้คลิกขวาที่ Object ด้านบนแล้ว Copy object'); }
  } catch (e) {
    console.log('ℹ️ คัดลอกอัตโนมัติไม่สำเร็จ — ให้คลิกขวาที่ Object ด้านบนแล้ว Copy object');
  }

  return report;
})();
