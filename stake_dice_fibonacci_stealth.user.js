// ==UserScript==
// @name Stake Dice Martingale 68% (แพ้ +73.11% · ชนะติด 3 รีเซ็ต)
// @namespace http://tampermonkey.net/
// @version 2.4.12
// @description Stake Dice Martingale 68% • Pure 68% Locked • แพ้ 1 ไม้ ยอด +73.11% · ชนะติด 3 รีเซ็ตกลับฐาน • Auto-Minimized HUD • Human Jitter & Watchdog
// @match https://stake.com/*
// @match https://www.stake.com/*
// @match https://stake.com/th/casino/games/dice*
// @match https://stake.com/*/casino/games/dice*
// @match https://stake.bet/*
// @match https://stake.games/*
// @match https://stake.bz/*
// @match https://stake.ceo/*
// @match https://stake.mba/*
// @grant none
// @run-at document-start
// ==/UserScript==

/* eslint-disable */

(function () {
    'use strict';

    // 🔖 BUILD STAMP — ใช้ยืนยันว่าโหลด build ไหน (แสดงที่หัวแผง + รายงาน self-test + console)
    //    ตั้งใจให้ตรงกับ @version ด้านบน: 2026.11.18 คือรอบที่ลงจริง, +N คือจำนวนรอบแพตช์หลังจากนั้น
    const BUILD_STAMP = "2026.11.13+v2.4.12-step7-70-step9-72";

    // ==================================================
    // 0. HIGH-SPEED NETWORK INTERCEPTOR (FETCH & XHR)
    // ==================================================
    let onDiceRollCallback = null;

    function findRollObject(node, depth) {
        if (!node || typeof node !== 'object' || depth > 5) return null;
        if (
            typeof node.payoutMultiplier === 'number' &&
            (typeof node.amount === 'number' || typeof node.payout === 'number' || (node.state && typeof node.state === 'object') || typeof node.id === 'string')
        ) {
            return node;
        }
        if (node.state && typeof node.state === 'object' && typeof node.state.result === 'number') {
            return node;
        }
        for (const key in node) {
            if (!Object.prototype.hasOwnProperty.call(node, key)) continue;
            const child = node[key];
            if (child && typeof child === 'object') {
                const found = findRollObject(child, depth + 1);
                if (found) return found;
            }
        }
        return null;
    }

    // หายอดเงิน "จริงจากเซิร์ฟเวอร์" ใน payload ของ API (ไม่ต้องพึ่ง DOM ที่หน่วง/อนิเมชัน)
    // Stake ส่งยอดกระเป๋ากลับมาพร้อมผลทอยในฟิลด์ balance / balances.available หรือ UserBalances GraphQL
    function findBalanceValue(node, depth) {
        if (!node || typeof node !== 'object' || depth > 6) return null;
        if (typeof node.balance === 'number' && isFinite(node.balance) && node.balance > 0) return node.balance;
        if (node.balances) {
            if (Array.isArray(node.balances)) {
                for (let i = 0; i < node.balances.length; i++) {
                    const b = node.balances[i];
                    if (b && typeof b === 'object') {
                        const curr = String(b.currency || (b.available && b.available.currency) || "").toLowerCase();
                        if (!curr || curr === "usdt" || curr === "usd") {
                            const amt = (b.available && typeof b.available.amount === 'number') ? b.available.amount
                                      : (typeof b.amount === 'number' ? b.amount : null);
                            if (amt !== null && isFinite(amt) && amt >= 0) return amt;
                        }
                    }
                }
            } else if (typeof node.balances === 'object') {
                const cand = [node.balances.available, node.balances.total, node.balances.usdt];
                for (let i = 0; i < cand.length; i++) {
                    if (typeof cand[i] === 'number' && isFinite(cand[i]) && cand[i] > 0) return cand[i];
                }
            }
        }
        for (const key in node) {
            if (!Object.prototype.hasOwnProperty.call(node, key)) continue;
            const child = node[key];
            if (child && typeof child === 'object') {
                const found = findBalanceValue(child, depth + 1);
                if (found !== null) return found;
            }
        }
        return null;
    }

    function handlePossibleRollData(data) {
        if (!data || typeof data !== 'object') return false;
        try { maybeCaptureAccount(data); } catch (e) {}
        try {
            const rollObj = findRollObject(data, 0);
            if (rollObj && typeof onDiceRollCallback === 'function') {
                let serverBal = null;
                try { serverBal = findBalanceValue(data, 0); } catch (e) {}
                onDiceRollCallback(rollObj, serverBal);
                return true;
            }
        } catch (e) {}
        return false;
    }

    // ==================================================
    // 🎲 FORCE ROLL SIDE AT REQUEST LEVEL (วิธีเดียวกับบอท Python: ส่ง condition มากับ bet)
    // Stake ส่ง GraphQL: mutation DiceRoll($amount,$target,$condition) ด้วย condition = "above" | "below"
    // ทำแบบนี้ได้แม้ปุ่มลูกศรบนหน้าจอถูก disabled
    // ==================================================
    let forceSideLoggedAt = 0;

    function rewriteDiceRollBody(body) {
        if (!pendingRollSide) return null;
        if (typeof body !== "string") return null;
        if (body.indexOf("diceRoll") < 0 && body.indexOf("DiceRoll") < 0) return null;

        let json;
        try { json = JSON.parse(body); } catch (e) { return null; }

        const chance = parseFloat(getEffectiveChance());
        if (!Number.isFinite(chance)) return null;

        const wantCond = pendingRollSide === "over" ? "above" : "below";
        const wantTarget = pendingRollSide === "over" ? (100 - chance) : chance;
        const list = Array.isArray(json) ? json : [json];
        let changed = false;

        for (let i = 0; i < list.length; i++) {
            const item = list[i];
            if (!item || typeof item !== "object") continue;
            const vars = item.variables;
            if (!vars || typeof vars !== "object" || !("condition" in vars)) continue;

            const beforeCond = String(vars.condition || "").toLowerCase();
            const beforeTarget = parseFloat(vars.target);
            if (beforeCond === wantCond && Math.abs(beforeTarget - wantTarget) <= 0.004) continue;

            vars.condition = wantCond;
            vars.target = parseFloat(wantTarget.toFixed(2));
            if (vars.identifier) vars.identifier = vars.identifier; // คง identifier เดิมไว้
            changed = true;
        }

        if (!changed) return null;

        const now = Date.now();
        if (now - forceSideLoggedAt > 30000) {
            forceSideLoggedAt = now;
            try { log(`🎲 บังคับด้านในคำขอเดิมพัน: ${wantCond.toUpperCase()} target ${wantTarget.toFixed(2)}`, true); } catch (e) {}
        }
        return JSON.stringify(Array.isArray(json) ? list : list[0]);
    }

    // ==================================================
    // 👤 ACCOUNT TAG — รู้ว่าหน้าต่างนี้เป็นบัญชีไหน (ตอนเปิดหลายบัญชี)
    // ดึงชื่อจาก response ของเว็บเอง (user.name / activeAccount.name) ไม่เขียน storage
    // ==================================================
    let accountName = "";
    let lastAccountScan = 0;

    function scanForAccountName(obj, depth, budget) {
        if (!obj || typeof obj !== "object" || depth > 5) return null;
        if (budget.n > 4000) return null;
        budget.n++;
        try {
            if (obj.user && typeof obj.user === "object") {
                const n1 = obj.user.name || obj.user.username;
                if (typeof n1 === "string" && n1.length > 0 && n1.length < 40) return n1;
            }
            if (obj.activeAccount && typeof obj.activeAccount === "object") {
                const n2 = obj.activeAccount.name || obj.activeAccount.username;
                if (typeof n2 === "string" && n2.length > 0 && n2.length < 40) return n2;
            }
            const keys = Object.keys(obj);
            for (let i = 0; i < keys.length; i++) {
                const v = obj[keys[i]];
                if (v && typeof v === "object") {
                    const r = scanForAccountName(v, depth + 1, budget);
                    if (r) return r;
                }
            }
        } catch (e) {}
        return null;
    }

    function maybeCaptureAccount(data) {
        if (accountName) return;
        const now = Date.now();
        if (now - lastAccountScan < 800) return;
        lastAccountScan = now;
        const found = scanForAccountName(data, 0, { n: 0 });
        if (!found) return;
        accountName = String(found).slice(0, 24);
        syncAccountBadge();
    }

    function setAccountNameManually() {
        try {
            const v = window.prompt("ตั้งชื่อ/ป้ายบัญชีของหน้าต่างนี้ (เช่น P3 หรือชื่อบัญชี)", accountName || "");
            if (v === null) return;
            accountName = String(v).trim().slice(0, 24);
            syncAccountBadge();
        } catch (e) {}
    }

    function syncAccountBadge() {
        if (!hudEls || !hudEls.acctBadge) return;
        const el = hudEls.acctBadge;
        setSafeText(el, accountName ? "👤 " + accountName : "👤 ?");
        el.title = accountName
            ? "บัญชี: " + accountName + " (จับจาก API ของหน้าเว็บ) — กดเพื่อแก้ชื่อ"
            : "ยังจับชื่อบัญชีไม่ได้ — กดเพื่อตั้งชื่อเอง";
        setSafeStyle(el, "color", accountName ? "#55e7ff" : "#ffea00");
        setSafeStyle(el, "borderColor", accountName ? "#55e7ff" : "#ffea00");
    }

    try {
        const origJson = Response.prototype.json;
        Response.prototype.json = function (...args) {
            const p = origJson.apply(this, args);
            try {
                if (typeof onDiceRollCallback === 'function') {
                    p.then(data => {
                        handlePossibleRollData(data);
                    }).catch(() => {});
                }
            } catch (e) {}
            return p;
        };

        const originalFetch = window.fetch;
        window.fetch = async function (...args) {
            try {
                if (args[1] && typeof args[1].body === "string") {
                    const rewritten = rewriteDiceRollBody(args[1].body);
                    if (rewritten) args[1] = Object.assign({}, args[1], { body: rewritten });
                }
            } catch (e) {}
            const response = await originalFetch.apply(this, args);
            try {
                if (typeof onDiceRollCallback === 'function') {
                    const url = args[0] ? (typeof args[0] === 'string' ? args[0] : (args[0].url || '')) : '';
                    if (!url || url.includes('/graphql') || url.includes('api.stake') || url.includes('/_api/') || url.includes('/api/')) {
                        const clone = response.clone();
                        origJson.call(clone).then(data => {
                            handlePossibleRollData(data);
                        }).catch(() => {});
                    }
                }
            } catch (e) {}
            return response;
        };
    } catch (e) {}

    try {
        const origOpen = XMLHttpRequest.prototype.open;
        const origSend = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.open = function (method, url, ...rest) {
            this._url = url;
            return origOpen.call(this, method, url, ...rest);
        };
        XMLHttpRequest.prototype.send = function (...args) {
            try {
                if (typeof args[0] === "string") {
                    const rewritten = rewriteDiceRollBody(args[0]);
                    if (rewritten) args[0] = rewritten;
                }
            } catch (e) {}
            this.addEventListener('load', function () {
                try {
                    if (typeof onDiceRollCallback === 'function' && this.responseText && (this.responseText.includes('payoutMultiplier') || this.responseText.includes('diceRoll') || this.responseText.includes('result'))) {
                        const data = JSON.parse(this.responseText);
                        handlePossibleRollData(data);
                    }
                } catch (e) {}
            });
            return origSend.apply(this, args);
        };
    } catch (e) {}

    // ==================================================
    // 0.1 ZERO FOOTPRINT & STORAGE HYGIENE (ไร้ร่องรอย 100%)
    // ==================================================
    try {
        const cleanStorage = (store) => {
            if (!store) return;
            const keysToRemove = [];
            for (let i = 0; i < store.length; i++) {
                const k = store.key(i);
                if (k && (k.startsWith("stake_fibo") || k.startsWith("stake_kelly") || k.startsWith("stake_wager") || k.startsWith("stake_sniper") || k.startsWith("stake_break") || k.startsWith("stake_auto") || k.startsWith("stake_dynamic") || k.startsWith("stake_real") || k.startsWith("stake_max") || k.startsWith("stake_profit") || k.startsWith("stake_stop") || k.startsWith("stake_cfg_"))) {
                    keysToRemove.push(k);
                }
            }
            for (let j = 0; j < keysToRemove.length; j++) {
                store.removeItem(keysToRemove[j]);
            }
        };
        cleanStorage(window.localStorage);
        cleanStorage(window.sessionStorage);
        delete window.__STAKE_SNIPER_LOADED__;
        delete window.__STAKE_SNIPER_INIT__;
    } catch (e) {}

    // ==================================================
    // 1. CONFIGURATION & STATE: MARTINGALE 68% (PURE 68% LOCKED)
    // ==================================================

    let isInitialized = false;
    let configEcoMode = true; // 🌱 เปิด ECO อัตโนมัติ: ซ่อนกราฟิก 3D/แอนิเมชัน // ❌ ปิด ECO ถาวร — เคยซ่อนส่วนของหน้าเว็บจนเลื่อนหน้าไม่ได้
    let isPanelMinimized = true; // 🔽 ยุบแบบอัตโนมัติ (Default: Minimized Compact Bar)

    function log() {
        // Silent Zero-Footprint Mode: ไม่ทิ้งข้อความใดๆ ลงใน Console ของเบราว์เซอร์
    }

    // ==================================================
    // 1.0 LOW-POWER ECO DISPLAY STYLES INJECTOR (ไร้ ID บน DOM)
    // ==================================================
    let ecoStyleEl = null;
    // 🌱 ECO MODE: ปิดแอนิเมชันและกราฟิกหนักๆ เพื่อลดโหลด CPU/GPU ให้เครื่องนิ่งและลื่นที่สุด
    function applyEcoStyles(enable) {
        try {
            if (ecoStyleEl) {
                ecoStyleEl.remove();
                ecoStyleEl = null;
            }
            if (enable) {
                ecoStyleEl = document.createElement("style");
                ecoStyleEl.textContent = `
                    *, *::before, *::after {
                        transition: none !important;
                        animation: none !important;
                        text-shadow: none !important;
                        box-shadow: none !important;
                    }
                    [class*="backdrop-blur"], [style*="backdrop-filter"] {
                        backdrop-filter: none !important;
                    }
                    [data-testid="live-stats"], [data-testid="chat-feed"] {
                        contain: strict !important;
                        display: none !important;
                    }
                    /* ปิดแอนิเมชันลูกเต๋าและกราฟิกของ Stake 100% ไร้โหลด GPU/CPU */
                    [data-testid*="dice"], [class*="dice"] *, canvas {
                        transition: none !important;
                        animation: none !important;
                    }
                `;
                (document.head || document.documentElement).appendChild(ecoStyleEl);
            }
        } catch (e) {}
    }

    // 1.1 พารามิเตอร์หลัก: ล็อกโอกาสชนะ 68% ถาวร 100% (Pure 68% Invariant - Payout 1.4559x)
    const NORMAL_CHANCE = "68";      // โอกาสชนะล็อกคงที่ 68% เสมอ ห้ามเปลี่ยน
    let configChance = NORMAL_CHANCE;
    let recentOutcomes = [];         // ประวัติผล [true/false]

    let activeBoostChance = NORMAL_CHANCE; // "68" -> "70" (ไม้ >= 7) -> "72" (ไม้ >= 9) · คงอัตราทบ +73.11%/ไม้
    function getEffectiveChance() {
        return activeBoostChance;
    }
    function syncChanceBoostState() {
        const curPnl = (currentBalance !== null && startBalance !== null)
            ? Math.max(profit, currentBalance - startBalance)
            : profit;
        if (mStep >= 9) {
            if (activeBoostChance !== "72") {
                activeBoostChance = "72";
                syncHUDInputs();
                log("🛡️ [CHANCE BOOST 72%] ติดไม้ที่ " + mStep + " (P/L " + formatNumber(curPnl, 4) + "$) → เพิ่มโอกาสชนะเป็น 72% (คงอัตราทบ +73.11%)", true);
            }
            return;
        }
        if (mStep >= 7) {
            if (activeBoostChance !== "70" && activeBoostChance !== "72") {
                activeBoostChance = "70";
                syncHUDInputs();
                log("🛡️ [CHANCE BOOST 70%] ติดไม้ที่ " + mStep + " (P/L " + formatNumber(curPnl, 4) + "$) → เพิ่มโอกาสชนะเป็น 70% (คงอัตราทบ +73.11%)", true);
            }
            return;
        }
        if (curPnl >= 0 && activeBoostChance !== NORMAL_CHANCE) {
            activeBoostChance = NORMAL_CHANCE;
            syncHUDInputs();
            log("🎯 [CHANCE REVERT 68%] ออกจากไม้ลึก (ไม้ " + mStep + ") และกำไรกลับมาเป็นบวก (" + formatNumber(curPnl, 4) + "$) → กลับสู่โอกาสชนะ 68% ตามเดิม", true);
        }
    }
    let configAlternateRoll = true; // สลับ Under/Over ทุกตา: true (เปิด) / false (ปิด = แทง Under ฝั่งเดียว)
    let currentRollSide = "under";  // ด้านของไม้ปัจจุบัน ("under" หรือ "over")
    let pendingRollSide = "under";  // ด้านที่ส่งไปกับคำขอเดิมพัน
    let lastBetSide = "under";      // ด้านที่แทงไปในไม้ล่าสุด
    // 🎯 ด้านที่ "ยิงจริง" ของไม้ที่กำลังวิ่ง — ใช้ตัดสินผลจาก badge ให้ตรงกับคำขอที่ส่งไป
    // (เดิมตัวนี้ไม่เคยถูกประกาศ ทำให้ isBadgeWinning โยน ReferenceError ทุกครั้ง)
    let activeRollSide = "under";
    // 🛰️ เงื่อนไข over/under ที่เซิร์ฟเวอร์รายงานล่าสุด — ความจริงจาก API ไม่ใช่จาก DOM
    // (เดิมไม่เคยถูกประกาศ การเขียนใน onDiceRollCallback จึงโยน ReferenceError ใน strict mode)
    let lastServerCondition = null;
    // 🔒 เดิมพันคงที่: ยอดฐานเดียวนิ่ง 100% ไม่เร่งยอด ไม่เสี่ยงพอร์ตแตก
    const FIXED_BASE_BET = "0.0002";
    let configRealBaseBet = FIXED_BASE_BET; // ยอดฐาน (ไม้แรก) — แก้ได้จากช่องบน HUD
    const AUTO_MIN_BET = 0.00010; // ขั้นต่ำที่เว็บยอมรับ (USDT) — ถ้าตั้งต่ำกว่านี้ ระบบจะปรับขึ้นให้เอง
    // 📈 MARTINGALE ตามที่ตั้งในหน้าเว็บ: แพ้ 1 ไม้ → ยอด ×1.7311 (+73.11%) · ชนะติด 3 → รีเซ็ตกลับฐาน
    const MARTINGALE_PCT = 73.11;     // % ที่เพิ่มขึ้นทุกครั้งที่แพ้ (คำนวณจากสูตร 1 / (3 * 0.4559) = 73.11% สำหรับโอกาสชนะ 68%)
    const MARTINGALE_RESET_WINS = 3;  // ชนะติดกี่ไม้แล้วรีเซ็ต
    let mStep = 1;                    // ลำดับไม้ปัจจุบัน (1 = ยอดฐาน)
    // 🛡️ DESYNC GUARD: เทียบยอดเงินจริงบนหน้าจอกับยอดที่ระบบคำนวณเอง
    const DESYNC_STRIKE_LIMIT = 3; // ไม่ตรงติดกันกี่ไม้ จึงหยุดระบบ
    // ↔️ AUTO-RESYNC: ยืดหยุ่นแทนการหยุด — ยอมรับยอดจริงบนหน้าจอเป็นยอดใหม่แล้วเล่นต่อ
    let configAutoResync = false;
    const RESYNC_LIMIT = 5; // ซิงก์ได้ไม่เกินกี่ครั้งต่อเซสชัน ก่อนหยุดจริง
    let resyncCount = 0;
    let desyncStrikes = 0;
    let lastBetAmount = 0; // ไม้จริงล่าสุด ใช้เป็นเกณฑ์ตรวจ desync
    // ⏱️ ตัวแปรฝั่ง API เท่านั้น (ค่าคงที่ของฝั่ง DOM ถูกถอดออกแล้ว)
    let cleanSyncStreak = 0;        // เทียบตรงติดกันกี่ไม้ → คืนเครดิต resync
    // รายละเอียดการไม่ตรงครั้งล่าสุด — แสดงบน HUD เพื่อหาสาเหตุได้ทันที
    let lastDesync = { dom: null, model: null, diff: 0, tol: 0, source: "" };
    // 🚦 BOUNDARY CONSTRAINTS: ขั้นต่ำ/สูงสุดที่อ่านได้จากช่องเดิมพันจริง (ถ้าเว็บประกาศไว้)
    let detectedMinBet = null;
    let detectedMaxBet = null;
    // 🚫 ไม่มีตัวตัดขาดทุน (ถอดออกตามคำสั่ง) — ตัวหยุดที่เหลือ: ถึงเป้ากำไร / ครบเวลา / DESYNC / เงินหมด
    // 🎯 DYNAMIC RANDOM PROFIT TARGET: สุ่มเป้าหมายกำไรต่อรอบ (เช่น 0.35 - 0.65 USDT) พรางพฤติกรรม & เซฟพอร์ตเล็ก
    let configDynamicTarget = true; // เปิดโหมดสุ่มเป้าหมายกำไร (ค่าเริ่มต้น: ON)
    const DYNAMIC_TARGET_MIN = 0.35; // เป้าต่ำสุด (USDT)
    const DYNAMIC_TARGET_MAX = 0.65; // เป้าสูงสุด (USDT)
    let configProfitTarget = 0.5; // กำไรเป้าหมายต่อรอบ (จะถูกสุ่มใหม่ตามทุนจริงใน startSession)

    function generateDynamicTarget(startBal = null) {
        if (!configDynamicTarget) return 0.5;
        let minT = DYNAMIC_TARGET_MIN;
        let maxT = DYNAMIC_TARGET_MAX;

        // 🛡️ SMALL BALANCE SAFETY: "ยอดเงินน้อย กำไรน้อย"
        // หากยอดทุนน้อยกว่า 3 USDT ให้จำกัดเป้ากำไรไม่เกิน 20% - 25% ของทุน เพื่อความปลอดภัยสูงสุด
        if (typeof startBal === "number" && startBal > 0 && startBal < 3.0) {
            maxT = Math.min(maxT, Math.max(0.15, parseFloat((startBal * 0.20).toFixed(4))));
            minT = Math.min(minT, Math.max(0.10, parseFloat((maxT * 0.60).toFixed(4))));
        }

        const rand = minT + Math.random() * (maxT - minT);
        return parseFloat(rand.toFixed(4));
    }

    let configAutoStart = true; // เปิดทำงานอัตโนมัติเมื่อตรวจพบยอดเงิน
    // 🚦 GUARDRAIL CAP: จำกัดไม้สูงสุด (0 = ไม่จำกัดตามสเปกเดิม, หรือกำหนด 4-5 เพื่อตัดขาดทุน)
    let configMaxMartingaleSteps = 0;

    // 1.2 ตัวแปรสถานะการทำงาน (State Machine)
    let successfulSnipes = 0; // สถิติจำนวนรอบที่ชนะไม้จริงเข้าเป้า
    let cutLossSnipes = 0; // สถิติจำนวนรอบที่ระบบสั่งหยุดเอง (คงช่องนี้ไว้แสดงบน HUD)

    // 1.4 ตัวแปรการเงินและสถิติเซสชัน
    let sessionRunning = false;
    let isWaitingNextRound = false;
    let isBetInProgress = false;

    let startBalance = null;
    let currentBalance = null;
    let profit = 0;

    let recentRollValues = []; // เก็บตัวเลขที่ออกจริง 50 ตาล่าสุด (0.00 - 99.99)
    let statsUnderCount = 0; // จำนวนตาที่ออกต่ำ (< 50.00) ใน 50 ตาล่าสุด
    let statsOverCount = 0; // จำนวนตาที่ออกสูง (>= 50.00) ใน 50 ตาล่าสุด

    function trackRollValue(val) {
        if (typeof val !== 'number' || isNaN(val)) return;
        recentRollValues.push(val);
        if (recentRollValues.length > 50) recentRollValues.shift();
        statsUnderCount = recentRollValues.filter(v => v < 50.0).length;
        statsOverCount = recentRollValues.filter(v => v >= 50.0).length;
    }

    // สถานะการไล่ไม้แบบ Martingale (ตามหน้าตั้งค่าเว็บ)
    function getSurvivalProbabilityText() {
        return `📈 แพ้ต่อไม้ +${MARTINGALE_PCT}% · รีเซ็ตเมื่อชนะติด ${MARTINGALE_RESET_WINS} · ไม่จำกัดจำนวนไม้`;
    }

    let totalBets = 0;
    let betTimestamps = []; // เวลาของ 50 ตาล่าสุด ใช้วัดความเร็วจริง
    function getBetRateText() {
        // วัดจาก 50 ตาล่าสุดที่ทอยต่อเนื่อง (ถ้าช่วงห่างเกิน 20 วินาที = มีพัก จึงไม่แสดง)
        const n = betTimestamps.length;
        if (n < 10) return "";
        const span = (betTimestamps[n - 1] - betTimestamps[0]) / 1000;
        if (span <= 0 || span > 20) return "";
        return ` | ⚡ ${((n - 1) / span).toFixed(1)} ตา/วิ`;
    }
    let totalWagered = 0;
    let winsCount = 0;
    let lossesCount = 0;
    let currentStreak = 0;
    let maxDrawdown = 0;
    let peakBalance = null;

    let autoCycleRounds = false; // ค่าเริ่มต้น OFF เพื่อให้เมื่อถึงเป้ากำไร 5% บอทจะหยุดและสลับบัญชีทันที
    let completedRounds = 0;
    let lifetimeProfit = 0;
    let autoCycleCountdownTimer = null;

    let autoStartPolling = null;
    let autoStartCountdownTimer = null;
    let autoStartCountdown = 2;

    // ==================================================
    // 1.4 ISOLATED WORLD BRIDGE DISPATCHER (TASK QUEUE)
    // ส่งข้อมูลสถิติข้ามจาก MAIN World ไปยัง bridge.js เพื่อลง chrome.storage.local
    // ==================================================
    function sendStatToBridge(data) {
        try {
            window.postMessage({
                source: "stake-sniper-bot",
                type: "ENQUEUE_STAT",
                payload: data
            }, "*");
        } catch (e) {}
    }

    // ==================================================
    // 1.5 BOT PERSISTENT MEMORY & SESSION GUARD (STEALTH NATIVE STORAGE)
    // ใช้ native sessionStorage + localStorage ตรงในหน้าเว็บ (MAIN world)
    // 🛡️ พรางชื่อ Key เป็น _st_view_prefs_v2 ป้องกัน Web Telemetry / Anti-cheat ตรวจพบ
    // ==================================================
    const BOT_STATE_KEY = "_st_view_prefs_v2";
    const LEGACY_BOT_STATE_KEY = "__stake_martingale_state_v1__";
    let currentSessionId = "sess_" + Date.now();

    const BotMemory = {
        saveState(status = "RUNNING") {
            try {
                const payload = {
                    sessionId: currentSessionId,
                    mStep: mStep,
                    currentStreak: currentStreak,
                    sessionProfit: profit,
                    startBalance: startBalance,
                    currentRollSide: currentRollSide,
                    sessionStartedAt: sessionStartedAt,
                    status: status,
                    timestamp: Date.now()
                };
                window.sessionStorage.setItem(BOT_STATE_KEY, JSON.stringify(payload));
                window.localStorage.setItem(BOT_STATE_KEY, JSON.stringify(payload));
            } catch (e) {}
        },
        markCompleted() {
            try {
                const payload = {
                    sessionId: currentSessionId,
                    mStep: 1,
                    sessionProfit: profit,
                    status: "COMPLETED",
                    timestamp: Date.now()
                };
                window.sessionStorage.setItem(BOT_STATE_KEY, JSON.stringify(payload));
                window.localStorage.setItem(BOT_STATE_KEY, JSON.stringify(payload));
            } catch (e) {}
        },
        restore() {
            try {
                const raw = window.sessionStorage.getItem(BOT_STATE_KEY) || 
                            window.localStorage.getItem(BOT_STATE_KEY) ||
                            window.sessionStorage.getItem(LEGACY_BOT_STATE_KEY) ||
                            window.localStorage.getItem(LEGACY_BOT_STATE_KEY);
                if (!raw) return;
                const saved = JSON.parse(raw);

                // 🛑 กรณีที่ 1: เซสชันเดิมจบสมบูรณ์ไปแล้ว (COMPLETED / STOPPED) -> ล้างทิ้ง ไม่นำมานับต่อ
                if (saved.status === "COMPLETED" || saved.status === "STOPPED") {
                    log("🛡️ [SESSION GUARD] เซสชันเดิมจบสมบูรณ์แล้ว — เริ่มต้นเซสชันใหม่ที่ไม้ 1 (P/L 0.00$)", true);
                    BotMemory.clearState();
                    return;
                }

                // 🟢 กรณีที่ 2: เป็นการรีเฟรชหน้าเว็บ (F5 / Network Watchdog) ในเซสชันเดิมที่ยังไม่หมดอายุ (< 15 นาที)
                const ageMs = Date.now() - (saved.timestamp || 0);
                if (ageMs < 15 * 60 * 1000 && saved.status === "RUNNING") {
                    if (saved.sessionId) currentSessionId = saved.sessionId;
                    if (typeof saved.mStep === "number" && saved.mStep > 1) {
                        mStep = saved.mStep;
                        log("💾 [SESSION GUARD RESTORE] กู้คืนสเต็ปเดิมในเซสชัน (" + currentSessionId + "): ไม้ " + mStep, true);
                    }
                    if (typeof saved.sessionProfit === "number" && !isNaN(saved.sessionProfit)) {
                        profit = saved.sessionProfit;
                    }
                    if (typeof saved.startBalance === "number" && saved.startBalance > 0) {
                        startBalance = saved.startBalance;
                    }
                    if (typeof saved.sessionStartedAt === "number" && saved.sessionStartedAt > 0) {
                        sessionStartedAt = saved.sessionStartedAt;
                        log("⏱️ [SESSION GUARD RESTORE] กู้คืนเวลาเริ่มเซสชันเดิม (" + new Date(sessionStartedAt).toLocaleTimeString() + ") ไม่เริ่มนับ 20 นาทีใหม่", true);
                    }

                    if (typeof saved.currentStreak === "number") currentStreak = saved.currentStreak;
                    if (saved.currentRollSide) currentRollSide = saved.currentRollSide;
                    updateUI();
                } else if (ageMs >= 15 * 60 * 1000) {
                    BotMemory.clearState();
                }
            } catch (e) {}
        },
        clearState() {
            try {
                window.sessionStorage.removeItem(BOT_STATE_KEY);
                window.localStorage.removeItem(BOT_STATE_KEY);
                window.sessionStorage.removeItem(LEGACY_BOT_STATE_KEY);
                window.localStorage.removeItem(LEGACY_BOT_STATE_KEY);
            } catch (e) {}
        }
    };

    // ==================================================
    // 1.6 DAILY STATS PERSISTENCE (NATIVE LOCALSTORAGE)
    // สะสมสถิติ wins/losses/profit/maxStep ข้ามเซสชันและข้ามวันผ่าน localStorage
    // ==================================================
    let dailyCumulative = {
        date: "",
        totalSessions: 0,
        totalBetsDay: 0,
        totalWinsDay: 0,
        totalLossesDay: 0,
        totalProfitDay: 0.0,
        maxStepSeenDay: 0,
        maxDrawdownDay: 0.0,
        bestSessionProfit: 0.0,
        worstSessionProfit: 0.0
    };

    const DailyStats = {
        _getKey() {
            const d = new Date();
            const p2 = function(n) { return String(n).padStart(2, "0"); };
            return "_st_ui_metrics_" + d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate());
        },
        _getLegacyKey() {
            const d = new Date();
            const p2 = function(n) { return String(n).padStart(2, "0"); };
            return "STAKE_DAILY_" + d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate());
        },
        load() {
            try {
                const raw = window.localStorage.getItem(this._getKey()) || window.localStorage.getItem(this._getLegacyKey());
                if (!raw) return;
                const saved = JSON.parse(raw);
                if (saved && saved.date) {
                    dailyCumulative = Object.assign({}, dailyCumulative, saved);
                    log("📊 [DAILY STATS] โหลดสถิติวันนี้: " + saved.totalSessions + " เซสชัน | W:" + saved.totalWinsDay + " L:" + saved.totalLossesDay + " | กำไรรวม: " + (Number(saved.totalProfitDay || 0) >= 0 ? "+" : "") + Number(saved.totalProfitDay || 0).toFixed(4) + "$", true);
                    updateUI();
                }
            } catch (e) {}
        },
        save(sessionData) {
            try {
                if (!sessionData) return;
                window.localStorage.setItem(this._getKey(), JSON.stringify(sessionData));
            } catch (e) {}
        },
        reset() {
            try {
                window.localStorage.removeItem(this._getKey());
                window.localStorage.removeItem(this._getLegacyKey());
            } catch (e) {}
        }
    };

    function clearAllBotHistory(showToast = true) {
        try {
            window.sessionStorage.removeItem(BOT_STATE_KEY);
            window.localStorage.removeItem(BOT_STATE_KEY);
            window.sessionStorage.removeItem(LEGACY_BOT_STATE_KEY);
            window.localStorage.removeItem(LEGACY_BOT_STATE_KEY);
            const toRemove = [];
            for (let i = 0; i < window.localStorage.length; i++) {
                const k = window.localStorage.key(i);
                if (k && (k.startsWith("_st_ui_metrics_") || k.startsWith("STAKE_DAILY_") || k === BOT_STATE_KEY || k === LEGACY_BOT_STATE_KEY || k.startsWith("__stake_martingale_"))) {
                    toRemove.push(k);
                }
            }
            toRemove.forEach(k => window.localStorage.removeItem(k));
            dailyCumulative = {
                date: "",
                totalSessions: 0,
                totalBetsDay: 0,
                totalWinsDay: 0,
                totalLossesDay: 0,
                totalProfitDay: 0.0,
                maxStepSeenDay: 0,
                maxDrawdownDay: 0.0,
                bestSessionProfit: 0.0,
                worstSessionProfit: 0.0
            };
            mStep = 1;
            currentStreak = 0;
            profit = 0;
            lifetimeProfit = 0;
            completedRounds = 0;
            recentOutcomes = [];
            try {
                window.postMessage({ source: "stake-sniper-bot", type: "CLEAR_HISTORY" }, "*");
            } catch (e) {}
            if (showToast) {
                flashHudAlert("#00e676");
                log("🧹 [HISTORY CLEARED] ล้างประวัติเดิมและสถิติทั้งหมดเรียบร้อยแล้ว (เริ่มต้นระบบใหม่ 100%)", true);
            }
            updateUI();
        } catch (e) {}
    }
    window.clearAllStakeBotHistory = clearAllBotHistory;

    // 🧹 Auto-purge history once on this update so user starts completely clean (Fresh Start)
    try {
        if (window.localStorage.getItem("_st_cache_clean_v6") !== "done") {
            clearAllBotHistory(true);
            window.localStorage.setItem("_st_cache_clean_v6", "done");
        }
    } catch (e) {}

    let betTimeoutId = null;

    let audioKeepAliveCtx = null;
    let screenWakeLock = null;

    let shadowRootRef = null;
    let hostContainer = null;
    let cachedBetBtn = null;
    let cachedBalanceEl = null;
    let cachedAmountInput = null;
    let cachedChanceInput = null;
    let isUiUpdatePending = false;
    let betRetryCount = 0;
    let amountRetryCount = 0;

    // ==================================================
    // 1.8 INTELLIGENT ANOMALY & NETWORK WATCHDOG
    // ==================================================
    const NETWORK_WATCHDOG_TIMEOUT_MS = 12000; // เร่งตรวจจับที่ 12 วินาที (จากเดิม 15s)
    const GLOBAL_STALL_TIMEOUT_MS = 35000;     // ตรวจจับอาการค้างทุกกรณี (เช่น ปุ่มกดไม่ได้/DOM ค้าง) หากไม่มีไม้จบภายใน 35s
    let lastBetSentAt = 0;
    let lastBetActivityAt = 0;
    let watchdogTimerId = null;
    let adaptiveCalmingDelay = 0; // หน่วงเวลาพยุงจังหวะอัตโนมัติเมื่อพบ Latency สูง

    function startNetworkWatchdog() {
        stopNetworkWatchdog();
        lastBetActivityAt = Date.now();
        watchdogTimerId = setInterval(() => {
            if (!sessionRunning) return;
            const now = Date.now();
            if (isBetInProgress && lastBetSentAt) {
                const elapsed = now - lastBetSentAt;
                if (elapsed >= NETWORK_WATCHDOG_TIMEOUT_MS) {
                    log(`🚨 [INTELLIGENT WATCHDOG] เซิร์ฟเวอร์ไม่ตอบสนองเกิน ${(elapsed / 1000).toFixed(0)}s (ไม้ ${mStep})! บันทึกสเต็ปและรีเฟรชกู้คืนอัตโนมัติ...`, true);
                    BotMemory.saveState();
                    teardownSessionResources();
                    location.reload();
                    return;
                }
            }
            if (!isWaitingNextRound && lastBetActivityAt && (now - lastBetActivityAt) >= GLOBAL_STALL_TIMEOUT_MS) {
                const stalledSec = ((now - lastBetActivityAt) / 1000).toFixed(0);
                log(`🚨 [STALL WATCHDOG] บอทค้างไม่ขยับเกิน ${stalledSec}s (ไม้ ${mStep})! บันทึกสเต็ปและรีเฟรชกู้คืนอัตโนมัติ...`, true);
                BotMemory.saveState();
                teardownSessionResources();
                location.reload();
            }
        }, 2000);
    }

    function stopNetworkWatchdog() {
        if (watchdogTimerId) {
            clearInterval(watchdogTimerId);
            watchdogTimerId = null;
        }
        lastBetSentAt = 0;
        lastBetActivityAt = 0;
    }

    // 🌐 ตรวจจับสถานะการเชื่อมต่ออินเทอร์เน็ต (Online / Offline)
    window.addEventListener("offline", () => {
        log("🚨 [NETWORK] ตรวจพบอินเทอร์เน็ตตัดการเชื่อมต่อ — หยุดรออัตโนมัติ...", true);
        updateStatusText("🚨 เน็ตหลุดชั่วคราว — บอทหยุดรอเชื่อมต่อ...", "#ff5252");
    });
    window.addEventListener("online", () => {
        log("🌐 [NETWORK] อินเทอร์เน็ตเชื่อมต่อกลับมาแล้ว — พร้อมทำงานต่อ", true);
        updateStatusText("🌐 เน็ตกลับมาแล้ว — ลุยต่อ", "#00e676");
        if (sessionRunning && !betTimeoutId) betTimeoutId = setTimeout(executeNextBet, 600);
    });

    // 🧹 RAM & PERFORMANCE SELF-HEALING (ล้างแคชและ DOM ป้องกันแรมบวม)
    function runPerformanceSelfHealing() {
        try {
            // 1. ตัดจำนวนประวัติที่สะสมใน DOM Stake เพื่อคืน RAM ให้เครื่อง
            const pastList = document.querySelectorAll('[data-testid^="past-bet-button-"], [data-testid*="dice-history"] button');
            if (pastList.length > 25) {
                for (let i = 25; i < pastList.length; i++) {
                    try { pastList[i].remove(); } catch (e) {}
                }
            }
            // 2. ป้องกัน array ใน memory บวม
            if (sessionLedger && sessionLedger.length > 40) {
                sessionLedger = sessionLedger.slice(-20);
            }
        } catch (e) {}
    }

    // ==================================================
    // 1.7 UNIFIED TEARDOWN & RESOURCE CLEANUP (ZERO-LEAK)
    // ==================================================
    let sessionAbortController = new AbortController();

    function teardownSessionResources() {
        try {
            // 1. ล้าง Timers ทั้งหมด
            clearTimers();
            stopSessionTimer();
            stopRecoveryHold();
            stopNetworkWatchdog();

            // 2. ยกเลิก DOM Event Listeners ของรอบการทำงานผ่าน AbortController
            if (sessionAbortController) {
                sessionAbortController.abort();
                sessionAbortController = new AbortController();
            }

            // 3. ปลดล็อก AudioKeepAlive และ ScreenWakeLock
            stopAudioKeepAliveNode();
            if (screenWakeLock) {
                try { screenWakeLock.release(); } catch (e) {}
                screenWakeLock = null;
            }

            // 4. บันทึกสถานะ COMPLETED เมื่อเซสชันจบจริง (ไม่ล้างทับหากเกิดการรีเฟรชขณะรัน)
            if (!sessionRunning) {
                BotMemory.markCompleted();
            }

            // 5. แจ้งสถานะ Idle ไปยัง BroadcastChannel
            broadcastTabState("idle");

            // 6. ปลดล็อกการอ้างอิง DOM Elements ทั้งหมด คืนหน่วยความจำให้ Garbage Collection ทันที
            cachedBalanceEl = null;
            cachedBetBtn = null;
            cachedAmountInput = null;
            cachedChanceInput = null;
            onDiceRollCallback = null;
        } catch (e) {}
    }

    // ล้างทรัพยากรทุกครั้งเมื่อแท็บกำลังจะถูกปิดหรือสลับหน้า
    window.addEventListener("pagehide", teardownSessionResources);
    window.addEventListener("beforeunload", teardownSessionResources);

    // ==================================================
    // 2. EMERGENCY ESC KEY HANDLER
    // ==================================================
    window.addEventListener("keydown", function (e) {
        if (e.key === "Escape") {
            cancelAutoStart();
            if (sessionRunning) {
                stopSession("🚨 หยุดฉุกเฉินด้วยปุ่ม ESC", "#ff3344");
            } else {
                updateStatusText("🚨 ยกเลิก Auto-Start ด้วยปุ่ม ESC", "#ff3344");
            }
        }
    }, true);

    // ==================================================
    // 3. ANTI-TAB SLEEP SYSTEM
    // ==================================================
    let audioUnlocked = false;   // ต้องมี user gesture ก่อน (นโยบาย autoplay ของ Chrome)
    let audioGestureBound = false;

    // สร้าง oscillator 1 ตัว + เริ่มทำงาน (เรียกได้เฉพาะตอนมี gesture แล้วเท่านั้น)
    function startAudioKeepAliveNode() {
        try {
            if (!audioKeepAliveCtx) {
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                if (!AudioCtx) return;
                audioKeepAliveCtx = new AudioCtx();
                const osc = audioKeepAliveCtx.createOscillator();
                const gain = audioKeepAliveCtx.createGain();
                gain.gain.value = 0.00001; // เงียบสนิท ไร้เสียงรบกวน
                osc.connect(gain);
                gain.connect(audioKeepAliveCtx.destination);
                try { osc.start(); } catch (e) {}
            }
            if (audioKeepAliveCtx && audioKeepAliveCtx.state === "suspended") {
                const p = audioKeepAliveCtx.resume();
                if (p && typeof p.catch === "function") p.catch(() => {});
            }
        } catch (e) {}
    }

    // คืน resource ระหว่างพัก: suspend (ไม่ close) เพื่อไม่เสียสิทธิ์ autoplay ที่ปลดล็อกไว้แล้ว
    // เดิม: AudioContext เปิดค้างตลอดแม้จบเซสชัน → แท็บถือ audio thread และกันการพักต่อเนื่อง
    function stopAudioKeepAliveNode() {
        try {
            if (audioKeepAliveCtx && audioKeepAliveCtx.state === "running") {
                const p = audioKeepAliveCtx.suspend();
                if (p && typeof p.catch === "function") p.catch(() => {});
            }
        } catch (e) {}
    }

    // ⚠️ ห้ามสร้าง/เริ่ม AudioContext ก่อนผู้ใช้มี gesture — Chrome จะบล็อกและขึ้น warning
    //    "The AudioContext was not allowed to start" (content.js:357 เดิม)
    //    วิธีแก้: รอ pointerdown/keydown ครั้งแรกก่อน แล้วค่อยเริ่ม (เงียบเหมือนเดิม ไม่มี warning)
    function enableAudioKeepAlive() {
        if (!audioUnlocked) {
            if (!audioGestureBound) {
                audioGestureBound = true;
                const unlock = () => {
                    audioUnlocked = true;
                    window.removeEventListener("pointerdown", unlock, true);
                    window.removeEventListener("keydown", unlock, true);
                    window.removeEventListener("touchstart", unlock, true);
                    try { startAudioKeepAliveNode(); } catch (e) {}
                };
                window.addEventListener("pointerdown", unlock, true);
                window.addEventListener("keydown", unlock, true);
                window.addEventListener("touchstart", unlock, true);
            }
            return;
        }
        try { startAudioKeepAliveNode(); } catch (e) {}
    }

    async function requestScreenWakeLock() {
        try {
            if ('wakeLock' in navigator && !screenWakeLock) {
                screenWakeLock = await navigator.wakeLock.request('screen');
            }
        } catch (e) {}
    }


    // ==================================================
    // 4. TIMING & ENGINE CONTROLS
    // ==================================================
    function clearTimers() {
        if (betTimeoutId) {
            clearTimeout(betTimeoutId);
            betTimeoutId = null;
        }
        if (autoCycleCountdownTimer) {
            clearInterval(autoCycleCountdownTimer);
            autoCycleCountdownTimer = null;
        }
        // ✅ หยุด STAKE_HOLD title loop เมื่อ session จบ
        if (typeof sessionHoldTitleTimerId !== "undefined" && sessionHoldTitleTimerId) {
            clearInterval(sessionHoldTitleTimerId);
            sessionHoldTitleTimerId = null;
        }
    }

    // ==================================================
    // 5. DOM SELECTORS & BALANCE READER
    // ==================================================
    function parseBalanceElement(el) {
        if (!el || !document.body || !document.body.contains(el)) return null;

        // 🛡️ UNIVERSAL WALLET SCOPE: ยอดเงินของ Stake อยู่ใน Header/Nav หรือ Wallet Container เสมอ
        // ห้ามอ่านจากส่วนแสดงผลเกม (Main/Sidebar/Dice/Inputs/Multiplier) เด็ดขาด 100%
        const isStyle16ch = (el.getAttribute('style') || '').includes('16ch') || !!el.closest('[style*="16ch"]');
        const isInWalletArea = isStyle16ch || !!el.closest('header, nav, [role="banner"], [class*="header" i], [class*="navbar" i], [class*="navigation" i], [class*="top-bar" i], [data-testid*="wallet"], [data-testid="coin-toggle"], [class*="wallet" i], [class*="BalanceWrap" i]');
        if (!isInWalletArea) return null;

        if (el.closest('[data-testid="game-frame"], [data-testid="game-sidebar"], [data-testid="dice-game"], [data-testid*="bet-amount"], [data-testid*="input-game"], [data-testid*="chance"], [data-testid*="payout"], [data-testid*="profit"], [class*="game-sidebar"], [class*="bet-control"], main')) {
            return null;
        }
        const raw = (el.textContent || "").trim();
        if (!raw || raw.length > 36) return null;
        if (/[×%½]|1\/2|2x|max|min/i.test(raw)) return null;
        const cleaned = raw
            .replace(/,/g, '')
            .replace(/^(US\$|CA\$|A\$|NZ\$|HK\$|S\$|R\$|₹|฿|€|£|¥|\$)\s*/i, '')
            .replace(/\s*(USDT|USDC|BTC|ETH|LTC|TRX|DOGE|BNB|SOL|XRP|MATIC|POL|SHIB|DAI|BCH|EOS|UNI|LINK|USD|EUR|THB|JPY|GBP|CAD|AUD|BRL|INR)$/i, '')
            .trim();
        if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
        const val = parseFloat(cleaned);
        if (!Number.isFinite(val) || val < 0) return null;
        return val;
    }

    function getBalance() {
        try {
            if (cachedBalanceEl && document.body.contains(cachedBalanceEl)) {
                const cachedVal = parseBalanceElement(cachedBalanceEl);
                if (cachedVal !== null && cachedVal > 0) return cachedVal;
                cachedBalanceEl = null;
            }

            // ลำดับ Selector ตามความเจาะจงสูงสุดของระบบกระเป๋าเงิน Stake (สากล)
            const selectors = [
                // 🎯 1. เจาะจงโครงสร้าง Stake Design System ตรงตามที่ผู้ใช้ตรวจสอบพบจริง (style="max-width: 16ch")
                'span[data-ds-text="true"][style*="16ch"]',
                'span.edge-typography-body-md-strong[style*="16ch"]',
                'span[style*="max-width: 16ch"]',
                'button[data-testid="wallet-balance-button"] span',
                'button[data-testid="wallet-balance-button"]',
                '[data-testid="wallet-balance"] span',
                '[data-testid="wallet-balance"]',
                '[data-testid="coin-toggle"] span',
                'header [data-testid*="wallet"] span',
                'nav [data-testid*="wallet"] span',
                'header div[class*="BalanceWrap"] span',
                'header div[class*="balance"] span',
                'span.edge-typography-body-md-strong.text-ellipsis',
                'span[data-ds-text="true"][style*="max-width"]',
                'header span[data-ds-text="true"]',
                'nav span[data-ds-text="true"]',
                '[role="banner"] span[data-ds-text="true"]'
            ];
            let zeroEl = null;
            for (let i = 0; i < selectors.length; i++) {
                const els = document.querySelectorAll(selectors[i]);
                for (let j = 0; j < els.length; j++) {
                    const val = parseBalanceElement(els[j]);
                    if (val !== null) {
                        if (val > 0) {
                            cachedBalanceEl = els[j];
                            return val;
                        }
                        if (!zeroEl) zeroEl = els[j];
                    }
                }
            }
            if (zeroEl) {
                cachedBalanceEl = zeroEl;
                return 0;
            }
            return null;
        } catch (e) {
            return null;
        }
    }

    function openManualTab(force = false) {
        const manualBtn = document.querySelector('button[data-testid="manual-tab"]') ||
                          document.querySelector('button[data-analytics="manual-bet-button"]');
        if (manualBtn) {
            const isAlreadyActive = manualBtn.getAttribute("aria-selected") === "true" ||
                                    manualBtn.getAttribute("data-active") === "true" ||
                                    manualBtn.classList.contains("active");
            if (!force && isAlreadyActive) return true;
            manualBtn.click();
            return true;
        }
        return false;
    }

    function ensureManualTab() {
        return openManualTab(true);
    }

    function setInput(testid, value) {
        let input = null;
        if (testid === "input-game-amount" || testid === "amount") {
            if (cachedAmountInput && document.body.contains(cachedAmountInput)) {
                input = cachedAmountInput;
            } else {
                input = document.querySelector('input[data-testid="input-game-amount"]') ||
                        document.querySelector('[data-testid="input-game-amount"] input') ||
                        document.querySelector('input[data-analytics="input-game-amount"]') ||
                        document.querySelector('[data-analytics="input-game-amount"] input') ||
                        document.querySelector('input[data-testid="bet-amount"]') ||
                        document.querySelector('[data-testid="bet-amount"] input') ||
                        resolveAmountInput();
                if (input) cachedAmountInput = input;
            }
        } else if (testid === "chance" || testid === "input-game-chance") {
            if (cachedChanceInput && document.body.contains(cachedChanceInput)) {
                input = cachedChanceInput;
            } else {
                input = document.querySelector('input[data-testid="chance"]') ||
                        document.querySelector('[data-testid="chance"] input') ||
                        document.querySelector('input[data-testid="input-game-chance"]') ||
                        document.querySelector('[data-testid="input-game-chance"] input') ||
                        document.querySelector('input[data-analytics="input-game-chance"]') ||
                        document.querySelector('input[data-testid="game-chance"]') ||
                        resolveChanceInput();
                if (input) cachedChanceInput = input;
            }
            BotMemory.saveState();
        } else {
            input = document.querySelector(`input[data-testid="${testid}"]`) ||
                    document.querySelector(`[data-testid="${testid}"] input`);
        }

        if (!input) {
            // 🧩 AUTO-ADAPT: หา element ใหม่เอง แล้วเขียนค่าที่ต้องการลงไปเลย (ยืนยันด้วยการอ่านกลับ)
            const isChanceField = (testid === "chance" || testid === "input-game-chance");
            const learned = isChanceField ? learnChanceInput(value) : learnAmountInput(value);
            if (learned && learned.el) {
                domStrategyNote(learned.strategy);
                return true;
            }
            return false;
        }

        // ลดพลังงานการแสดงผล: หากค่ายอดเดิมในช่องตรงกับค่าใหม่อยู่แล้ว ข้ามการ dispatch event ไม่ให้ React ทำงานซ้ำซ้อน
        if (input.value === String(value)) {
            return true;
        }
        const curNum = parseFloat(String(input.value).replace(/,/g, ''));
        const newNum = parseFloat(String(value).replace(/,/g, ''));
        if (Number.isFinite(curNum) && Number.isFinite(newNum) && Math.abs(curNum - newNum) <= 1e-7) {
            return true;
        }

        const descriptor = Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            "value"
        );
        if (descriptor && descriptor.set) {
            descriptor.set.call(input, String(value));
        } else {
            input.value = String(value);
        }

        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        input.dispatchEvent(new Event("blur", { bubbles: true }));
        return true;
    }

    function getBetButton() {
        if (cachedBetBtn && document.body.contains(cachedBetBtn)) return cachedBetBtn;

        let btn = document.querySelector('button[data-testid="bet-button"]') ||
                  document.querySelector('button[data-analytics="bet-button"]') ||
                  document.querySelector('button[data-analytics="game-bet-button"]') ||
                  document.querySelector('button[data-testid="game-play-button"]') ||
                  document.querySelector('button[data-test="bet-button"]');
        if (!btn) btn = resolveBetButton();
        if (!btn) {
            const learnedBtn = learnBetButton();
            if (learnedBtn) {
                domStrategyNote(learnedBtn.strategy);
                return learnedBtn.el;
            }
        }
        if (btn) {
            cachedBetBtn = btn;
            return btn;
        }
        const allBtns = document.querySelectorAll('button');
        for (let i = 0; i < allBtns.length; i++) {
            const txt = (allBtns[i].textContent || "").trim().toLowerCase();
            if (txt === "bet" || txt === "เดิมพัน" || txt === "play" || txt === "ทอย") {
                cachedBetBtn = allBtns[i];
                return allBtns[i];
            }
        }
        return null;
    }

    // ==================================================
    // 5.5 DOM RESILIENCE LAYER — กันสคริปต์พังเมื่อ Stake เปลี่ยน data-testid
    // ลำดับการค้นหา: cache → testid/analytics เดิม → โครงสร้าง (attribute/label/บริเวณใกล้กัน)
    // ทำงาน "เฉพาะเมื่อทางเดิมหาของไม่เจอ" จึงไม่เปลี่ยนพฤติกรรมเดิมที่ทำงานอยู่แล้ว
    // ==================================================
    let domResolveFails = 0;

    // หา "แผงเกม" เป็นจุดอ้างอิง (anchor) แทนการไล่ทั้งหน้า
    function getGamePanel() {
        // anchor จริงบน stake.com (ยืนยันจาก DOM probe 3 พ.ย. 2026): game-frame / game-sidebar
        const known = document.querySelector('[data-testid="game-frame"]') ||
                      document.querySelector('[data-testid="game-sidebar"]') ||
                      document.querySelector('[data-testid="dice-game"]') ||
                      document.querySelector('[data-testid="dice-slider"]');
        if (known) return known;
        // anchor สำรอง: container ที่มีทั้งช่องกรอกตัวเลขและปุ่มอยู่ด้วยกัน
        const inputs = document.querySelectorAll('input[type="number"], input[inputmode="decimal"], input[inputmode="numeric"]');
        for (let i = 0; i < inputs.length; i++) {
            let p = inputs[i].parentElement;
            for (let d = 0; d < 6 && p; d++) {
                if (p.querySelector('button')) return p;
                p = p.parentElement;
            }
        }
        return document.body;
    }

    function isElUsable(el) {
        if (!el) return false;
        if (el.disabled) return false;
        if (el.getAttribute("aria-disabled") === "true") return false;
        if (el.type === "hidden") return false;
        const r = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
        return !r || (r.width > 1 && r.height > 1);
    }

    // 🧩 ช่องที่ "ไม่ใช่" ช่องยอดเดิมพัน (ข้อมูลจริงจาก stake.com 3 พ.ย. 2026):
    // ช่อง payout/profit มี min/max แต่ช่องยอดจริงไม่มี — ถ้าไม่กรองออกจะเลือกผิดช่อง
    function isNotAmountField(el) {
        if (!el) return true;
        const sig = (el.getAttribute("data-testid") || "") + " " +
                    (el.getAttribute("name") || "") + " " +
                    (el.getAttribute("aria-label") || "");
        return /payout|profit|chance|multiplier|slider|target|roll/i.test(sig);
    }

    function numberInputsIn(root) {
        const scope = root || getGamePanel();
        const all = scope.querySelectorAll('input[type="number"], input[inputmode="decimal"], input[inputmode="numeric"], input:not([type])');
        const out = [];
        for (let i = 0; i < all.length; i++) {
            if (all[i].type === "hidden") continue;
            // กันช่องค้นหา/ช่องในกระเป๋าเงิน ที่ไม่ใช่ของเกม
            if (all[i].closest('[data-testid*="wallet"], header, nav, [data-testid*="payout"], [data-testid*="profit"]')) continue;
            if (isNotAmountField(all[i])) continue;
            out.push(all[i]);
        }
        return out;
    }

    // ช่องโอกาส: ค่า 2–98 และอยู่ใกล้คำว่า Chance/โอกาส
    function resolveChanceInput() {
        if (learnedChanceEl && document.body.contains(learnedChanceEl) && isElUsable(learnedChanceEl)) return learnedChanceEl;
        const candidates = numberInputsIn(getGamePanel());
        for (let i = 0; i < candidates.length; i++) {
            const el = candidates[i];
            const v = parseFloat(el.value);
            if (!Number.isFinite(v) || v < 2 || v > 98) continue;
            if (!isElUsable(el)) continue;
            const sig = (el.getAttribute("data-testid") || "") + " " + (el.getAttribute("aria-label") || "");
            if (/payout|profit|multiplier/i.test(sig)) continue;
            const box = el.closest("div") || el.parentElement || el;
            const txt = ((box.textContent || "") + " " + (el.getAttribute("aria-label") || "")).toLowerCase();
            if (/chance|โอกาส|win|multiplier/.test(txt)) return el;
        }
        return null;
    }

    // ช่องยอดเดิมพัน: ใช้ min/max ที่เว็บประกาศ + label "Bet Amount" + ตัดช่องโอกาสออก
    function resolveAmountInput() {
        if (learnedAmountEl && document.body.contains(learnedAmountEl) && isElUsable(learnedAmountEl)) return learnedAmountEl;
        const scope = getGamePanel();
        const candidates = numberInputsIn(scope);

        for (let i = 0; i < candidates.length; i++) {
            const el = candidates[i];
            if (isNotAmountField(el)) continue;
            if ((el.getAttribute("min") !== null || el.getAttribute("max") !== null) && isElUsable(el)) return el;
        }
        // ช่องยอดจริงของ Stake ไม่มี min/max แต่มี step="1e-8"
        for (let i = 0; i < candidates.length; i++) {
            const el = candidates[i];
            if (isNotAmountField(el)) continue;
            if (el.getAttribute("step") !== null && isElUsable(el)) return el;
        }

        const labels = scope.querySelectorAll("label, span, div");
        const limit = Math.min(labels.length, 400);
        for (let i = 0; i < limit; i++) {
            const t = (labels[i].textContent || "").trim();
            if (!t || t.length > 24) continue;
            if (!/^(bet\s*amount|amount|จำนวนเดิมพัน|ยอดเดิมพัน)$/i.test(t)) continue;
            let p = labels[i].parentElement;
            for (let d = 0; d < 4 && p; d++) {
                const inp = p.querySelector("input");
                if (inp && isElUsable(inp)) return inp;
                p = p.parentElement;
            }
        }

        const chanceEl = resolveChanceInput();
        for (let i = 0; i < candidates.length; i++) {
            if (candidates[i] !== chanceEl && isElUsable(candidates[i])) return candidates[i];
        }
        return null;
    }

    // ปุ่มเดิมพัน: ปุ่มในฟอร์มเดียวกับช่องยอด → ปุ่มที่ใกล้ช่องยอดที่สุดและกดได้
    function resolveBetButton() {
        const inp = cachedAmountInput || resolveAmountInput();
        const form = inp ? inp.closest("form") : null;
        if (form) {
            const submit = form.querySelector('button[type="submit"]');
            if (submit && isElUsable(submit)) return submit;
            const btns = form.querySelectorAll("button");
            for (let i = 0; i < btns.length; i++) {
                const t = (btns[i].textContent || "").trim();
                if (t.length > 0 && t.length <= 20 && isElUsable(btns[i])) return btns[i];
            }
        }
        if (inp) {
            let p = inp.parentElement;
            for (let d = 0; d < 6 && p; d++) {
                const btns = p.querySelectorAll("button");
                for (let i = 0; i < btns.length; i++) {
                    const t = (btns[i].textContent || "").trim();
                    if (/^(\d|bet|เดิมพัน|play|ทอย|roll)/i.test(t) && t.length <= 20 && isElUsable(btns[i])) return btns[i];
                }
                p = p.parentElement;
            }
        }
        return null;
    }

    // ตรวจสุขภาพ selector: บอกผู้ใช้ตรง ๆ ว่าอะไรหาย แทนการวนรอเงียบ ๆ
    function probeDomHealth() {
        checkDomDrift();
        const amount = (cachedAmountInput && document.body.contains(cachedAmountInput)) ? cachedAmountInput : resolveAmountInput();
        const chance = (cachedChanceInput && document.body.contains(cachedChanceInput)) ? cachedChanceInput : resolveChanceInput();
        const button = (cachedBetBtn && document.body.contains(cachedBetBtn)) ? cachedBetBtn : resolveBetButton();
        const missing = [];
        if (!amount) missing.push("ช่องยอดเดิมพัน");
        if (!chance) missing.push("ช่องโอกาส");
        if (!button && !getBetButton()) missing.push("ปุ่มเดิมพัน");
        if (missing.length === 0) return { ok: true, msg: "" };
        return {
            ok: false,
            msg: "หาไม่เจอ: " + missing.join(", ") + " — เว็บอาจเปลี่ยนหน้าแล้ว (F5 หรือ STOP ก่อน)"
        };
    }

    // ==================================================
    // 5.4.1 SELF-TEST MODE — ตรวจทุกจุดที่บอทต้องใช้จริง โดยไม่กดเดิมพัน
    // วิธีใช้: กดปุ่ม 🧪 SELF-TEST บนแผง หรือ Alt+T (ก่อน START)
    // หลักการ: เรียก resolver "ตัวจริง" ของบอท (ไม่ใช่ selector ของสคริปต์ภายนอก)
    //          + เขียนทับด้วยค่าเดิม -> ทดสอบ event pipeline โดยไม่เปลี่ยนยอดเงินผู้ใช้
    // ==================================================
    let selfTestRunning = false;

    function stAdd(list, name, ok, detail) {
        list.push({ check: name, ok: !!ok, detail: String(detail == null ? "" : detail) });
    }

    async function runSelfTest() {
        if (selfTestRunning) return null;
        selfTestRunning = true;
        const results = [];
        try {
            if (typeof updateStatusText === "function") updateStatusText("🧪 กำลังทดสอบระบบ (ไม่เดิมพัน)...", "#55e7ff");

            const panel = getGamePanel();
            stAdd(results, "แผงเกม", !!panel,
                panel ? (panel.getAttribute("data-testid") || panel.tagName.toLowerCase()) : "หาไม่เจอ");

            const amountEl = cachedAmountInput || resolveAmountInput();
            stAdd(results, "ช่องยอดเดิมพัน", !!amountEl,
                amountEl ? "value=" + amountEl.value + " step=" + (amountEl.getAttribute("step") || "-") : "หาไม่เจอ");

            const chanceEl = cachedChanceInput || resolveChanceInput();
            const chanceVal = chanceEl ? parseFloat(chanceEl.value) : NaN;
            stAdd(results, "ช่องโอกาส (%)", !!chanceEl && Number.isFinite(chanceVal) && chanceVal > 0 && chanceVal <= 100,
                chanceEl ? "value=" + chanceEl.value : "หาไม่เจอ");

            const btn = getBetButton();
            stAdd(results, "ปุ่มเดิมพัน", !!btn,
                btn ? "'" + (btn.textContent || "").trim().slice(0, 14) + "'" + (btn.disabled ? " (disabled = ปกติเมื่อช่องว่าง)" : " พร้อมกด") : "หาไม่เจอ");

            const bal = getBalance();
            stAdd(results, "ยอดเงิน (Balance)", bal !== null && bal > 0,
                bal === null ? "อ่านไม่ได้" : formatNumber(bal, 4) + " USDT");

            const badge = getLatestBadgeInfo();
            stAdd(results, "ผลทอยล่าสุด (badge)", !!badge && badge.roll !== null && Number.isFinite(badge.roll),
                badge ? "roll=" + badge.roll : "หาไม่เจอ (ยังใช้ผลจาก API ได้)");

            const amountWrote = amountEl ? writeVerified(amountEl, amountEl.value) : false;
            stAdd(results, "เขียนค่าช่องยอดได้", amountWrote, amountWrote ? "อ่านกลับตรง (React setter ทำงาน)" : "เขียนแล้วอ่านกลับไม่ตรง");

            const chanceWrote = chanceEl ? writeVerified(chanceEl, chanceEl.value) : false;
            stAdd(results, "เขียนค่าช่องโอกาสได้", chanceWrote, chanceWrote ? "อ่านกลับตรง" : "เขียนแล้วอ่านกลับไม่ตรง");

            const passed = results.filter(function (r) { return r.ok; }).length;
            const total = results.length;
            const failed = results.filter(function (r) { return !r.ok; }).map(function (r) { return r.check; });
            const allOk = passed === total;

            const report = {
                probe: "self-test@1",
                build: BUILD_STAMP,
                time: new Date().toISOString(),
                passed: passed + "/" + total,
                results: results,
                adapt: {
                    strategy: learnedStrategy || "(ยังไม่ต้องปรับ)",
                    amountLearned: !!learnedAmountEl,
                    chanceLearned: !!learnedChanceEl
                },
                dom: domFingerprintReport()
            };

            try { if (typeof console !== "undefined" && console.table) console.table(results); } catch (e) {}
            log("🧪 SELF-TEST " + passed + "/" + total + (allOk ? " PASS — พร้อมเดิมพัน" : " — ไม่ผ่าน: " + failed.join(", ")), true);

            if (typeof updateStatusText === "function") {
                updateStatusText(allOk
                    ? "🧪 SELF-TEST ผ่านครบ " + total + "/" + total + " — พร้อมเดิมพัน"
                    : "🧪 SELF-TEST " + passed + "/" + total + " — ไม่ผ่าน: " + failed.join(", "),
                    allOk ? "#00e676" : "#ffa726");
            }

            if (!allOk) {
                try { if (typeof copy === "function") copy(JSON.stringify(report, null, 2)); } catch (e) {}
                log("📋 คัดลอกรายงาน SELF-TEST ลงคลิปบอร์ดแล้ว (ส่งกลับมาเพื่อแก้ selector ได้)", true);
            }
            return report;
        } catch (e) {
            log("🧪 SELF-TEST ผิดพลาด: " + (e && e.message ? e.message : e), true);
            return null;
        } finally {
            selfTestRunning = false;
        }
    }

    // ==================================================
    // 5.4.2 DOM DRIFT DETECTOR — จำลายนิ้วมือของแผงเกม แล้วเทียบทุกครั้งที่ probe
    // เป้าหมาย: รู้ล่วงหน้าว่า Stake เปลี่ยน DOM ก่อนที่บอทจะพัง
    // หมายเหตุ: ตัด testid ที่เป็น UUID ออก (Stake สุ่มใหม่ทุกรอบ -> drift ปลอม)
    // ==================================================
    let domBaseline = null;
    let domDriftCount = 0;

    function domTestIdSignature() {
        let scope = null;
        try { scope = getGamePanel() || document.body; } catch (e) { scope = document.body; }
        if (!scope) return [];
        const nodes = scope.querySelectorAll("[data-testid]");
        const seen = {};
        const out = [];
        for (let i = 0; i < nodes.length && out.length < 400; i++) {
            const t = nodes[i].getAttribute("data-testid");
            if (!t || t.length < 2 || t.length > 40) continue;
            if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(t)) continue;
            if (seen[t]) continue;
            seen[t] = 1;
            out.push(t);
        }
        return out.sort();
    }

    function domFingerprintReport() {
        const now = domTestIdSignature();
        if (!domBaseline) return { baseline: false, added: [], removed: [], changed: 0, count: now.length, drifts: domDriftCount };
        const added = now.filter(function (t) { return domBaseline.indexOf(t) < 0; });
        const removed = domBaseline.filter(function (t) { return now.indexOf(t) < 0; });
        return {
            baseline: true,
            added: added.slice(0, 12),
            removed: removed.slice(0, 12),
            changed: added.length + removed.length,
            count: now.length,
            drifts: domDriftCount
        };
    }

    function checkDomDrift() {
        const now = domTestIdSignature();
        if (!now.length) return null;
        if (!domBaseline) { domBaseline = now; return null; }
        const added = now.filter(function (t) { return domBaseline.indexOf(t) < 0; });
        const removed = domBaseline.filter(function (t) { return now.indexOf(t) < 0; });
        if (!added.length && !removed.length) return null;
        domBaseline = now;
        domDriftCount++;
        const parts = [];
        if (removed.length) parts.push("หาย " + removed.length + ": " + removed.slice(0, 5).join(", "));
        if (added.length) parts.push("เพิ่ม " + added.length + ": " + added.slice(0, 5).join(", "));
        const msg = "🧬 DOM เปลี่ยน (" + parts.join(" · ") + ")";
        try { log(msg, true); } catch (e) {}
        try {
            if (typeof updateStatusText === "function") updateStatusText(msg, "#ffea00");
        } catch (e) {}
        return { added: added, removed: removed };
    }

    // ==================================================
    // 5.6 AUTO-ADAPT ENGINE — เรียนรู้ selector ใหม่เองเมื่อ Stake เปลี่ยน DOM
    // หลักการ: หา candidate → ยืนยันด้วย "พฤติกรรม" (เขียนค่าแล้วอ่านกลับได้จริง)
    //          → จำไว้ใน memory → ทำงานต่อทันที ไม่ต้องรอคนมาแก้โค้ด
    // หมายเหตุ: เก็บใน memory เท่านั้น (ไม่เขียน localStorage) เพื่อรักษา zero-footprint
    // ==================================================
    let learnedAmountEl = null;
    let learnedChanceEl = null;
    let learnedStrategy = "";
    let betBtnStalls = 0;

    function domStrategyNote(text) {
        learnedStrategy = text || "";
        try {
            if (typeof updateStatusText === "function") updateStatusText("🧩 ปรับ selector อัตโนมัติ: " + learnedStrategy, "#ffea00");
        } catch (e) {}
        log("🧩 AUTO-ADAPT: " + learnedStrategy, true);
    }

    // เขียนค่าลง input ด้วย native setter + event ที่ React ฟังอยู่ แล้ว "อ่านกลับ" ยืนยันว่าติดจริง
    function writeVerified(el, value) {
        if (!el) return false;
        const want = parseFloat(value);
        if (!Number.isFinite(want)) return false;
        try {
            const d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
            if (d && d.set) d.set.call(el, String(value));
            else el.value = String(value);
            el.dispatchEvent(new Event("input", { bubbles: true }));
            el.dispatchEvent(new Event("change", { bubbles: true }));
            el.dispatchEvent(new Event("blur", { bubbles: true }));
            const got = parseFloat(el.value);
            return Number.isFinite(got) && Math.abs(got - want) <= Math.max(1e-9, Math.abs(want) * 1e-6);
        } catch (e) {
            return false;
        }
    }

    // ให้คะแนนช่องตัวเลขว่า "น่าจะเป็นช่องยอดเดิมพัน" แค่ไหน
    function amountCandidates() {
        const chanceEl = resolveChanceInput();
        const list = numberInputsIn(getGamePanel());
        const scored = [];
        for (let i = 0; i < list.length; i++) {
            const el = list[i];
            if (!isElUsable(el) || el === chanceEl) continue;
            if (isNotAmountField(el)) continue;
            let score = 0;
            if (el.getAttribute("step") !== null) score += 2;
            const attrs = (el.getAttribute("min") || "") + " " + (el.getAttribute("max") || "") + " " + (el.getAttribute("aria-label") || "");
            if (el.getAttribute("min") !== null || el.getAttribute("max") !== null) score += 3;
            if (/amount|stake|bet|เดิมพัน|ยอด|จำนวน/i.test(attrs)) score += 2;
            const box = el.closest("div") || el.parentElement;
            if (box && /bet\s*amount|amount|จำนวนเดิมพัน|ยอดเดิมพัน/i.test(box.textContent || "")) score += 2;
            if (el.type === "number" || el.inputMode === "decimal" || el.inputMode === "numeric") score += 1;
            scored.push({ el: el, score: score });
        }
        scored.sort(function (a, b) { return b.score - a.score; });
        return scored;
    }

    // เรียนรู้ช่องยอดเดิมพันใหม่ แล้วเขียนค่าที่ต้องการลงไปทันที
    function learnAmountInput(value) {
        const cands = amountCandidates();
        for (let i = 0; i < cands.length; i++) {
            if (cands[i].el === learnedChanceEl) continue;
            if (writeVerified(cands[i].el, value)) {
                learnedAmountEl = cands[i].el;
                cachedAmountInput = cands[i].el;
                return { el: cands[i].el, strategy: "ช่องยอดเดิมพัน (คะแนน " + cands[i].score + ")" };
            }
        }
        return null;
    }

    // เรียนรู้ช่องโอกาสใหม่ (ค่า 2–98 + คำใบ้ chance/โอกาส)
    function learnChanceInput(value) {
        const list = numberInputsIn(getGamePanel());
        for (let i = 0; i < list.length; i++) {
            const el = list[i];
            if (!isElUsable(el)) continue;
            if (el === learnedAmountEl || el === cachedAmountInput) continue;
            const box = el.closest("div") || el.parentElement;
            const hint = (((box && box.textContent) || "") + " " + (el.getAttribute("aria-label") || "")).toLowerCase();
            if (!/chance|โอกาส|win|multiplier|%/.test(hint)) continue;
            if (writeVerified(el, value)) {
                learnedChanceEl = el;
                cachedChanceInput = el;
                return { el: el, strategy: "ช่องโอกาส (label)" };
            }
        }
        return null;
    }

    // รายการปุ่มที่ "อาจเป็น" ปุ่มเดิมพัน เรียงจากน่าเชื่อถือที่สุด (กรองปุ่มอันตรายออก)
    function betButtonCandidates() {
        const panel = getGamePanel();
        const out = [];
        const amountEl = cachedAmountInput || learnedAmountEl || resolveAmountInput();
        const form = amountEl ? amountEl.closest("form") : null;
        const banned = /stop|หยุด|reload|โหลด|cash\s*out|ถอน|ทั้งหมด|settings|ตั้งค่า|history|ประวัติ/i;

        function push(el, why) {
            if (!el || !isElUsable(el)) return;
            if (el.getAttribute("role") === "tab" || el.getAttribute("aria-selected") !== null) return;
            if (el.closest('[data-testid*="wallet"], header, nav')) return;
            const t = (el.textContent || "").trim();
            if (banned.test(t)) return;
            if (t.length > 24) return;
            out.push({ el: el, why: why });
        }

        if (form) {
            push(form.querySelector('button[type="submit"]'), "submit ในฟอร์มเดียวกับช่องยอด");
            const fb = form.querySelectorAll("button");
            for (let i = 0; i < fb.length; i++) push(fb[i], "ปุ่มในฟอร์มเดียวกับช่องยอด");
        }
        const all = panel.querySelectorAll("button");
        for (let i = 0; i < all.length; i++) {
            const t = (all[i].textContent || "").trim();
            if (/^(bet|เดิมพัน|play|ทอย|roll|place)/i.test(t)) push(all[i], "ข้อความปุ่ม '" + t + "'");
        }
        if (out.length === 0 && all.length) push(all[all.length - 1], "ปุ่มที่กดได้ตัวสุดท้ายของแผง");

        const seen = [];
        return out.filter(function (o) {
            if (seen.indexOf(o.el) >= 0) return false;
            seen.push(o.el);
            return true;
        });
    }

    // เลือกปุ่มเดิมพันใหม่เอง
    function learnBetButton() {
        const cands = betButtonCandidates();
        if (!cands.length) return null;
        cachedBetBtn = cands[0].el;
        return { el: cands[0].el, strategy: "ปุ่มเดิมพัน ← " + cands[0].why };
    }

    // หมุนไปปุ่มตัวถัดไป (ใช้เมื่อกดแล้วไม่มีผลติดกัน 2 ครั้ง)
    function rotateBetButton() {
        const cands = betButtonCandidates();
        for (let i = 0; i < cands.length; i++) {
            if (cands[i].el !== cachedBetBtn) {
                cachedBetBtn = cands[i].el;
                return cands[i].why;
            }
        }
        return "";
    }

    function isBetButtonReady(btn) {
        if (!btn) return false;
        if (btn.disabled) return false;
        if (btn.getAttribute("aria-disabled") === "true") return false;
        return true;
    }

    function clickBetButton(btn) {
        if (!btn) return;
        btn.click();
    }

    // ==================================================
    // 6. MARTINGALE ENGINE — แพ้ 1 ไม้ ยอด ×1.7311 (+73.11%) · ฐาน 68% (ไม้ 7+ = 70%) · ชนะติด 3 รีเซ็ต
    // (ระบบบันได Fibonacci และการทบต้นเดิมถูกถอดออกทั้งหมด)
    // ==================================================

    function getBaseBet() {
        const v = parseFloat(configRealBaseBet);
        return (v > 0) ? v : parseFloat(FIXED_BASE_BET);
    }

    // แปลงยอดเป็นสตริงทศนิยมล้วน ห้ามออกมาเป็นรูป 4.8e-7 (ช่องยอดของ Stake ไม่รับ)
    function formatBetAmount(x) {
        const n = (typeof x === "number" && isFinite(x)) ? x : parseFloat(x);
        const v = (isFinite(n) && n >= 0) ? n : 0;
        if (v >= 0.01) return v.toFixed(4);
        return v.toFixed(8).replace(/0+$/, "").replace(/\.$/, "");
    }

    // ยอดไม้ปัจจุบัน = ยอดฐาน × ตัวคูณตาม Payout จริง แล้วปัดขึ้น 8 ตำแหน่ง และไม่ต่ำกว่าขั้นต่ำของเว็บ
    function calculateCurrentBetAmount() {
        const base = Math.max(getBaseBet(), effectiveMinBet());
        // คงอัตราทบฐาน 68% (+73.11%/ไม้) เสมอ เพื่อไม่ให้ยอดแทงกระโดดเมื่อเพิ่มโอกาสชนะเป็น 70% ที่ไม้ >= 7
        const baseChance = parseFloat(NORMAL_CHANCE) || 68;
        const payout = 99 / baseChance;
        const profitRate = payout - 1; // 0.45588 at 68%
        // คำนวณตัวคูณทบให้ถูกต้องตามหลักคณิตศาสตร์:
        // เมื่อชนะติด 3 ตา (MARTINGALE_RESET_WINS = 3) ต้องดึงทุนที่เสียไปทั้งหมดคืนมา 100% + กำไร
        const multPct = (1 / (MARTINGALE_RESET_WINS * profitRate)) * 100;
        const mult = Math.pow(1 + multPct / 100, Math.max(0, mStep - 1));
        const amt = Math.ceil(base * mult * 1e8) / 1e8;
        return formatBetAmount(amt);
    }

    // ==================================================
    // 6.2 DESYNC GUARD — จับกรณีที่ยอดเงินจริงไม่ตรงกับที่ระบบคำนวณ
    // (เว็บปฏิเสธเดิมพัน / อ่านผลผิด / คำนวณ payout พลาด)
    // หลักการ: เชื่อ "ยอดจาก API" ก่อนเสมอ (แม่นระดับทศนิยม 8 ตำแหน่ง)
    // ❌ การอ่านยอดจาก DOM ถูกถอดออกทั้งหมด — เพราะ WebSocket `wss://stake.com/_api/websockets`
    //    ล่มทำให้ยอดบนหน้าจอค้าง → อ่านค่าค้างไปตัดสิน = DESYNC ปลอม + หยุดเซสชันผิด
    // ==================================================

    function registerBalanceSync() {
        desyncStrikes = 0;
        cleanSyncStreak++;
        // คืนเครดิต RESYNC ให้ทีละครั้งทุก 10 ไม้ที่ยอดตรงกัน (สูงสุดไม่เกินเพดาน)
        if (cleanSyncStreak >= 10) {
            cleanSyncStreak = 0;
            if (resyncCount > 0) resyncCount--;
        }
    }

    // ลงโทษ/ซิงก์ เมื่อยอดไม่ตรงจริง ๆ (tol ถูกส่งเข้ามา เพราะ API กับ DOM เชื่อถือได้ไม่เท่ากัน)
    function registerBalanceMismatch(diff, actualBal, tol, source) {
        desyncStrikes++;
        cleanSyncStreak = 0;
        lastDesync = { dom: actualBal, model: currentBalance, diff: diff, tol: tol, source: source };
        const signed = (diff >= 0 ? "+" : "−") + formatNumber(Math.abs(diff), 8);
        log(`⚠️ [DESYNC/${source}] ยอดจริง ${formatNumber(actualBal, 8)} ≠ ที่คำนวณ ${formatNumber(currentBalance, 8)} | ต่าง ${signed} (เกณฑ์ ${formatNumber(tol, 8)}, ไม้ล่าสุด ${formatNumber(lastBetAmount, 8)}) (ครั้งที่ ${desyncStrikes}/${DESYNC_STRIKE_LIMIT})`, true);
        updateStatusText(`⚠️ ยอดต่าง ${signed} [${source}] (${desyncStrikes}/${DESYNC_STRIKE_LIMIT})`, "#ffa726");
        if (desyncStrikes < DESYNC_STRIKE_LIMIT) return;
        if (configAutoResync && resyncCount < RESYNC_LIMIT) {
            resyncCount++;
            currentBalance = parseFloat(actualBal.toFixed(8)); // ยอมรับยอดจริงเป็นความจริงใหม่
            desyncStrikes = 0;
            lastBetAmount = 0;
            log(`↔️ [RESYNC ${resyncCount}/${RESYNC_LIMIT}] ปรับยอดในระบบเป็น ${formatNumber(actualBal, 8)} (เดิม ${formatNumber(lastDesync.model, 8)}, ต่าง ${signed}) — เดาว่าจะเกิดจากผลหลุด/มีตัวอื่นแทงซ้อน`, true);
            updateStatusText(`↔️ ซิงก์ยอดใหม่ (ต่าง ${signed}) — เล่นต่อ ${resyncCount}/${RESYNC_LIMIT}`, "#ffa726");
            return;
        }
        stopSession(`🚨 DESYNC: ยอดจริงต่าง ${signed} จากที่คำนวณ ${desyncStrikes} ครั้งติด — หยุดเพื่อกันคำนวณไม้ผิด`, "#ff3344");
    }

    // 🗑️ verifyBalanceSync() เดิมถูกลบออกทั้งฟังก์ชัน: มันอ่านยอดจาก DOM เพื่อเทียบ ซึ่งพึ่ง
    // WebSocket ที่ล่มอยู่ → ยอดค้าง → แจ้ง DESYNC ปลอมและหยุดเซสชันโดยไม่มีอะไรผิดจริง
    // ✅ การเทียบยอดเหลือทางเดียวคือ API ใน applyBetBalance() (ค่าจากเซิร์ฟเวอร์จริง)

    // ==================================================
    // 6.3 BET BOUNDARY — อ่านขั้นต่ำ/สูงสุดจาก attribute ของช่องเดิมพัน
    // ==================================================
    function refreshBetLimits() {
        try {
            const inp = cachedAmountInput ||
                document.querySelector('input[data-testid="input-game-amount"]') ||
                document.querySelector('[data-testid="input-game-amount"] input') ||
                document.querySelector('input[data-analytics="input-game-amount"]') ||
                learnedAmountEl ||
                resolveAmountInput();
            if (!inp) return;
            const min = parseFloat(inp.getAttribute("min") || inp.getAttribute("data-min"));
            const max = parseFloat(inp.getAttribute("max") || inp.getAttribute("data-max"));
            if (Number.isFinite(min) && min > 0) detectedMinBet = min;
            if (Number.isFinite(max) && max > 0) detectedMaxBet = max;
        } catch (e) {}
    }

    // ขั้นต่ำที่ใช้จริง = ค่าที่เว็บประกาศ (ถ้ามี) หรือ 0.00015 ที่ตั้งไว้
    function effectiveMinBet() {
        return (detectedMinBet && detectedMinBet > AUTO_MIN_BET) ? detectedMinBet : AUTO_MIN_BET;
    }

    // ==================================================
    // 6.4 RNG AUDIT — ชุดทดสอบย่อยตาม NIST SP 800-22 (ตรวจ "รู้เขา" จากผลจริง)
    // บิตที่ใช้: roll < 50 = 1, roll >= 50 = 0  (buffer 2,048 ลูก)
    // ==================================================
    // 32,768 บิต: ดัน Rank เป็น N=32 บล็อก, NonOverlap N=32, Overlap N=31, LinComplex N=64,
    // และ Excursions เป็น ~144 รอบ (NIST แนะนำ J≥500) — ชุดที่เคยพลังต่ำจึงใช้งานได้จริง
    const RNG_MAX_SAMPLES = 4096; // เดิม 32768 — ลดงานคำนวณฮิสโตแกรมลง 8 เท่า (กราฟยังนิ่งพอ)
    const RNG_ALPHA = 0.01; // เกณฑ์มาตรฐาน NIST: p >= 0.01 ถือว่าผ่าน
    let rngRolls = [];

    function trackRngRoll(v) {
        if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 100) return;
        rngRolls.push(v);
        if (rngRolls.length > RNG_MAX_SAMPLES) rngRolls.shift();
    }

    // ฟังก์ชันพิเศษที่จำเป็น (ไม่มีใน JS): erfc, normal CDF, incomplete gamma
    function erfc(x) {
        const z = Math.abs(x);
        const t = 1 / (1 + z / 2);
        const ans = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 +
            t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 +
            t * (-0.82215223 + t * 0.17087277)))))))));
        return x >= 0 ? ans : 2 - ans;
    }

    function normalCdf(x) {
        return 0.5 * erfc(-x / Math.SQRT2);
    }

    function gammaLower(a, x) {
        // P(a,x) — lower incomplete gamma / Γ(a), อนุกรมลู่เข้า (ใช้เมื่อ x < a+1)
        let ap = a, sum = 1 / a, del = sum;
        for (let n = 1; n <= 1000; n++) {
            ap++;
            del *= x / ap;
            sum += del;
            if (Math.abs(del) < Math.abs(sum) * 1e-15) break;
        }
        return sum * Math.exp(-x + a * Math.log(x) - lnGamma(a));
    }

    function gammaIncompleteUpper(a, x) {
        // Q(a,x) — upper incomplete gamma / Γ(a) (Numerical Recipes)
        if (x <= 0) return 1;
        // continued fraction ใช้ได้เฉพาะ x ≥ a+1; ช่วงล่างต้องใช้ series ไม่เช่นนั้นได้ NaN
        if (x < a + 1) return Math.max(0, Math.min(1, 1 - gammaLower(a, x)));
        let b = x + 1 - a, c = 1e300, d = 1 / b, h = d;
        for (let i = 1; i <= 200; i++) {
            const an = -i * (i - a);
            b += 2;
            d = an * d + b;
            if (Math.abs(d) < 1e-300) d = 1e-300;
            c = b + an / c;
            if (Math.abs(c) < 1e-300) c = 1e-300;
            d = 1 / d;
            const del = d * c;
            h *= del;
            if (Math.abs(del - 1) < 1e-12) break;
        }
        const logPrefix = -x + a * Math.log(x) - lnGamma(a);
        return Math.exp(logPrefix) * h;
    }

    function lnGamma(z) {
        const g = [676.5203681218851, -1259.1392167224028, 771.32342877765313,
            -176.61502916214059, 12.507343278686905, -0.13857109526572012,
            9.9843695780195716e-6, 1.5056327351493116e-7];
        if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z);
        z -= 1;
        let x = 0.99999999999980993;
        for (let i = 0; i < g.length; i++) x += g[i] / (z + i + 1);
        const t = z + g.length - 0.5;
        return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
    }

    function chiSquareP(df, chi2) {
        if (df <= 0) return 1;
        return Math.max(0, Math.min(1, gammaIncompleteUpper(df / 2, chi2 / 2)));
    }

    function rngBits() {
        return rngRolls.map((v) => (v < 50 ? 1 : 0));
    }

    // 1) Frequency (Monobit)
    function nistMonobit(bits) {
        const n = bits.length;
        let sum = 0;
        for (let i = 0; i < n; i++) sum += bits[i] ? 1 : -1;
        return erfc(Math.abs(sum) / Math.sqrt(n) / Math.SQRT2);
    }

    // 2) Frequency within a Block (M = 128)
    function nistBlockFrequency(bits, M) {
        const n = bits.length;
        const N = Math.floor(n / M);
        if (N < 1) return null;
        let chi2 = 0;
        for (let b = 0; b < N; b++) {
            let ones = 0;
            for (let i = 0; i < M; i++) ones += bits[b * M + i];
            const pi = ones / M;
            chi2 += 4 * M * (pi - 0.5) * (pi - 0.5);
        }
        return chiSquareP(N, chi2);
    }

    // 3) Runs Test
    function nistRuns(bits) {
        const n = bits.length;
        let ones = 0;
        for (let i = 0; i < n; i++) ones += bits[i];
        const pi = ones / n;
        if (Math.abs(pi - 0.5) >= 2 / Math.sqrt(n)) return 0; // ล้มเหลวตั้งแต่ prerequisite
        let V = 1;
        for (let i = 1; i < n; i++) if (bits[i] !== bits[i - 1]) V++;
        const num = Math.abs(V - 2 * n * pi * (1 - pi));
        const den = 2 * Math.sqrt(2 * n) * pi * (1 - pi);
        return erfc(num / den / Math.SQRT2);
    }

    // 4) Longest Run of Ones in a Block (M = 8, K = 3)
    function nistLongestRun(bits) {
        const n = bits.length;
        const M = 8;
        if (n < 128) return null;
        const vClass = [0, 0, 0, 0]; // <=1, 2, 3, >=4
        const blocks = Math.floor(n / M);
        for (let b = 0; b < blocks; b++) {
            let best = 0, cur = 0;
            for (let i = 0; i < M; i++) {
                if (bits[b * M + i]) { cur++; if (cur > best) best = cur; }
                else cur = 0;
            }
            vClass[best <= 1 ? 0 : best === 2 ? 1 : best === 3 ? 2 : 3]++;
        }
        const pi = [0.2148, 0.3672, 0.2305, 0.1875];
        let chi2 = 0;
        for (let i = 0; i < 4; i++) {
            const e = blocks * pi[i];
            chi2 += (vClass[i] - e) * (vClass[i] - e) / e;
        }
        return chiSquareP(3, chi2);
    }

    // 5) Cumulative Sums (forward + backward) — เลือกค่าที่แย่ที่สุด
    function nistCusum(bits) {
        const n = bits.length;
        const calc = (dir) => {
            let s = 0, z = 0;
            for (let i = 0; i < n; i++) {
                s += dir * (bits[i] ? 1 : -1);
                if (Math.abs(s) > z) z = Math.abs(s);
            }
            return z;
        };
        const z = Math.max(calc(1), calc(-1));
        if (z === 0) return 1;
        const sq = Math.sqrt(n);
        const kMax = Math.max(1, Math.floor(n / 4));
        let sum1 = 0, sum2 = 0;
        for (let k = -kMax; k <= kMax; k++) {
            sum1 += normalCdf((4 * k + 1) * z / sq) - normalCdf((4 * k - 1) * z / sq);
            sum2 += normalCdf((4 * k + 3) * z / sq) - normalCdf((4 * k + 1) * z / sq);
        }
        return Math.max(0, Math.min(1, 1 - sum1 + sum2));
    }

    // 6) Approximate Entropy (m = 2)
    function nistApEn(bits, m) {
        const n = bits.length;
        const phi = (len) => {
            const counts = new Map();
            for (let i = 0; i < n; i++) {
                let key = 0;
                for (let j = 0; j < len; j++) key = (key << 1) | bits[(i + j) % n];
                counts.set(key, (counts.get(key) || 0) + 1);
            }
            let s = 0;
            counts.forEach((c) => { const p = c / n; s += p * Math.log(p); });
            return s;
        };
        const apen = phi(m) - phi(m + 1);
        const chi2 = 2 * n * (Math.log(2) - apen);
        return chiSquareP(Math.pow(2, m), chi2);
    }

    // 7) Discrete Fourier Transform (Spectral) — ใช้ 1,024 บิตล่าสุด (n ≥ 1,000 ตามมาตรฐาน)
    function nistDFT(bits) {
        const n = Math.min(bits.length, 1024);
        if (n < 1000) return null;
        const start = bits.length - n;
        const x = new Float64Array(n);
        for (let i = 0; i < n; i++) x[i] = bits[start + i] ? 1 : -1;
        const T = Math.sqrt(Math.log(1 / 0.05) * n);
        const half = Math.floor(n / 2); // ใช้ k = 0 .. n/2-1 ตาม NIST
        let n1 = 0;
        for (let k = 0; k < half; k++) {
            let re = 0, im = 0;
            const w = -2 * Math.PI * k / n;
            for (let i = 0; i < n; i++) {
                const ang = w * i;
                re += x[i] * Math.cos(ang);
                im += x[i] * Math.sin(ang);
            }
            if (Math.sqrt(re * re + im * im) < T) n1++;
        }
        const n0 = 0.95 * n / 2;
        const d = (n1 - n0) / Math.sqrt(n * 0.95 * 0.05 / 4);
        const p = erfc(Math.abs(d) / Math.SQRT2);
        return Math.max(0, Math.min(1, p));
    }

    // 8) Serial Test (m = 3) — ดูความถี่ของแพตเทิร์น m, m-1, m-2 บิตแบบ overlaps
    function nistSerial(bits, m) {
        const n = bits.length;
        if (n < 1000) return null;
        const psi = (mm) => {
            const size = Math.pow(2, mm);
            const counts = new Float64Array(size);
            for (let i = 0; i < n; i++) {
                let key = 0;
                for (let j = 0; j < mm; j++) key = (key << 1) | bits[(i + j) % n];
                counts[key]++;
            }
            let sum = 0;
            for (let k = 0; k < size; k++) sum += counts[k] * counts[k];
            return (size / n) * sum - n;
        };
        const p2m = psi(m), p2m1 = psi(m - 1), p2m2 = psi(m - 2);
        const d1 = p2m - p2m1;
        const d2 = p2m - 2 * p2m1 + p2m2;
        const p1 = chiSquareP(Math.pow(2, m - 1), d1);
        const p2 = chiSquareP(Math.pow(2, m - 2), d2);
        // NIST ตัดสินด้วย p1 และ p2 แยกกัน → รวมเป็นเทสต์เดียวด้วย Bonferroni
        return Math.max(0, Math.min(1, 2 * Math.min(p1, p2)));
    }

    // 9) Binary Matrix Rank Test (M = Q = 32) — จับ linear dependence ระหว่างบิต
    function nistMatrixRank(bits) {
        const M = 32, Q = 32, block = M * Q;
        const N = Math.floor(bits.length / block);
        if (N < 8) return null; // NIST แนะนำ N ≥ 38; ต่ำกว่านี้ chi-square จะไร้พลัง
        const rows = new Uint32Array(M);
        let f32 = 0, f31 = 0, f0 = 0;
        for (let b = 0; b < N; b++) {
            const base = b * block;
            for (let i = 0; i < M; i++) {
                let row = 0;
                for (let j = 0; j < Q; j++) if (bits[base + i * Q + j]) row |= (1 << j);
                rows[i] = row >>> 0;
            }
            let rank = 0;
            for (let col = 0; col < Q && rank < M; col++) {
                const mask = 1 << col;
                let pivot = -1;
                for (let r = rank; r < M; r++) if (rows[r] & mask) { pivot = r; break; }
                if (pivot < 0) continue;
                const tmp = rows[rank]; rows[rank] = rows[pivot]; rows[pivot] = tmp;
                for (let r = 0; r < M; r++) if (r !== rank && (rows[r] & mask)) rows[r] ^= rows[rank];
                rank++;
            }
            if (rank === M) f32++; else if (rank === M - 1) f31++; else f0++;
        }
        const pr = [0.2888, 0.5776, 0.1336]; // rank 32 / 31 / ≤30
        const fr = [f32, f31, f0];
        let chi2 = 0;
        for (let i = 0; i < 3; i++) {
            const e = N * pr[i];
            chi2 += (fr[i] - e) * (fr[i] - e) / e;
        }
        return chiSquareP(2, chi2);
    }

    // ตัวช่วย: การแจกแจงแบบปัวซง (ใช้เป็นค่าคาดหมายของจำนวนครั้งที่เจอ template)
    function poissonPmf(mu, k) {
        let logp = -mu + k * Math.log(mu);
        for (let i = 2; i <= k; i++) logp -= Math.log(i);
        return Math.exp(logp);
    }

    // 7) Non-overlapping Template Matching Test (m = 9, M = 1,024)
    function nistNonOverlappingTemplate(bits) {
        const m = 9, M = 1024;
        const N = Math.floor(bits.length / M);
        if (N < 8) return null;
        const pat = [];
        const template = "000000001"; // template aperiodic ตั้งต้นตาม NIST
        for (let i = 0; i < m; i++) pat.push(template[i] === "1" ? 1 : 0);
        const mu = (M - m + 1) / Math.pow(2, m);
        const pi = [];
        for (let k = 0; k < 5; k++) pi.push(poissonPmf(mu, k));
        pi.push(Math.max(0, 1 - pi.reduce((a, v) => a + v, 0)));
        // ค่าที่สถิติเพิ่มขึ้นเมื่อบล็อกตกคลาส k (v เป็น one-hot ตาม NIST)
        const step = [];
        for (let k = 0; k < 6; k++) {
            let d = (1 - pi[k]) * (1 - pi[k]) / pi[k];
            for (let j = 0; j < 6; j++) if (j !== k) d += pi[j];
            step.push(d);
        }
        let stat = 0;
        for (let b = 0; b < N; b++) {
            const start = b * M;
            const end = start + M;
            let count = 0;
            let i = start;
            while (i + m <= end) {
                let hit = true;
                for (let j = 0; j < m; j++) if (bits[i + j] !== pat[j]) { hit = false; break; }
                if (hit) { count++; i += m; } else i++;
            }
            stat += step[count > 5 ? 5 : count];
        }
        // χ² 5N ของ NIST ไม่ตรงจริง: var ต่อบล็อก = 15 (ไม่ใช้ 10 แบบ χ²_5) และที่ N น้อย
        // expected ต่อช่อง < 1 → จับโมเมนต์ด้วย gamma (mean = 5N, var = 15N) แล้วเทียบหาง
        let blkMean = 0, blkVar = 0;
        for (let k = 0; k < 6; k++) blkMean += pi[k] * step[k];
        for (let k = 0; k < 6; k++) blkVar += pi[k] * (step[k] - blkMean) * (step[k] - blkMean);
        const totMean = blkMean * N, totVar = blkVar * N;
        const shape = totMean * totMean / totVar;
        return gammaIncompleteUpper(shape, stat / (totVar / totMean));
    }

    // 8) Overlapping Template Matching Test (m = 9, M = 1,032, template = 111111111)
    function nistOverlappingTemplate(bits) {
        const m = 9, M = 1032;
        const N = Math.floor(bits.length / M);
        if (N < 4) return null;
        // ค่าคงที่ π ของ NIST SP 800-22 Rev 1a (ตาราง Overlapping Template, m = 9)
        const pi = [0.364091, 0.185659, 0.139381, 0.100571, 0.070432, 0.139865];
        const nu = [0, 0, 0, 0, 0, 0];
        for (let b = 0; b < N; b++) {
            const start = b * M;
            const end = start + M;
            let count = 0;
            for (let i = start; i + m <= end; i++) {
                let hit = true;
                for (let j = 0; j < m; j++) if (!bits[i + j]) { hit = false; break; }
                if (hit) count++;
            }
            nu[count > 5 ? 5 : count]++;
        }
        let chi2 = 0;
        for (let k = 0; k < 6; k++) {
            const e = N * pi[k];
            chi2 += (nu[k] - e) * (nu[k] - e) / e;
        }
        return chiSquareP(5, chi2);
    }

    // 9) Maurer's Universal Statistical Test (L = 6..16) — ต้องใช้ตัวอย่างมหาศาล
    const UNIVERSAL_TABLE = {
        6: [5.2177052, 2.954], 7: [6.1962507, 3.125], 8: [7.1836656, 3.238],
        9: [8.1764248, 3.311], 10: [9.1723243, 3.356], 11: [10.170032, 3.384],
        12: [11.168765, 3.401], 13: [12.168070, 3.410], 14: [13.167693, 3.416],
        15: [14.167488, 3.419], 16: [15.167379, 3.421]
    };

    function nistUniversal(bits) {
        const n = bits.length;
        let L = 0, Q = 0, K = 0;
        for (let l = 16; l >= 6; l--) {
            const q = 10 * (1 << l);
            const k = Math.floor(n / q) - q;
            if (k >= 900) { L = l; Q = q; K = k; break; }
        }
        if (!L) return null; // ตัวอย่างยังไม่พอ (ต้อง ~1,000,000 บิต)
        const size = 1 << L;
        const last = new Int32Array(size).fill(0);
        for (let i = 1; i <= Q; i++) {
            let key = 0;
            for (let j = 0; j < L; j++) key = (key << 1) | bits[(i - 1) * L + j];
            last[key] = i;
        }
        let sum = 0;
        for (let i = Q + 1; i <= Q + K; i++) {
            let key = 0;
            for (let j = 0; j < L; j++) key = (key << 1) | bits[(i - 1) * L + j];
            sum += Math.log(i - last[key]) / Math.LN2;
            last[key] = i;
        }
        const fn = sum / K;
        const c = 0.7 - 0.8 / L + (4 + 32 / L) * Math.pow(K, -3 / L) / 15;
        const sigma = c * Math.sqrt(UNIVERSAL_TABLE[L][1] / K);
        const d = Math.abs(fn - UNIVERSAL_TABLE[L][0]) / (Math.SQRT2 * sigma);
        return Math.max(0, Math.min(1, erfc(d)));
    }

    // 10) Linear Complexity Test (Berlekamp–Massey บน GF(2), M = 512)
    function berlekampMassey(bits, start, M) {
        const c = new Uint8Array(M + 1);
        const b = new Uint8Array(M + 1);
        c[0] = 1; b[0] = 1;
        let L = 0, m = 1;
        for (let i = 0; i < M; i++) {
            let d = bits[start + i] ? 1 : 0;
            for (let j = 1; j <= L; j++) d ^= c[j] & bits[start + i - j];
            if (d === 1) {
                const t = c.slice(0, L + 1);
                for (let j = 0; j + m <= M; j++) c[j + m] ^= b[j];
                if (2 * L <= i) { L = i + 1 - L; b.set(t, 0); for (let j = t.length; j <= M; j++) b[j] = 0; m = 1; }
                else m++;
            } else m++;
        }
        return L;
    }

    function nistLinearComplexity(bits, M) {
        M = M || 512;
        const N = Math.floor(bits.length / M);
        if (N < 8) return null;
        const v = [0, 0, 0, 0, 0, 0, 0];
        let sumT = 0;
        for (let bIdx = 0; bIdx < N; bIdx++) {
            const L = berlekampMassey(bits, bIdx * M, M);
            const T = (M % 2 === 0 ? 1 : -1) * (L - M / 2) + 2 / 9; // (-1)^M · (L − M/2) + 2/9
            sumT += T;
            if (T <= -2.5) v[0]++;
            else if (T <= -1.5) v[1]++;
            else if (T <= -0.5) v[2]++;
            else if (T <= 0.5) v[3]++;
            else if (T <= 1.5) v[4]++;
            else if (T <= 2.5) v[5]++;
            else v[6]++;
        }
        const pi = [0.01047, 0.03125, 0.125, 0.5, 0.25, 0.0625, 0.020833];
        const norm = pi.reduce((a, b) => a + b, 0);
        const rel = pi.map((x) => x / norm);
        if (N * rel[0] >= 5) {
            // ตัวอย่างเยอะพอ (N ≥ ~478 บล็อก) → ใช้ χ² 7 คลาสตาม NIST ตรง ๆ
            let chi2 = 0;
            for (let i = 0; i < 7; i++) {
                const e = N * rel[i];
                chi2 += (v[i] - e) * (v[i] - e) / e;
            }
            return chiSquareP(6, chi2);
        }
        // ตัวอย่างน้อย: χ² 7 คลาสใช้ไม่ได้ (คลาสท้ายคาดหมาย < 1) → ใช้ค่ากลางของ T กับการประมาณปกติ
        // T มีค่าอยู่ที่ k + 2/9 (k เป็นจำนวนเต็ม) → จุดกลางคลาสคือ k + 2/9 ไม่ใช่ k
        const centers = [-2.7778, -1.7778, -0.7778, 0.2222, 1.2222, 2.2222, 3.2222];
        let mean = 0, sq = 0;
        for (let i = 0; i < 7; i++) { mean += rel[i] * centers[i]; sq += rel[i] * centers[i] * centers[i]; }
        const sd = Math.sqrt(Math.max(1e-9, sq - mean * mean));
        const z = (sumT / N - mean) / (sd / Math.sqrt(N));
        return Math.max(0, Math.min(1, erfc(Math.abs(z) / Math.SQRT2)));
    }

    // 13-15) Random walk (+1/-1) ที่ต่อปลายให้กลับมา 0 ตาม NIST
    function rngWalk(bits) {
        const out = [];
        let s = 0;
        for (let i = 0; i < bits.length; i++) { s += bits[i] ? 1 : -1; out.push(s); }
        while (s !== 0) { s += s > 0 ? -1 : 1; out.push(s); }
        return out;
    }

    // π ของ Random Excursions (NIST SP 800-22 Rev 1a, x = 1..4, k = 0..5)
    const RX_PI = [
        [0.5000000000, 0.2500000000, 0.1250000000, 0.0625000000, 0.0312500000, 0.0312500000],
        [0.7500000000, 0.0625000000, 0.0468750000, 0.0351562500, 0.0263671875, 0.0791015625],
        [0.8333333333, 0.0277777778, 0.0231481481, 0.0192901235, 0.0160751029, 0.0803755143],
        [0.8750000000, 0.0156250000, 0.0136718750, 0.0119628906, 0.0104675293, 0.0732727051]
    ];

    // 14) Random Excursions Test — จำนวนครั้งที่เยี่ยมสถานะ ±1..±4 ในแต่ละรอบ
    function nistRandomExcursions(walk) {
        let J = 0;
        for (let i = 0; i < walk.length; i++) if (walk[i] === 0) J++;
        if (J < 20) return null; // NIST แนะนำ J ≥ 500 แต่ที่ 8,192 บิตได้ ~70 รอบ (พลังต่ำ)
        let worst = 1;
        for (let x = 1; x <= 4; x++) {
            const nu = [0, 0, 0, 0, 0, 0];
            let visits = 0;
            for (let i = 0; i < walk.length; i++) {
                if (walk[i] === 0) { nu[visits > 5 ? 5 : visits]++; visits = 0; }
                else if (walk[i] === x) visits++;
            }
            let chi2 = 0;
            for (let k = 0; k < 6; k++) {
                const e = J * RX_PI[x - 1][k];
                chi2 += (nu[k] - e) * (nu[k] - e) / e;
            }
            const p = chiSquareP(5, chi2);
            if (p < worst) worst = p;
        }
        return Math.min(1, worst * 4); // รวม 4 สถานะด้วย Bonferroni
    }

    // 15) Random Excursions Variant Test — จำนวนครั้งรวมที่เยี่ยม 18 สถานะ (±1..±9)
    function nistRandomExcursionsVariant(walk) {
        let J = 0;
        for (let i = 0; i < walk.length; i++) if (walk[i] === 0) J++;
        if (J < 20) return null;
        let worst = 1;
        for (let x = -9; x <= 9; x++) {
            if (x === 0) continue;
            let xi = 0;
            for (let i = 0; i < walk.length; i++) if (walk[i] === x) xi++;
            const den = Math.sqrt(2 * J * (4 * Math.abs(x) - 2));
            const p = erfc(Math.abs(xi - J) / den / Math.SQRT2);
            if (p < worst) worst = p;
        }
        return Math.min(1, worst * 18); // รวม 18 สถานะด้วย Bonferroni
    }

    let rngAuditCache = { n: 0, pass: 0, total: 0, worst: 1, failed: [], pending: 0 };

    function runRngAudit() {
        const n = rngRolls.length;
        if (n < 200) return null;
        if (rngAuditCache.n === n) return rngAuditCache; // ไม่คำนวณซ้ำถ้าจำนวนลูกเท่าเดิม
        // throttle: DFT + Berlekamp–Massey แพง → คำนวณใหม่ทุก ๆ 32 ลูก
        if (rngAuditCache.n >= 200 && n - rngAuditCache.n < Math.max(32, n >> 7)) return rngAuditCache;
        const bits = rngBits();
        const walk = rngWalk(bits);
        const all = [
            { name: "Monobit", p: nistMonobit(bits) },
            { name: "Block", p: nistBlockFrequency(bits, 128) },
            { name: "Runs", p: nistRuns(bits) },
            { name: "LongRun", p: nistLongestRun(bits) },
            { name: "Rank", p: nistMatrixRank(bits) },
            { name: "DFT", p: nistDFT(bits) },
            { name: "NonOverlap", p: nistNonOverlappingTemplate(bits) },
            { name: "Overlap", p: nistOverlappingTemplate(bits) },
            { name: "Universal", p: nistUniversal(bits) },
            { name: "LinComplex", p: nistLinearComplexity(bits) },
            { name: "Serial", p: nistSerial(bits, 3) },
            { name: "ApEn", p: nistApEn(bits, 2) },
            { name: "Cusum", p: nistCusum(bits) },
            { name: "Excursions", p: nistRandomExcursions(walk) },
            { name: "ExcVar", p: nistRandomExcursionsVariant(walk) }
        ];
        const results = all.filter((r) => r.p !== null && Number.isFinite(r.p));
        const failed = results.filter((r) => r.p < RNG_ALPHA).map((r) => r.name);
        let worst = 1;
        results.forEach((r) => { if (r.p < worst) worst = r.p; });
        rngAuditCache = {
            n: n, pass: results.length - failed.length, total: results.length,
            worst: worst, failed: failed, pending: all.length - results.length
        };
        return rngAuditCache;
    }

    function isAmountApplied(expected) {
        const inp = cachedAmountInput;
        if (!inp || !document.body.contains(inp)) return false;
        const v = parseFloat(String(inp.value).replace(/,/g, ''));
        if (!Number.isFinite(v)) return false;
        return Math.abs(v - expected) <= Math.max(1e-8, expected * 1e-6);
    }

    // ==================================================
    // 6.1 ROLL SIDE — บังคับด้านคำขอเดิมพัน (Under / Over)
    // ==================================================
    function applyRollSide() {
        if (!configAlternateRoll) {
            currentRollSide = "under";
        }
        pendingRollSide = currentRollSide;
        return true;
    }

