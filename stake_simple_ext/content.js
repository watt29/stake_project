// stake_simple_ext — content script v3.7.0 (auto-start 5 วิ + ใส่โอกาสชนะ + ปุ่มหยุดฉุกเฉิน)
// โหลดที่ document_idle, world ISOLATED — แตะเฉพาะ DOM ไม่มีการเรียก API
(function () {
    'use strict';

    const LOG = (...a) => console.log('[autopilot]', ...a);
    LOG('content script v3.7.0 loaded:', location.href);
    const TICK_MS = 1200;          // รอบตรวจสอบ
    const CLICK_COOLDOWN = 3500;   // กันกดรัว
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    const VERSION = '3.7.0';           // โชว์บนแผง เพื่อยืนยันว่า Chrome โหลดโค้ดเวอร์ชันไหน
    const AUTO_START = true;          // เปิดหน้า Dice แล้วเริ่มเอง ไม่ต้องกด Arm
    const AUTO_START_DELAY = 5000;    // หน่วงหลังหน้าโหลด (ms)
    const AUTO_START_RETRY = 2000;    // ถ้ายังไม่พร้อม (หน้าโหลดไม่เสร็จ) ลองใหม่ทุก 2 วิ

    let baseAmount = 0.0005;    // ยอดเดิมพันเริ่มต้น
    let chance = 67;            // โอกาสชนะ (%) ที่จะใส่ให้เว็บ
    let target = 0.35;
    let limitBets = 0;   // จำนวนการเดิมพัน (0 = ไม่จำกัด)
    let armed = false;
    let advancedOpened = false;
    let startBal = null;
    let armedAt = 0;
    let lastClickAt = 0;
    let msg = 'พร้อมทำงาน';
    let ui = null;
    let autoStartAt = 0;       // เวลาที่จะเริ่มอัตโนมัติ
    let autoArmTimer = null;
    let userStopped = false;   // ผู้ใช้กดหยุด → ห้าม auto-start ซ้ำ
    let bets = 0;              // จำนวนครั้งที่สั่งเริ่ม Auto Bet สำเร็จ

    // ---------- utils ----------
    const visible = (el) => {
        if (!el) return false;
        const r = el.getBoundingClientRect();
        return r.width > 2 && r.height > 2;
    };
    const parseNum = (t) => {
        const m = String(t || '').replace(/[^0-9.\-]/g, '');
        const v = parseFloat(m);
        return isFinite(v) ? v : null;
    };
    const text = (el) => ((el && (el.textContent || '')) + ' ' + (el && el.getAttribute && (el.getAttribute('aria-label') || ''))).toLowerCase();

    function setValue(el, v) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(el, String(v));
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.blur();
    }

    // ---------- องค์ประกอบของเว็บ ----------
    function isButtonDisabled(btn) {
        return !!btn && (btn.disabled === true || btn.getAttribute('aria-disabled') === 'true');
    }

    function autoBetButton() {
        const byId = document.querySelector('button[data-testid="auto-bet-button"]');
        if (byId) return byId;
        const byStatus = document.querySelector('button[data-autobet-status]');
        if (byStatus) return byStatus;
        // สำรอง: บางสถานะ (ยังไม่ล็อกอิน/UI เปลี่ยน) ปุ่มไม่มี testid — หาจากข้อความไทย
        const btns = [...document.querySelectorAll('button')];
        return btns.find((b) => /การเดิมพันอัตโนมัติ/.test(b.textContent || '')) || null;
    }

    function isAutoBetRunning() {
        const btn = autoBetButton();
        if (!btn) return false;
        // ✅ HTML จริง: data-autobet-status="stop" = กำลังแทง · "start" = หยุดอยู่
        const status = (btn.getAttribute('data-autobet-status') || '').toLowerCase();
        if (status === 'stop') return true;
        if (status === 'start') return false;
        // fallback: ป้ายข้อความบนปุ่ม (ใช้เมื่อไม่มี attribute)
        return /หยุด/.test(btn.textContent || '');
    }

    // ขอบเขตแผง Auto Bet (ไล่ขึ้นไปจนเจอกลุ่มที่มีคำว่า อัตโนมัติ)
    function panelRoot() {
        let el = autoBetButton();
        let best = el ? el.parentElement : document.body;
        for (let i = 0; i < 7 && el; i++) {
            el = el.parentElement;
            if (el && /อัตโนมัติ|auto/i.test(el.textContent || '') && (el.textContent || '').length < 20000) best = el;
        }
        return best || document.body;
    }

    // แท็บ Advance / ขั้นสูง
    function findAdvancedTab() {
        // ✅ HTML จริง: <button data-testid="advanced-tab" data-analytics="advanced-bet-button">
        return document.querySelector('button[data-testid="advanced-tab"]') ||
               document.querySelector('[data-analytics="advanced-bet-button"]') ||
               null;
    }

    // ✅ HTML จริง: <input data-testid="input-game-amount" type="number" step="1e-8">
    function findAmountInput() {
        return document.querySelector('input[data-testid="input-game-amount"]') ||
               document.querySelector('label:has(input[data-testid="input-game-amount"]) input') ||
               null;
    }

    // ✅ HTML จริง: <input data-testid="limit-input" type="number"> = "จำนวนการเดิมพัน"
    function findLimitInput() {
        return document.querySelector('input[data-testid="limit-input"]') || null;
    }

    // แท็บถูกเลือกอยู่ไหม — Stake ใส่คลาส state-layer-inverse / !bg-(...) ให้แท็บ active
    function isTabActive(btn) {
        if (!btn) return false;
        const cls = btn.getAttribute('class') || '';
        if (/\bstate-layer-inverse\b/.test(cls)) return true;
        if (/!bg-/.test(cls)) return true;
        return btn.getAttribute('aria-selected') === 'true';
    }

    // กดแท็บแล้วรอจนเงื่อนไขสำเร็จ (ไม่รอเวลาตายตัว)
    async function clickTab(btn, label, ready, tries) {
        if (!btn) { LOG('ไม่พบแท็บ' + label); return false; }
        if (ready()) return true;
        LOG('กดแท็บ' + label + ':', (btn.textContent || '').trim().slice(0, 24) || '(ไอคอน)');
        btn.click();
        for (let i = 0; i < (tries || 16); i++) {
            await sleep(150);
            if (ready()) return true;
        }
        return false;
    }

    async function ensureAdvancedOpen() {
        if (advancedOpened && autoBetButton()) return true;

        const autoTab = document.querySelector('button[data-testid="auto-tab"]');
        const advTab = findAdvancedTab();

        // ① ยังอยู่แท็บ "กำหนดเอง" (ไม่มีปุ่ม Auto Bet) → เข้าแท็บอัตโนมัติ
        if (!autoBetButton()) {
            const okAuto = await clickTab(autoTab, 'อัตโนมัติ', () => !!autoBetButton(), 14);
            if (!okAuto) LOG('แท็บอัตโนมัติ: กดแล้วแต่ยังไม่เห็นปุ่ม Auto Bet');
        }

        // ② กดแท็บขั้นสูงให้ active จริง — ดูจากคลาส !state-layer-inverse / !bg-(...) ของแท็บ
        //    (ไม่ใช้แค่ "มี limit-input" เพราะแผงอาจโชว์อยู่ก่อนกด)
        if (isTabActive(advTab)) {
            pushLog('แท็บขั้นสูง: เปิดอยู่แล้ว');
        } else {
            const okAdv = await clickTab(advTab, 'ขั้นสูง', () => isTabActive(advTab), 16);
            pushLog(okAdv ? 'เปิดแท็บขั้นสูงแล้ว' : 'แท็บขั้นสูง: กดแล้วยังไม่ active');
            LOG('แท็บขั้นสูง active =', okAdv);
        }

        advancedOpened = isTabActive(advTab) || !!(findLimitInput() || autoBetButton());
        await sleep(200);

        if (autoBetButton()) return true;
        pushLog('เปิดแท็บขั้นสูงแล้ว แต่ยังไม่เจอปุ่ม Auto Bet');
        return false;
    }

    // ช่อง "โอกาสชนะ" ของหน้า Dice (ยังไม่เคยเห็น HTML จริง — ลองหลายแบบแล้วตรวจค่ากลับ)
    function findChanceInput() {
        const byId = document.querySelector('input[data-testid="chance"]') ||   // ✅ HTML จริง
                     document.querySelector('input[data-testid="input-game-chance"]') ||
                     document.querySelector('input[data-testid="chance-input"]') ||
                     document.querySelector('input[data-testid="bet-chance-input"]') ||
                     document.querySelector('input[data-testid="input-chance"]');
        if (byId) return byId;
        const nodes = Array.from(document.querySelectorAll('label'));
        for (const el of nodes) {
            const t = (el.textContent || '').toLowerCase();
            if (t.length > 90) continue;
            if (t.indexOf('โอกาสชนะ') < 0 && t.indexOf('chance') < 0) continue;
            const inp = el.querySelector('input');
            if (!inp) continue;
            const id = (inp.getAttribute('data-testid') || '') + (inp.getAttribute('name') || '');
            if (/amount|limit/i.test(id)) continue;
            return inp;
        }
        return null;
    }

    async function applyChance(pct) {
        if (!(pct > 0)) return false;
        const input = findChanceInput();
        if (!input) { LOG('ไม่พบช่องโอกาสชนะ — ใช้ค่าที่ตั้งบนเว็บ'); return false; }
        const cur = parseNum(input.value);
        if (cur !== null && Math.abs(cur - pct) < 0.01) return true;
        input.focus();
        setValue(input, pct);
        await sleep(260);
        const now = parseNum(input.value);
        const ok = now !== null && Math.abs(now - pct) < 0.5;
        pushLog('โอกาสชนะ ' + pct + '% ' + (ok ? 'ติดแล้ว' : 'ไม่ติด'));
        LOG('ใส่โอกาสชนะ =', pct, '→ อ่านกลับ =', now, ok ? '(ok)' : '(ไม่ติด)');
        return ok;
    }

    async function applyAmount(amount) {
        const input = findAmountInput();
        if (!input) { LOG('ไม่พบช่อง input-game-amount'); return false; }
        const cur = parseNum(input.value);
        if (cur === null || Math.abs(cur - amount) > 1e-12) {
            setValue(input, amount);
            LOG('ใส่ยอดเดิมพัน =', amount);
            await sleep(180);
        }
        // จำนวนการเดิมพัน (0 = ไม่แตะ ใช้ค่าที่ตั้งบนเว็บ)
        if (limitBets > 0) {
            const lim = findLimitInput();
            if (lim && parseNum(lim.value) !== limitBets) {
                setValue(lim, limitBets);
                LOG('ใส่จำนวนไม้ =', limitBets);
                await sleep(150);
            }
        }
        return true;
    }

    async function startAutoBet() {
        const btn = autoBetButton();
        if (!btn) { msg = 'ไม่พบปุ่ม Auto Bet'; return false; }
        if (isAutoBetRunning()) return true;
        // ปุ่มที่ disabled จะไม่ตอบ click() เลย — รายงานตรง ๆ ดีกว่ากดซ้ำเงียบ ๆ
        if (isButtonDisabled(btn)) {
            msg = 'ปุ่ม Auto Bet ถูกปิด (disabled) — เช็กยอดเงิน/จำนวนไม้ก่อน';
            pushLog('ปุ่มถูกปิด — กดไม่ติด');
            return false;
        }
        if (Date.now() - lastClickAt < CLICK_COOLDOWN) return false;
        lastClickAt = Date.now();
        await applyAmount(baseAmount);
        const chanceOk = await applyChance(chance);
        if (!chanceOk) msg = 'ตั้งโอกาสชนะ ' + chance + '% ไม่ได้ — ใช้ค่าบนเว็บ';
        btn.click();
        LOG('กดปุ่ม Auto Bet (เริ่ม)');
        await sleep(400);
        const startedOk = isAutoBetRunning();
        if (startedOk) { bets++; pushLog('เริ่ม Auto Bet (ยอด ' + baseAmount + ')'); }
        return startedOk;
    }

    async function stopAutoBet() {
        if (!isAutoBetRunning()) return true;
        const btn = autoBetButton();
        if (btn) { btn.click(); LOG('กดปุ่ม Auto Bet (หยุด)'); }
        await sleep(300);
        return !isAutoBetRunning();
    }

    function balance() {
        const el = document.querySelector('button[data-testid="wallet-balance-button"] span') ||
                   document.querySelector('button[data-testid="wallet-balance-button"]');
        return el ? parseNum(el.textContent) : null;
    }

    // ---------- ตรวจว่าเป็นหน้า Dice ไหม ----------
    function isDicePage() {
        const p = String(location.pathname || '').toLowerCase();
        if (p.indexOf('stake-dice') >= 0 || p.split('/').indexOf('dice') >= 0) return true;
        // สำรอง: หน้าเกมที่ยังไม่เปิดแท็บอัตโนมัติ ก็ต้องถือว่าใช่หน้า Dice
        const diceControls = document.querySelector('input[data-testid="chance"]') ||
                             document.querySelector('button[data-testid="bet-button"]');
        if (diceControls && findAdvancedTab()) return true;
        const h = document.querySelector('h1');
        const t = (document.title || '') + ' ' + (h ? h.textContent : '');
        return /dice|ลูกเต๋า/i.test(t);
    }

    // ---------- Arm (ใช้ร่วมกันทั้งปุ่มและ auto-start) ----------
    function armNow(reason) {
        if (refs['ap-base']) {          // อ่านค่าจากช่องในแผง (ถ้าแผงถูกสร้างแล้ว)
            const b = parseFloat(refs['ap-base'].value);
            const t = parseFloat(refs['ap-target'].value);
            const l = parseInt(refs['ap-limit'].value, 10);
            const c = parseFloat(refs['ap-chance'].value);
            if (b > 0) baseAmount = b;
            if (t > 0) target = t;
            if (c > 0 && c < 100) chance = c;
            limitBets = (isFinite(l) && l > 0) ? l : 0;
        }
        if (!(baseAmount > 0) || !(target > 0)) { msg = 'ค่าไม่ถูกต้อง — ยังไม่เริ่ม'; render(); return false; }
        userStopped = false;
        startBal = balance();
        armedAt = Date.now();
        armed = true;
        advancedOpened = false;
        msg = 'เริ่มทำงาน… (' + reason + ')';
        render();
        pushLog('arm: ' + reason + ' | ยอด ' + baseAmount + ' | เป้า ' + target);
        LOG('armed:', reason, 'base=' + baseAmount, 'target=' + target, 'limit=' + limitBets);
        return true;
    }

    // ---------- โหมดเริ่มอัตโนมัติเมื่อเปิดหน้า Dice ----------
    function scheduleAutoStart(delay) {
        if (autoArmTimer) clearTimeout(autoArmTimer);
        autoStartAt = Date.now() + delay;
        autoArmTimer = setTimeout(tryAutoStart, delay);
    }

    async function tryAutoStart() {
        autoArmTimer = null;
        if (!AUTO_START || armed || userStopped) return;
        if (!isDicePage() || !findAdvancedTab()) {
            msg = 'auto-start: รอหน้า Dice…';
            render();
            scheduleAutoStart(AUTO_START_RETRY);
            return;
        }
        autoStartAt = 0;
        // ลำดับ: เปิดหน้า → กด advanced-tab → ตรวจปุ่ม Auto Bet → ใส่ยอด/โอกาส → กดเริ่ม
        await ensureAdvancedOpen();
        if (!autoBetButton()) {
            msg = 'auto-start: เปิดแท็บขั้นสูงแล้ว แต่ยังไม่เจอปุ่ม Auto Bet — ลองใหม่';
            render();
            scheduleAutoStart(AUTO_START_RETRY);
            return;
        }
        if (isAutoBetRunning()) {
            msg = 'auto-start: เว็บกำลังแทงอยู่แล้ว — ไม่เริ่มซ้ำ';
            render();
            return;
        }
        armNow('auto-start');
    }

    // ---------- ลูปอัตโนมัติ ----------
    async function tick() {
        if (!armed) { render(); return; }

        // ต้องเปิดแท็บให้เสร็จก่อน — ปุ่ม Auto Bet เกิดหลังแท็บอัตโนมัติ/ขั้นสูง
        if (!advancedOpened) await ensureAdvancedOpen();
        if (!autoBetButton()) { msg = 'ยังไม่พบปุ่ม Auto Bet — เปิดแท็บอัตโนมัติของ Dice ก่อน'; render(); return; }

        // เป้าหมายกำไร
        const bal = balance();
        if (bal !== null && startBal !== null) {
            const pnl = bal - startBal;
            if (pnl >= target) {
                armed = false;
                await stopAutoBet();
                pushLog('ถึงเป้า ' + fmtPnl(pnl) + ' → หยุด');
                msg = 'ถึงเป้า +' + pnl.toFixed(5) + '$ → หยุดแล้ว';
                render(bal);
                return;
            }
        }

        // เห็นปุ่ม = ใส่จำนวน + กด
        if (!isAutoBetRunning()) {
            await applyAmount(baseAmount);
            const ok = await startAutoBet();
            msg = ok ? 'กดเริ่ม Auto Bet แล้ว' : 'รอกดปุ่มอีกครั้ง…';
        } else {
            msg = 'เว็บกำลังแทงอัตโนมัติ';
        }
        render(bal);
    }

    // ---------- แผงแดชบอร์ดบนหน้าเว็บ ----------
    let logs = [];
    let collapsed = false;
    let refs = {};                                  // cache DOM ของแผง (กัน querySelector ซ้ำทุกเฟรม)

    const POS_KEY = '_ap_ui_pos_v1';                 // คีย์พรางตา (ไม่ใช้ชื่อบอท)
    const DRAG_SLOP = 4;                             // ขยับเกิน 4px = ลาก ไม่ใช่คลิก
    const IN_STYLE = 'width:100%;margin-top:2px;padding:4px 6px;background:#0f212e;color:#e8eef2;border:1px solid #2f4553;border-radius:6px;font:11.5px system-ui,sans-serif';

    function pushLog(text) {
        logs.push(new Date().toTimeString().slice(0, 8) + ' · ' + text);
        if (logs.length > 6) logs.shift();
    }

    function fmtPnl(v) { return (v >= 0 ? '+' : '') + v.toFixed(5); }

    function stateLine() {
        if (!AUTO_START) return 'auto-start: ปิด';
        if (userStopped) return 'auto-start: ปิด (กด Arm เพื่อเริ่มใหม่)';
        if (autoStartAt > Date.now()) return 'auto-start ในอีก ' + ((autoStartAt - Date.now()) / 1000).toFixed(1) + ' วิ';
        return 'auto-start: กำลังตรวจหน้า…';
    }

    function elapsedText() {
        const sec = armedAt ? Math.round((Date.now() - armedAt) / 1000) : 0;
        return sec ? Math.floor(sec / 60) + 'm ' + (sec % 60) + 's' : '—';
    }

    // ---------- ตำแหน่งแผง ----------
    function clampPos(box, x, y) {
        const w = box ? box.offsetWidth : 266;
        const h = box ? Math.min(box.offsetHeight, 46) : 46;   // เผื่อแค่หัวแผงพอ
        const maxX = Math.max(DRAG_SLOP, window.innerWidth - w - DRAG_SLOP);
        const maxY = Math.max(DRAG_SLOP, window.innerHeight - h - DRAG_SLOP);
        return { x: Math.min(Math.max(DRAG_SLOP, x), maxX), y: Math.min(Math.max(DRAG_SLOP, y), maxY) };
    }

    function placePanel(box, x, y) {
        const p = clampPos(box, x, y);
        box.style.left = p.x + 'px';
        box.style.top = p.y + 'px';
        box.style.right = 'auto';
        return p;
    }

    function loadPos() {
        try {
            const v = JSON.parse(localStorage.getItem(POS_KEY) || 'null');
            if (v && isFinite(v.x) && isFinite(v.y)) return v;
        } catch (e) { /* ข้าม */ }
        return null;
    }

    function savePos(x, y) {
        try { localStorage.setItem(POS_KEY, JSON.stringify({ x: Math.round(x), y: Math.round(y) })); } catch (e) { /* ข้าม */ }
    }

    // ---------- ตัวช่วยของแผง ----------
    function setText(id, txt, color) {
        const el = refs[id];
        if (!el) return;
        el.textContent = txt;
        if (color) el.style.color = color;
    }

    function fillConfigInputs() {
        if (!refs['ap-base']) return;
        refs['ap-base'].value = baseAmount;
        refs['ap-chance'].value = chance;
        refs['ap-target'].value = target;
        refs['ap-limit'].value = limitBets;
    }

    function buildUI() {
        const box = document.createElement('div');
        box.id = 'ap-panel';
        box.style.cssText = 'position:fixed;top:14px;right:14px;z-index:2147483647;width:266px;background:#0f212e;color:#e8eef2;border:1px solid #2f4553;border-radius:12px;font:12px/1.45 system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.5);overflow:hidden';
        box.innerHTML = [
            '<div id="ap-head" style="display:flex;align-items:center;justify-content:space-between;padding:9px 12px;border-bottom:1px solid #2f4553;cursor:move;user-select:none">',
            '                      <strong style="color:#00e676;font-size:12.5px"><span id="ap-dot" style="color:#7d8b98">●</span> Autopilot <span id="ap-ver" style="color:#6c7f8c;font-size:10px;font-weight:400">v' + VERSION + '</span></strong>',
            '  <span style="color:#9fb0bd;font-size:11px"><span id="ap-hint">IDLE</span> <span id="ap-caret">▾</span></span>',
            '</div>',
            '<div id="ap-body">',
            '  <div style="padding:10px 12px 2px;display:flex;justify-content:space-between;align-items:flex-end">',
            '    <div><div style="color:#9fb0bd;font-size:11px">P/L เซสชัน</div><div id="ap-pl" style="font-size:21px;font-weight:700;font-variant-numeric:tabular-nums">—</div></div>',
            '    <div id="ap-target-lbl" style="color:#9fb0bd;font-size:11px">เป้า —</div>',
            '  </div>',
            '  <div style="display:grid;grid-template-columns:1fr auto;gap:3px 8px;padding:8px 12px 6px;font-size:11.5px">',
            '    <span style="color:#9fb0bd">ยอดเงิน</span><span id="ap-bal" style="text-align:right;font-variant-numeric:tabular-nums">—</span>',
            '    <span style="color:#9fb0bd">Auto Bet เว็บ</span><span id="ap-run" style="text-align:right;font-variant-numeric:tabular-nums">—</span>',
            '    <span style="color:#9fb0bd">เวลาเซสชัน</span><span id="ap-elapsed" style="text-align:right;font-variant-numeric:tabular-nums">—</span>',
            '    <span style="color:#9fb0bd">จำนวนไม้ที่สั่ง</span><span id="ap-bets" style="text-align:right;font-variant-numeric:tabular-nums">—</span>',
            '    <span style="color:#9fb0bd">แท็บขั้นสูง</span><span id="ap-adv" style="text-align:right;font-variant-numeric:tabular-nums">—</span>',
            '    <span style="color:#9fb0bd">ช่องโอกาสชนะ</span><span id="ap-chance-ok" style="text-align:right;font-variant-numeric:tabular-nums">—</span>',
            '  </div>',
            '  <div style="padding:2px 12px 8px;display:grid;grid-template-columns:1fr 1fr;gap:6px">',
            '    <label style="color:#9fb0bd;font-size:11px">ยอดเดิมพัน<input id="ap-base" type="text" style="' + IN_STYLE + '"></label>',
            '    <label style="color:#9fb0bd;font-size:11px">โอกาสชนะ (%)<input id="ap-chance" type="text" style="' + IN_STYLE + '"></label>',
            '    <label style="color:#9fb0bd;font-size:11px">เป้ากำไร<input id="ap-target" type="text" style="' + IN_STYLE + '"></label>',
            '    <label style="color:#9fb0bd;font-size:11px">จำนวนไม้ (0=ไม่จำกัด)<input id="ap-limit" type="text" style="' + IN_STYLE + '"></label>',
            '  </div>',
            '  <div style="padding:0 12px 8px;display:grid;grid-template-columns:1fr 1fr;gap:6px">',
            '    <button id="ap-arm" style="padding:7px;border:0;border-radius:7px;background:#00e676;color:#04231a;font-weight:700;cursor:pointer">Arm (เริ่ม)</button>',
            '    <button id="ap-disarm" style="padding:7px;border:0;border-radius:7px;background:#2f4553;color:#e8eef2;font-weight:600;cursor:pointer">หยุดฉุกเฉิน</button>',
            '  </div>',
            '  <div style="padding:0 12px 8px"><button id="ap-dump" style="width:100%;padding:5px;border:1px solid #2f4553;border-radius:7px;background:transparent;color:#9fb0bd;cursor:pointer;font-size:11px">ตรวจหน้าเว็บ (Dump)</button></div>',
            '  <div id="ap-status" style="padding:8px 12px 6px;border-top:1px solid #2f4553;color:#9fb0bd;font-size:11px;white-space:pre-line">พร้อมทำงาน</div>',
            '  <div id="ap-log" style="padding:0 12px 10px;color:#6c7f8c;font-size:10.5px;white-space:pre-line;font-family:ui-monospace,Consolas,monospace"></div>',
            '</div>'
        ].join('\n');
        document.body.appendChild(box);

        refs = {};
        box.querySelectorAll('[id]').forEach((el) => { refs[el.id] = el; });
        fillConfigInputs();

        const saved = loadPos();
        placePanel(box, saved ? saved.x : window.innerWidth - box.offsetWidth - 14, saved ? saved.y : 14);

        bindDrag(box);
        bindButtons(box);

        ui = box;
        pushLog('สคริปต์ v' + VERSION + ' พร้อมทำงาน');
        render();
    }

    // ---------- ลาก / ย่อ ----------
    function bindDrag(box) {
        const head = refs['ap-head'];
        if (!head) return;
        head.style.touchAction = 'none';

        let drag = null;

        head.addEventListener('pointerdown', (e) => {
            if (e.button !== 0) return;
            const r = box.getBoundingClientRect();
            // จำจุดกดจริง (sx, sy) ไว้คำนวณระยะขยับ — ไม่พึ่ง e.movementX
            drag = { offX: e.clientX - r.left, offY: e.clientY - r.top, sx: e.clientX, sy: e.clientY, moved: 0 };
            head.style.cursor = 'grabbing';
            try { head.setPointerCapture(e.pointerId); } catch (err) { /* ข้าม */ }
        });

        head.addEventListener('pointermove', (e) => {
            if (!drag) return;
            drag.moved = Math.max(drag.moved, Math.abs(e.clientX - drag.sx) + Math.abs(e.clientY - drag.sy));
            placePanel(box, e.clientX - drag.offX, e.clientY - drag.offY);
        });

        const endDrag = (e, allowToggle) => {
            if (!drag) return;
            const wasClick = drag.moved <= DRAG_SLOP;
            const offX = drag.offX, offY = drag.offY;
            drag = null;
            head.style.cursor = 'move';
            try { head.releasePointerCapture(e.pointerId); } catch (err) { /* ข้าม */ }
            const p = placePanel(box, e.clientX - offX, e.clientY - offY);
            savePos(p.x, p.y);
            if (allowToggle && wasClick) toggleCollapse(box);
        };

        head.addEventListener('pointerup', (e) => endDrag(e, true));
        head.addEventListener('pointercancel', (e) => endDrag(e, false));

        window.addEventListener('resize', () => {
            if (!box.isConnected) return;
            const r = box.getBoundingClientRect();
            placePanel(box, r.left, r.top);
        });
    }

    function toggleCollapse(box) {
        collapsed = !collapsed;
        refs['ap-body'].style.display = collapsed ? 'none' : 'block';
        refs['ap-caret'].textContent = collapsed ? '▸' : '▾';
        const r = box.getBoundingClientRect();
        placePanel(box, r.left, r.top);
    }

    // ---------- ปุ่มต่าง ๆ ----------
    function cancelAutoStart() {
        userStopped = true;
        if (autoArmTimer) { clearTimeout(autoArmTimer); autoArmTimer = null; }
        autoStartAt = 0;
    }

    function bindButtons(box) {
        refs['ap-arm'].addEventListener('click', () => {
            if (autoArmTimer) { clearTimeout(autoArmTimer); autoArmTimer = null; }
            autoStartAt = 0;
            armNow('กดเอง');
        });

        refs['ap-disarm'].addEventListener('click', async () => {
            cancelAutoStart();
            armed = false;
            await stopAutoBet();
            pushLog('หยุดฉุกเฉิน');
            msg = 'หยุดฉุกเฉิน — ปิด auto-start แล้ว (กด Arm เพื่อเริ่มใหม่)';
            render();
        });

        refs['ap-dump'].addEventListener('click', () => {
            const root = panelRoot();
            const btns = [...root.querySelectorAll('button,[role="tab"]')].filter(visible)
                .map((b) => 'BTN testid=' + (b.getAttribute('data-testid') || '-') + ' | ' + (b.textContent || '').trim().slice(0, 40));
            const ins = [...root.querySelectorAll('input')].filter(visible)
                .map((i) => 'IN  testid=' + (i.getAttribute('data-testid') || '-') + ' | name=' + (i.getAttribute('name') || '-') + ' | val=' + i.value);
            ['--- panelRoot ---', ...btns, ...ins].forEach((line) => console.log('[autopilot dump]', line));
            pushLog('Dump ลง Console แล้ว');
            msg = 'Dump แล้ว — เปิด Console (F12) copy มาส่ง';
            render();
        });
    }

    // ---------- วาดสถานะ ----------
    function render(bal) {
        if (!ui || !refs['ap-pl']) return;
        const b = (bal !== undefined) ? bal : balance();
        const pnl = (startBal !== null && b !== null) ? (b - startBal) : null;
        const running = isAutoBetRunning();
        const hasChance = !!findChanceInput();

        setText('ap-dot', '●', armed ? (running ? '#00e676' : '#ffd166') : '#7d8b98');
        setText('ap-pl', pnl === null ? '—' : fmtPnl(pnl),
            pnl === null ? '#e8eef2' : (pnl > 0 ? '#00e676' : (pnl < 0 ? '#ff5252' : '#e8eef2')));
        setText('ap-target-lbl', 'เป้า ' + target.toFixed(2));
        setText('ap-bal', b !== null ? b.toFixed(5) : '—');
        setText('ap-run', running ? 'กำลังทำงาน' : 'หยุดอยู่', running ? '#00e676' : '#9fb0bd');
        setText('ap-elapsed', elapsedText());
        setText('ap-bets', String(bets));
        setText('ap-adv', advancedOpened ? 'เปิดแล้ว' : 'ยังไม่เปิด');
        setText('ap-chance-ok', hasChance ? 'เจอ' : 'ไม่เจอ', hasChance ? '#00e676' : '#ff5252');
        setText('ap-hint', armed ? (running ? 'RUN' : 'ARM') : (userStopped ? 'STOP' : 'IDLE'));
        setText('ap-status', [msg, armed ? '' : stateLine()].filter(Boolean).join('\n'));
        setText('ap-log', logs.join('\n'));
    }
    // ---------- เริ่ม ----------
    function boot() {
        if (ui) return;                          // สร้างแผงไปแล้ว
        if (!document.body) { setTimeout(boot, 300); return; }
        try {
            buildUI();
            // แผงขึ้นทันทีเสมอ — กระเป๋าเงินค่อยตามมาทีหลัง (ไม่บล็อกการแสดงแผง)
            if (!document.querySelector('button[data-testid="wallet-balance-button"]')) {
                msg = 'รอยอดกระเป๋า — P/L จะขึ้นเมื่อโหลดครบ';
            }
            setInterval(tick, TICK_MS);
            setInterval(() => render(), 1000);
            if (AUTO_START) {
                LOG('พร้อม — auto-start ใน', AUTO_START_DELAY / 1000, 'วิ (กดปุ่มหยุดได้ทุกเมื่อ)');
                scheduleAutoStart(AUTO_START_DELAY);
            } else {
                LOG('พร้อม — กด Arm เพื่อเริ่ม');
            }
        } catch (e) {
            LOG('error ตอนสร้างแผง:', (e && e.message) || e);
            setTimeout(boot, 2000);
        }
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') boot();
    else window.addEventListener('DOMContentLoaded', boot, { once: true });
})();