// 🔒 SCROLL KEEPER — กันหน้าเว็บเด้งกลับตำแหน่งเดิม
    // สาเหตุ: เวลาเขียนค่าลงช่องกรอก เว็บ (Svelte/React) re-render แล้ว scroll container รีเซ็ตกลับ 0
    // ==================================================
    let lastUserScrollAt = 0;
    try {
        const markUserScroll = () => { lastUserScrollAt = Date.now(); };
        window.addEventListener("wheel", markUserScroll, { passive: true, capture: true });
        window.addEventListener("touchstart", markUserScroll, { passive: true, capture: true });
    } catch (e) {}

    function snapshotScroll() {
        const snaps = [];
        try {
            const se = document.scrollingElement || document.documentElement;
            if (se && (se.scrollTop > 0 || se.scrollLeft > 0)) snaps.push({ el: se, top: se.scrollTop, left: se.scrollLeft });

            const nodes = document.querySelectorAll("div, main, section, ul, ol, [class*='scroll']");
            const limit = Math.min(nodes.length, 2500);
            for (let i = 0; i < limit; i++) {
                const el = nodes[i];
                if (el.scrollTop > 0 || el.scrollLeft > 0) snaps.push({ el: el, top: el.scrollTop, left: el.scrollLeft });
            }
        } catch (e) {}
        return snaps;
    }

    function restoreScroll(snaps) {
        if (!snaps || !snaps.length) return;
        // ถ้าผู้ใช้กำลังเลื่อนวนอยู่ อย่าฝืนดึงกลับ
        if (Date.now() - lastUserScrollAt < 700) return;
        const apply = () => {
            if (Date.now() - lastUserScrollAt < 700) return;
            for (let i = 0; i < snaps.length; i++) {
                const s = snaps[i];
                try {
                    if (!s.el.isConnected) continue;
                    if (Math.abs(s.el.scrollTop - s.top) > 1) s.el.scrollTop = s.top;
                    if (Math.abs(s.el.scrollLeft - s.left) > 1) s.el.scrollLeft = s.left;
                } catch (e) {}
            }
        };
        apply();
        requestAnimationFrame(apply);
        setTimeout(apply, 80);
        setTimeout(apply, 250);
    }

    function applyBetSettings() {
        if (detectedMinBet === null) refreshBetLimits(); // อ่านขั้นต่ำ/สูงสุดจากช่องเดิมพันครั้งแรก
        const targetAmount = calculateCurrentBetAmount();
        const amountOK = setInput("input-game-amount", targetAmount);
        const chanceOK = setInput("chance", getEffectiveChance());
        const sideOK = applyRollSide();
        return amountOK && chanceOK && sideOK;
    }

    // ==================================================
    // 6.5 SESSION LEDGER — ทะเบียนไม้จริงในหน่วยความจำ (ไม่เขียนดิสก์)
    // ใช้: กระทบยอดอัตโนมัติทุกไม้ + ส่งออกด้วย Alt+L เพื่อตรวจกับประวัติของเว็บ
    // ==================================================
    let sessionLedger = [];
    let ledgerGaps = 0;
    const LEDGER_MAX = 500;

    function ledgerRecord(rec) {
        try {
            const prev = sessionLedger.length ? sessionLedger[sessionLedger.length - 1] : null;
            const entry = {
                n: sessionLedger.length + 1,
                time: new Date().toISOString(),
                step: rec.step,
                amount: parseFloat(Number(rec.amount || 0).toFixed(8)),
                win: !!rec.win,
                delta: parseFloat(Number(rec.delta || 0).toFixed(8)),
                balance: (typeof rec.balance === "number" && isFinite(rec.balance)) ? parseFloat(rec.balance.toFixed(8)) : null,
                source: rec.source || "?"
            };
            sessionLedger.push(entry);
            if (sessionLedger.length > LEDGER_MAX) sessionLedger.shift();

            if (prev && prev.balance !== null && entry.balance !== null) {
                const walked = parseFloat((entry.balance - prev.balance).toFixed(8));
                const gap = parseFloat((walked - entry.delta).toFixed(8));
                const tol = Math.max(1e-8, Math.abs(entry.delta) * 1e-3);
                if (Math.abs(gap) > tol) {
                    ledgerGaps++;
                    log("🧾 LEDGER: ไม้ " + entry.n + " ยอดเดินไม่ตรง — คาด " + formatNumber(entry.delta, 8) + " แต่จริง " + formatNumber(walked, 8) + " (ต่าง " + formatNumber(gap, 8) + ")", true);
                }
            }
            return entry;
        } catch (e) {
            return null;
        }
    }

    function ledgerSummaryByStep() {
        const map = {};
        for (let i = 0; i < sessionLedger.length; i++) {
            const s = sessionLedger[i].step;
            if (!map[s]) map[s] = { at: 0, wins: 0, net: 0 };
            map[s].at++;
            if (sessionLedger[i].win) map[s].wins++;
            map[s].net = parseFloat((map[s].net + sessionLedger[i].delta).toFixed(8));
        }
        return map;
    }

    function ledgerSummary() {
        let wins = 0, losses = 0, net = 0;
        for (let i = 0; i < sessionLedger.length; i++) {
            if (sessionLedger[i].win) wins++; else losses++;
            net += sessionLedger[i].delta;
        }
        return {
            bets: sessionLedger.length,
            wins: wins,
            losses: losses,
            net: parseFloat(net.toFixed(8)),
            gaps: ledgerGaps,
            byStep: ledgerSummaryByStep()
        };
    }

    function copyLedger() {
        const summary = ledgerSummary();
        const payload = JSON.stringify({ version: "2026.11.18", time: new Date().toISOString(), summary: summary, bets: sessionLedger }, null, 2);
        let copied = false;
        try { if (typeof copy === "function") { copy(payload); copied = true; } } catch (e) {}
        log("🧾 LEDGER " + summary.bets + " ไม้ · ชนะ " + summary.wins + " / แพ้ " + summary.losses + " · P/L " + formatNumber(summary.net, 6) + " · กระทบยอดคลาด " + summary.gaps + " ครั้ง" + (copied ? " — คัดลอก JSON แล้ว" : " — ดู JSON ใน console"), true);
        try { if (typeof console !== "undefined") console.log(payload); } catch (e) {}
        return summary;
    }

    // ==================================================
    // 6.7 MULTI-TAB GUARD — กันเปิดบอทสองแท็บแล้วเดิมพันซ้อน
    // ใช้ BroadcastChannel (ข้อความระหว่างแท็บในหน่วยความจำ ไม่เขียนดิสก์ -> ยัง zero-footprint)
    // กติกา: แท็บที่ id น้อยกว่าชนะ — อีกแท็บหยุดเอง ทั้งสองฝั่งคำนวณเหมือนกันจึงเหลือแท็บเดียว
    // ==================================================
    const TAB_CHANNEL_NAME = "stake_dice_bot_v1";
    const TAB_ID = "t" + Math.random().toString(36).slice(2, 10);
    let tabChannel = null;
    let peerRunning = null;

    function initTabGuard() {
        if (typeof BroadcastChannel !== "function") return false;
        if (tabChannel) return true;
        try {
            tabChannel = new BroadcastChannel(TAB_CHANNEL_NAME);
            tabChannel.onmessage = function (ev) {
                const msg = ev && ev.data;
                if (!msg || !msg.type || msg.id === TAB_ID) return;
                if (msg.type === "running") {
                    peerRunning = { id: msg.id, at: Date.now() };
                    if (sessionRunning && String(msg.id) < TAB_ID) {
                        log("🔒 MULTI-TAB: แท็บ " + msg.id + " กำลังเดิมพัน — แท็บนี้หยุดเพื่อกันเดิมพันซ้ำ", true);
                        stopSession("🔒 พบอีกแท็บกำลังเดิมพัน (แท็บนี้หยุดให้เองเพื่อกันกดซ้อน)", "#ffa726");
                    } else if (sessionRunning) {
                        updateStatusText("⚠️ ตรวจพบอีกแท็บกำลังเดิมพัน — ควรปิดแท็บหนึ่ง", "#ffa726");
                    }
                } else if (msg.type === "idle") {
                    if (peerRunning && peerRunning.id === msg.id) peerRunning = null;
                }
            };
            tabChannel.postMessage({ type: "hello", id: TAB_ID, at: Date.now() });
            return true;
        } catch (e) {
            tabChannel = null;
            return false;
        }
    }

    function peerIsRunning() {
        return !!(peerRunning && (Date.now() - peerRunning.at) < 8000);
    }

    function broadcastTabState(type) {
        if (!tabChannel) return;
        try { tabChannel.postMessage({ type: type, id: TAB_ID, at: Date.now() }); } catch (e) {}
    }

    // ==================================================
    // 6.8 BET LIMIT SNIFFER — อ่านเพดานเดิมพันจากข้อความแจ้งเตือนของเว็บ
    // เหตุผล: ช่องยอดของ Stake ไม่มี min/max attribute (ยืนยันจาก DOM จริง 3 พ.ย. 2026)
    // หลักการ: อ่านเฉพาะ "เพดานสูงสุด" (ค่าที่แคบที่สุดที่เว็บยืนยัน) ไม่แตะขั้นต่ำ
    //          ต้องมีคำว maximum/สูงสุด/เกิน + หน่วยเงิน กันอ่านเลขจาก payout ผิด
    // ==================================================
    let lastLimitSniff = 0;

    function sniffBetLimits(force) {
        const now = Date.now();
        if (!force && now - lastLimitSniff < 1500) return null;
        lastLimitSniff = now;
        try {
            const nodes = document.querySelectorAll('[data-testid="notification-list"] *, [role="alert"], [data-testid*="toast"] *, [data-testid*="notification"] *');
            const texts = [];
            for (let i = 0; i < nodes.length && texts.length < 12; i++) {
                const t = (nodes[i].textContent || "").replace(/\s+/g, " ").trim();
                if (!t || t.length > 160) continue;
                if (!/(สูงสุด|maximum|max\b|เกิน|exceed)/i.test(t)) continue;
                if (!/(USDT|\$|เดิมพัน|bet)/i.test(t)) continue;
                if (texts.indexOf(t) < 0) texts.push(t);
            }
            if (!texts.length) return null;

            let best = null;
            for (let i = 0; i < texts.length; i++) {
                const nums = texts[i].match(/\d[\d,]*\.?\d*/g) || [];
                for (let j = 0; j < nums.length; j++) {
                    const v = parseFloat(nums[j].replace(/,/g, ""));
                    if (!Number.isFinite(v) || v <= 0 || v > 100000) continue;
                    if (v < effectiveMinBet()) continue;
                    if (best === null || v < best) best = v;
                }
            }
            if (best === null) return null;
            if (detectedMaxBet === null || best < detectedMaxBet) {
                detectedMaxBet = best;
                log("📏 LIMIT SNIFFER: เว็บแจ้งเพดานเดิมพันสูงสุด " + formatBetAmount(best) + " (จากข้อความ: " + texts[0].slice(0, 80) + ")", true);
                updateStatusText("📏 เรียนเพดานเว็บ: สูงสุด " + formatBetAmount(best) + "$", "#55e7ff");
            }
            return detectedMaxBet;
        } catch (e) {
            return null;
        }
    }

    // ==================================================
    // 7. AUTO-START SEQUENCE
    // ==================================================

    function initAutoStartSequence() {
        cancelAutoStart();
        let attempts = 0;
        let zeroBalCount = 0;

        autoStartPolling = setInterval(() => {
            attempts++;
            const bal = getBalance();
            const btn = getBetButton();

            // ⚡ FAST ZERO-FUNDS SKIP: ถ้าหน้าเว็บโหลดพร้อมแล้ว แต่เงินในกระเป๋าเป็น 0 ติดต่อกัน 25 วินาที
            // สั่งข้ามบัญชีทันที เพื่อให้ PowerShell สลับไปเปิดบัญชีถัดไปโดยไม่ต้องรอ 20 นาที
            if (btn && bal !== null && bal < AUTO_MIN_BET) {
                zeroBalCount++;
                if (zeroBalCount >= 50) { // 50 ครั้ง x 500ms = 25 วินาที (ให้เวลา WebSocket โหลดกระเป๋าเงินเสร็จ 100%)
                    clearInterval(autoStartPolling);
                    autoStartPolling = null;
                    flashHudAlert("#ff3344");
                    updateStatusText("🚨 ยอดเงินเป็น 0 USDT — ข้ามไปบัญชีถัดไปทันที...", "#ff3344");
                    log("🚨 [FAST ZERO-FUNDS SKIP] ตรวจพบยอดเงินคงเหลือ 0 USDT (ไม่พอยอดฐาน) — ส่งสัญญาณข้ามไปบัญชีถัดไปทันที", true);
                    startBalance = 0;
                    currentBalance = 0;
                    profit = 0;
                    stopSession("🚨 เงินในกระเป๋าไม่พอไม้ถัดไป!", "#ff3344");
                    return;
                }
            } else {
                zeroBalCount = 0;
            }

            if (bal !== null && bal >= AUTO_MIN_BET && btn) {
                clearInterval(autoStartPolling);
                autoStartPolling = null;

                startBalance = bal;
                currentBalance = bal;
                peakBalance = bal;
                if (configDynamicTarget) {
                    configProfitTarget = generateDynamicTarget(bal);
                }
                syncHUDInputs();
                updateUI();

                ensureManualTab();
                applyBetSettings();

                autoStartCountdown = 2;
                updateStatusText(`🚀 Auto-Start เริ่มใน ${autoStartCountdown}s (กด ESC ยกเลิก)`, "#ffea00");

                autoStartCountdownTimer = setInterval(() => {
                    autoStartCountdown--;
                    if (autoStartCountdown > 0) {
                        updateStatusText(`🚀 Auto-Start เริ่มใน ${autoStartCountdown}s (กด ESC ยกเลิก)`, "#ffea00");
                    } else {
                        cancelAutoStart();
                        startSession();
                    }
                }, 1000);
                return;
            }

            // แสดงสถานะรอหน้าเว็บโหลดอย่างต่อเนื่อง ไม่ตัดทิ้งไวเกินไป (รอสูงสุด 10 นาที)
            if (attempts % 10 === 0) {
                const sec = Math.floor(attempts / 2);
                updateStatusText(`⏳ รอหน้าเว็บ Stake โหลดความพร้อม (${sec}s)...`, "#ffea00");
            }

            if (attempts > 1200) {
                clearInterval(autoStartPolling);
                autoStartPolling = null;
                updateStatusText("⚠️ รอเปิดหน้าเกม Dice หรือเข้าสู่ระบบ", "#ff9800");
            }
        }, 500);
    }

    function cancelAutoStart() {
        if (autoStartPolling) {
            clearInterval(autoStartPolling);
            autoStartPolling = null;
        }
        if (autoStartCountdownTimer) {
            clearInterval(autoStartCountdownTimer);
            autoStartCountdownTimer = null;
        }
    }

    function toggleAutoStart() {
        configAutoStart = !configAutoStart;
        if (!configAutoStart) {
            cancelAutoStart();
            updateStatusText("⏸️ ปิดโหมด Auto-Start", "#b1bad3");
        } else {
            if (!sessionRunning) initAutoStartSequence();
        }
        updateUI();
    }

    // ==================================================
    // 8. BET EXECUTION & OUTCOME MONITORING
    // ==================================================

    // 🎭 HUMAN BEHAVIORAL JITTER & MICRO-BREAK ENGINE (HIGH-SPEED TURBO MODE)
    // สุ่มหน่วงเวลาระหว่างตา: 60 - 100 ms (เร็วขึ้น 2 เท่า ปลอดภัยสูงสุด) + พักสายตา 0.8s ทุกๆ 60-80 ตา
    let betsSinceLastHumanBreak = 0;
    let nextHumanBreakThreshold = Math.floor(Math.random() * 20) + 60; // สุ่มระหว่าง 60 - 80 ตา

    function getHumanJitterDelay() {
        try {
            if (window.crypto && window.crypto.getRandomValues) {
                const buf = new Uint32Array(1);
                window.crypto.getRandomValues(buf);
                return 60 + (buf[0] % 41); // 60 ถึง 100 ms (Turbo)
            }
        } catch (e) {}
        return Math.floor(Math.random() * 41) + 60;
    }

    function scheduleNextBet() {
        if (!sessionRunning || isWaitingNextRound) return;

        betsSinceLastHumanBreak++;
        if (betsSinceLastHumanBreak >= nextHumanBreakThreshold) {
            betsSinceLastHumanBreak = 0;
            nextHumanBreakThreshold = Math.floor(Math.random() * 20) + 60; // สุ่มรอบถัดไป 60 - 80 ตา
            const breakMs = 800; // 0.8 วินาทีตามคำสั่ง
            updateStatusText(`☕ พักสายตา 0.8s (พรางพฤติกรรมมนุษย์)`, "#80cbc4");
            betTimeoutId = setTimeout(executeNextBet, breakMs);
            return;
        }

        const baseDelay = getHumanJitterDelay();
        const totalDelay = baseDelay + (adaptiveCalmingDelay || 0);
        betTimeoutId = setTimeout(executeNextBet, totalDelay);
    }

    function handleTakeProfitHit() {
        if (totalBets === 0) return; // 🛡️ GUARD: ห้ามจบ Take Profit หากยังไม่มีการแทงจริง (ป้องกัน False Exit)
        completedRounds++;
        lifetimeProfit += profit;
        flashHudAlert("#00e676");

        const bankedProfit = profit;
        log(`🎯 จบรอบที่ ${completedRounds}! กำไรในรอบนี้: +${formatNumber(bankedProfit)} USDT | สะสมรวมทุกรอบ: +${formatNumber(lifetimeProfit)} USDT`);

        if (autoCycleRounds) {
            clearTimers();
            isWaitingNextRound = false;

            const freshBal = getBalance() || currentBalance;
            startBalance = freshBal;
            currentBalance = freshBal;
            peakBalance = freshBal;
            profit = 0;
            maxDrawdown = 0;
            currentStreak = 0;

            applyBetSettings();

            updateStatusText(`🚀 ชนะรอบ ${completedRounds}! ลุยต่อรอบที่ ${completedRounds + 1} ทันที`, "#00e676");
            updateUI();
            betTimeoutId = setTimeout(executeNextBet, 0);
        } else {
            stopSession(`🎯 ถึงเป้ากำไร: +${formatNumber(bankedProfit)} USDT (Hit & Run สำเร็จ!)`, "#00e676");
        }
    }

    // ==================================================
    // 🎯 TARGET MODE — เป้ากำไรแบบ USDT (เดิม) หรือ % ของทุนตั้งต้น
    // เหตุผล: แผน "ถึง 5% แล้วหยุด" ต้องคิดจากทุนจริงแต่ละบัญชี ไม่ใช่ยอดคงที่
    // ==================================================
    let configTargetMode = "usd"; // "usd" = ยอดเงินคงที่ · "pct" = % ของ startBalance

    function effectiveProfitTarget() {
        const raw = Math.abs(parseFloat(configProfitTarget)) || 0;
        if (configTargetMode !== "pct") return raw;
        if (!raw || startBalance === null || !(startBalance > 0)) return 0;
        return parseFloat(((startBalance * raw) / 100).toFixed(8));
    }

    function syncTargetModeBadge() {
        if (!hudEls || !hudEls.targetModeBadge) return;
        const el = hudEls.targetModeBadge;
        const isPct = configTargetMode === "pct";
        setSafeText(el, isPct ? "📊 %" : "🎯 USD");
        setSafeStyle(el, "color", isPct ? "#55e7ff" : "#ffea00");
        setSafeStyle(el, "borderColor", isPct ? "#55e7ff" : "#ffea00");
        if (hudEls.targetLabel) {
            setSafeText(hudEls.targetLabel, isPct ? "เป้ากำไร (%):" : "เป้ากำไร ($):");
        }
    }

    function toggleTargetMode() {
        configTargetMode = configTargetMode === "pct" ? "usd" : "pct";
        syncTargetModeBadge();
        updateUI();
        if (configTargetMode === "pct") {
            const t = effectiveProfitTarget();
            updateStatusText("🎯 เป้ากำไร = " + configProfitTarget + "% ของทุน" + (t > 0 ? " (≈ " + formatNumber(t, 4) + " USDT)" : " (รอ START เพื่อคิดจากทุนจริง)"), "#55e7ff");
        } else {
            updateStatusText("🎯 เป้ากำไร = " + configProfitTarget + " USDT (ยอดคงที่)", "#7f8b9b");
        }
    }

    function executeNextBet() {
        if (!sessionRunning || isWaitingNextRound || isBetInProgress) return;

        // ตรวจสอบ Take Profit รวม (ต้องมีไม้เดิมพันจริงอย่างน้อย 1 ไม้ totalBets > 0)
        const profitTargetLimit = effectiveProfitTarget();
        if (totalBets > 0 && profitTargetLimit > 0 && profit >= (profitTargetLimit - 0.000000001)) {
            handleTakeProfitHit();
            return;
        }

        // 1. ตรวจแท็บ Manual ทุก 25 ตา — ⚡ ย้ายออกจากเส้นทางวิกฤต: วางไม้ให้เสร็จก่อน แล้วค่อยตรวจเบื้องหลัง
        if (totalBets % 25 === 0) {
            setTimeout(function () {
                try {
                    openManualTab();
                    // ตรวจสุขภาพ selector ถ้าอะไรหายให้ล้าง cache เพื่อค้นหาใหม่
                    if (!probeDomHealth().ok) {
                        cachedBetBtn = null;
                        cachedAmountInput = null;
                        cachedChanceInput = null;
                    }
                } catch (e) {}
            }, 0);
        }

        // 2. ตั้งค่าตัวเลข Bet / Chance / ทิศทาง โดยตรงทุกรอบก่อนกดเดิมพัน
        applyBetSettings();

        const betBtn = getBetButton();
        if (!betBtn) {
            domResolveFails++;
            // ทุก 3 ครั้ง: ล้าง cache + ตรวจแท็บ (เดิมทำทุกครั้ง = เปิดแท็บซ้ำตอนเว็บกำลังโหลด)
            if (domResolveFails % 3 === 0) {
                openManualTab();
                cachedBetBtn = null;
                cachedAmountInput = null;
                cachedChanceInput = null;
            }
            // หาไม่ได้นานผิดปกติ → แจ้งตรง ๆ (ไม่หยุดเอง กันหยุดผิดตอนหน้าเว็บกำลังโหลด)
            if (domResolveFails >= 12) {
                const health = probeDomHealth();
                updateStatusText("⚠️ หาปุ่มเดิมพันไม่เจอ — " + (health.msg || "selector อาจเปลี่ยน (F5 หรือ STOP)"), "#ffa726");
                betTimeoutId = setTimeout(executeNextBet, 400);
                return;
            }
            updateStatusText("⚠️ รอเปิดปุ่มเดิมพัน...", "#ffa726");
            betTimeoutId = setTimeout(executeNextBet, 150);
            return;
        }
        domResolveFails = 0;

        if (!isBetButtonReady(betBtn)) {
            betRetryCount++;
            if (betRetryCount > 6) {
                openManualTab();
                betRetryCount = 0;
            }
            updateStatusText("⏳ รอเปิดปุ่มเดิมพัน...", "#ff9800");
            betTimeoutId = setTimeout(executeNextBet, 200);
            return;
        }
        betRetryCount = 0;

        const balanceBefore = getBalance();
        const currentBetAmount = parseFloat(calculateCurrentBetAmount());

        // 🚦 กันยอดเกินเพดานสูงสุดที่เว็บประกาศไว้ (ถ้าอ่านได้)
        if (detectedMaxBet && currentBetAmount > detectedMaxBet) {
            stopSession(`🛑 ยอดไม้ ${formatBetAmount(currentBetAmount)}$ เกินเพดานเว็บ ${formatBetAmount(detectedMaxBet)}$ — หยุดก่อนถูกปฏิเสธ`, "#ff5252");
            return;
        }

        if (balanceBefore !== null) {
            // ป้องกัน DOM glitch ที่อ่านค่าได้ 0 ชั่วคราวตอนหน้าเว็บรีเฟรชยอด (สากล: เช็ก > 0 ไม่จำกัดเฉพาะ > 1)
            if (balanceBefore === 0 && ((currentBalance !== null && currentBalance > 0) || (startBalance !== null && startBalance > 0))) {
                betTimeoutId = setTimeout(executeNextBet, 500);
                return;
            }
            if (currentBetAmount > balanceBefore) {
                // หากเคยมีเงินบวกมาก่อน ให้หน่วงเวลาและลองอ่านใหม่ 3 ครั้ง ป้องกันเน็ตหรือ DOM กระตุก
                if (((currentBalance !== null && currentBalance > 0) || (startBalance !== null && startBalance > 0)) && domResolveFails < 3) {
                    domResolveFails++;
                    betTimeoutId = setTimeout(executeNextBet, 400);
                    return;
                }
                flashHudAlert("#ff3344");
                stopSession("🚨 เงินในกระเป๋าไม่พอไม้ถัดไป!", "#ff3344");
                return;
            }
        }

        // ยืนยันว่าช่องยอดเดิมพันถูกตั้งค่าตรงกับยอดที่ต้องการจริงก่อนกด (กันกดด้วยยอดค้างจากตาก่อนหน้า)
        if (!isAmountApplied(currentBetAmount)) {
            amountRetryCount++;
            if (amountRetryCount > 100) {
                amountRetryCount = 0;
                flashHudAlert("#ff3344");
                stopSession("🚨 ตั้งยอดเดิมพันในช่องไม่สำเร็จ (ยืนยันค่าไม่ได้) หยุดเพื่อความปลอดภัย", "#ff3344");
                return;
            }
            updateStatusText("⏳ กำลังยืนยันยอดเดิมพันในช่อง...", "#ff9800");
            betTimeoutId = setTimeout(executeNextBet, 50);
            return;
        }
        amountRetryCount = 0;

        isBetInProgress = true;
        lastBetSentAt = Date.now();
        lastBetSide = pendingRollSide || currentRollSide || "under";
        activeRollSide = lastBetSide; // ล็อกด้านของไม้ที่กำลังวิ่ง (badge fallback ใช้อ้างอิง)
        updateUI();

        clickBetButton(betBtn);
        waitForBetCompletion(betBtn, balanceBefore, currentBetAmount, Date.now());
    }

    function getLatestBadgeInfo() {
        try {
            const badge = document.querySelector('[data-testid^="past-bet-button-"], [data-testid="dice-history"] button:first-child, [data-testid*="dice-history"] button:first-child, [data-testid*="past-bet"] button:first-child, [data-testid*="recent-bet"] button:first-child') ||
                          document.querySelector('div[class*="previous-rolls"] button:first-child, div[class*="past-bets"] button:first-child') ||
                          document.querySelector('[data-testid="game-history"] button:first-child, [data-testid*="history"] button:first-child') ||
                          document.querySelector('div[class*="history"] button:first-child, div[class*="recent-bets"] button:first-child') ||
                          document.querySelector('div[class*="history-entry"]:first-child, [data-testid*="dice-result"]');
            if (!badge) return null;
            const text = (badge.textContent || "").replace(/,/g, '').trim();
            const match = text.match(/\d+(\.\d+)?/);
            const roll = match ? parseFloat(match[0]) : null;
            return { el: badge, roll: roll, text: text };
        } catch (e) {
            return null;
        }
    }

    function isGreenRgb(rgbStr) {
        if (!rgbStr) return null;
        const m = rgbStr.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
        if (!m) return null;
        const r = parseInt(m[1], 10);
        const g = parseInt(m[2], 10);
        const b = parseInt(m[3], 10);
        if (g >= 170 && r <= 100 && b <= 130) return true;
        if (r >= 180 && g <= 100) return false;
        return null;
    }

    function isBadgeWinning(badgeInfo, targetChance) {
        if (!badgeInfo) return false;
        if (badgeInfo.el) {
            const html = (badgeInfo.el.outerHTML || "").toLowerCase();
            if (html.includes("success") || html.includes("#00e701") || html.includes("#00e676") || html.includes("rgb(0, 231, 1)")) {
                return true;
            }
            if (html.includes("danger") || html.includes("lose") || html.includes("error") || html.includes("rgb(237,")) {
                return false;
            }
            try {
                const cs = window.getComputedStyle(badgeInfo.el);
                const bgCheck = isGreenRgb(cs.backgroundColor);
                if (bgCheck !== null) return bgCheck;
                const colCheck = isGreenRgb(cs.color);
                if (colCheck !== null) return colCheck;
            } catch (e) {}
        }

        // กำหนดด้านจากคำขอเดิมพันจริงของบอทโดยตรง (ตัดโค้ดที่ไปอ่าน DOM หน้าเว็บซึ่งขัดแย้งกับคำขอออก 100%)
        const sideForBadge = activeRollSide || lastServerCondition || lastBetSide || pendingRollSide || currentRollSide || "under";
        const isRollOver = sideForBadge === "over";

        if (badgeInfo.roll !== null) {
            if (isRollOver) return badgeInfo.roll > (100 - targetChance);
            return badgeInfo.roll < targetChance;
        }
        return false;
    }

    function waitForBetCompletion(betBtn, balanceBefore, betAmount, startTime) {
        let isResolved = false;
        let checkInterval = null;
        let pollingDelayTimeout = null;

        function finishBet(isWin, delta, newBal, serverBal) {
            if (isResolved) return;
            isResolved = true;
            lastBetActivityAt = Date.now();
            betBtnStalls = 0; // ได้ผลลัพธ์ = ปุ่มที่ใช้อยู่ทำงานถูก
            onDiceRollCallback = null;

            // ⏱️ LATENCY WATCHDOG: ตรวจวัดความหน่วงของเซิร์ฟเวอร์ Stake
            const latency = Date.now() - startTime;
            if (latency > 3500) {
                log(`⚠️ [LATENCY WATCHDOG] เซิร์ฟเวอร์หน่วง (${latency}ms) — ปรับจังหวะผ่อนปรนไม้ถัดไป`, true);
                adaptiveCalmingDelay = Math.min(800, Math.floor(latency * 0.15));
            } else {
                adaptiveCalmingDelay = 0;
            }

            if (pollingDelayTimeout) {
                clearTimeout(pollingDelayTimeout);
                pollingDelayTimeout = null;
            }
            if (checkInterval) {
                clearInterval(checkInterval);
                checkInterval = null;
            }
            handleBetResult(isWin, delta, newBal, betAmount, serverBal);
        }

        // 1. FAST PATH: ตรวจจับผลลัพธ์จริง 100% จากเซิร์ฟเวอร์ผ่าน Network Interceptor (Fetch & XHR)
        onDiceRollCallback = function (rollData, serverBal) {
            try {
                if (rollData && rollData.state && typeof rollData.state.result === "number") {
                    trackRngRoll(rollData.state.result); // เก็บผลจริงไว้ตรวจ RNG (NIST)
                }
                const targetChance = parseFloat(getEffectiveChance()) || 68;
                // เก็บด้านที่เซิร์ฟเวอร์ใช้จริงในไม้ล่าสุด (ไว้ยืนยันว่าด้านที่บังคับไว้มีผลจริง)
                try {
                    const cRaw = String((rollData && rollData.state && rollData.state.condition) || (rollData && rollData.condition) || "").toLowerCase();
                    lastServerCondition = (cRaw === "above" || cRaw === "over") ? "over"
                        : ((cRaw === "below" || cRaw === "under") ? "under" : null);
                } catch (e) { lastServerCondition = null; }
                let isWin = false;
                let winMult = 99 / targetChance;

                // บันทึกตัวเลขที่ออกจริง (res) เข้าสู่ระบบเรดาร์สถิติ
                if (rollData.state && typeof rollData.state.result === 'number') {
                    trackRollValue(rollData.state.result);
                } else if (typeof rollData.result === 'number') {
                    trackRollValue(rollData.result);
                }

                if (typeof rollData.payoutMultiplier === 'number') {
                    isWin = rollData.payoutMultiplier > 0;
                    if (rollData.payoutMultiplier > 0) winMult = rollData.payoutMultiplier;
                } else if (typeof rollData.payout === 'number' && typeof rollData.amount === 'number' && rollData.amount > 0) {
                    isWin = rollData.payout > 0;
                    if (rollData.payout > 0) winMult = rollData.payout / rollData.amount;
                } else if (rollData.state && typeof rollData.state.result === 'number') {
                    const res = rollData.state.result;
                    const cond = String(rollData.state.condition || 'below').toLowerCase();
                    const tgt = typeof rollData.state.target === 'number'
                        ? rollData.state.target
                        : ((cond === 'below' || cond === 'under') ? targetChance : (100 - targetChance));
                    isWin = (cond === 'below' || cond === 'under') ? (res < tgt) : (res > tgt);
                    if (typeof rollData.state.multiplier === 'number' && rollData.state.multiplier > 0) {
                        winMult = rollData.state.multiplier;
                    }
                } else if (typeof rollData.result === 'number') {
                    const res = rollData.result;
                    const cond = String(rollData.condition || 'below').toLowerCase();
                    const tgt = typeof rollData.target === 'number'
                        ? rollData.target
                        : ((cond === 'below' || cond === 'under') ? targetChance : (100 - targetChance));
                    isWin = (cond === 'below' || cond === 'under') ? (res < tgt) : (res > tgt);
                }

                let delta = 0;
                if (betAmount > 0) {
                    delta = isWin
                        ? (typeof rollData.payout === 'number' && rollData.payout > 0 ? parseFloat(rollData.payout) - betAmount : betAmount * (winMult - 1))
                        : -betAmount;
                }
                const baseBal = (currentBalance !== null) ? currentBalance : balanceBefore;
                const freshBal = (baseBal !== null) ? parseFloat((baseBal + delta).toFixed(8)) : getBalance();
                finishBet(isWin, parseFloat(delta.toFixed(8)), freshBal, serverBal);
            } catch (e) {}
        };

        // 2. DOM POLLING FALLBACK (ทำงานเฉพาะเมื่อ Network Interceptor ไม่ตอบกลับภายในเวลาที่กำหนด)
        const initialBadge = getLatestBadgeInfo();
        const initialBadgeText = initialBadge ? initialBadge.text : "";
        const maxTimeout = 1200;

        pollingDelayTimeout = setTimeout(function () {
            if (isResolved) return;

            checkInterval = setInterval(function () {
                if (isResolved) {
                    clearInterval(checkInterval);
                    checkInterval = null;
                    return;
                }

                const elapsed = Date.now() - startTime;
                const isReady = isBetButtonReady(betBtn);

                // ตรวจการเปลี่ยนแปลงยอด Balance จริงในกระเป๋า (เมื่อปุ่มพร้อมและผ่านไปเกิน 60ms เพื่อให้ยอดนิ่ง)
                if (isReady && elapsed > 60 && betAmount > 0 && balanceBefore !== null) {
                    const balanceNow = getBalance();
                    if (balanceNow !== null && Math.abs(balanceNow - balanceBefore) > 0.0000000001) {
                        const delta = parseFloat((balanceNow - balanceBefore).toFixed(8));
                        finishBet(delta > 0, delta, balanceNow);
                        return;
                    }
                }

                // ตรวจสอบตัวเลขใน History Badge เปลี่ยนแปลง (เฉพาะเมื่อผ่านไปเกิน 150ms แล้วยังไม่ได้รับผลจาก Network/Balance)
                if (elapsed > 150) {
                    const currentBadge = getLatestBadgeInfo();
                    if (currentBadge && currentBadge.text && currentBadge.text !== initialBadgeText) {
                        if (typeof currentBadge.roll === 'number') trackRollValue(currentBadge.roll);
                        const targetChance = parseFloat(getEffectiveChance()) || 68;
                        const isWin = isBadgeWinning(currentBadge, targetChance);
                        const delta = isWin ? parseFloat((betAmount * (99 / targetChance - 1)).toFixed(8)) : -betAmount;
                        const baseBal = (currentBalance !== null) ? currentBalance : balanceBefore;
                        const finalBal = (baseBal !== null) ? parseFloat((baseBal + delta).toFixed(8)) : getBalance();
                        finishBet(isWin, delta, finalBal);
                        return;
                    }
                }

                // Safety Timeout
                if (elapsed > maxTimeout) {
                    // หยุด polling ทันที ไม่ให้นับซ้ำ/สั่งแทงซ้อนหลายรอบ
                    if (checkInterval) {
                        clearInterval(checkInterval);
                        checkInterval = null;
                    }
                    const finalBal = betAmount > 0 ? getBalance() : balanceBefore;
                    if (betAmount > 0 && balanceBefore !== null && finalBal !== null && Math.abs(finalBal - balanceBefore) > 0.0000000001) {
                        const delta = parseFloat((finalBal - balanceBefore).toFixed(8));
                        finishBet(delta > 0, delta, finalBal);
                        return;
                    }
                    sniffBetLimits(true);
                    // 🧩 AUTO-ADAPT: กดแล้วไม่มีอะไรเกิดขึ้นติดกัน → ลองปุ่มอื่นที่เข้าข่าย
                    betBtnStalls++;
                    if (betBtnStalls >= 2) {
                        const rotated = rotateBetButton();
                        if (rotated) {
                            domStrategyNote("ปุ่มเดิมพัน ← " + rotated);
                            betBtnStalls = 0;
                        }
                    }
                    isBetInProgress = false;
                    lastBetSentAt = 0;
                    scheduleNextBet();
                }
            }, 20); // เดิม 6ms → 20ms: ลด DOM polling ~3 เท่า (interceptor ยังเป็นทางหลัก)
        }, 40); // เดิม 12ms
    }

    // ==================================================
    // 9. CORE MARTINGALE BET LOGIC HANDLER
    // ==================================================


    // อัปเดตยอดในระบบจากผลไม้หนึ่งครั้ง
    // - ถ้ามียอดจาก API: ใช้เป็นความจริงที่สุด แล้วเทียบกับที่โมเดลคำนวณไว้ทันที (จับ payout เพี้ยนได้แม่น)
    // - ถ้าไม่มียอดจาก API: บวก delta ตามปกติ (ไม่ตัดสินจาก DOM เลย — ยอดบนจออาจค้างเพราะ WebSocket ล่ม)
    function applyBetBalance(delta, newBalance, serverBal) {
        let server = (typeof serverBal === "number" && isFinite(serverBal) && serverBal > 0)
            ? parseFloat(serverBal.toFixed(8)) : null;
        // กันกรณี API ส่งยอด "ก่อน" แทงกลับมา (เท่ากับยอดเดิมทั้งที่ delta ไม่ใช่ 0)
        if (server !== null && currentBalance !== null && Math.abs(delta) > 1e-10 &&
            Math.abs(server - currentBalance) < 1e-9) {
            server = null;
        }

        if (server !== null) {
            const expected = (currentBalance !== null)
                ? parseFloat((currentBalance + delta).toFixed(8))
                : parseFloat((server - delta).toFixed(8));
            const diff = parseFloat((expected - server).toFixed(8));
            const tol = Math.max(1e-8, Math.abs(delta) * 1e-6); // ยอดจาก API ควรตรงระดับทศนิยม 8 ตำแหน่ง
            if (Math.abs(diff) > tol) {
                registerBalanceMismatch(diff, server, tol, "API");
            } else {
                registerBalanceSync();
            }
            if (currentBalance === null && startBalance === null) {
                startBalance = parseFloat((server - delta).toFixed(8));
            }
            currentBalance = server;
            return;
        }

        if (newBalance !== null) {
            if (currentBalance !== null && Math.abs(newBalance - currentBalance) < 1e-10 && Math.abs(delta) > 0) {
                currentBalance = parseFloat((currentBalance + delta).toFixed(8));
            } else {
                currentBalance = parseFloat(newBalance.toFixed(8));
            }
            if (startBalance === null) {
                startBalance = parseFloat((currentBalance - delta).toFixed(8));
            }
        } else if (currentBalance !== null) {
            currentBalance = parseFloat((currentBalance + delta).toFixed(8));
        }
    }

    function handleBetResult(isWin, delta, newBalance, betAmount, serverBal) {
        isBetInProgress = false;
        lastBetSentAt = 0;
        const ledgerStep = mStep; // บันทึกลำดับไม้จริงลง ledger

        totalBets++;
        betTimestamps.push(Date.now());
        if (betTimestamps.length > 50) betTimestamps.shift();
        totalWagered = parseFloat((totalWagered + betAmount).toFixed(8));
        if (totalBets % 40 === 0) runPerformanceSelfHealing();

        applyBetBalance(delta, newBalance, serverBal);
        ledgerRecord({ step: ledgerStep, amount: betAmount, win: !!isWin, delta: delta, balance: currentBalance, source: (typeof serverBal === "number" ? "API" : "DOM") });
        // DESYNC สั่งหยุดไปแล้ว — ห้ามเอาข้อความ "ชนะ/แพ้" มาทับข้อความหยุด
        if (!sessionRunning) return;

        if (currentBalance !== null && startBalance !== null) {
            profit = parseFloat((currentBalance - startBalance).toFixed(8));
        } else {
            profit = parseFloat((profit + delta).toFixed(8));
        }

        if (currentBalance !== null) {
            if (peakBalance === null || currentBalance > peakBalance) peakBalance = currentBalance;
            const currentDrawdown = peakBalance - currentBalance;
            if (currentDrawdown > maxDrawdown) maxDrawdown = currentDrawdown;
        }

        if (betAmount > 0) lastBetAmount = betAmount;

        recentOutcomes.push(isWin);
        if (recentOutcomes.length > 30) recentOutcomes.shift();

        if (isWin) {
            winsCount++;
            currentStreak = currentStreak > 0 ? currentStreak + 1 : 1;
        } else {
            lossesCount++;
            currentStreak = currentStreak < 0 ? currentStreak - 1 : -1;
        }



        // ==========================================
        // MARTINGALE DYNAMIC: แพ้คำนวณตาม Payout · ชนะติด 3 → รีเซ็ตกลับฐาน
        // ==========================================
        if (isWin) {
            successfulSnipes++;
            flashHudAlert("#00e676");
            if (currentStreak >= MARTINGALE_RESET_WINS) {
                const wasStep = mStep;
                mStep = 1;

                BotMemory.saveState();
                log(`🎯 [WIN ×${currentStreak}] ชนะติด ${currentStreak} → รีเซ็ตยอดกลับฐาน (จากไม้ ${wasStep} ➔ ไม้ 1) | +$${delta.toFixed(8)}`, true);
                updateStatusText(`🎯 ชนะติด ${currentStreak}! รีเซ็ตกลับยอดฐาน (+${delta.toFixed(5)}$)`, "#00e676");
            } else {
                BotMemory.saveState();
                log(`🎯 [WIN] ชนะ +$${delta.toFixed(8)} | ชนะติด ${currentStreak}/${MARTINGALE_RESET_WINS} | อยู่ไม้ ${mStep}`, currentStreak >= 2 || totalBets % 50 === 0);
                updateStatusText(`🎯 [WIN] +${delta.toFixed(5)}$ | ชนะติด ${currentStreak}/${MARTINGALE_RESET_WINS} | ไม้ ${mStep}`, "#00e676");
            }
        } else {
            mStep++;
            if (configMaxMartingaleSteps > 0 && mStep > configMaxMartingaleSteps) {
                log(`🛑 [GUARDRAIL CAP] ชนเพดานจำกัดไม้สูงสุด (${configMaxMartingaleSteps} ไม้) → รีเซ็ตกลับไม้ 1 เพื่อความปลอดภัย`, true);
                mStep = 1;
            }
            BotMemory.saveState();
            const nextAmt = calculateCurrentBetAmount();
            log(`⚠️ [LOSS] แพ้ -$${Math.abs(delta).toFixed(8)} → ขยับเป็นไม้ ${mStep} (${nextAmt}$)`, true);
            updateStatusText(`⚠️ [LOSS] -${formatNumber(Math.abs(delta), 5)}$ → ไม้ ${mStep} (${nextAmt}$)`, "#ffa726");
        }

        // 🔄 สลับฝั่งอัตโนมัติทุกตา (ถ้าเปิดใช้งาน)
        syncChanceBoostState();
        if (configAlternateRoll) {
            currentRollSide = (currentRollSide === "under") ? "over" : "under";
        } else {
            currentRollSide = "under";
        }
        pendingRollSide = currentRollSide;

        updateUI();

        // 📊 ส่งสถิติไม้ล่าสุดไปยัง Bridge Task Queue ฝั่ง ISOLATED World
        sendStatToBridge({
            account: accountName || "",
            step: mStep,
            isWin: isWin,
            delta: Math.round(delta * 1e8) / 1e8,
            profit: Math.round(profit * 1e8) / 1e8,
            streak: currentStreak,
            time: Date.now()
        });

        // ⏱️ GRACEFUL TIME EXIT:
        // ตรวจสอบเมื่อครบเวลา 20 นาที หรืออยู่ในโหมดพยุงกู้คืน:
        // 1. ถ้ายอดรวมเป็นบวก (profit >= 0 หรือ domBal >= startBalance) -> ปิดทันที 100% ล็อกกำไรเข้ากระเป๋า!
        // 2. ถ้ากู้คืนจนกลับมาอยู่ที่ไม้ 1 และแทงชนะ (isWin && mStep === 1) หรือชนะติดครบ 3 ตา (currentStreak >= MARTINGALE_RESET_WINS)
        //    -> ได้บวก/จบรอบกู้คืนแล้ว ปิดล็อกความปลอดภัยทันที ไม่แทงต่อให้เสี่ยงหลุดไปไม้ลึก!
        if (sessionTimeExpired || sessionRecoveryActive) {
            const domBal = getBalance();
            const memProfit = (typeof profit === "number" && !isNaN(profit)) ? profit : 0;
            const domProfit = (domBal !== null && startBalance !== null)
                ? parseFloat((domBal - startBalance).toFixed(8))
                : memProfit;
            const effectiveProfit = Math.max(memProfit, domProfit);

            // เงื่อนไขปิดล็อกกำไร & ความปลอดภัยทันที (Instant Exit):
            // ก) ยอดรวมเซสชันพลิกเป็นบวก (effectiveProfit >= 0)
            // ข) บอทกู้คืนสำเร็จ อยู่ที่ไม้ 1 และแทงชนะได้บวก (isWin && mStep === 1)
            // ค) ชนะติดกันครบ 3 ตา (currentStreak >= MARTINGALE_RESET_WINS) ซึ่งรีเซ็ตกลับไม้ 1 เรียบร้อย
            const isProfitPositive = (effectiveProfit >= 0 || memProfit >= 0 || domProfit >= 0);
            const isRecoveredSafe = (mStep === 1 && (isWin || currentStreak >= MARTINGALE_RESET_WINS));

            if (isProfitPositive || isRecoveredSafe) {
                stopRecoveryHold();

                let exitReason = "";
                if (isProfitPositive) {
                    exitReason = `🎯 ครบเวลา เซสชันนี้บวก (+${formatNumber(effectiveProfit, 4)}$) — ล็อกกำไรทันที`;
                    log(`🎯 [INSTANT PROFIT LOCK] ${exitReason} → สั่งหยุดทันที 0ms ไม่รอไม้ 1 และไม่รอชนะติด 3 ตา!`, true);
                } else {
                    exitReason = `🛡️ พยุงจบไม้ ชนะกลับไม้ 1 ปลอดภัย (P/L ${formatNumber(effectiveProfit, 4)}$) — ปิดล็อกความปลอดภัยทันที`;
                    log(`🛡️ [SAFE RECOVERY EXIT] ${exitReason} (ไม้ ${mStep}, ชนะติด ${currentStreak}) ไม่เสี่ยงแทงต่อ!`, true);
                }
                stopSession(exitReason, "#00e676");
                return;
            } else {
                publishRecoveryHold();
                updateStatusText(`⏳ กำลังพยุงรอพลิกบวก (ฐาน ${FIXED_BASE_BET}$, P/L: ${formatNumber(effectiveProfit, 4)}$) — พลิกบวก/กลับไม้ 1 หยุดทันที! (ไม้ ${mStep})`, "#ffea00");
            }
        }

        // 🎯 INSTANT TAKE PROFIT CHECK (0ms):
        // ตรวจสอบเป้าหมายกำไรทันทีที่ผลเดิมพันเข้ามา โดยไม่ต้องรอ scheduleNextBet หรือติดค้างใน Humanizer delay!
        const profitTargetLimit = effectiveProfitTarget();
        if (totalBets > 0 && profitTargetLimit > 0 && profit >= (profitTargetLimit - 0.000000001)) {
            handleTakeProfitHit();
            return;
        }

        applyBetSettings(); // ตั้งยอดไม้ถัดไปล่วงหน้า ให้ช่องกรอกอัปเดตก่อนถึงรอบกด
        scheduleNextBet();
    }

    // เปิดโหมด "เดิมพันในทันที" (Instant Bet) อัตโนมัติ: เปิดเมนูเฟือง > หาปุ่มสวิตช์ > ตรวจสถานะ (data-active) > กดเฉพาะเมื่อยังปิดอยู่
    function findInstantBetLabel() {
        const exact = document.querySelector(
            'button[data-testid="button-instantBetToggle"], [data-testid*="instantBet" i], [data-testid*="instant-bet" i], [data-testid*="instant" i]'
        );
        if (exact) return exact;
        const nodes = document.querySelectorAll('span, label, div, button, p');
        for (let i = 0; i < nodes.length; i++) {
            const n = nodes[i];
            if (n.children.length > 2) continue;
            const t = (n.textContent || "").trim();
            if (
                /^(การเดิมพันทันที|เดิมพันในทันที|เดิมพันทันที|เดิมพันทันใจ|เดิมพันด่วน|instant\s*bet)$/i.test(t) ||
                (t.length < 35 && (/instant\s*bet/i.test(t) || (t.includes("เดิมพัน") && t.includes("ทันที"))))
            ) {
                return n;
            }
        }
        return null;
    }

    function readToggleState(labelEl) {
        if (!labelEl) return null;
        if (labelEl.getAttribute) {
            const da = labelEl.getAttribute("data-active");
            if (da === "true" || da === "false") return { el: labelEl, on: da === "true" };
            const ac = labelEl.getAttribute("aria-checked");
            if (ac === "true" || ac === "false") return { el: labelEl, on: ac === "true" };
        }
        let node = labelEl;
        for (let depth = 0; depth < 5 && node; depth++) {
            const ctl = node.querySelector('input[type="checkbox"], [role="switch"], button[aria-checked], [aria-checked], [data-active]');
            if (ctl) {
                if (ctl.tagName === "INPUT") return { el: ctl, on: !!ctl.checked };
                const aria = ctl.getAttribute("aria-checked");
                if (aria === "true" || aria === "false") return { el: ctl, on: aria === "true" };
                const da = ctl.getAttribute("data-active");
                if (da === "true" || da === "false") return { el: ctl, on: da === "true" };
                return { el: ctl, on: false };
            }
            node = node.parentElement;
        }
        return null;
    }

    // ==================================================
    // 🎯 GO TO DICE — พาแท็บปัจจุบันไปหน้า Stake Dice (ใช้ภาษาเดิมของเว็บ ไม่เปิดแท็บใหม่)
    // ==================================================
    function dicePageUrl() {
        let lang = "th";
        try {
            const m = (window.location.pathname || "").match(/^\/([a-zA-Z]{2})(\/|$)/);
            if (m) lang = m[1].toLowerCase();
        } catch (e) {}
        const host = window.location.host || "stake.com";
        return "https://" + host + "/" + lang + "/casino/games/stake-dice";
    }

    function isOnDicePage() {
        try {
            return (window.location.pathname || "").indexOf("/casino/games/stake-dice") !== -1;
        } catch (e) {
            return false;
        }
    }

    function goToDicePage() {
        if (isOnDicePage()) {
            updateStatusText("🎯 อยู่หน้า Stake Dice แล้ว", "#00e676");
            return;
        }
        const url = dicePageUrl();
        updateStatusText("🎯 กำลังไปหน้า Dice... " + url, "#55e7ff");
        try {
            window.location.href = url;
        } catch (e) {
            updateStatusText("⚠️ เปลี่ยนหน้าไม่ได้: " + (e && e.message ? e.message : e), "#ff5252");
        }
    }

    // 🎯 AUTO NAV: พาเว็บไปหน้า Stake Dice เองเมื่อเปิดหน้าเว็บ (มีตัวกันวนลูป)
    let configAutoGoDice = true;

    function isAuthPage() {
        try {
            const p = (window.location.pathname || "").toLowerCase();
            return p.indexOf("login") !== -1 || p.indexOf("register") !== -1 ||
                p.indexOf("/auth") !== -1 || p.indexOf("verify") !== -1 || p.indexOf("forgot") !== -1;
        } catch (e) {
            return false;
        }
    }

    function maybeAutoGoDice() {
        if (!configAutoGoDice) return;
        try {
            if (isOnDicePage()) return;
            if (isAuthPage()) return; // หน้า login/สมัคร/ยืนยันตัวตน — ห้ามเด้ง กันวนลูป
            if (getBalance() === null) return; // ยังอ่านยอดไม่ได้ = ยังไม่ล็อกอิน/หน้ายังไม่พร้อม
            setTimeout(function () {
                if (!configAutoGoDice || isOnDicePage() || isAuthPage()) return;
                goToDicePage();
            }, 1200);
        } catch (e) {}
    }

    function syncAutoGoDiceBadge() {
        if (!hudEls || !hudEls.autoGoDiceBadge) return;
        const el = hudEls.autoGoDiceBadge;
        setSafeText(el, configAutoGoDice ? "🎯 auto: ON" : "🎯 auto: OFF");
        setSafeStyle(el, "color", configAutoGoDice ? "#00e676" : "#7f8b9b");
        setSafeStyle(el, "borderColor", configAutoGoDice ? "#00e676" : "#2f4553");
    }

    async function ensureInstantBet() {
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        try {
            let label = findInstantBetLabel();
            let openedGear = null;
            if (!label) {
                // ค้นหาปุ่ม Settings / เมนูเฟืองของ Stake ให้ครอบคลุมทุกแบบ
                let gears = Array.from(document.querySelectorAll(
                    'button[data-testid="game-settings"], button[aria-label*="Setting" i], button[aria-label*="การตั้งค่า"], button[title*="Setting" i], button[title*="การตั้งค่า"], [data-testid*="settings" i]'
                ));
                if (gears.length === 0) {
                    gears = Array.from(document.querySelectorAll('svg[data-ds-icon="Settings"], svg[data-ds-icon="Gear"], svg[data-icon="gear"], svg[data-icon="settings"]'))
                        .map((s) => s.closest('button'))
                        .filter(Boolean);
                }
                if (gears.length === 0) {
                    const footers = document.querySelectorAll('.game-footer button, .game-actions button, [class*="game"] button');
                    gears = Array.from(footers).filter(b => {
                        const h = (b.getAttribute("aria-label") || b.title || b.innerHTML || "").toLowerCase();
                        return h.includes("setting") || h.includes("ตั้งค่า") || h.includes("gear");
                    });
                }
                for (let i = 0; i < Math.min(gears.length, 3) && !label; i++) {
                    gears[i].click();
                    await sleep(200);
                    label = findInstantBetLabel();
                    if (label) openedGear = gears[i];
                    else gears[i].click(); // ไม่ใช่เมนูที่ต้องการ ปิดกลับ
                }
            }
            if (!label) return "ไม่พบเมนู Instant Bet (สามารถกดเปิดที่เฟือง ⚙️ หน้าเว็บเองได้)";
            const state = readToggleState(label);
            let result;
            if (!state) {
                label.click();
                result = "กดเปิด Instant Bet แล้ว ⚡";
            } else if (state.on) {
                result = "Instant Bet เปิดอยู่แล้ว ⚡ (เร็วสูงสุด)";
            } else {
                state.el.click();
                await sleep(150);
                const after = readToggleState(label);
                result = after && after.on ? "เปิด Instant Bet สำเร็จ ⚡" : "กดเปิด Instant Bet แล้ว ⚡";
            }
            if (openedGear) {
                openedGear.click(); // ปิดเมนูเฟือง
                await sleep(100);
            }
            return result;
        } catch (e) {
            return "ตรวจ Instant Bet ผิดพลาด";
        }
    }

    // ==================================================
    // ⏱️ SESSION LIMIT — จบเซสชันเองตามเวลา (ใช้ตอนวนบัญชีทีละอัน)
    // ==================================================
    const SESSION_TIME_OPTIONS = [20, 30, 15, 0]; // นาที · 0 = ปิด
    // 🩹 RECOVERY HOLD — ครบเวลาแล้วถ้ายัง "ขาดทุน" ห้ามปิดบัญชี ให้พยุงต่อจนกว่าจะชนะติด N ไม้
    // เหตุผล: การตัดจบตอนขาดทุน = ล็อกขาดทุนทิ้ง และทิ้งบันไดค้างไว้กลางทาง
    const SESSION_RECOVERY_WINS = 3;            // สอดคล้องกับ Martingale +73.11% / ฐาน 68% (ต้องชนะติด 3 ไม้เพื่อรีเซ็ตกลับฐาน)
    const SESSION_RECOVERY_MAX_EXTRA_MIN = 60;  // เพดานพยุงสูงสุด (นาที) กันเซสชันค้างข้ามวัน
    const SESSION_HOLD_REFRESH_MS = 5000;       // รีเฟรช title STAKE_HOLD ทุก 5 วิ (เว็บอาจเขียนทับ)
    let configSessionMaxMinutes = 20; // ค่าเริ่มต้น 20 นาที (ครบเวลาแล้วไม่ตัดทันที แต่รอให้แก้ไม้จบก่อน)
    let sessionTimeExpired = false;
    let sessionRecoveryActive = false;  // กำลังพยุงอยู่ (ครบเวลาแต่ยังขาดทุน)
    let sessionRecoveryStreak = 0;      // ชนะติดกันกี่ไม้ นับจากวินาทีที่เริ่มพยุง
    let sessionHoldTitleTimerId = null;
    let sessionStartedAt = 0;
    let sessionTimerId = null;
    let sessionGraceTimerId = null;
    let lastSessionSummary = "";
    const LEDGER_HEADER = "date,account,start_bal,end_bal,profit,bets,max_step,minutes,stop_reason";

    function stopSessionTimer() {
        stopRecoveryHold();
        if (sessionTimerId) {
            clearTimeout(sessionTimerId);
            sessionTimerId = null;
        }
        // ต้องล้าง timer ช่วงผ่อนผัน (2 นาที) ด้วย ไม่งั้นมันจะยิง stopSession
        // ใส่ "เซสชันใหม่" ที่เพิ่งเริ่ม ภายใน 2 นาทีหลังเซสชันก่อนหยุด
        if (sessionGraceTimerId) {
            clearTimeout(sessionGraceTimerId);
            sessionGraceTimerId = null;
        }
        sessionTimeExpired = false;
        sessionStartedAt = 0;
    }

    function startSessionTimer() {
        stopSessionTimer();
        sessionTimeExpired = false;
        if (!sessionStartedAt) sessionStartedAt = Date.now();
        if (!configSessionMaxMinutes) return;

        const elapsedMs = Date.now() - sessionStartedAt;
        const totalMs = configSessionMaxMinutes * 60000;
        const remainMs = Math.max(0, totalMs - elapsedMs);

        sessionTimerId = setTimeout(function () {
            if (!sessionRunning) return;
            sessionTimeExpired = true;
            const domBal = getBalance();
            const memProfit = (typeof profit === "number" && !isNaN(profit)) ? profit : 0;
            const domProfit = (domBal !== null && startBalance !== null)
                ? parseFloat((domBal - startBalance).toFixed(8))
                : memProfit;
            const curProfit = Math.max(memProfit, domProfit);

            // 🛑 ถ้าครบ 20 นาทีแล้ว ยอดเป็นบวก (ตรวจทั้ง Memory และ DOM) -> ปิดเซสชันพักทันที 0ms ล็อกกำไรเข้ากระเป๋า!
            if (curProfit >= 0 || memProfit >= 0 || domProfit >= 0) {
                stopRecoveryHold();
                log("🎯 [INSTANT PROFIT LOCK] ครบ " + configSessionMaxMinutes + " นาทีแล้ว ยอดเป็นบวก (+" + formatNumber(curProfit, 4) + "$) → สั่งหยุดทันที 0ms ล็อกกำไรเข้ากระเป๋า!", true);
                stopSession("⏰ ครบเวลา " + configSessionMaxMinutes + " นาที ยอดบวก (+" + formatNumber(curProfit, 4) + "$) — ล็อกกำไรทันที", "#00e676");
                return;
            }

            if (curProfit < 0) {
                log("⏳ [HOLD FOR PROFIT] ครบ " + configSessionMaxMinutes + " นาทีแต่ยังขาดทุน (" + formatNumber(curProfit, 4) + "$) → พยุงเล่นต่อด้วยยอดฐานคงที่ " + FIXED_BASE_BET + "$ ไม่เร่งยอด เมื่อยอดพลิกบวกหยุดทันที 0ms!", true);
            }
            enterRecoveryHold(configSessionMaxMinutes);
        }, remainMs);
    }

    // 🩹 RECOVERY HOLD — ครบเวลาแล้วถ้ายังขาดทุน: พยุงเล่นต่อด้วยฐาน 0.0002$ คงที่ เมื่อยอดพลิกบวกหยุดทันที 0ms
    function enterRecoveryHold(minutes) {
        sessionRecoveryActive = true;
        sessionRecoveryStreak = 0;
        publishRecoveryHold();
        if (sessionHoldTitleTimerId) clearInterval(sessionHoldTitleTimerId);
        sessionHoldTitleTimerId = setInterval(publishRecoveryHold, SESSION_HOLD_REFRESH_MS);
    }

    function stopRecoveryHold() {
        sessionRecoveryActive = false;
        sessionRecoveryStreak = 0;
        if (sessionHoldTitleTimerId) {
            clearInterval(sessionHoldTitleTimerId);
            sessionHoldTitleTimerId = null;
        }
    }

    // title ชั่วคราวระหว่างพยุง — ให้ rotate-accounts.ps1 รู้ว่า "บอทยังทำงานอยู่ ห้ามปิดบัญชีนี้"
    function publishRecoveryHold() {
        if (!sessionRunning) return;  // ✅ ถ้า session จบแล้ว ห้ามเขียนทับ STAKE_DONE title
        if (!sessionRecoveryActive && !sessionTimeExpired) return;
        try {
            const bal = getBalance();
            const endBal = bal !== null ? bal : currentBalance;
            const pnl = (endBal !== null && startBalance !== null) ? (endBal - startBalance) : profit;
            let pnlStr = "0.00000";
            try { pnlStr = Number(pnl || 0).toFixed(5); } catch (e) { pnlStr = "0.00000"; }
            const holdTag = " [⏳พยุง " + FIXED_BASE_BET + "$ · " + getEffectiveChance() + "%]";
            const human = (accountName || "Account") + holdTag + " (P/L " + formatNumber(pnl, 4) + "$, ไม้ " + mStep + ", ชนะติด " + currentStreak + "/" + MARTINGALE_RESET_WINS + ")";
            document.title = "STAKE_HOLD|P=" + pnlStr + "|W=" + currentStreak + "|S=" + mStep + " :: " + human;
        } catch (e) {}
    }

    function syncSessionTimeBadge() {
        if (!hudEls || !hudEls.sessionTimeBadge) return;
        setSafeText(hudEls.sessionTimeBadge, configSessionMaxMinutes ? "⏱️ " + configSessionMaxMinutes + "m" : "⏱️ OFF");
        setSafeStyle(hudEls.sessionTimeBadge, "color", configSessionMaxMinutes ? "#ffea00" : "#7f8b9b");
        setSafeStyle(hudEls.sessionTimeBadge, "borderColor", configSessionMaxMinutes ? "#ffea00" : "#2f4553");
    }

    function cycleSessionTimeLimit() {
        const i = SESSION_TIME_OPTIONS.indexOf(configSessionMaxMinutes);
        configSessionMaxMinutes = SESSION_TIME_OPTIONS[(i + 1) % SESSION_TIME_OPTIONS.length];
        syncSessionTimeBadge();
        updateStatusText(configSessionMaxMinutes ? "⏱️ จบเซสชันอัตโนมัติเมื่อครบ " + configSessionMaxMinutes + " นาที" : "⏱️ ปิดการจบตามเวลา", configSessionMaxMinutes ? "#ffea00" : "#7f8b9b");
    }

    function buildSessionSummary(durMs, reason) {
        const d = new Date();
        const p2 = function (n) { return String(n).padStart(2, "0"); };
        const stamp = d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate()) + " " + p2(d.getHours()) + ":" + p2(d.getMinutes());
        const bal = getBalance();
        const endBal = bal !== null ? bal : currentBalance;
        const pnl = (endBal !== null && startBalance !== null) ? (endBal - startBalance) : profit;
        const mins = Math.round((durMs || 0) / 60000);
        return [
            stamp,
            accountName || "?",
            formatNumber(startBalance, 4),
            formatNumber(endBal, 4),
            formatNumber(pnl, 4),
            totalBets,
            mStep,
            mins,
            String(reason || "").replace(/,/g, ";")
        ].join(",");
    }

    function copySummaryToClipboard() {
        const row = lastSessionSummary || buildSessionSummary(sessionStartedAt ? (Date.now() - sessionStartedAt) : 0, "กำลังเล่น");
        const payload = LEDGER_HEADER + "\n" + row;
        const done = function () { updateStatusText("📋 คัดลอกสรุปแล้ว — วางใน Google Sheets ได้เลย", "#00e676"); };
        const fail = function (e) { updateStatusText("⚠️ คัดลอกไม่ได้: " + (e && e.message ? e.message : e), "#ff5252"); };
        try {
            const r = navigator.clipboard && navigator.clipboard.writeText(payload);
            if (r && typeof r.then === "function") r.then(done).catch(fail);
            else done();
        } catch (e) {
            fail(e);
        }
    }

    function startSession() {
        if (sessionRunning) {
            if (isWaitingNextRound) {
                clearTimers();
                isWaitingNextRound = false;
                updateStatusText("🚀 ข้ามช่วงพัก ลุยต่อทันที!", "#00e676");
                updateUI();
                executeNextBet();
            }
            return;
        }
        cancelAutoStart();
        clearTimers();

        const bal = getBalance();
        if (bal === null) {
            updateStatusText("รอโหลด Balance ก่อนเริ่ม", "#ff5252");
            return;
        }

        if (peerIsRunning()) {
            updateStatusText("🔒 อีกแท็บกำลังเดิมพันอยู่ — ปิดแท็บนั้นก่อน", "#ff5252");
            log("🔒 MULTI-TAB: พบแท็บอื่นกำลังเดิมพัน (id " + (peerRunning ? peerRunning.id : "?") + ") — ไม่เริ่มซ้ำ", true);
            return;
        }

        startBalance = bal;
        currentBalance = bal;
        peakBalance = bal;
        DailyStats.load(); // โหลดสถิติสะสมของวันนี้จาก storage

        maxDrawdown = 0;
        profit = 0;
        completedRounds = 0;
        lifetimeProfit = 0;
        totalBets = 0;
        totalWagered = 0;
        winsCount = 0;
        lossesCount = 0;
        currentStreak = 0;
        successfulSnipes = 0;
        cutLossSnipes = 0;
        desyncStrikes = 0;
        lastBetAmount = 0;
        lastDesync = { dom: null, model: null, diff: 0, tol: 0, source: "" };
        resyncCount = 0;
        cleanSyncStreak = 0;
        sessionLedger = [];
        ledgerGaps = 0;

        ensureManualTab();
        applyBetSettings();

        sniffBetLimits(false);

        const domHealth = probeDomHealth();
        if (!domHealth.ok) updateStatusText("⚠️ " + domHealth.msg, "#ffa726");

        sessionRunning = true;
        isWaitingNextRound = false;
        isBetInProgress = false;
        mStep = 1; // เริ่มเซสชันใหม่ที่ยอดฐานทุกครั้ง

        // 🛡️ SESSION GUARD: สร้าง Session ID เฉพาะรอบ และบันทึก State เป็น RUNNING
        currentSessionId = "sess_" + Date.now();
        BotMemory.saveState("RUNNING");

        activeBoostChance = NORMAL_CHANCE;
        syncChanceBoostState();

        startSessionTimer();
        startNetworkWatchdog();

        enableAudioKeepAlive();
        requestScreenWakeLock();

        if (configDynamicTarget) {
            configProfitTarget = generateDynamicTarget(bal);
            log(`🎯 [DYNAMIC TARGET] สุ่มเป้าหมายกำไรในรอบนี้: +${configProfitTarget} USDT (พรางพฤติกรรม & เซฟพอร์ต)`, true);
        }
        const baseAmt = getBaseBet();
        log(`🚀 เริ่มต้นเซสชัน (Martingale +${MARTINGALE_PCT}%): ทุน ${formatNumber(bal, 4)} USDT | ยอดฐาน ${baseAmt}$ | รีเซ็ตเมื่อชนะติด ${MARTINGALE_RESET_WINS}`, true);
        updateStatusText(`🚀 สตาร์ทแล้ว! ยอดฐาน ${baseAmt}$ (เป้า +${configProfitTarget}$)`, "#00e676");
        updateUI();

        // 🔽 AUTO-MINIMIZE: ยุบหน้าจอ HUD เป็น Compact Mini Bar อัตโนมัติเมื่อเริ่มเล่น
        try { setMinimizePanel(true); } catch (e) {}

        ensureInstantBet().then((msg) => {
            updateStatusText(`⚡ ${msg}`, "#ffea00");
        }).finally(() => {
            if (sessionRunning && !betTimeoutId) betTimeoutId = setTimeout(executeNextBet, 40);
        });
    }

    // 🧾 STOP CODE — รหัสสาเหตุแบบเครื่องอ่านได้ (ส่งต่อให้ rotate-accounts.ps1)
    // ทำไมต้องมี: title เดิมเป็นข้อความไทยล้วน -> PowerShell แยก "จบเพราะอะไร" ไม่ได้
    // หลักการ: อ่านจากข้อความ reason ที่มีอยู่แล้ว (ไม่ต้องแก้ call site ทั้ง 15 จุด)
    function deriveStopCode(rStr) {
        const s = String(rStr || "");
        if (s.indexOf("เป้ากำไร") >= 0) return "WIN";
        if (s.indexOf("เพดานเว็บ") >= 0) return "BET_CAP";
        if (s.indexOf("แพ้ครบ") >= 0) return "LADDER_EXHAUSTED";
        if (s.indexOf("เพดานไม้") >= 0) return "MAX_STEPS";
        if (s.indexOf("DESYNC") >= 0) return "DESYNC";
        if (s.indexOf("อีกแท็บ") >= 0) return "TAB_CONFLICT";
        if (s.indexOf("ครบเวลา") >= 0) return "TIME";
        if (s.indexOf("กู้คืน") >= 0) return "TIME";
        if (s.indexOf("เงินในกระเป๋าไม่พอ") >= 0) return "NO_FUNDS";
        if (s.indexOf("ตั้งยอดเดิมพัน") >= 0) return "BET_FAIL";
        if (s.indexOf("ปุ่ม ESC") >= 0 || s.indexOf("ผู้ใช้สั่งหยุด") >= 0) return "MANUAL";
        return "OTHER";
    }

    // รูปแบบ: STAKE_DONE|R=<code>|P=<pnl>|S=<step>|D=<yyyy-mm-dd> :: <ข้อความให้คนอ่าน>
    // คงคาว่า STAKE_DONE ไว้หน้าเสมอ เพื่อให้ FindDoneWindows() ใน PowerShell ยังจับได้เหมือนเดิม
    function buildDoneTitle(rStr) {
        let bal = getBalance();
        // ป้องกัน DOM glitch อ่านยอดเป็น 0 ขณะปิดหน้าต่าง (สากล: เช็ก > 0)
        if (bal === 0 && ((currentBalance !== null && currentBalance > 0) || (startBalance !== null && startBalance > 0))) {
            bal = currentBalance > 0 ? currentBalance : startBalance;
        }
        const endBal = bal !== null ? bal : currentBalance;
        const domProfit = (endBal !== null && startBalance !== null && endBal > 0) ? (endBal - startBalance) : null;
        const memProfit = (typeof profit === "number" && !isNaN(profit)) ? profit : 0;
        // 🛡️ ป้องกัน DOM glitch: ถ้าใน Memory มีกำไรสะสมจริง แต่ DOM ยังไม่อัปเดต ให้ใช้กำไรจริงเสมอ
        const pnl = (domProfit !== null && Math.abs(domProfit) > 0.00001) ? domProfit : memProfit;
        const d = new Date();
        const p2 = function (n) { return String(n).padStart(2, "0"); };
        const day = d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate());
        const code = deriveStopCode(rStr);
        const step = mStep; // ลำดับไม้ Martingale ปัจจุบัน (rotate-accounts.ps1 อ่านจาก S=)
        const human = (accountName || "Account") + " (" + String(rStr || "").split("|").join("/").slice(0, 35) + ")";
        let pnlStr = "0.00000";
        try { pnlStr = Number(pnl || 0).toFixed(5); } catch (e) { pnlStr = "0.00000"; }
        return "STAKE_DONE|R=" + code + "|P=" + pnlStr + "|S=" + step + "|D=" + day + " :: " + human;
    }

    function stopSession(reason, statusColor = "#b1bad3") {
        const durMs = sessionStartedAt ? (Date.now() - sessionStartedAt) : 0;
        if (durMs > 0) {
            lastSessionSummary = buildSessionSummary(durMs, reason);
            log("📋 SESSION: " + lastSessionSummary, true);
        }
        sessionRunning = false;
        isWaitingNextRound = false;
        isBetInProgress = false;
        mStep = 1;

        // 🛡️ SESSION GUARD: ทำเครื่องหมายจบเซสชัน ป้องกันการดึงสเต็ปเดิมมาใช้นอกรอบ
        BotMemory.markCompleted();

        // บันทึกสถิติสะสมของวันนี้ลง localStorage
        try {
            const _ds = dailyCumulative;
            dailyCumulative = {
                date: (function(){const d=new Date(),p2=function(n){return String(n).padStart(2,"0")};return d.getFullYear()+"-"+p2(d.getMonth()+1)+"-"+p2(d.getDate());})(),
                totalSessions: (_ds.totalSessions || 0) + 1,
                totalBetsDay: (_ds.totalBetsDay || 0) + totalBets,
                totalWinsDay: (_ds.totalWinsDay || 0) + winsCount,
                totalLossesDay: (_ds.totalLossesDay || 0) + lossesCount,
                totalProfitDay: parseFloat(((_ds.totalProfitDay || 0) + profit).toFixed(8)),
                maxStepSeenDay: Math.max(_ds.maxStepSeenDay || 0, maxDrawdown > 0 ? maxDrawdown : 0),
                maxDrawdownDay: Math.min(_ds.maxDrawdownDay || 0, maxDrawdown),
                bestSessionProfit: Math.max(_ds.bestSessionProfit || 0, profit),
                worstSessionProfit: Math.min(_ds.worstSessionProfit || 0, profit)
            };
            DailyStats.save(dailyCumulative);
        } catch(e) {}

        // 🧹 สั่งรวบยอด Teardown คืนทรัพยากรทั้งหมด (Timers, Audio, WakeLock, Listeners)
        teardownSessionResources();
        log("🛑 หยุดการทำงาน: " + (reason || "คำสั่งผู้ใช้"));
        updateStatusText(reason || "หยุดเซสชันแล้ว", statusColor);
        updateUI();

        // 🔄 AUTO-CLOSE TAB & ROTATE ACCOUNT:
        // เมื่อจบรอบสำเร็จ (ถึงเป้ากำไร, ตัดขาดทุนตามแผน, ครบเวลา, หรือเงื่อนไขหยุดใดๆ) ให้ส่งสัญญาณและสั่งปิดแท็บอัตโนมัติ
        const rStr = String(reason || "");
        const isManualUserStop = rStr.includes("ผู้ใช้สั่งหยุด") || rStr.includes("ปุ่ม ESC");
        const shouldAutoClose = !isManualUserStop;

        if (shouldAutoClose) {
            log("🚀 [AUTO-ROTATE] จบเซสชันแล้ว (" + rStr + ") — สั่งปิดหน้าต่างและสลับบัญชีอัตโนมัติ...", true);
            try {
                document.title = buildDoneTitle(rStr);
            } catch (e) {}

            // 1. ส่งสัญญาณ Beacon ไปยัง PowerShell Listener ทันที (ถ้ามี)
            try {
                const beaconUrl = "http://127.0.0.1:18888/done?account=" + encodeURIComponent(accountName || "") + "&reason=" + encodeURIComponent(rStr);
                fetch(beaconUrl, { mode: "no-cors" }).catch(() => {});
            } catch (e) {}

            // 2. ให้คง Title ไว้อย่างน้อย 2,500ms เพื่อให้ PowerShell (FindDoneWindows) ดักจับ STAKE_DONE ได้แน่นอน 100%
            // ก่อนส่งคำขอปิดแท็บไปยัง bridge.js และ background.js
            setTimeout(() => {
                try {
                    window.postMessage({
                        source: "stake-sniper-bot",
                        type: "STAKE_BOT_CLOSE_SESSION",
                        reason: rStr,
                        account: accountName || ""
                    }, "*");
                } catch (e) {}

                // Fallback: หาก background service worker ติดขัด ให้สั่งปิดหน้าต่างผ่าน window.close()
                setTimeout(() => {
                    try {
                        window.close();
                    } catch (e) {}
                }, 1000);
            }, 2500);
        }
    }

    // ==================================================
    // 10. CLOSED SHADOW DOM HUD INTERFACE
    // ==================================================

    let hudEls = {};

    function setSafeText(el, text) {
        if (el && el.textContent !== text) el.textContent = text;
    }

    function setSafeStyle(el, prop, val) {
        if (el && el.style[prop] !== val) el.style[prop] = val;
    }

    function formatNumber(val, decimals = 2) {
        if (val === null || val === undefined || isNaN(val)) return "-";
        return Number(val).toLocaleString('en-US', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        });
    }

    function flashHudAlert(color = "#00e676") {
        if (!hudEls.wrapper) return;
        if (configEcoMode) {
            // โหมด ECO: เปลี่ยนแค่สีขอบเส้น 1px ปราศจาก box-shadow blur เพื่อประหยัด GPU 100%
            hudEls.wrapper.style.borderColor = color;
            setTimeout(() => {
                if (hudEls.wrapper) hudEls.wrapper.style.borderColor = "#2f4553";
            }, 200);
            return;
        }
        hudEls.wrapper.style.borderColor = color;
        hudEls.wrapper.style.boxShadow = `0 0 16px ${color}88`;
        setTimeout(() => {
            if (hudEls.wrapper) {
                hudEls.wrapper.style.borderColor = "#2f4553";
                hudEls.wrapper.style.boxShadow = "0 8px 32px rgba(0,0,0,0.55)";
            }
        }, 400);
    }

    function updateStatusText(text, color = "#b1bad3") {
        if (hudEls.statusText) {
            setSafeText(hudEls.statusText, text);
            setSafeStyle(hudEls.statusText, "color", color);
        }
    }

    function syncHUDInputs() {
        if (!hudEls) return;
        const activeEl = shadowRootRef ? shadowRootRef.activeElement : null;
        const activeBase = formatBetAmount(configRealBaseBet);
        if (hudEls.inRealBase && activeEl !== hudEls.inRealBase) hudEls.inRealBase.value = activeBase;
        if (hudEls.inTarget && activeEl !== hudEls.inTarget) hudEls.inTarget.value = configProfitTarget;
        if (hudEls.inChance && activeEl !== hudEls.inChance) hudEls.inChance.value = getEffectiveChance();
    }

    function updateUI() {
        if (!shadowRootRef) return;
        syncAccountBadge();
        if (isUiUpdatePending) return;
        isUiUpdatePending = true;

        requestAnimationFrame(() => {
            isUiUpdatePending = false;
            performUIUpdate();
        });
    }

    function performUIUpdate() {
        if (!shadowRootRef) return;
        const {
            autoBtn, titleStep, paramStep, safetyStep, safetyStop, resyncBtn,
            cycleBtn, cycleBadge, ecoBtn, ecoBadge, modeBadge, nextBetEl,
            startBalEl, currBalEl, profitEl, streakEl, winrateEl, theoryEl, rngEl,
            snipesCountEl, startBtn, stopBtn, antiSleepBadge, integrityEl,
            miniStep, miniProfit, miniStartBtn, miniStopBtn, inRealBase
        } = hudEls;

        if (inRealBase && shadowRootRef.activeElement !== inRealBase) {
            const activeBase = formatBetAmount(configRealBaseBet);
            if (inRealBase.value !== activeBase) inRealBase.value = activeBase;
        }

        if (antiSleepBadge) {
            // ACTIVE = เสียงกันพักหน้าจอทำงานจริงแล้ว (มี gesture แล้ว)
            // STANDBY = กำลังรันแต่ยังไม่ได้คลิก/กดคีย์เลย → Chrome ยังไม่อนุญาตให้เล่นเสียง
            if (sessionRunning && audioUnlocked) {
                setSafeText(antiSleepBadge, "ACTIVE");
                setSafeStyle(antiSleepBadge, "color", "#00e676");
            } else if (sessionRunning) {
                setSafeText(antiSleepBadge, "STANDBY");
                setSafeStyle(antiSleepBadge, "color", "#ffa726");
            } else {
                setSafeText(antiSleepBadge, "IDLE");
                setSafeStyle(antiSleepBadge, "color", "#7f8b9b");
            }
        }

        if (ecoBadge) {
            setSafeText(ecoBadge, configEcoMode ? "🌱 ECO" : "🌿 FULL");
            setSafeStyle(ecoBadge, "color", configEcoMode ? "#00e676" : "#7f8b9b");
            setSafeStyle(ecoBadge, "borderColor", configEcoMode ? "#00e676" : "#2f4553");
        }

        if (ecoBtn) {
            setSafeText(ecoBtn, configEcoMode ? "🌱 ECO: ON" : "🌿 ECO: OFF");
            setSafeStyle(ecoBtn, "color", configEcoMode ? "#00e676" : "#7f8b9b");
            setSafeStyle(ecoBtn, "borderColor", configEcoMode ? "#00e676" : "#2f4553");
        }

        if (autoBtn) {
            setSafeText(autoBtn, configAutoStart ? "🚀 AUTO: ON" : "⏸️ AUTO: OFF");
            setSafeStyle(autoBtn, "color", configAutoStart ? "#00e676" : "#7f8b9b");
            setSafeStyle(autoBtn, "borderColor", configAutoStart ? "#00e676" : "#2f4553");
        }

        if (titleStep) setSafeText(titleStep, `🎯 MARTINGALE ${MARTINGALE_PCT}%`);

        if (integrityEl) {
            setSafeText(integrityEl,
                "🩺 DD " + formatNumber(maxDrawdown, 4) + "$ · Waged " + formatNumber(totalWagered, 2) + "$ · Peak " + formatNumber(peakBalance === null ? 0 : peakBalance, 2) +
                " · Gaps " + ledgerGaps + " · Drift " + domDriftCount + " · Resync " + resyncCount + " · Sync " + cleanSyncStreak + " · Cut " + cutLossSnipes);
        }
        if (paramStep) setSafeText(paramStep, `⚙️ พารามิเตอร์ Martingale:`);
        if (safetyStep) setSafeText(safetyStep, `ไม้ ${mStep} = ${formatBetAmount(calculateCurrentBetAmount())}$`);
        if (safetyStop) setSafeText(safetyStop, `ไม่จำกัดไม้`);
        if (hudEls.toggleAltBtn) {
            if (configAlternateRoll) {
                setSafeText(hudEls.toggleAltBtn, `เปิด (ON) · ${currentRollSide.toUpperCase()}`);
                hudEls.toggleAltBtn.style.color = "#00e676";
                hudEls.toggleAltBtn.style.borderColor = "#00e676";
            } else {
                setSafeText(hudEls.toggleAltBtn, "ปิด (OFF)");
                hudEls.toggleAltBtn.style.color = "#8596a5";
                hudEls.toggleAltBtn.style.borderColor = "#2f4553";
            }
        }

        if (resyncBtn) {
            setSafeText(resyncBtn, configAutoResync
                ? `↔️ AUTO-RESYNC: ON (${resyncCount}/${RESYNC_LIMIT})`
                : "↔️ AUTO-RESYNC: OFF (หยุดเมื่อยอดเพี้ยน)");
            setSafeStyle(resyncBtn, "color", configAutoResync ? "#00e676" : "#ffa726");
            setSafeStyle(resyncBtn, "borderColor", configAutoResync ? "#00e676" : "#ffa726");
        }

        if (cycleBadge) {
            setSafeText(cycleBadge, autoCycleRounds ? "🔁 วน: ON" : "⏹️ วน: OFF");
            setSafeStyle(cycleBadge, "color", autoCycleRounds ? "#ffea00" : "#7f8b9b");
            setSafeStyle(cycleBadge, "borderColor", autoCycleRounds ? "#ffea00" : "#2f4553");
        }

        if (cycleBtn) {
            setSafeText(cycleBtn, autoCycleRounds ? "🔁 ลูปรอบ: ON" : "⏹️ ลูป: OFF");
            setSafeStyle(cycleBtn, "color", autoCycleRounds ? "#ffea00" : "#7f8b9b");
            setSafeStyle(cycleBtn, "borderColor", autoCycleRounds ? "#ffea00" : "#2f4553");
        }

        const amt = calculateCurrentBetAmount();
        const displayAmt = `${amt} USDT`;

        if (modeBadge) {
            if (sessionTimeExpired || sessionRecoveryActive) {
                setSafeText(modeBadge, `⏳ ไม้ ${mStep}: ${amt}$ (พยุงจนบวก ${getEffectiveChance()}%)`);
                setSafeStyle(modeBadge, "background", "#3d2200");
                setSafeStyle(modeBadge, "color", "#ffea00");

            } else {
                setSafeText(modeBadge, `🎯 ไม้ ${mStep}: ${amt}$ (${getEffectiveChance()}%)`);
                setSafeStyle(modeBadge, "background", "#013e00");
                setSafeStyle(modeBadge, "color", "#00e676");
            }
        }

        if (nextBetEl) {
            setSafeText(nextBetEl, displayAmt);
            setSafeStyle(nextBetEl, "color", "#00e676");
        }

        if (miniStep) {
            setSafeText(miniStep, `ไม้ ${mStep} (${amt}$)`);
        }

        // อัปเดตข้อมูลเรดาร์สถิติและความน่าจะเป็น
        if (hudEls.radarRatioEl) {
            const totalRollsSample = statsUnderCount + statsOverCount;
            if (totalRollsSample > 0) {
                const uPct = Math.round((statsUnderCount / totalRollsSample) * 100);
                const oPct = 100 - uPct;
                setSafeText(hudEls.radarRatioEl, `ต่ำ ${uPct}% | สูง ${oPct}% (${totalRollsSample} ตา)`);
            } else {
                setSafeText(hudEls.radarRatioEl, `ต่ำ 50% | สูง 50%`);
            }
        }

        if (hudEls.survivalProbEl) {
            const survText = getSurvivalProbabilityText();
            setSafeText(hudEls.survivalProbEl, survText);
            setSafeStyle(hudEls.survivalProbEl, "color", "#00e676");
        }

        if (hudEls.radarAnomalyEl) {
            const totalRollsSample = statsUnderCount + statsOverCount;
            if (totalRollsSample >= 20) {
                const uPct = Math.round((statsUnderCount / totalRollsSample) * 100);
                if (uPct >= 72 || uPct <= 28) {
                    setSafeText(hudEls.radarAnomalyEl, `⚠️ กราฟเอียงหนัก (${uPct >= 72 ? 'ต่ำรัว' : 'สูงรัว'})`);
                    setSafeStyle(hudEls.radarAnomalyEl, "color", "#ff5252");
                    setSafeStyle(hudEls.radarAnomalyEl, "background", "#3a1010");
                } else if (uPct >= 62 || uPct <= 38) {
                    setSafeText(hudEls.radarAnomalyEl, `⚡ กราฟเริ่มเบี่ยง`);
                    setSafeStyle(hudEls.radarAnomalyEl, "color", "#ffa726");
                    setSafeStyle(hudEls.radarAnomalyEl, "background", "#2a2010");
                } else {
                    setSafeText(hudEls.radarAnomalyEl, `กราฟปกติ`);
                    setSafeStyle(hudEls.radarAnomalyEl, "color", "#7f8b9b");
                    setSafeStyle(hudEls.radarAnomalyEl, "background", "#1a242d");
                }
            } else {
                setSafeText(hudEls.radarAnomalyEl, `กำลังเก็บสถิติ`);
                setSafeStyle(hudEls.radarAnomalyEl, "color", "#7f8b9b");
                setSafeStyle(hudEls.radarAnomalyEl, "background", "#1a242d");
            }
        }

        if (startBalEl) setSafeText(startBalEl, formatNumber(startBalance, 4));
        if (currBalEl) setSafeText(currBalEl, formatNumber(currentBalance, 4));

        if (profitEl) {
            setSafeText(profitEl, (profit >= 0 ? "+" : "") + formatNumber(profit, 4) + " USDT");
            setSafeStyle(profitEl, "color", profit >= 0 ? "#00e676" : "#ff5252");
        }

        if (miniProfit) {
            setSafeText(miniProfit, (profit >= 0 ? "+" : "") + formatNumber(profit, 4) + "$");
            setSafeStyle(miniProfit, "color", profit >= 0 ? "#00e676" : "#ff5252");
        }

        if (snipesCountEl) {
            setSafeText(snipesCountEl, `🎯 ยิงเข้าเป้า: ${successfulSnipes} ครั้ง`);
        }

        if (winrateEl) {
            const wr = totalBets > 0 ? ((winsCount / totalBets) * 100).toFixed(1) : "0.0";
            setSafeText(winrateEl, `${wr}% (${winsCount}W / ${lossesCount}L - รวม ${totalBets})${getBetRateText()}`);
        }

        if (theoryEl) {
            const realWr = totalBets > 0 ? (winsCount / totalBets) * 100 : 0;
            const expectedEv = -0.01 * totalWagered; // RTP 99% → ขาดทุนคาดหวัง 1% ของยอดที่วาง
            const targetChance = parseFloat(configChance) || 68;
            const limitText = detectedMinBet !== null || detectedMaxBet !== null
                ? ` | เว็บ: ขั้นต่ำ ${formatBetAmount(detectedMinBet || AUTO_MIN_BET)}$${detectedMaxBet ? " สูงสุด " + formatBetAmount(detectedMaxBet) + "$" : ""}`
                : ` | ขั้นต่ำ ${formatBetAmount(AUTO_MIN_BET)}$ (default)`;
            // ถ้ามี strike ค้างอยู่ ให้แปรผลต่างลงบรรทัดนี้ด้วย (สถานะอาจถูกข้อความอื่นทับไปแล้ว)
            const desyncText = desyncStrikes > 0 && lastDesync.dom !== null
                ? ` | ⚠️ ยอดจริง ${formatNumber(lastDesync.dom, 6)} vs คำนวณ ${formatNumber(lastDesync.model, 6)} (ต่าง ${(lastDesync.diff >= 0 ? "+" : "−") + formatNumber(Math.abs(lastDesync.diff), 6)}) [${lastDesync.source || "?"}]`
                : "";
            setSafeText(theoryEl,
                `📊 จริง ${realWr.toFixed(1)}% vs ทฤษฎี ${targetChance.toFixed(0)}% | EV คาด ${expectedEv <= 0 ? "−" : "+"}${formatNumber(Math.abs(expectedEv), 6)} (วาง ${formatNumber(totalWagered, 5)}$) | แพ้ +${MARTINGALE_PCT}%/ไม้ รีเซ็ตที่ชนะติด ${MARTINGALE_RESET_WINS}${limitText}${desyncText}`);
            setSafeStyle(theoryEl, "color", desyncStrikes > 0 ? "#ffa726" : "#8596a5");
        }

        if (rngEl) {
            const audit = runRngAudit();
            if (!audit) {
                setSafeText(rngEl, `🧪 RNG: เก็บผลแล้ว ${rngRolls.length}/${200} ลูก`);
                setSafeStyle(rngEl, "color", "#8596a5");
            } else {
                const ok = audit.failed.length === 0;
                setSafeText(rngEl,
                    `🧪 RNG n=${audit.n} · ผ่าน ${audit.pass}/${audit.total} · min p=${audit.worst.toFixed(3)}${ok ? " ✓" : " ⚠ " + audit.failed.join(",")}${audit.pending > 0 ? ` · ⏳${audit.pending}` : ""}`);
                setSafeStyle(rngEl, "color", ok ? "#55e7ff" : "#ffa726");
            }
        }

        if (streakEl) {
            if (currentStreak > 0) {
                setSafeText(streakEl, `🔥 W${currentStreak}`);
                setSafeStyle(streakEl, "color", "#00e676");
            } else if (currentStreak < 0) {
                setSafeText(streakEl, `❄️ L${Math.abs(currentStreak)}`);
                setSafeStyle(streakEl, "color", "#ff5252");
            } else {
                setSafeText(streakEl, "-");
                setSafeStyle(streakEl, "color", "#b1bad3");
            }
        }

        if (startBtn) {
            startBtn.disabled = sessionRunning;
            setSafeStyle(startBtn, "opacity", sessionRunning ? "0.4" : "1");
            setSafeStyle(startBtn, "cursor", sessionRunning ? "not-allowed" : "pointer");
        }

        if (stopBtn) {
            stopBtn.disabled = !sessionRunning;
            setSafeStyle(stopBtn, "opacity", sessionRunning ? "1" : "0.4");
            setSafeStyle(stopBtn, "cursor", sessionRunning ? "pointer" : "not-allowed");
        }

        if (miniStartBtn) {
            miniStartBtn.disabled = sessionRunning;
            setSafeStyle(miniStartBtn, "opacity", sessionRunning ? "0.4" : "1");
            setSafeStyle(miniStartBtn, "cursor", sessionRunning ? "not-allowed" : "pointer");
        }

        if (miniStopBtn) {
            miniStopBtn.disabled = !sessionRunning;
            setSafeStyle(miniStopBtn, "opacity", sessionRunning ? "1" : "0.4");
            setSafeStyle(miniStopBtn, "cursor", sessionRunning ? "pointer" : "not-allowed");
        }
    }

    function createStealthPanel() {
        if (!document.body || hostContainer) return;

        hostContainer = document.createElement("div");
        hostContainer.style.all = "initial";

        const shadow = hostContainer.attachShadow({ mode: 'closed' });
        shadowRootRef = shadow;

        const wrapper = document.createElement("div");
        wrapper.style.cssText = `
            position: fixed;
            top: 60px;
            left: 20px;
            width: ${isPanelMinimized ? "270px" : "330px"};
            background: #1a242d;
            border: 1px solid #2f4553;
            border-radius: 10px;
            padding: ${isPanelMinimized ? "8px 10px" : "12px"};
            box-shadow: 0 8px 32px rgba(0,0,0,0.55);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            color: #fff;
            z-index: 9999999;
            font-size: 12px;
            user-select: none;
            transition: border-color 0.3s ease, box-shadow 0.3s ease;
        `;

        wrapper.innerHTML = `
            <div id="sniperDragHeader" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; border-bottom:1px solid #2f4553; padding-bottom:6px; cursor:move;">
                <div style="display:flex; align-items:center; gap:6px;">
                    <span id="sniperTitleStep" style="font-weight:bold; font-size:13px; color:#00e676;">🎯 MARTINGALE 68%</span>
                    <span style="font-size:9px; color:#7f8b9b;" title="รุ่นของโค้ด — ใช้ตรวจว่าติดตั้งไฟล์ล่าสุดหรือยัง">${BUILD_STAMP}</span>
                    <button id="sniperMinimizeBtn" style="background:#0f1923; border:1px solid #2f4553; border-radius:4px; color:#00e676; font-size:10px; padding:1px 5px; cursor:pointer;" title="ย่อ/ขยายหน้าจอเพื่อประหยัดพลังงาน">${isPanelMinimized ? "🔼" : "🔽"}</button>
                    <button id="sniperReloadBtn" style="background:#0f1923; border:1px solid #2f4553; border-radius:4px; color:#55e7ff; font-size:10px; padding:1px 5px; cursor:pointer;" title="🔄 รีเฟรชหน้าเว็บ (F5) ทันทีเพื่อล้างแคชและรีเซ็ตหน่วยความจำ">🔄</button>
                    <button id="sniperResetHistoryBtn" style="background:#0f1923; border:1px solid #ff5252; border-radius:4px; color:#ff5252; font-size:10px; padding:1px 5px; cursor:pointer;" title="🧹 ล้างประวัติทั้งหมด 100% เริ่มใหม่เหมือนเพิ่งติดตั้งบอท">🧹</button>
                    <button id="sniperAdvBtn" style="background:#0f1923; border:1px solid #2f4553; border-radius:4px; color:#ffea00; font-size:10px; padding:1px 5px; cursor:pointer;" title="ซ่อน/แสดงเครื่องมือเพิ่มเติม (SELF-TEST · RESYNC · เริ่มไม้ · เรดาร์ · สถิติ · RNG · Integrity)">🧰</button>
                </div>
                <div style="display:flex; gap:4px; align-items:center; flex-wrap:wrap; justify-content:flex-end;">
                    <span id="sniperAcctBadge" style="font-size:9px; background:#0f1923; border:1px solid #ffea00; padding:1px 5px; border-radius:4px; color:#ffea00; font-weight:bold; cursor:pointer; max-width:86px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="ยังจับชื่อบัญชีไม่ได้ — กดเพื่อตั้งชื่อเอง">👤 ?</span>
                    <button id="sniperCycleBadge" style="font-size:9px; background:#0f1923; border:1px solid #ffea00; padding:1px 5px; border-radius:4px; color:#ffea00; font-weight:bold; cursor:pointer;" title="ลูปรอบ — ON = ถึงเป้ากำไรแล้วเริ่มรอบใหม่ทันที / OFF = หยุดเมื่อถึงเป้า (กดเพื่อสลับ)">🔁 ON</button>
                </div>
            </div>

            <!-- COMPACT MINI BAR (แสดงเมื่อกดย่อหน้าต่างเพื่อประหยัดพลังงานจอ) -->
            <div id="sniperMiniBar" style="display:${isPanelMinimized ? 'flex' : 'none'}; align-items:center; justify-content:space-between; font-size:11px; margin-top:2px;">
                <div>
                    <span id="sniperMiniStep" style="font-weight:bold; color:#00e676;">ไม้ 1 (0.0002$)</span>
                    <span id="sniperMiniProfit" style="margin-left:8px; font-weight:bold; color:#00e676;">+0.0000$</span>
                </div>
                <div style="display:flex; gap:4px;">
                    <button id="sniperMiniReloadBtn" style="background:#0f1923; border:1px solid #2f4553; border-radius:4px; color:#55e7ff; font-size:10px; padding:2px 5px; cursor:pointer;" title="🔄 รีเฟรชหน้าเว็บ">🔄</button>
                    <button id="sniperMiniStartBtn" style="background:#00e701; color:#013e00; border:none; padding:3px 8px; border-radius:4px; font-weight:bold; font-size:10px; cursor:pointer;">START</button>
                    <button id="sniperMiniStopBtn" style="background:#ed4245; color:#fff; border:none; padding:3px 8px; border-radius:4px; font-weight:bold; font-size:10px; cursor:pointer;">STOP</button>
                </div>
            </div>

            <div id="sniperPanelBody" style="display:${isPanelMinimized ? 'none' : 'block'};">
                <!-- 🧰 ADVANCED 1: เครื่องมือ (ซ่อนไว้ กด 🧰 ที่หัวแผงเพื่อแสดง) -->
                <div class="sniperAdv" style="display:none;">
                <div style="display:flex; gap:6px; align-items:center; margin-bottom:6px;">
                    <span id="sniperEcoBadge" style="font-size:9px; background:#0f1923; border:1px solid #2f4553; padding:1px 5px; border-radius:4px; color:#7f8b9b; font-weight:bold;">🌿 FULL</span>
                    <span id="sniperAntiSleep" style="font-size:9px; background:#0f1923; padding:1px 5px; border-radius:4px; color:#7f8b9b; font-weight:bold;">IDLE</span>
                    <button id="sniperGoDiceBtn" style="font-size:9px; background:#0f1923; border:1px solid #55e7ff; padding:1px 6px; border-radius:4px; color:#55e7ff; font-weight:bold; cursor:pointer;" title="พาแท็บนี้ไปหน้า Stake Dice (ใช้ภาษาตามหน้าเว็บปัจจุบัน ไม่เปิดแท็บใหม่)">🎯 ไปหน้า Dice</button>
                    <span id="sniperAutoGoDiceBadge" style="font-size:9px; background:#0f1923; border:1px solid #00e676; padding:1px 5px; border-radius:4px; color:#00e676; font-weight:bold; cursor:pointer;" title="พาเว็บไปหน้า Dice เองเมื่อเปิดหน้า (ปิดได้ด้วยการกด)">🎯 auto: ON</span>
                    <span id="sniperSessionTimeBadge" style="font-size:9px; background:#0f1923; border:1px solid #ffea00; padding:1px 5px; border-radius:4px; color:#ffea00; font-weight:bold; cursor:pointer;" title="จบเซสชันอัตโนมัติเมื่อครบเวลา (15/30/60/ปิด) — กดเพื่อเปลี่ยน">⏱️ 30m</span>
                    <button id="sniperCopySummaryBtn" style="font-size:9px; background:#0f1923; border:1px solid #00e676; padding:1px 6px; border-radius:4px; color:#00e676; font-weight:bold; cursor:pointer;" title="คัดลอกสรุปเซสชันล่าสุดเป็น CSV 1 แถว (ไว้จด/วางในชีต) — ใช้ตอนวนบัญชี">📋 สรุป</button>
                    <span id="sniperTargetModeBadge" style="font-size:9px; background:#0f1923; border:1px solid #ffea00; padding:1px 5px; border-radius:4px; color:#ffea00; font-weight:bold; cursor:pointer;" title="โหมดเป้ากำไร: USD = ยอดคงที่ / % = เปอร์เซ็นต์ของทุนตั้งต้น (กดเพื่อสลับ)">🎯 USD</span>
                </div>
                <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:3px; margin-bottom:8px;">
                    <button id="sniperAutoBtn" style="background:#0f1923; border:1px solid #00e676; border-radius:4px; padding:4px 1px; font-size:9px; font-weight:bold; color:#00e676; cursor:pointer;" title="เริ่มอัตโนมัติ">
                        🚀 AUTO: ON
                    </button>
                    <button id="sniperCycleBtn" style="background:#0f1923; border:1px solid #ffea00; border-radius:4px; padding:4px 1px; font-size:9px; font-weight:bold; color:#ffea00; cursor:pointer;" title="ลูปรอบ">
                        🔁 ลูป: ON
                    </button>
                    <button id="sniperEcoBtn" style="background:#0f1923; border:1px solid #00e676; border-radius:4px; padding:4px 1px; font-size:9px; font-weight:bold; color:#00e676; cursor:pointer;" title="เปิด/ปิดโหมดประหยัดพลังงาน (ปิดกราฟิก 3D/ลดการเรนเดอร์)">
                        🌿 ECO: OFF
                    </button>
                </div>

                <button id="sniperSelfTestBtn" style="width:100%; background:#0f1923; border:1px dashed #55e7ff; border-radius:4px; padding:3px; font-size:9px; font-weight:bold; color:#55e7ff; cursor:pointer; margin-bottom:5px;" title="ตรวจว่าบอทมองเห็นช่องยอด/โอกาส/ปุ่ม/ยอดเงิน/ผลทอย และเขียนค่าลงเว็บได้จริงหรือไม่ - ไม่กดเดิมพัน ไม่เปลี่ยนยอดเงิน (Alt+T)">🧪 SELF-TEST (ไม่เดิมพัน)</button>
                <button id="sniperResyncBtn" style="width:100%; background:#0f1923; border:1px dashed #ffa726; border-radius:4px; padding:3px; font-size:9px; font-weight:bold; color:#ffa726; cursor:pointer; margin-bottom:8px;" title="เปิด = เมื่อยอดจริงเพี้ยน 3 ครั้งติด ระบบจะยอมรับยอดจริงบนหน้าจอเป็นยอดใหม่แล้วเล่นต่อ (จำกัด 5 ครั้ง/เซสชัน) แทนการหยุดทันที">↔️ AUTO-RESYNC: OFF</button>

                </div>
                <!-- /ADVANCED 1 -->

                <!-- MARTINGALE PARAMETERS (แพ้ +73.11% · ชนะติด 3 รีเซ็ต) -->
                <div style="background:#0f1923; border:1px solid #243442; border-radius:8px; padding:8px; margin-bottom:8px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                        <span id="sniperParamStep" style="color:#00e676; font-size:11px; font-weight:bold;">⚙️ พารามิเตอร์ Martingale:</span>
                        <button id="sniperResetBtn" style="background:#1a242d; border:1px solid #00e676; border-radius:4px; padding:2px 6px; font-size:10px; font-weight:bold; color:#00e676; cursor:pointer;" title="รีเซ็ตเป็นค่ามาตรฐาน (เดิมพันคงที่ 0.0002$/ไม้)">
                            ✨ รีเซ็ตค่า
                        </button>
                    </div>
                    <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:6px;">
                        <div>
                            <div style="color:#8596a5; font-size:10px; margin-bottom:2px;">ยอดฐาน ไม้ 1 ($):</div>
                            <input id="sniperInRealBase" type="text" value="${configRealBaseBet}" style="width:100%; background:#1a242d; border:1px solid #2f4553; border-radius:4px; color:#fff; font-size:11px; padding:3px 4px; box-sizing:border-box; outline:none; font-family:inherit;">
                        </div>
                        <div>
                            <div id="sniperTargetLabel" style="color:#ffea00; font-size:10px; margin-bottom:2px;">${configTargetMode === "pct" ? "เป้ากำไร (%):" : "เป้ากำไร ($):"}</div>
                            <input id="sniperInTarget" type="text" value="${configProfitTarget}" style="width:100%; background:#1a242d; border:1px solid #ffea00; border-radius:4px; color:#ffea00; font-size:11px; padding:3px 4px; box-sizing:border-box; outline:none; font-family:inherit;">
                        </div>
                        <div>
                            <div style="color:#55e7ff; font-size:10px; margin-bottom:2px;">โอกาสชนะ (%):</div>
                            <input id="sniperInChance" type="text" value="${getEffectiveChance()}" style="width:100%; background:#1a242d; border:1px solid #2f4553; border-radius:4px; color:#55e7ff; font-size:11px; padding:3px 4px; box-sizing:border-box; outline:none; font-family:inherit;">
                        </div>
                    </div>
                </div>

                <!-- SAFETY BADGE -->
                <div style="background:#0f1923; border:1px solid #00e676; border-radius:6px; padding:5px 6px; font-size:10px; font-weight:bold; color:#00e676; margin-bottom:8px; text-align:center;">
                    🛡️ Martingale <span id="sniperSafetyStep">+73.11%/ไม้</span> • ชนะติด 3 = รีเซ็ต • <span id="sniperSafetyStop">ไม่จำกัดไม้</span>
                </div>

                <!-- สลับ Under/Over ทุกตา: [เปิด / ปิด] -->
                <div style="display:flex; align-items:center; justify-content:space-between; background:#0f1923; border:1px solid #243442; border-radius:6px; padding:6px 10px; margin-bottom:8px;">
                    <span style="color:#b1bad3; font-size:11px; font-weight:bold;">สลับ Under/Over ทุกตา:</span>
                    <button id="sniperToggleAltBtn" style="background:#0f1923; border:1px solid #00e676; border-radius:4px; padding:3px 12px; font-size:11px; font-weight:bold; color:#00e676; cursor:pointer;" title="คลิกเพื่อ เปิด / ปิด การสลับฝั่งทุกตา">เปิด (ON)</button>
                </div>

                <!-- ความเร็ว Instant Bet (เดิมพันทันที): [เปิด / ปิด] -->
                <div style="display:flex; align-items:center; justify-content:space-between; background:#0f1923; border:1px solid #243442; border-radius:6px; padding:6px 10px; margin-bottom:8px;">
                    <span style="color:#b1bad3; font-size:11px; font-weight:bold;">⚡ เดิมพันทันที (Instant Bet):</span>
                    <button id="sniperInstantBetBtn" style="background:#0f1923; border:1px solid #00e676; border-radius:4px; padding:3px 12px; font-size:11px; font-weight:bold; color:#00e676; cursor:pointer;" title="เปิดโหมดเดิมพันทันที ตัดแอนิเมชันลูกเต๋าเพื่อเร่งความเร็ว 10 เท่า">เปิด (ON) ⚡</button>
                </div>

                <div style="margin-bottom:8px; min-height:20px;">
                    <span style="color:#b1bad3; font-size:11px;">สถานะ:</span>
                    <span id="sniperStatusText" style="font-weight:bold; color:#b1bad3; margin-left:4px; font-size:11px;">พร้อมเริ่มงาน</span>
                </div>

                <!-- REAL-TIME STATUS BOX -->
                <div style="background:#0f1923; border:1px solid #243442; border-radius:8px; padding:8px; margin-bottom:8px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                        <span style="color:#b1bad3; font-size:11px;">สถานะโหมด:</span>
                        <span id="sniperModeBadge" style="font-size:10px; font-weight:bold; background:#013e00; padding:2px 6px; border-radius:4px; color:#00e676;">🎯 ไม้ 1: 0.0002$</span>
                    </div>
                    <div style="display:flex; justify-content:space-between; font-size:12px; margin-top:2px;">
                        <span style="color:#b1bad3;">ไม้ถัดไป:</span>
                        <span id="sniperNextBet" style="font-weight:bold; color:#00e676;">0.0002 USDT</span>
                    </div>
                    <div style="display:flex; justify-content:space-between; font-size:11px; margin-top:4px; border-top:1px dashed #243442; padding-top:4px;">
                        <span style="color:#00e676; font-weight:bold;" id="sniperStatsCount">🎯 ยิงเข้าเป้า: 0</span>
                    </div>
                </div>

                <!-- 🧰 ADVANCED 2: สถิติ/เรดาร์ -->
                <div class="sniperAdv" style="display:none;">
                <!-- PROBABILITY & RADAR STATS BOX -->
                <div style="background:#0f1923; border:1px solid #243442; border-radius:8px; padding:6px 8px; margin-bottom:8px; font-size:11px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                        <span style="color:#55e7ff; font-weight:bold;">📊 เรดาร์ความน่าจะเป็น:</span>
                        <span id="sniperRadarRatio" style="color:#b1bad3; font-size:10px;">ต่ำ 50% | สูง 50%</span>
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center; font-size:10px;">
                        <span id="sniperSurvivalProb" style="color:#00e676; font-weight:bold;">โอกาสรอด: 100.00%</span>
                        <span id="sniperRadarAnomaly" style="color:#7f8b9b; font-size:9px; background:#1a242d; padding:1px 4px; border-radius:3px;">กราฟปกติ</span>
                    </div>
                </div>

                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:4px; font-size:11px; margin-bottom:6px;">
                    <div><span style="color:#b1bad3;">Streak:</span> <span id="sniperStreak" style="font-weight:bold;">-</span></div>
                    <div><span style="color:#b1bad3;">สถิติ:</span> <span id="sniperWinrate">0.0% (0W/0L)</span></div>
                </div>

                <div id="sniperTheory" style="font-size:10px; color:#8596a5; background:#0f1923; border:1px dashed #243442; border-radius:6px; padding:4px 6px; margin-bottom:6px; line-height:1.4;">📊 รอข้อมูล...</div>
                <div id="sniperRng" style="font-size:10px; color:#8596a5; background:#0f1923; border:1px dashed #55e7ff; border-radius:6px; padding:4px 6px; margin-bottom:6px; line-height:1.4;" title="NIST SP 800-22 ครบ 15 เทสต์: Monobit/Block/Runs/LongRun/Rank/DFT/NonOverlap/Overlap/Universal/LinComplex/Serial/ApEn/Cusum/Excursions/ExcVar — p ≥ 0.01 = ผ่าน · เทสต์ที่ขึ้น ⏳=ข้อมูลยังไม่พอ/สุ่มเดินไม่ถึง 20 รอบ (Universal ต้อง ~1,000,000 บิต) · n=32,768=buffer เต็ม · p หลุด 1 ตัวเป็นเรื่องปกติทางสถิติ (~1%/เทสต์)">🧪 RNG: รอผลอย่างน้อย 200 ลูก</div>

                <div id="sniperIntegrity" style="font-size:9px; color:#7f8b9b; background:#0f1923; border:1px dashed #243442; border-radius:6px; padding:3px 5px; margin-bottom:6px; line-height:1.5;" title="ตัวเลขภายในที่เดิมคำนวณแล้วไม่แสดง: DD=drawdown สูงสุด, Waged=ยอดเดิมพันสะสม, Peak=ยอดสูงสุด, Gaps=ครั้งที่ยอดเดินไม่ตรง, Drift=ครั้งที่ DOM เปลี่ยน, Resync/Sync/Cut=ตัวนับของ DESYNC guard">🩺 DD 0 · Waged 0 · Peak 0 · Gaps 0 · Drift 0</div>
                </div>
                <!-- /ADVANCED 2 -->

                <div style="border-top:1px dashed #2f4553; margin:6px 0; padding-top:6px; font-size:11px;">
                    <div style="display:flex; justify-content:space-between;"><span style="color:#b1bad3;">Start Bal:</span> <span id="sniperStartBal">-</span></div>
                    <div style="display:flex; justify-content:space-between;"><span style="color:#b1bad3;">Current:</span> <span id="sniperCurrBal">-</span></div>
                    <div style="display:flex; justify-content:space-between; font-weight:bold; font-size:12px; margin-top:2px;">
                        <span style="color:#b1bad3;">กำไร/ขาดทุนสุทธิ (P/L):</span> <span id="sniperProfit">0.00000000 USDT</span>
                    </div>
                </div>

                <div style="display:flex; gap:6px; margin-top:10px;">
                    <button id="sniperStartBtn" style="flex:1; background:#00e701; color:#013e00; border:none; padding:8px 4px; border-radius:6px; font-weight:bold; font-size:12px; cursor:pointer;" title="เริ่มเซสชันทันที">
                        START
                    </button>
                    <button id="sniperStopBtn" style="flex:1; background:#ed4245; color:#fff; border:none; padding:8px 4px; border-radius:6px; font-weight:bold; font-size:12px; cursor:pointer;" title="หยุดยิง">
                        STOP
                    </button>
                </div>
                <div style="margin-top:6px; font-size:10px; color:#7f8b9b; text-align:center;">
                    กด ESC เพื่อหยุดฉุกเฉิน • พอร์ตปลอดภัย 100%
                </div>
            </div>
        `;

        shadow.appendChild(wrapper);
        document.body.appendChild(hostContainer);

        // Bind references
        hudEls = {
            wrapper: wrapper,
            minimizeBtn: shadow.getElementById("sniperMinimizeBtn"),
            reloadBtn: shadow.getElementById("sniperReloadBtn"),
            resetHistoryBtn: shadow.getElementById("sniperResetHistoryBtn"),
            advBtn: shadow.getElementById("sniperAdvBtn"),
            advNodes: shadow.querySelectorAll(".sniperAdv"),
            miniReloadBtn: shadow.getElementById("sniperMiniReloadBtn"),
            ecoBadge: shadow.getElementById("sniperEcoBadge"),
            cycleBadge: shadow.getElementById("sniperCycleBadge"),
            acctBadge: shadow.getElementById("sniperAcctBadge"),
            ecoBtn: shadow.getElementById("sniperEcoBtn"),
            resyncBtn: shadow.getElementById("sniperResyncBtn"),
            selfTestBtn: shadow.getElementById("sniperSelfTestBtn"),
            panelBody: shadow.getElementById("sniperPanelBody"),
            miniBar: shadow.getElementById("sniperMiniBar"),
            miniStep: shadow.getElementById("sniperMiniStep"),
            miniProfit: shadow.getElementById("sniperMiniProfit"),
            miniStartBtn: shadow.getElementById("sniperMiniStartBtn"),
            miniStopBtn: shadow.getElementById("sniperMiniStopBtn"),
            antiSleepBadge: shadow.getElementById("sniperAntiSleep"),
            goDiceBtn: shadow.getElementById("sniperGoDiceBtn"),
            autoGoDiceBadge: shadow.getElementById("sniperAutoGoDiceBadge"),
            sessionTimeBadge: shadow.getElementById("sniperSessionTimeBadge"),
            copySummaryBtn: shadow.getElementById("sniperCopySummaryBtn"),
            targetModeBadge: shadow.getElementById("sniperTargetModeBadge"),
            targetLabel: shadow.getElementById("sniperTargetLabel"),
            autoBtn: shadow.getElementById("sniperAutoBtn"),
            titleStep: shadow.getElementById("sniperTitleStep"),
            paramStep: shadow.getElementById("sniperParamStep"),
            safetyStep: shadow.getElementById("sniperSafetyStep"),
            safetyStop: shadow.getElementById("sniperSafetyStop"),
            toggleAltBtn: shadow.getElementById("sniperToggleAltBtn"),
            instantBetBtn: shadow.getElementById("sniperInstantBetBtn"),
            cycleBtn: shadow.getElementById("sniperCycleBtn"),
            resetBtn: shadow.getElementById("sniperResetBtn"),
            inRealBase: shadow.getElementById("sniperInRealBase"),
            inTarget: shadow.getElementById("sniperInTarget"),
            inChance: shadow.getElementById("sniperInChance"),
            statusText: shadow.getElementById("sniperStatusText"),
            modeBadge: shadow.getElementById("sniperModeBadge"),
            nextBetEl: shadow.getElementById("sniperNextBet"),
            snipesCountEl: shadow.getElementById("sniperStatsCount"),
            streakEl: shadow.getElementById("sniperStreak"),
            theoryEl: shadow.getElementById("sniperTheory"),
            rngEl: shadow.getElementById("sniperRng"),
            integrityEl: shadow.getElementById("sniperIntegrity"),
            winrateEl: shadow.getElementById("sniperWinrate"),
            radarRatioEl: shadow.getElementById("sniperRadarRatio"),
            survivalProbEl: shadow.getElementById("sniperSurvivalProb"),
            radarAnomalyEl: shadow.getElementById("sniperRadarAnomaly"),
            startBalEl: shadow.getElementById("sniperStartBal"),
            currBalEl: shadow.getElementById("sniperCurrBal"),
            profitEl: shadow.getElementById("sniperProfit"),
            startBtn: shadow.getElementById("sniperStartBtn"),
            stopBtn: shadow.getElementById("sniperStopBtn")
        };

        // Event listeners
        hudEls.startBtn.addEventListener("click", () => startSession());
        hudEls.stopBtn.addEventListener("click", () => stopSession("🛑 ผู้ใช้สั่งหยุด"));
        hudEls.miniStartBtn.addEventListener("click", () => startSession());
        hudEls.miniStopBtn.addEventListener("click", () => stopSession("🛑 ผู้ใช้สั่งหยุด"));
        hudEls.minimizeBtn.addEventListener("click", () => toggleMinimizePanel());
        hudEls.acctBadge.addEventListener("click", () => { setAccountNameManually(); });
        hudEls.goDiceBtn.addEventListener("click", () => { goToDicePage(); });
        hudEls.autoGoDiceBadge.addEventListener("click", () => {
            configAutoGoDice = !configAutoGoDice;
            syncAutoGoDiceBadge();
            updateStatusText(configAutoGoDice ? "🎯 ไปหน้า Dice อัตโนมัติ: เปิด" : "🎯 ไปหน้า Dice อัตโนมัติ: ปิด", configAutoGoDice ? "#00e676" : "#7f8b9b");
        });
        hudEls.sessionTimeBadge.addEventListener("click", () => { cycleSessionTimeLimit(); });
        hudEls.copySummaryBtn.addEventListener("click", () => { copySummaryToClipboard(); });
        hudEls.targetModeBadge.addEventListener("click", () => { toggleTargetMode(); });
        // 🧰 ซ่อน/แสดงเครื่องมือเพิ่มเติม (ค่าเริ่มต้น: ซ่อน เพื่อให้แผงโล่ง)
        let advOpen = false;
        hudEls.advBtn.addEventListener("click", () => {
            advOpen = !advOpen;
            if (hudEls.advNodes) hudEls.advNodes.forEach((n) => { n.style.display = advOpen ? "" : "none"; });
            setSafeText(hudEls.advBtn, advOpen ? "🧰▾" : "🧰");
        });
        hudEls.reloadBtn.addEventListener("click", () => {
            log("🔄 ผู้ใช้สั่งรีเฟรชหน้าเว็บ (Reloading page)...", true);
            window.location.reload();
        });
        if (hudEls.resetHistoryBtn) {
            hudEls.resetHistoryBtn.addEventListener("click", () => {
                if (confirm("🧹 คุณต้องการล้างประวัติ สถิติ และหน่วยความจำเดิมทั้งหมดเพื่อเริ่มต้นใหม่ 100% ใช่หรือไม่?")) {
                    clearAllBotHistory(true);
                }
            });
        }
        hudEls.miniReloadBtn.addEventListener("click", () => {
            log("🔄 ผู้ใช้สั่งรีเฟรชหน้าเว็บ (Reloading page)...", true);
            window.location.reload();
        });
        hudEls.ecoBtn.addEventListener("click", () => { toggleEcoMode(); });
        if (hudEls.ecoBadge) {
            hudEls.ecoBadge.style.cursor = "pointer";
            hudEls.ecoBadge.addEventListener("click", () => { toggleEcoMode(); });
        }
        hudEls.resyncBtn.addEventListener("click", () => {
            configAutoResync = !configAutoResync;
            if (!configAutoResync) resyncCount = 0;
            log(configAutoResync
                ? `↔️ AUTO-RESYNC เปิด: ยอดเพี้ยนติด 3 ครั้ง → ยอมรับยอดจริงแล้วเล่นต่อ (สูงสุด ${RESYNC_LIMIT} ครั้ง/เซสชัน)`
                : "↔️ AUTO-RESYNC ปิด: ยอดเพี้ยนติด 3 ครั้ง → หยุดเซสชัน", true);
            updateUI();
        });
        hudEls.selfTestBtn.addEventListener("click", () => {
            runSelfTest();
        });
        hudEls.autoBtn.addEventListener("click", () => {
            toggleAutoStart();
        });
        const toggleCycle = () => {
            autoCycleRounds = !autoCycleRounds;
            log(autoCycleRounds ? "🔁 ลูปรอบ: ON — ถึงเป้ากำไรแล้วเริ่มรอบใหม่ทันที" : "⏹️ ลูปรอบ: OFF — ถึงเป้ากำไรแล้วหยุด", true);
            updateUI();
        };
        hudEls.cycleBtn.addEventListener("click", toggleCycle);
        hudEls.cycleBadge.addEventListener("click", toggleCycle);
        if (hudEls.toggleAltBtn) {
            hudEls.toggleAltBtn.addEventListener("click", () => {
                configAlternateRoll = !configAlternateRoll;
                if (!configAlternateRoll) currentRollSide = "under";
                applyRollSide();
                updateUI();
                log(configAlternateRoll ? "🎲 สลับ Under/Over ทุกตา: เปิด (ON)" : "🎲 สลับ Under/Over ทุกตา: ปิด (OFF) — แทง Under ฝั่งเดียว", true);
            });
        }
        if (hudEls.instantBetBtn) {
            hudEls.instantBetBtn.addEventListener("click", async () => {
                updateStatusText("⚡ กำลังตรวจสอบและเปิด Instant Bet...", "#ffea00");
                const res = await ensureInstantBet();
                updateStatusText(`⚡ ${res}`, "#00e676");
                log(`⚡ [INSTANT BET]: ${res}`, true);
            });
        }
        hudEls.resetBtn.addEventListener("click", () => {
            clearAllBotHistory(true);
            configRealBaseBet = FIXED_BASE_BET;
            configProfitTarget = generateDynamicTarget(getBalance() || currentBalance);
            configChance = "68";
            configAlternateRoll = true;
            currentRollSide = "under";
            pendingRollSide = "under";
            syncHUDInputs();
            applyBetSettings();
            updateUI();
            log("✨ รีเซ็ตพารามิเตอร์และล้างประวัติเดิมเรียบร้อย 100%", true);
        });

        // อัปเดตค่าในหน่วยความจำทันทีที่พิมพ์ (In-Memory Only ไร้ร่องรอยใน Storage)
        const onBaseInput = (e) => {
            const val = parseFloat(e.target.value);
            if (val > 0) {
                // เดิมพันคงที่: ค่าที่พิมพ์มีผลทุกไม้ทันที (ต่ำกว่าขั้นต่ำของเว็บเมื่อไร ระบบจะปรับขึ้นเองตอนตั้งยอด)
                configRealBaseBet = (val >= 0.01) ? val.toFixed(2) : String(val);
            }
            applyBetSettings();
            updateUI();
        };
        hudEls.inRealBase.addEventListener("input", onBaseInput);
        hudEls.inRealBase.addEventListener("change", onBaseInput);

        const onTargetInput = (e) => {
            const val = parseFloat(e.target.value);
            if (val > 0) configProfitTarget = val;
            updateUI();
        };
        hudEls.inTarget.addEventListener("input", onTargetInput);
        hudEls.inTarget.addEventListener("change", onTargetInput);

        const onChanceInput = (e) => {
            const val = parseFloat(e.target.value);
            if (val > 0 && val <= 98) configChance = String(val);
            applyBetSettings();
            updateUI();
        };
        hudEls.inChance.addEventListener("input", onChanceInput);
        hudEls.inChance.addEventListener("change", onChanceInput);

        // Draggable
        makeDraggable(shadow.getElementById("sniperDragHeader"), wrapper);

        updateUI();
    }

    function toggleEcoMode() {
        configEcoMode = !configEcoMode;
        applyEcoStyles(configEcoMode);
        // ⚡ เปิด Instant Bet (เดิมพันทันที) ล่วงหน้าตั้งแต่โหลดหน้าเว็บ
        setTimeout(() => { try { ensureInstantBet(); } catch (e) {} }, 1500);
        updateUI();
        log(configEcoMode ? "🌱 เปิดโหมด ECO: ปิดกราฟิกและแอนิเมชัน ลดโหลด CPU/GPU สูงสุด" : "🌿 ปิดโหมด ECO: เปิดแสดงผลกราฟิกปกติ", true);
    }

    function setMinimizePanel(minimized) {
        isPanelMinimized = Boolean(minimized);
        if (hudEls.panelBody) {
            hudEls.panelBody.style.display = isPanelMinimized ? "none" : "block";
        }
        if (hudEls.miniBar) {
            hudEls.miniBar.style.display = isPanelMinimized ? "flex" : "none";
        }
        if (hudEls.minimizeBtn) {
            hudEls.minimizeBtn.textContent = isPanelMinimized ? "🔼" : "🔽";
            hudEls.minimizeBtn.title = isPanelMinimized ? "ขยายแผงควบคุมเต็มรูปแบบ" : "ย่อขนาดเพื่อประหยัดพลังงาน";
        }
        if (hudEls.wrapper) {
            hudEls.wrapper.style.width = isPanelMinimized ? "270px" : "330px";
            hudEls.wrapper.style.padding = isPanelMinimized ? "8px 10px" : "12px";
        }
    }

    function toggleMinimizePanel() {
        setMinimizePanel(!isPanelMinimized);
    }

    function makeDraggable(header, panel) {
        let isDragging = false;
        let startX, startY, initialLeft, initialTop;

        header.addEventListener("mousedown", (e) => {
            if (e.target.tagName === "INPUT" || e.target.tagName === "BUTTON") return;
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            const rect = panel.getBoundingClientRect();
            initialLeft = rect.left;
            initialTop = rect.top;

            const onMouseMove = (e) => {
                if (!isDragging) return;
                const dx = e.clientX - startX;
                const dy = e.clientY - startY;
                panel.style.left = `${Math.max(10, initialLeft + dx)}px`;
                panel.style.top = `${Math.max(10, initialTop + dy)}px`;
            };

            const onMouseUp = () => {
                isDragging = false;
                window.removeEventListener("mousemove", onMouseMove);
                window.removeEventListener("mouseup", onMouseUp);
            };

            window.addEventListener("mousemove", onMouseMove);
            window.addEventListener("mouseup", onMouseUp);
        });
    }

    // ==================================================
    // 11. BOOTSTRAP INITIALIZATION
    // ==================================================
    function init() {
        if (isInitialized) return;
        isInitialized = true;

        applyEcoStyles(configEcoMode);
        setTimeout(() => { try { ensureInstantBet(); } catch (e) {} }, 1500);
        BotMemory.restore();
        DailyStats.load();
        log("🔖 BUILD " + BUILD_STAMP + " — martingale +" + MARTINGALE_PCT + "% / self-test / ledger / tab-guard • ยอดฐาน = " + configRealBaseBet + "$", true);

        initTabGuard();
        if (tabChannel) {
            setInterval(function () { if (sessionRunning) broadcastTabState("running"); }, 3000);

            syncAccountBadge();
            syncAutoGoDiceBadge();
            syncSessionTimeBadge();
            syncTargetModeBadge();
            maybeAutoGoDice();
        }

        window.addEventListener("keydown", function (e) {
            if (e.altKey && !e.ctrlKey && !e.metaKey) {
                const k = String(e.key || "").toLowerCase();
                if (k === "t") { e.preventDefault(); runSelfTest(); }
                else if (k === "l") { e.preventDefault(); copyLedger(); }
            }
        });

        const checkBody = setInterval(() => {
            if (document.body) {
                clearInterval(checkBody);
                createStealthPanel();
                if (configAutoStart) initAutoStartSequence();
            }
        }, 100);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
