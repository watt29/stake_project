// ==UserScript==
// @name Stake Dice Hybrid Engine (ล็อกเฉพาะปุ่ม bet-button แท้ 100% • ปิดหน้าต่างความโปร่งใสอัตโนมัติ)
// @namespace http://tampermonkey.net/
// @version 2026.11.18.121
// @description Stake Dice Hybrid Engine • ล็อกเฉพาะปุ่มเดิมพัน data-testid="bet-button" แท้ 100% กันกดโดนปุ่มความโปร่งใส • Auto Close Modals • ขั้นต่ำ 0.00012 USDT
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
    // 🔖 เวอร์ชันเดียวทั้งระบบ — "version" ใน manifest.json ต้องตรงกับ EXT_VERSION เสมอ
    const EXT_VERSION = "2.4.83";
    const BUILD_NO = 216;
    const BUILD_STAMP = "v" + EXT_VERSION + "+build" + BUILD_NO + "-realhybrid";
    const BUILD_SHORT = "v" + EXT_VERSION + "+" + BUILD_NO;
    try { window.__stakeHybridInstanceId = BUILD_SHORT + "-" + Math.random().toString(36).slice(2, 7); } catch (e) {}

    // 🛡️ GUARD กันโหลดซ้ำ — ให้ "build ใหม่กว่าชนะ" เสมอ
    //    (เดิม flag เดี่ยวทำให้หลัง Reload extension ตัวใหม่ถูกบล็อก → บอทตายจนกว่าจะกด F5)
    const MY_STAMP = EXT_VERSION + "+" + BUILD_NO;
    let SUPERSEDED = false;

    function buildWeight(stamp) {
        const m = String(stamp || "").match(/(\d+)\.(\d+)\.(\d+)\+(\d+)/);
        if (!m) return 0;
        return (parseInt(m[1], 10) * 1e9) + (parseInt(m[2], 10) * 1e7) + (parseInt(m[3], 10) * 1e5) + parseInt(m[4], 10);
    }

    try {
        const prev = window.__stakeHybridActive;
        if (prev && prev.stamp === MY_STAMP) {
            // build เดียวกันรันซ้ำ (เช่น inject ซ้ำ) → ตัวที่สองหยุด
            try { console.warn("[stake] duplicate instance skipped (" + MY_STAMP + ")"); } catch (e) {}
            return;
        }
        if (prev && prev.stamp && buildWeight(prev.stamp) >= buildWeight(MY_STAMP)) {
            // ตัวที่ทำงานอยู่ใหม่กว่าหรือเท่ากัน → ตัวนี้ยอมถอย
            try { console.warn("[stake] older instance skipped (" + MY_STAMP + " < " + prev.stamp + ")"); } catch (e) {}
            return;
        }
        if (prev && prev.stamp) {
            // 🆕 build ใหม่กว่า: สั่งตัวเก่าปิดตัวลง (ถ้ามันรองรับ) แล้วเข้าแทน
            try { if (typeof prev.shutdown === "function") prev.shutdown(); } catch (e) {}
            try { window.__stakeHybridActive = { stamp: MY_STAMP, supersededStamp: prev.stamp, startedAt: Date.now(), shutdown: null }; } catch (e) {}
            // 🚚 ให้หน้าเว็บโหลดใหม่ 1 ครั้ง เพื่อล้าง instance เก่าที่ค้างในหน่วยความจำ (กัน loop ด้วย sessionStorage)
            try {
                const KEY = "__stakeHybridReloadFor";
                if (sessionStorage.getItem(KEY) !== MY_STAMP) {
                    sessionStorage.setItem(KEY, MY_STAMP);
                    location.reload();
                    return;
                }
            } catch (e) {}
        } else {
            window.__stakeHybridActive = { stamp: MY_STAMP, startedAt: Date.now(), shutdown: null };
        }
    } catch (e) {}

    // ให้ build ถัดไปสั่งปิดตัวนี้ได้ + ตรวจตัวเองว่าโดนแทนที่แล้วหรือยัง
    try {
        if (window.__stakeHybridActive && window.__stakeHybridActive.stamp === MY_STAMP) {
            window.__stakeHybridActive.shutdown = function () { SUPERSEDED = true; };
        }
    } catch (e) {}

    function selfSupersededCheck() {
        try {
            const cur = window.__stakeHybridActive;
            if (!cur || !cur.stamp) return false;
            if (cur.stamp === MY_STAMP) return false;
            if (buildWeight(cur.stamp) > buildWeight(MY_STAMP)) {
                if (!SUPERSEDED) {
                    SUPERSEDED = true;
                    try { log("🔄 ถูก build ใหม่กว่าแทนที่ (" + MY_STAMP + " → " + cur.stamp + ") — ตัวนี้หยุดทำงาน", true); } catch (e) {}
                }
                return true;
            }
        } catch (e) {}
        return false;
    }

    // ==================================================
    // 0. HIGH-SPEED NETWORK INTERCEPTOR (FETCH & XHR)
    // ==================================================
    let onDiceRollCallback = null;

    function toFiniteNum(v) {
        if (typeof v === 'number') return isFinite(v) ? v : null;
        if (typeof v === 'string' && v.trim() !== '') {
            const n = parseFloat(v);
            return isFinite(n) ? n : null;
        }
        return null;
    }

    function findRollObject(node, depth, allowDeep) {
        if (!node || typeof node !== 'object' || depth > 5) return null;
        // Fast exact match for Stake GraphQL diceRoll payload
        if (node.diceRoll && typeof node.diceRoll === 'object') return node.diceRoll;
        if (node.data && node.data.diceRoll && typeof node.data.diceRoll === 'object') return node.data.diceRoll;
        if (!allowDeep) return null;
        if (
            typeof node.payoutMultiplier === 'number' &&
            node.state && typeof node.state === 'object' && typeof node.state.result === 'number'
        ) {
            return node;
        }
        for (const key in node) {
            if (!Object.prototype.hasOwnProperty.call(node, key)) continue;
            if (Array.isArray(node[key])) continue; // ข้าม array เช่น betList/highRollers กันอ่านผลคนอื่นผิด
            const child = node[key];
            if (child && typeof child === 'object') {
                const found = findRollObject(child, depth + 1, allowDeep);
                if (found) return found;
            }
        }
        return null;
    }

    // หายอดเงิน "จริงจากเซิร์ฟเวอร์" ใน payload ของ API (รองรับทั้ง number/string และ array balances ตาม currency)
    function findBalanceValue(node, depth, targetCurrency) {
        if (!node || typeof node !== 'object' || depth > 6) return null;
        if (Array.isArray(node)) {
            for (let i = 0; i < node.length; i++) {
                const item = node[i];
                if (item && typeof item === 'object' && item.available && typeof item.available === 'object') {
                    const cur = String(item.available.currency || item.currency || '').toLowerCase();
                    if (!targetCurrency || !cur || cur === targetCurrency) {
                        const amt = toFiniteNum(item.available.amount);
                        if (amt !== null && amt > 0) return amt;
                    }
                }
            }
            return null;
        }
        const directBal = toFiniteNum(node.balance);
        if (directBal !== null && directBal > 0) return directBal;
        if (node.available && typeof node.available === 'object') {
            const cur = String(node.available.currency || node.currency || '').toLowerCase();
            if (!targetCurrency || !cur || cur === targetCurrency) {
                const amt = toFiniteNum(node.available.amount);
                if (amt !== null && amt > 0) return amt;
            }
        }
        if (node.balances && typeof node.balances === 'object') {
            if (Array.isArray(node.balances)) {
                const arrBal = findBalanceValue(node.balances, depth + 1, targetCurrency);
                if (arrBal !== null) return arrBal;
            } else {
                const cand = [node.balances.available, node.balances.total, node.balances.usdt];
                for (let i = 0; i < cand.length; i++) {
                    const n = toFiniteNum(cand[i]);
                    if (n !== null && n > 0) return n;
                }
            }
        }
        for (const key in node) {
            if (!Object.prototype.hasOwnProperty.call(node, key)) continue;
            const child = node[key];
            if (child && typeof child === 'object') {
                const found = findBalanceValue(child, depth + 1, targetCurrency);
                if (found !== null) return found;
            }
        }
        return null;
    }

    // 📊 สถิติเครือข่าย: คำขอเดิมพัน / คำตอบที่มีทอย / คำตอบที่ไม่มีทอย (โดนปฏิเสธ)
    const netStats = {
        diceReq: 0, respWithRoll: 0, respNoRoll: 0, emptyLogged: 0,
        dupBlocked: 0, rollNoReq: 0, rollSeen: 0, rollWithReq: 0
    };

    // 🧾 เก็บข้อความ error/toast ที่เว็บแสดง (บอกเหตุที่ไม้ถูกปฏิเสธ)
    let siteErrLogged = 0;
    function captureSiteError(where) {
        try {
            if (siteErrLogged >= 6) return null;
            const sels = [
                '[data-testid*="error"]', '[role="alert"]', '[class*="toast"]',
                '[class*="Toast"]', '[class*="alert"]', '[class*="notification"]', '[class*="error"]'
            ];
            for (let i = 0; i < sels.length; i++) {
                const els = document.querySelectorAll(sels[i]);
                for (let k = 0; k < els.length && k < 3; k++) {
                    const el = els[k];
                    const txt = String((el && el.textContent) || "").replace(/\s+/g, " ").trim();
                    if (!txt || txt.length < 6) continue;
                    if (!/ไม่|ขั้นต่ำ|min|invalid|error|ไม่สำเร็จ|เท่า|balance|insufficient|ยอด|amount/i.test(txt)) continue;
                    siteErrLogged++;
                    diagPush("SITE_ERROR", null, { where: where, text: txt.slice(0, 160) });
                    return txt.slice(0, 160);
                }
            }
        } catch (e) {}
        return null;
    }

    function handlePossibleRollData(data, fromDiceRequest = false) {
        if (!data || typeof data !== 'object') return false;
        try { maybeCaptureAccount(data); } catch (e) {}
        try {
            const rollObj = findRollObject(data, 0, fromDiceRequest);
            if (fromDiceRequest) {
                if (rollObj) netStats.respWithRoll++;
                else {
                    netStats.respNoRoll++;
                    if (netStats.emptyLogged < 5) {
                        netStats.emptyLogged++;
                        let snip = "";
                        try { snip = JSON.stringify(data).slice(0, 300); } catch (e) { snip = "?"; }
                        diagPush("DICE_EMPTY", null, { snippet: snip, siteError: captureSiteError("dice-empty") });
                    }
                }
            }
            if (rollObj && typeof onDiceRollCallback === 'function') {
                const targetCur = String(rollObj.currency || '').toLowerCase();
                let serverBal = null;
                try { serverBal = findBalanceValue(data, 0, targetCur); } catch (e) {}
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

        const chance = parseFloat(configChance);
        if (!Number.isFinite(chance)) return null;

        const wantCond = pendingRollSide === "over" ? "above" : "below";
        const wantTarget = pendingRollSide === "over" ? (100 - chance) : chance;
        const wantVirtualZero = typeof isVirtualBetActive === "function" && isVirtualBetActive();
        const list = Array.isArray(json) ? json : [json];
        let changed = false;

        for (let i = 0; i < list.length; i++) {
            const item = list[i];
            if (!item || typeof item !== "object") continue;
            let vars = item.variables;
            if (!vars || typeof vars !== "object") continue;
            if (vars.input && typeof vars.input === "object" && ("condition" in vars.input)) vars = vars.input;
            if (!("condition" in vars)) continue;

            const beforeCond = String(vars.condition || "").toLowerCase();
            const beforeTarget = parseFloat(vars.target);
            const condMatch = (beforeCond === wantCond && Math.abs(beforeTarget - wantTarget) <= 0.004);
            const amtMatch = !wantVirtualZero || (vars.amount === 0);
            if (condMatch && amtMatch) continue;

            vars.condition = wantCond;
            vars.target = parseFloat(wantTarget.toFixed(2));
            if (wantVirtualZero) vars.amount = 0;
            if (vars.identifier) vars.identifier = vars.identifier; // คง identifier เดิมไว้
            changed = true;
        }

        if (!changed) return null;

        const now = Date.now();
        if (wantVirtualZero) {
            lastVirtualRewriteAt = now;
            if (now - lastZeroRequestTraceAt > 400) {
                lastZeroRequestTraceAt = now;
                try { trace("ZERO_REQUEST", { amount: 0, step: mStep }); } catch (e) {}
            }
        }
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
        // ⚠️ ห้ามลบ: เว็บ Stake เรียก response.json() บน Response ที่ไม่ได้มาจาก window.fetch ที่เราครอบไว้
        // (เช่น response จาก websocket/graphql client) — ถ้าลบ hook นี้ ทอยจะหายทั้งระบบ (bets roll=null, seq=0)
        const origJson = Response.prototype.json;
        Response.prototype.json = function (...args) {
            const p = origJson.apply(this, args);
            try {
                if (typeof onDiceRollCallback === 'function') {
                    p.then(data => {
                        handlePossibleRollData(data, true);
                    }).catch(() => {});
                }
            } catch (e) {}
            return p;
        };

        const originalFetch = window.fetch;
        window.fetch = async function (...args) {
            let isDiceReq = false;
            try {
                const reqUrl = String((args[0] && args[0].url) || args[0] || "");
                const bodyText = (args[1] && typeof args[1].body === "string") ? args[1].body : "";
                // 1) ทางเดิม: เห็นชื่อ diceRoll ใน body (ใช้ได้เมื่อเว็บส่ง body เป็น string)
                const bodyHasDice = bodyText.indexOf("diceRoll") >= 0 || bodyText.indexOf("DiceRoll") >= 0;
                // 2) ทางสำรอง: เพิ่งคลิกเดิมพันไม่เกิน 2.5 วิ + ยิงไปที่ API และอ่าน body ไม่ได้
                //    (เว็บปัจจุบันส่ง body มาใน Request object/stream ที่อ่าน sync ไม่ได้ → diceReq เดิมเป็น 0 ตลอด)
                const clickAt = lastBetDispatchTime || 0;
                const clickedRecently = clickAt > 0 && (Date.now() - clickAt) < 2500;
                const looksApi = /graphql|\/api\/|_api/i.test(reqUrl);
                if (bodyHasDice || (clickedRecently && looksApi && !bodyText)) {
                    isDiceReq = true;
                    lastDiceRequestAt = Date.now();
                    netStats.diceReq++;
                }
                if (bodyText) {
                    const rewritten = rewriteDiceRollBody(bodyText);
                    if (rewritten) args[1] = Object.assign({}, args[1], { body: rewritten });
                }
            } catch (e) {}
            const response = await originalFetch.apply(this, args);
            // 🚨 RATE LIMIT AUTO-PROTECTION (HTTP 429)
            try {
                if (response && response.status === 429) {
                    log("⚠️ [RATE LIMIT 429] เซิร์ฟเวอร์ Stake แจ้งจำกัดความเร็ว! พักชะลอ 2.5 วินาทีเพื่อความปลอดภัย...", true);
                    updateStatusText("⚠️ [RATE LIMIT 429] พักชะลอ 2.5s...", "#ffea00");
                    isRateLimitPaused = true;
                    setTimeout(() => {
                        isRateLimitPaused = false;
                        scheduleNextBet();
                    }, 2500);
                }
            } catch (e) {}
            try {
                if (typeof onDiceRollCallback === 'function') {
                    const url = args[0] ? (typeof args[0] === 'string' ? args[0] : (args[0].url || '')) : '';
                    if (!url || url.includes('/graphql') || url.includes('api.stake') || url.includes('/_api/') || url.includes('/api/')) {
                        const clone = response.clone();
                        origJson.call(clone).then(data => {
                            handlePossibleRollData(data, isDiceReq);
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
            let isDiceReq = false;
            try {
                if (typeof args[0] === "string" && (args[0].indexOf("diceRoll") >= 0 || args[0].indexOf("DiceRoll") >= 0)) {
                    isDiceReq = true;
                    lastDiceRequestAt = Date.now();
                    netStats.diceReq++;
                }
                if (typeof args[0] === "string") {
                    const rewritten = rewriteDiceRollBody(args[0]);
                    if (rewritten) args[0] = rewritten;
                }
            } catch (e) {}
            this._isDiceReq = isDiceReq;
            this.addEventListener('load', function () {
                try {
                    if (typeof onDiceRollCallback === 'function' && this.responseText && (this.responseText.includes('payoutMultiplier') || this.responseText.includes('diceRoll') || this.responseText.includes('result'))) {
                        const data = JSON.parse(this.responseText);
                        handlePossibleRollData(data, !!this._isDiceReq);
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
    // 1. CONFIGURATION & STATE: FIBONACCI 49.5% (20 ไม้)
    // ==================================================

    let isInitialized = false;
    let configEcoMode = true; // 🌱 เปิด ECO อัตโนมัติ: ซ่อนกราฟิก 3D/แอนิเมชัน // ❌ ปิด ECO ถาวร — เคยซ่อนส่วนของหน้าเว็บจนเลื่อนหน้าไม่ได้
    let isPanelMinimized = true; // 🌿 ยุบแผงเป็นค่าเริ่มต้นตามคำสั่งผู้ใช้ (ประหยัดพลังงานหน้าจอและลดภาระ CPU/GPU)
    try {
        const savedMin = localStorage.getItem("_st_hud_minimized");
        if (savedMin !== null) isPanelMinimized = (savedMin === "1");
    } catch (e) {}

    // ==================================================
    // 🧾 DIAG BUFFER (ชุดเดียว) — ไม้(BET) + เหตุการณ์(EVENT) + ข้อความ(LOG)
    //   รูปแบบกะทัดรัด: { t: epoch ms, k: kind, s?: step, m?: ข้อความ, d?: ข้อมูล }
    //   ไม่ทำ JSON ต่อบรรทัด / ไม่สร้าง context object ทุกครั้ง → ไม่กระทบความเร็วการแทง
    //   Alt+L = คัดลอก, Alt+D = ดาวน์โหลด (ทั้งคู่ใช้ buildDiagExport ชุดเดียวกัน)
    // ==================================================
    const DIAG_MAX = 1500;
    const diag = [];

    function diagPush(kind, msg, data, isBet) {
        try {
            const e = { t: Date.now(), k: kind };
            if (!isBet) { try { e.s = mStep; } catch (err) {} }
            if (msg) e.m = msg;
            if (data) e.d = data;
            diag.push(e);
            if (diag.length > DIAG_MAX) diag.shift();
        } catch (err) {}
    }

    // ⏱️ PERF — วัดว่าเวลาแต่ละไม้หายไปที่ไหน: prep (คำนวณ+เขียน DOM ก่อนคลิก) / wait (รอทอย) / result (ประมวลผลผล)
    //    ใช้ยืนยันว่า "ไม้ลมช้า" เกิดจากการรอ (0% CPU) ไม่ใช่การประมวลผล
    const PERF = {
        bets: 0, prepSum: 0, waitSum: 0, resSum: 0,
        maxPrep: 0, maxWait: 0, maxRes: 0,
        virtBets: 0, virtPrepSum: 0, virtWaitSum: 0, virtResSum: 0
    };
    function perfNow() {
        return (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
    }
    // 🔁 เริ่มเซสชันใหม่ = เริ่มวัดใหม่ (เดิมตัวนับสะสมข้ามเซสชัน ทำให้ avgWaitMs/prep เพี้ยน)
    let perfResumed = false; // true = ตัวเลข PERF รอบนี้เริ่มนับจากจุด resume (ไม่ใช่ตั้งแต่ต้นเซสชัน)
    function perfReset(resumed) {
        try {
            PERF.bets = 0; PERF.prepSum = 0; PERF.waitSum = 0; PERF.resSum = 0;
            PERF.maxPrep = 0; PERF.maxWait = 0; PERF.maxRes = 0;
            PERF.virtBets = 0; PERF.virtPrepSum = 0; PERF.virtWaitSum = 0; PERF.virtResSum = 0;
            perfResumed = !!resumed;
        } catch (e) {}
    }
    function perfAdd(kind, ms, isVirt) {
        try {
            const v = (typeof ms === "number" && isFinite(ms) && ms >= 0) ? ms : 0;
            if (kind === "prep") {
                PERF.prepSum += v; if (v > PERF.maxPrep) PERF.maxPrep = v;
                if (isVirt) PERF.virtPrepSum += v;
            } else if (kind === "wait") {
                PERF.waitSum += v; if (v > PERF.maxWait) PERF.maxWait = v;
                if (isVirt) PERF.virtWaitSum += v;
            } else if (kind === "result") {
                PERF.resSum += v; if (v > PERF.maxRes) PERF.maxRes = v;
                if (isVirt) PERF.virtResSum += v;
            }
        } catch (e) {}
    }
    function perfBetDone(isVirt) {
        try {
            PERF.bets++;
            if (isVirt) PERF.virtBets++;
            if (PERF.bets % 20 === 0) trace("PERF", perfSnapshot());
        } catch (e) {}
    }
    function perfSnapshot() {
        try {
            const n = Math.max(1, PERF.bets);
            const cpu = PERF.prepSum + PERF.resSum;
            const total = cpu + PERF.waitSum;
            const vn = Math.max(1, PERF.virtBets);
            return {
                bets: PERF.bets,
                avgPrepMs: +(PERF.prepSum / n).toFixed(2),
                avgWaitMs: +(PERF.waitSum / n).toFixed(1),
                avgResultMs: +(PERF.resSum / n).toFixed(2),
                shareWaitPct: total > 0 ? +((PERF.waitSum / total) * 100).toFixed(1) : null,
                shareCpuPct: total > 0 ? +((cpu / total) * 100).toFixed(1) : null,
                maxPrepMs: +PERF.maxPrep.toFixed(1),
                maxWaitMs: Math.round(PERF.maxWait),
                maxResultMs: +PERF.maxRes.toFixed(1),
                virtual: {
                    bets: PERF.virtBets,
                    avgPrepMs: PERF.virtBets ? +(PERF.virtPrepSum / vn).toFixed(2) : null,
                    avgWaitMs: PERF.virtBets ? +(PERF.virtWaitSum / vn).toFixed(1) : null,
                    avgResultMs: PERF.virtBets ? +(PERF.virtResSum / vn).toFixed(2) : null
                }
            };
        } catch (e) { return { error: String(e && e.message || e) }; }
    }

    function log(message, important) {
        diagPush(important ? "LOG!" : "LOG", String(message == null ? "" : message));
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
                    [class*="backdrop-blur"], [style*="backdrop-filter"] {
                        backdrop-filter: none !important;
                    }
                    /* 🛑 ULTRA ECO: ซ่อนห้องแชทสด Stake ทุกส่วนเพื่อลดโหลด CPU/GPU และ RAM */
                    [data-testid="chat-feed"], [data-testid="chat-room"], [data-testid="chat-sidebar"],
                    [class*="chat-feed"], [class*="chat-sidebar"], [class*="chat-room"],
                    aside[data-testid*="chat"], aside[class*="chat"],
                    /* 🛑 ULTRA ECO: ซ่อนตารางคนแทงสดทั่วโลก (Recent Bets / Live Stats) */
                    [data-testid="live-stats"], [data-testid="recent-bets"], [data-testid="casino-bets-feed"],
                    [data-testid="high-rollers"], [data-testid="race-leaderboard"], [class*="recent-bets"],
                    /* 🛑 ULTRA ECO: ซ่อนแบนเนอร์ภาพเคลื่อนไหวโปรโมชั่น */
                    [class*="carousel"], [data-testid="banner-slider"], [class*="promotion-banner"] {
                        display: none !important;
                    }
                `;
                (document.head || document.documentElement).appendChild(ecoStyleEl);
            }
        } catch (e) {}
    }

    // 1.1 พารามิเตอร์หลัก: เดิมพันคงที่ทุกไม้ (เก็บใน Memory ล้วน 100% ไม่แตะ Storage)
    let configChance = "49.5"; // โอกาสชนะ 49.5% (payout 99/49.5 = 2.00x)
    let configAlternateRoll = false; // สลับ Under/Over ทุกตา: false (ปิดถาวรตามคำสั่งผู้ใช้ = แทง Under ฝั่งเดียว)
    let currentRollSide = "under";  // ด้านของไม้ปัจจุบัน ("under" หรือ "over")
    let pendingRollSide = "under";  // ด้านที่ส่งไปกับคำขอเดิมพัน
    let lastBetSide = "under";      // ด้านที่แทงไปในไม้ล่าสุด
    // 🎯 ด้านที่ "ยิงจริง" ของไม้ที่กำลังวิ่ง — ใช้ตัดสินผลจาก badge ให้ตรงกับคำขอที่ส่งไป
    // (เดิมตัวนี้ไม่เคยถูกประกาศ ทำให้ isBadgeWinning โยน ReferenceError ทุกครั้ง)
    let activeRollSide = "under";
    // 🛰️ เงื่อนไข over/under ที่เซิร์ฟเวอร์รายงานล่าสุด — ความจริงจาก API ไม่ใช่จาก DOM
    // (เดิมไม่เคยถูกประกาศ การเขียนใน onDiceRollCallback จึงโยน ReferenceError ใน strict mode)
    let lastServerCondition = null;
    // 🎯 เส้นแบ่งจริงที่เซิร์ฟเวอร์ใช้ (over → 50.5, under → 49.5) + ด้าน/เส้นแบ่งของไม้ล่าสุด
    // ใช้บันทึกลง ledger ให้ตรงกับเว็บจริง (เดิมบันทึก chance เป็น target และยัด cond = "under" คงที่)
    let lastServerTarget = null;
    let lastSettledSide = null;
    let lastSettledTarget = null;
    let lastRollResult = null; // ตัวเลขลูกเต๋าล่าสุดจาก API (0.00 - 99.99)
    let lastBetLatencyMs = null; // เวลาจากคลิกถึงได้ผล (ms) ของไม้ล่าสุด
    let lastRollSig = "";      // ลายเซ็นทอยล่าสุด (เลข|เงื่อนไข) — กันทอยเดิมถูกนับซ้ำ
    let lastRollSigAt = 0;     // เวลาที่เห็นลายเซ็นนั้นครั้งแรก
    const ROLL_DUP_MS = 1200;  // ถ้าทอยเดิมโผล่ซ้ำภายในเวลานี้ = ทอยเดียวกัน (ไม่ใช่ตาใหม่)
    let serverRollSeq = 0;          // นับ "ทอยใหม่จากเซิร์ฟเวอร์" (ใช้ยืนยันว่าไม้ 0$ ได้ทอยของตัวเอง)
    let lastDiceRequestAt = 0;      // เวลาล่าสุดที่มีคำขอ DiceRoll ออกไป
    let lastVirtualRewriteAt = 0;   // เวลาล่าสุดที่เขียน amount=0 ลงคำขอสำเร็จ
    let lastZeroRequestTraceAt = 0; // กันเขียน trace ZERO_REQUEST ถี่เกินไป
    // 🔒 เดิมพันคงที่: ยอดเดียวกันทุกไม้ — ไม่ไล่ไม้ ไม่ทบ ไม่มีบันได
    const FIXED_BASE_BET = "0.00012";
    let configRealBaseBet = FIXED_BASE_BET; // ยอดฐาน (ไม้แรก) — แก้ได้จากช่องบน HUD
    const AUTO_MIN_BET = 0.00012; // ขั้นต่ำที่เว็บยอมรับ (USDT) — Stake ไม่อนุญาตต่ำกว่า 0.00012
    // 📈 FIBONACCI PROGRESSION (20 ไม้ · 49.5% Under)
    // 20 ไม้: 1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377, 610, 987, 1597, 2584, 4181, 6765 (ผลรวม = 17,710)
    // กฎรีเซ็ต: ชนะติดกัน 2 ครั้ง / ชนะถอย 2 ขั้น / ถอยถึงไม้ 1 หรือกำไรรอบทบเป็นบวก -> รีเซ็ตกลับไม้ 1
    const FIBONACCI_STEPS = [1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377, 610, 987, 1597, 2584, 4181, 6765];
    const MAX_FIBO_STEPS = 20;
    const DYNAMIC_BASE_DIVISOR = 17710;   // ผลรวม 20 ไม้ = 17,710 (ทนแพ้ติด 20 ไม้)
    let configDynamicBase = true;     // เปิดคำนวณยอดฐานอัตโนมัติตามพอร์ตเฉพาะตอนอยู่ไม้ 1
    let lockedCycleBaseBet = null;    // ล็อกยอดฐานของรอบทบไม้ปัจจุบัน (ห้ามเปลี่ยนกลางคันเมื่อ mStep > 1)
    
    // ⚙️ MULTI-ENGINE SELECTION: "hybrid" (K=2 ทุกไม้ ≥2), "fibo" (Fibonacci 20 ไม้), "k2" (Pure K2)
    const STORAGE_ENGINE_MODE_KEY = "_st_engine_mode_v4";
    let activeEngineMode = (function() {
        try {
            const saved = localStorage.getItem(STORAGE_ENGINE_MODE_KEY);
            if (saved === "hybrid" || saved === "fibo" || saved === "k2") return saved;
        } catch (e) {}
        return "hybrid"; // ค่าเริ่มต้น: Hybrid Engine (ไม้ 1-4 คืนทุนตาเดียว + ไม้ 5+ เซฟพอร์ต)
    })();

    let mStep = 1;                    // ลำดับไม้ปัจจุบัน (1 = ยอดฐาน)
    let maxStepReached = 1;           // ไม้ลึกสุดที่เคยไปถึงในเซสชันนี้ (สำหรับเฝ้าระวังแพ้ลึก)
    let cycleProfit = 0;              // กำไร/ขาดทุนสะสมเฉพาะรอบทบไม้ปัจจุบัน (ตั้งแต่ไม้ 1)
    let cycleStartBalance = null;     // ยอดกระเป๋าจริงตอนเริ่มรอบทบไม้ปัจจุบัน (สำหรับตรวจบวกจริง)
    // 🔄 F5 RECOVERY STATE MACHINE (รีเฟรช F5 เฉพาะเมื่อแพ้ติดต่อกัน 5 ครั้งเท่านั้น -> รีเฟรชทบต่อไม้ 6 -> ชนะติด 2 ตา / ถอยถึงไม้ 1 รีเซ็ตไม้ 1)
    const STORAGE_RECOVERY_KEY = "_st_f5_recovery_state_v1";
    let inRefreshRecovery = false;
    let recoveryWinStreak = 0;       // นับชนะติดกันหลังรีเฟรช (ครบ 2 ตา -> รีเซ็ตกลับไม้ 1)
    // 🛡️ DESYNC GUARD: เทียบยอดเงินจริงบนหน้าจอกับยอดที่ระบบคำนวณเอง
    const DESYNC_STRIKE_LIMIT = 5; // ไม่ตรงติดกันกี่ไม้ จึงหยุดระบบ (เดิม 3 ทำให้หยุดง่ายเกิน) + auto-resync ทำงานก่อน
    // ↔️ AUTO-RESYNC: ยืดหยุ่นแทนการหยุด — ยอมรับยอดจริงบนหน้าจอเป็นยอดใหม่แล้วเล่นต่อ
    let configAutoResync = true;   // เปิดเป็นค่าเริ่มต้น: ยอดเพี้ยนเล็กน้อยให้ซิงก์เองก่อน ไม่ต้องหยุดทั้งเซสชัน
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
    // 🚫 ไม่มีตัวตัดขาดทุน (ถอดออกตามคำสั่ง) — ตัวหยุดที่เหลือ: ครบเวลา / DESYNC / เงินหมด
    let configProfitTarget = 0; // ถอดเป้ากำไรออกตามคำสั่งผู้ใช้ (สะอาด เบาขึ้น เล่นต่อเนื่องไร้การตัดรอบเป้ากำไร)
    let configAutoStart = true; // เปิดทำงานอัตโนมัติเมื่อตรวจพบยอดเงิน

    // 🌬️ LOSS-STREAK VIRTUAL SHIELD (แทงจริงแพ้ติด N ครั้ง -> เข้าแทงลม 0$ N ตา -> ออกแทงลมแทงจริงต่อจากไม้เดิม)
    let configVirtualBetEnabled = true;  // เปิดใช้งานแทงลมเป็นค่าเริ่มต้น
    let configVirtualLossTrigger = 3;    // แพ้เงินจริงติดต่อกันกี่ครั้ง จึงตัดเข้าแทงลม 0$ (ค่าเริ่มต้น 3 ครั้ง)
    let virtualMode = false;             // สถานะปัจจุบัน: false = แทงเงินจริงตามปกติ, true = กำลังแทงลม 0$
    let realLossStreakForVirtual = 0;    // ตัวนับแพ้เงินจริงติดต่อกันในรอบปัจจุบัน (ครบ N -> เข้าแทงลม)
    let virtualRolls = 0;                // จำนวนตาที่แทงลมในรอบพักปัจจุบัน
    let virtualRollsTotal = 0;           // จำนวนตาแทงลมสะสมทั้งหมดในเซสชัน
    // 🔒 ไม้และยอดที่พักไว้ตอนเข้าโหมด — ใช้คืนค่าตอนออก ให้ "แทงจริงต่อจากไม้เดิม" เป๊ะ ๆ
    let parkedStep = 0;
    let parkedAmount = 0;
    // ==================================================
    // ⚙️ สวิตช์เดียว: พฤติกรรมช่องยอดตอนแทงลม (Alt+Z สลับ)
    //   true  = เขียน 0 ลงช่องจริง
    //   false = ช่องใช้ยอดจริง (คำขอยังถูกเขียน amount=0)
    // ==================================================
    let configVirtualWriteZero = true;

    function isVirtualBetActive() {
        // อยู่ในโหมดลม + สวิตช์เปิด → ต้องแทง 0$ เท่านั้น
        if (!virtualMode) return false;
        return Boolean(configVirtualBetEnabled);
    }

    function virtualZeroModeText() {
        return configVirtualWriteZero
            ? "ช่องยอด = 0 (เว็บเห็น 0$)"
            : "ช่องยอด = ยอดจริง (ส่ง 0$ ในคำขอ)";
    }

    // รีเซ็ตสถานะรอบแทงลมทั้งหมด (ใช้จุดเดียว ทั้งตอนเข้า/ออก/กดปุ่ม)
    function resetVirtualRun() {
        virtualLastSeq = -1;
        virtualRolls = 0;
        virtualStallCount = 0;
        virtualStallReason = "";
        virtualStallAt = 0;
    }

    // 🌬️ แทงลมค้างกี่ตาก่อนกลับไปแทงจริง (โหมดอัตโนมัติ) — ออกไม่ว่าแพ้หรือชนะ
    const VIRTUAL_EXIT_AFTER_ROLLS = 3;
    let virtualLastSeq = -1;        // ลำดับทอยที่ถูกนับแล้ว (กันนับซ้ำที่ต้นทาง)
    let virtualEnteredAt = 0;

    // ออกลมเมื่อครบจำนวนตาที่ตั้งไว้ (แพ้หรือชนะก็ออก)
    function virtualExitDue() {
        return virtualRolls >= VIRTUAL_EXIT_AFTER_ROLLS;
    }

    function virtualStayMs() {
        return virtualEnteredAt > 0 ? (Date.now() - virtualEnteredAt) : 0;
    }

    // 🚪 จุดออกจากโหมดแทงลม "จุดเดียว" → คืนไม้/ยอดที่พักไว้เป๊ะ แล้วแทงจริงต่อทันที
    function exitVirtualToReal(reason) {
        const resumeStep = (parkedStep >= 1) ? parkedStep : mStep;
        const resumeAmt = (parkedAmount > 0) ? parkedAmount : calculateCurrentBetAmount();
        const rolls = virtualRolls;
        const staySec = Math.round(virtualStayMs() / 1000);
        virtualMode = false;
        if (parkedStep >= 1) mStep = parkedStep;
        try { applyBetSettings(true); } catch (e) {}
        try { if (parkedAmount > 0) setInput("input-game-amount", parkedAmount, true); } catch (e) {}
        const fieldNow = getAmountInputValue();
        // ⏳ ปล่อยจังหวะให้เว็บรับยอดที่คืนมา (เดิมคลิกทันที 10ms → เว็บไม่ตอบ เงียบ 6 วิ)
        postExitSettleUntil = Date.now() + 400;
        resetVirtualRun();
        virtualEnteredAt = 0;
        realLossStreakForVirtual = 0;
        recordEvent("VIRTUAL_EXIT", {
            reason: reason,
            rolls: rolls,
            staySec: staySec,
            resumeStep: resumeStep,
            resumeAmount: resumeAmt,
            mStepAfter: mStep,
            fieldValue: fieldNow
        });
        log(`🎯 [VIRTUAL EXIT] ${reason} → แทงเงินจริงต่อไม้ ${resumeStep} (${resumeAmt}$ · ช่องยอด ${fieldNow})`, true);
        updateStatusText(`🎯 ${reason} → ลุยเงินจริงต่อไม้ ${resumeStep} (${resumeAmt}$)`, "#00e676");
        flashHudAlert("#00e676");
        return { resumeStep: resumeStep, resumeAmt: resumeAmt };
    }

    function virtualExitRuleText() {
        return `ออกเมื่อ แทงลมครบ ${VIRTUAL_EXIT_AFTER_ROLLS} ตา (แพ้/ชนะก็ออก)`;
    }

    let virtualStallCount = 0;           // นับไม้ 0$ ที่ไม่ได้ทอยใหม่ติดกัน
    let virtualStallReason = "";         // สาเหตุ stall ล่าสุด (โชว์บน HUD)
    let virtualStallAt = 0;

    const VIRTUAL_ROLL_WAIT_MS = 1000;  // รอทอยใหม่ของไม้ 0$ — ไม้ที่สำเร็จจบที่ ~450-500 ms อยู่แล้ว (ค่านี้มีผลเฉพาะไม้ที่ไม่ติด)
    const VIRTUAL_ROLL_POLL_MS = 60;   // ตรวจทอยถี่ขึ้น (เดิม 150ms = ช้าเกิน) 
    const VIRTUAL_STALL_LIMIT = 5;       // stall limit -> back to real betting
    const VIRTUAL_NUDGE_MAX = 3;         // คลิกซ้ำไม้ 0$ สูงสุด 3 ครั้ง (diag 16:02: คลิกแรก/คลิกถี่ถูกเว็บเพิกเฉย ~50% — ต้องยิงซ้ำหลายจังหวะ)
    const VIRTUAL_NUDGE_AT_MS = 250;     // คลิกซ้ำที่ 250 / 500 / 750 ms (ต้องน้อยกว่า VIRTUAL_ROLL_WAIT_MS)
    const VIRTUAL_WRITE_SETTLE_MS = 180; // รอให้เว็บรับค่า 0 ในช่องก่อนคลิก (คลิกทันทีถูกเมิน — diag 16:08)

    function diagnoseVirtualStall(dispatchSeq, sinceTs) {
        const now = Date.now();
        const since = (typeof sinceTs === "number" && sinceTs > 0) ? (sinceTs - 500) : (now - VIRTUAL_ROLL_WAIT_MS);
        if (lastBetSignal() < since) return "ยังไม่มีการคลิกปุ่มเดิมพันในไม้นี้ (ปุ่มไม่ยิง/ถูกเว็บบล็อก)";
        if (lastVirtualRewriteAt < since) return "คลิกเดิมพันแล้ว แต่ไม่ได้ rewrite amount=0 ในคำขอ (ตัวดัก network ไม่จับรูปแบบ GraphQL ปัจจุบัน)";
        if (serverRollSeq === dispatchSeq) return "ส่งคำขอแล้ว แต่เซิร์ฟเวอร์ไม่ส่งทอยใหม่กลับมา (ทอยซ้ำ/ไม่มีทอย)";
        return "ได้ทอยแต่ไม่ผูกกับไม้นี้ (ทอยซ้ำ)";
    }

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

    // ==================================================
    // 🔍 ACCURATE LOSS GAP & CLUSTERING ANALYZER
    // ตรวจสอบพฤติกรรม "ก้อนแพ้คั่นกลางระหว่างชนะ" อย่างแม่นยำ 100%
    // ==================================================
    const lossGapTracker = {
        currentLossGap: 0,          // จำนวนตาที่แพ้สะสมในก้อนปัจจุบันก่อนจะชนะ
        gaps: [],                   // ประวัติขนาดก้อนแพ้คั่นกลาง 50 ก้อนล่าสุด
        maxGap: 0,                  // ก้อนแพ้ที่ยาวที่สุดในเซสชัน
        totalWins: 0,               // จำนวนครั้งที่ชนะทั้งหมด
        winsFollowedByLoss: 0,      // ชนะแล้วตาถัดไปแพ้ทันที (สภาวะก้อนแพ้คั่น)
        winsFollowedByWin: 0,       // ชนะแล้วตาถัดไปชนะซ้ำ (W-W)
        lastBetWasWin: null,        // สถานะตาที่แล้ว: true = ชนะ, false = แพ้, null = เริ่มต้น
        isolatedWinCount: 0         // จำนวนครั้งที่ชนะเดี่ยวๆ (W-L)
    };

    function recordLossGap(isWin) {
        if (isWin) {
            lossGapTracker.totalWins++;
            if (lossGapTracker.lastBetWasWin === true) {
                lossGapTracker.winsFollowedByWin++;
            } else if (lossGapTracker.lastBetWasWin === false) {
                const gap = lossGapTracker.currentLossGap;
                lossGapTracker.gaps.push(gap);
                if (gap > lossGapTracker.maxGap) lossGapTracker.maxGap = gap;
                if (lossGapTracker.gaps.length > 50) lossGapTracker.gaps.shift();
            }
            lossGapTracker.currentLossGap = 0;
            lossGapTracker.lastBetWasWin = true;
        } else {
            if (lossGapTracker.lastBetWasWin === true) {
                lossGapTracker.winsFollowedByLoss++;
                lossGapTracker.isolatedWinCount++;
            }
            lossGapTracker.currentLossGap++;
            lossGapTracker.lastBetWasWin = false;
        }
    }

    function getLossGapMetrics() {
        const totalTransitions = lossGapTracker.winsFollowedByLoss + lossGapTracker.winsFollowedByWin;
        const postWinLossPct = totalTransitions > 0
            ? Math.round((lossGapTracker.winsFollowedByLoss / totalTransitions) * 100)
            : null;
        const avgGap = lossGapTracker.gaps.length > 0
            ? (lossGapTracker.gaps.reduce((a, b) => a + b, 0) / lossGapTracker.gaps.length).toFixed(1)
            : null;
        return {
            avgGap: avgGap,
            maxGap: lossGapTracker.maxGap,
            currentGap: lossGapTracker.currentLossGap,
            postWinLossPct: postWinLossPct,
            totalTransitions: totalTransitions,
            recentGaps: lossGapTracker.gaps.slice(-5)
        };
    }

    // สถานะการไล่ไม้แบบ Dual-Engine (K=2 หรือ Fibonacci 20 ไม้)
    function getSurvivalProbabilityText() {
        if (activeEngineMode === "hybrid") {
            const deficit = getCycleDeficit();
            const modeLabel = (mStep <= 4) ? "ไม้ตื้น K=1 (หนี้+ฐาน คืนทุนตาเดียว)" : "ไม้ลึก K=2 (เซฟพอร์ต)";
            return `⚡ Hybrid ไม้ ${mStep}: ${modeLabel} · หนี้สะสม ${formatNumber(deficit, 5)}$ · 49.5% Under`;
        } else if (activeEngineMode === "k2") {
            const deficit = getCycleDeficit();
            const hitLabel = (currentStreak >= 1 || (inRefreshRecovery && recoveryWinStreak >= 1)) ? "ล้างหนี้ที่เหลือ" : "ปลดหนี้ 50%";
            return `🛡️ K=2 (${hitLabel} · หนี้สะสม ${formatNumber(deficit, 5)}$) · 49.5% Under`;
        }
        return `📈 Fibonacci 20 ไม้ · ถอย 2 ขั้น / รีเซ็ตเมื่อบวกจริง · 49.5% Under`;
    }

    let totalBets = 0;
    let betTimestamps = []; // เวลาของ 50 ตาล่าสุด ใช้วัดความเร็วจริง
    function getBetRateNum() {
        const n = betTimestamps.length;
        if (n < 10) return null;
        const span = (betTimestamps[n - 1] - betTimestamps[0]) / 1000;
        if (span <= 0 || span > 180) return null;
        return (n - 1) / span;
    }
    function getBetRateText() {
        // วัดจาก 50 ตาล่าสุดที่ทอยต่อเนื่อง (ถ้าช่วงห่างเกิน 20 วินาที = มีพัก จึงไม่แสดง)
        const r = getBetRateNum();
        if (r === null) return "";
        return ` | ⚡ ${r.toFixed(1)} ตา/วิ`;
    }
    // 🏷️ ธงสถานะให้ background อ่าน (ใช้ตัดสินว่าหน้านี้ "กำลังแทง" อยู่จริงไหม)
    //    → ตัวเก็บกวาดแท็บจะไม่ปิดแท็บที่ยังเล่นอยู่
    function publishBotState() {
        try {
            window.__stakeBotState = {
                running: !!sessionRunning,   // แค่ "เซสชันเปิดอยู่" = ห้ามปิดแท็บ (รวมช่วง recovery/hold)
                at: Date.now(),
                build: BUILD_NO
            };
        } catch (e) {}
    }

    setInterval(() => {
        try {
            publishBotState();
            if (!sessionRunning || sessionTimeExpired || sessionRecoveryActive) return;
            const cur = String(document.title || "");
            if (cur.indexOf("STAKE_DONE") === 0 || cur.indexOf("STAKE_HOLD") === 0 || cur.indexOf("STAKE_IDLE") === 0) return;
            const bps = getBetRateNum();
            const bpsStr = (bps !== null) ? bps.toFixed(2) : "0.00";
            const pStr = Number(profit || 0).toFixed(5);
            const wStr = Number(totalWagered || 0).toFixed(4);
            const mdStr = Number(maxDrawdown || 0).toFixed(4);
            const lgm = getLossGapMetrics();
            const gapStr = (lgm.avgGap !== null) ? lgm.avgGap : "0.0";
            const pwlStr = (lgm.postWinLossPct !== null) ? `${lgm.postWinLossPct}%` : "-";
            document.title = `STAKE_RUN|P=${pStr}|S=${mStep}|B=${totalBets || 0}|GAP=${gapStr}|PWL=${pwlStr}|W=${wStr}|BPS=${bpsStr}|MS=${maxStepReached || 1}|MD=${mdStr} :: ${accountName || "Account"}`;
        } catch (e) {}
    }, 5000);
    let totalWagered = 0;
    let winsCount = 0;
    let lossesCount = 0;
    let currentStreak = 0;
    let maxDrawdown = 0;
    let peakBalance = null;

    let autoCycleRounds = true; // เปิดวนรอบอัตโนมัติ (🔁 วน: ON) อัตโนมัติ 100% ถึงเป้ากำไรแล้วเริ่มรอบใหม่ทันที
    let completedRounds = 0;
    let lifetimeProfit = 0;
    let autoCycleCountdownTimer = null;

    let autoStartPolling = null;
    let autoStartCountdownTimer = null;
    let autoStartCountdown = 2;

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
    let sideGateRetry = 0; // จำนวนครั้งที่ยืนยันฝั่งบนหน้าเว็บไม่ผ่านก่อนยิงไม้จริง
    let postExitSettleUntil = 0; // หลังออกจากโหมดแทงลม ต้องรอให้เว็บรับยอดจริงก่อนคลิก
    let closeAllNext = false;     // ชนะแล้วแพ้ (W→L) → ตาถัดไปปิดหนี้ทั้งหมด เพื่อให้ W-L-W คืนทุนได้
    let amountRetryCount = 0;
    let amountForceCount = 0;   // นับครั้งที่ต้องบังคับเขียนยอด (รีเซ็ตเมื่อไม้ผ่าน)
    let balanceShortCount = 0;  // นับรอบที่รอเงินไม่พอ (รีเซ็ตเมื่อผ่าน)

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
    let audioUnlocked = false;   // ต้องมี user gesture จริงก่อน (นโยบาย autoplay ของ Chrome)
    let audioGestureBound = false;
    let audioKeepAliveStarted = false; // สร้าง oscillator ไปแล้วหรือยัง

    // Chrome อนุญาตให้สร้าง/เริ่มเสียงหลังผู้ใช้มีปฏิสัมพันธ์กับหน้าแล้วเท่านั้น
    function audioUserActivated() {
        try {
            const ua = navigator.userActivation;
            if (ua && typeof ua.hasBeenActive === "boolean") return ua.hasBeenActive;
        } catch (e) {}
        return audioUnlocked;
    }

    // สร้าง oscillator + เริ่มทำงาน — เฉพาะเมื่อมี user gesture จริงเท่านั้น
    // (ถ้าสร้าง/start ก่อน gesture Chrome จะขึ้น error "The AudioContext was not allowed to start")
    function startAudioKeepAliveNode() {
        try {
            if (!audioUnlocked || !audioUserActivated()) return; // ยังไม่มี gesture → ไม่สร้าง/ไม่เริ่ม
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return;
            if (!audioKeepAliveCtx) audioKeepAliveCtx = new AudioCtx();
            const ctx = audioKeepAliveCtx;
            const startOsc = () => {
                if (audioKeepAliveStarted || ctx.state !== "running") return;
                try {
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    gain.gain.value = 0.00001; // เงียบสนิท ไร้เสียงรบกวน
                    osc.connect(gain);
                    gain.connect(ctx.destination);
                    osc.start();
                    audioKeepAliveStarted = true;
                } catch (e) {}
            };
            if (ctx.state === "running") { startOsc(); return; }
            // ยัง suspended → resume ภายใน gesture นี้ให้สำเร็จก่อน แล้วค่อย start
            // (ถ้า resume ไม่สำเร็จ ห้าม start เพราะจะเกิด warning/error เดียวกัน)
            const p = ctx.resume();
            if (p && typeof p.then === "function") p.then(startOsc).catch(function () {});
        } catch (e) {}
    }

    // ⚠️ ห้ามสร้าง/เริ่ม AudioContext ก่อนผู้ใช้มี gesture — Chrome จะบล็อกและขึ้น error
    //    "The AudioContext was not allowed to start" (content.js:973)
    function enableAudioKeepAlive() {
        if (!audioUnlocked && audioUserActivated()) audioUnlocked = true; // ผู้ใช้เคยคลิก/กดคีย์บนหน้านี้แล้ว
        if (!audioUnlocked) {
            if (!audioGestureBound) {
                audioGestureBound = true;
                const unlock = (ev) => {
                    if (ev && ev.isTrusted === false) return; // event สังเคราะห์ไม่นับเป็น user gesture
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
        if (el.closest('[data-testid="game-frame"], [data-testid="game-sidebar"], [data-testid="dice-game"], [data-testid*="bet-amount"], [data-testid*="input-game"], [data-testid*="chance"], [data-testid*="payout"], [data-testid*="profit"], [class*="game-sidebar"], [class*="bet-control"]')) {
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
            if (cachedBalanceEl) {
                const cachedVal = parseBalanceElement(cachedBalanceEl);
                if (cachedVal !== null && cachedVal > 0) return cachedVal;
                cachedBalanceEl = null;
            }
            const selectors = [
                'button[data-testid="wallet-balance-button"] span',
                'button[data-testid="wallet-balance-button"]',
                'span[data-testid="wallet-balance"]',
                'div[data-testid="wallet-balance"] span',
                'button[data-testid*="wallet"] span',
                'div[data-testid*="wallet"] span',
                '[data-testid="coin-toggle"] span',
                'header span[data-ds-text="true"][style*="max-width"]',
                'header span.edge-typography-body-md-strong.text-ellipsis',
                'header span[data-ds-text="true"]',
                'nav span[data-ds-text="true"]',
                'div[class*="BalanceWrap"] span',
                'div[class*="balance"] span',
                'span[data-ds-text="true"][style*="max-width"]'
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

    // 🚪 AUTO-CLOSE DIALOGS: ปิดหน้าต่าง Popup / Modal (เช่น หน้าต่างความโปร่งใส หรือการตั้งค่า) อัตโนมัติเฉพาะเมื่อมีเปิดอยู่จริง
    function closeAnyStakeModal() {
        try {
            const dialog = document.querySelector('[role="dialog"], [data-testid*="modal-container"]');
            if (dialog && (dialog.offsetWidth > 0 || dialog.offsetHeight > 0)) {
                const closeBtn = dialog.querySelector(
                    'button[aria-label*="close" i], button[aria-label*="ปิด" i], ' +
                    'button[data-testid*="close" i], button[class*="close" i], ' +
                    'button[class*="Close" i], header button'
                );
                if (closeBtn) {
                    closeBtn.click();
                    return true;
                }
            }
        } catch (e) {}
        return false;
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

    function setInput(testid, value, force = false) {
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

        // ลดพลังงานการแสดงผล: หากค่าตัวเลขในช่องตรงกับค่าใหม่อยู่แล้ว และไม่ได้บังคับ (force) ให้ข้าม event
        const curNum = parseFloat(input.value);
        const tgtNum = parseFloat(value);
        if (!force && (input.value === String(value) || (!isNaN(curNum) && !isNaN(tgtNum) && Math.abs(curNum - tgtNum) < 1e-9))) {
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
        // 🎯 1. ตรวจสอบปุ่มแท้จริงของ Stake (data-testid="bet-button") ก่อนเสมอ 100%
        // ถ้ามีปุ่มแท้จริงใน DOM ต้องใช้ปุ่มนี้เท่านั้น ห้ามตกไปเดาปุ่มอื่น (เช่น ปุ่มความโปร่งใส) เด็ดขาด
        const realBtn = document.querySelector('button[data-testid="bet-button"]') ||
                        document.querySelector('button[data-analytics="bet-button"]') ||
                        document.querySelector('button[data-analytics="game-bet-button"]') ||
                        document.querySelector('button[data-testid="game-play-button"]') ||
                        document.querySelector('button[data-test="bet-button"]');
        if (realBtn) {
            cachedBetBtn = realBtn;
            return realBtn;
        }

        // 🎯 2. ถ้า cached button ยังมีอยู่และเป็นปุ่มเดิมพันแท้จริง
        if (cachedBetBtn && document.body.contains(cachedBetBtn)) {
            const txt = (cachedBetBtn.textContent || "").trim().toLowerCase();
            const tid = cachedBetBtn.getAttribute("data-testid") || "";
            if (tid.includes("bet") || txt === "bet" || txt === "เดิมพัน" || txt === "play" || txt === "ทอย") {
                return cachedBetBtn;
            }
        }
        cachedBetBtn = null;

        // 🎯 3. Fallback: หาเฉพาะปุ่มที่มีข้อความ Bet / เดิมพัน / Play / ทอย เท่านั้น
        const allBtns = document.querySelectorAll('button');
        for (let i = 0; i < allBtns.length; i++) {
            const b = allBtns[i];
            if (!isElUsable(b)) continue;
            const txt = (b.textContent || "").trim().toLowerCase();
            if (/ความโปร่งใส|โปร่งใส|fairness|provably|seed|ซีด|verify|ยืนยัน|overview|ภาพรวม|rules|กฎ|help|settings|ตั้งค่า/i.test(txt)) continue;
            if (txt === "bet" || txt === "เดิมพัน" || txt === "play" || txt === "ทอย") {
                cachedBetBtn = b;
                return b;
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
                const t = (btns[i].textContent || "").trim().toLowerCase();
                if (/ความโปร่งใส|โปร่งใส|fairness|provably|seed|ซีด|verify|ยืนยัน/i.test(t)) continue;
                if (/^(bet|เดิมพัน|play|ทอย|roll)/i.test(t) && isElUsable(btns[i])) return btns[i];
            }
        }
        if (inp) {
            let p = inp.parentElement;
            for (let d = 0; d < 6 && p; d++) {
                const btns = p.querySelectorAll("button");
                for (let i = 0; i < btns.length; i++) {
                    const t = (btns[i].textContent || "").trim().toLowerCase();
                    if (/ความโปร่งใส|โปร่งใส|fairness|provably|seed|ซีด|verify|ยืนยัน/i.test(t)) continue;
                    if (/^(bet|เดิมพัน|play|ทอย|roll)/i.test(t) && isElUsable(btns[i])) return btns[i];
                }
                p = p.parentElement;
            }
        }
        return null;
    }

    // ตรวจสุขภาพ selector: บอกผู้ใช้ตรง ๆ ว่าอะไรหาย แทนการวนรอเงียบ ๆ
    // 🔎 เก็บสภาพ DOM จริงไว้ใน diag (ใช้ตอน "กด START แล้วไม่แทง")
    function diagDomProbe(extra) {
        const out = Object.assign({
            url: String(location.href).slice(0, 160),
            t: Date.now()
        }, extra || {});
        try {
            const btn = (cachedBetBtn && document.body.contains(cachedBetBtn)) ? cachedBetBtn : getBetButton();
            out.btn = !!btn;
            out.btnDisabled = !!(btn && btn.disabled);
            out.btnAria = btn ? String(btn.getAttribute("aria-disabled") || "") : "";
            out.btnText = btn ? String((btn.textContent || "").trim()).slice(0, 24) : "";
            const amt = (cachedAmountInput && document.body.contains(cachedAmountInput)) ? cachedAmountInput : resolveAmountInput();
            out.amountInput = !!amt;
            out.amountValue = amt ? String(amt.value) : "";
            const ch = (cachedChanceInput && document.body.contains(cachedChanceInput)) ? cachedChanceInput : resolveChanceInput();
            out.chanceInput = !!ch;
            out.chanceValue = ch ? String(ch.value) : "";
            out.balance = getBalance();
            out.running = sessionRunning;
            out.inBet = isBetInProgress;
            out.waiting = isWaitingNextRound;
            out.virtual = isVirtualBetActive();
            out.domHealth = probeDomHealth();
        } catch (e) { out.error = String(e && e.message || e); }
        return out;
    }

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
        const banned = /stop|หยุด|reload|โหลด|cash\s*out|ถอน|ทั้งหมด|settings|ตั้งค่า|history|ประวัติ|ความโปร่งใส|โปร่งใส|fairness|provably|seed|ซีด|verify|ยืนยัน|overview|ภาพรวม|rules|กฎ|help|ช่วยเหลือ/i;

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
            for (let i = 0; i < fb.length; i++) {
                const t = (fb[i].textContent || "").trim().toLowerCase();
                if (/^(bet|เดิมพัน|play|ทอย|roll)/i.test(t)) push(fb[i], "ปุ่มในฟอร์มเดียวกับช่องยอด");
            }
        }
        const all = panel.querySelectorAll("button");
        for (let i = 0; i < all.length; i++) {
            const t = (all[i].textContent || "").trim();
            if (/^(bet|เดิมพัน|play|ทอย|roll|place)/i.test(t)) push(all[i], "ข้อความปุ่ม '" + t + "'");
        }

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
        try {
            if (btn.disabled) {
                btn.disabled = false;
                btn.removeAttribute("disabled");
            }
            if (btn.getAttribute("aria-disabled") === "true") {
                btn.removeAttribute("aria-disabled");
                btn.setAttribute("aria-disabled", "false");
            }
        } catch (e) {}
        try {
            btn.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true }));
            btn.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
            btn.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, cancelable: true }));
            btn.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
        } catch (e) {}
        btn.click();
    }

    // ==================================================
    // 6. FIBONACCI ENGINE — 20 ไม้ (49.5% Under · ชนะติด 2 ตา / ถอย 2 ขั้น / รีเซ็ตไม้ 1)
    // ==================================================

    function getFibonacciMultiplier(step) {
        const s = (typeof step === "number" && isFinite(step)) ? Math.floor(step) : 1;
        const idx = Math.max(0, Math.min(MAX_FIBO_STEPS - 1, s - 1));
        return FIBONACCI_STEPS[idx] || 1;
    }

    function computeDynamicBaseBet(bal) {
        const minB = (typeof effectiveMinBet === "function") ? effectiveMinBet() : AUTO_MIN_BET;
        if (typeof bal !== "number" || !isFinite(bal) || bal <= 0) return minB;
        // สายเซฟ 20 ไม้: balance / 17,710
        const raw = Math.floor((bal / DYNAMIC_BASE_DIVISOR) * 1e8) / 1e8;
        return Math.max(minB, raw);
    }

    // 🔄 คำนวณและปรับยอดฐานใหม่ทุกครั้งที่เกิดการ "รีเซ็ต" (จบไม้ 1, กู้คืนสำเร็จ, จบ F5 recovery, หรือเริ่มเซสชันใหม่)
    function updateBaseBetOnReset(reason) {
        if (!configDynamicBase) return (lockedCycleBaseBet || parseFloat(configRealBaseBet) || AUTO_MIN_BET);
        const liveBal = (typeof currentBalance === "number" && isFinite(currentBalance) && currentBalance > 0)
            ? currentBalance
            : getBalance();
        const oldBase = lockedCycleBaseBet;
        const newBase = computeDynamicBaseBet(liveBal);
        lockedCycleBaseBet = newBase;
        configRealBaseBet = formatBetAmount(newBase);
        try { if (typeof syncHUDInputs === "function") syncHUDInputs(); } catch (e) {}
        if (oldBase !== null && Math.abs(oldBase - newBase) >= 1e-8) {
            log(`📈 [DYNAMIC BASE] รีเซ็ตรอบ (20 ไม้) → ปรับยอดฐานใหม่: ${formatBetAmount(newBase)}$ (ตาม Balance ${formatNumber(liveBal, 4)}$) [${reason || 'Reset'}]`, true);
        }
        return newBase;
    }

    function getBaseBet() {
        if (configDynamicBase) {
            // ถ้าระหว่างทบไม้แก้ตัว (mStep > 1) ให้ล็อกยอดฐานเดิมของรอบนั้นไว้ ป้องกันยอดทบแกว่ง
            if (sessionRunning && mStep > 1 && lockedCycleBaseBet !== null) return lockedCycleBaseBet;
            
            // เมื่ออยู่ไม้ 1 ถ้ายังไม่มีค่าล็อก ให้คำนวณจากยอด Balance ปัจจุบัน
            if (lockedCycleBaseBet === null) {
                return updateBaseBetOnReset("ไม้ 1");
            }
            return lockedCycleBaseBet;
        }
        const v = parseFloat(configRealBaseBet);
        return (v > 0) ? v : parseFloat(FIXED_BASE_BET);
    }

    // แปลงยอดเป็นสตริงทศนิยมล้วน ห้ามออกมาเป็นรูป 4.8e-7 (ช่องยอดของ Stake ไม่รับ)
    function formatBetAmount(x) {
        const n = (typeof x === "number" && isFinite(x)) ? x : parseFloat(x);
        const v = (isFinite(n) && n >= 0) ? n : 0;
        // ⚠️ ยอด ≥0.01 ต้อง "ปัดขึ้น" ไม่ใช่ toFixed (ปัดลง) — ไม่งั้นเศษที่หายไปทำให้
        //    ยอดไม้ deficit+base ไม่พอคืนทุนเป๊ะ แล้วระบบต้องเล่นเพิ่มอีกไม้ (2-WIN SHORT)
        if (v >= 0.01) return (Math.ceil(v * 1e4 - 1e-12) / 1e4).toFixed(4);
        return v.toFixed(8).replace(/0+$/, "").replace(/\.$/, "");
    }

    // ==================================================
    // 6. DEFICIT PARTITIONING (K=2) RECOVERY ENGINE
    // คำนวณยอดไม้ตามหนี้จริง: ไม้ = (หนี้สะสม / 2) + ยอดฐาน
    // ช่วยให้กู้คืนทุนครบ 100% ภายใน 2 ชนะ ไม่ว่าจะมีแพ้คั่นกลางกี่ครั้ง
    // ==================================================
    function getCycleDeficit() {
        if (cycleStartBalance !== null && currentBalance !== null) {
            return Math.max(0, parseFloat((cycleStartBalance - currentBalance).toFixed(8)));
        }
        return (cycleProfit < 0) ? Math.abs(cycleProfit) : 0;
    }

    // ยอดไม้ปัจจุบัน: ไม้ 1 ใช้ยอดฐาน / ไม้แก้ตัวแยกตามระบบที่เลือก (Hybrid, K=2 หรือ Fibonacci)
    function calculateCurrentBetAmount() {
        const base = Math.max(getBaseBet(), effectiveMinBet());
        if (mStep === 1) {
            return formatBetAmount(base);
        }
        if (activeEngineMode === "hybrid") {
            // ⚡ HYBRID ENGINE (ไม้ตื้น ≤4: K=1 คืนทุนตาเดียว + ไม้ลึก ≥5: K=2 เซฟพอร์ต)
            const deficit = getCycleDeficit();
            let rawBet;
            if (mStep <= 4) {
                // 🎯 ไม้ตื้น (ไม้ 2-4): K=1 Full Deficit Recovery — แทงหนี้สะสม + ฐาน ชนะเพียง 1 ตา คืนทุน 100% ทันที!
                rawBet = (deficit > 0) ? (deficit + base) : base;
            } else if (currentStreak >= 1 || (inRefreshRecovery && recoveryWinStreak >= 1)) {
                // 🎯 ไม้ลึก: ชนะตาแรกมาแล้ว ปิดหนี้ที่เหลืออยู่
                rawBet = (deficit > 0) ? (deficit + base) : base;
            } else if (closeAllNext && mStep > 2) {
                rawBet = (deficit > 0) ? (deficit + base) : base;
            } else {
                // 🛡️ ไม้ลึก: เพิ่งแพ้มา แทงหนี้/2 เพื่อเซฟพอร์ต ทนได้ 20 ไม้
                rawBet = (deficit > 0) ? ((deficit / 2) + base) : base;
            }
            // ⚠️ - 1e-6 หน่วย (1e-8) ตัดเศษ float ก่อน ceil — ถ้าไม่มี จะได้ 0.00204001 แทน 0.00204000
            const amt = Math.max(effectiveMinBet(), Math.ceil(rawBet * 1e8 - 1e-6) / 1e8);
            return formatBetAmount(amt);
        } else if (activeEngineMode === "fibo") {
            // 📈 ระบบ Fibonacci 20 ไม้: ตัวคูณ Fibonacci ตามลำดับไม้
            const mult = getFibonacciMultiplier(mStep);
            const amt = Math.max(effectiveMinBet(), Math.ceil(base * mult * 1e8 - 1e-6) / 1e8);
            return formatBetAmount(amt);
        } else {
            // 🎯 Deficit Partitioning (Pure K=2):
            const deficit = getCycleDeficit();
            let rawBet;
            if (currentStreak >= 1 || (inRefreshRecovery && recoveryWinStreak >= 1)) {
                rawBet = (deficit > 0) ? (deficit + base) : base;
            } else if (closeAllNext && mStep > 2) {
                rawBet = (deficit > 0) ? (deficit + base) : base;
            } else {
                rawBet = (deficit > 0) ? ((deficit / 2) + base) : base;
            }
            // ⚠️ - 1e-6 หน่วย (1e-8) ตัดเศษ float ก่อน ceil — ถ้าไม่มี จะได้ 0.00204001 แทน 0.00204000
            const amt = Math.max(effectiveMinBet(), Math.ceil(rawBet * 1e8 - 1e-6) / 1e8);
            return formatBetAmount(amt);
        }
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
        autoDiag("desync");
        trace("DESYNC", { diff: diff, actual: actualBal, model: currentBalance, tol: tol, source: source, strikes: desyncStrikes, limit: DESYNC_STRIKE_LIMIT });
        cleanSyncStreak = 0;
        lastDesync = { dom: actualBal, model: currentBalance, diff: diff, tol: tol, source: source };
        const signed = (diff >= 0 ? "+" : "−") + formatNumber(Math.abs(diff), 8);
        log(`⚠️ [DESYNC/${source}] ยอดจริง ${formatNumber(actualBal, 8)} ≠ ที่คำนวณ ${formatNumber(currentBalance, 8)} | ต่าง ${signed} (เกณฑ์ ${formatNumber(tol, 8)}, ไม้ล่าสุด ${formatNumber(lastBetAmount, 8)}) (ครั้งที่ ${desyncStrikes}/${DESYNC_STRIKE_LIMIT})`, true);
        updateStatusText(`⚠️ ยอดต่าง ${signed} [${source}] (${desyncStrikes}/${DESYNC_STRIKE_LIMIT})`, "#ffa726");
        if (desyncStrikes < DESYNC_STRIKE_LIMIT) return;
        // 🔁 ไม่หยุดเซสชัน: ซิงก์ยอดจริงเข้ามาเป็นค่าตั้งต้นใหม่แล้วเล่นต่อ (ไม่จำกัดจำนวนครั้ง)
        resyncCount++;
        currentBalance = parseFloat(actualBal.toFixed(8));
        desyncStrikes = 0;
        lastBetAmount = 0;
        trace("RESYNC", { count: resyncCount, actual: actualBal, diff: diff });
        log(`↔️ [RESYNC ${resyncCount}] ปรับยอดในระบบเป็น ${formatNumber(actualBal, 8)} (ต่าง ${signed}) — เล่นต่อ`, true);
        updateStatusText(`↔️ ซิงก์ยอดใหม่ (ต่าง ${signed}) — เล่นต่อ`, "#ffa726");
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
    // 6.4 FIBONACCI AUDIT & INTEGRITY MONITOR
    // ==================================================
    function runFiboAudit() {
        return `🎯 Fibonacci: 20 ไม้ · ชนะติด 2 ตา / ถอย 2 ขั้น รีเซ็ตไม้ 1 · 49.5% Under`;
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
    // 🎯 กดฝั่ง Under/Over บนหน้าเว็บจริง (เดิมฟังก์ชันนี้แค่ตั้งตัวแปรในโค้ด
    //    หน้าเว็บจึงค้างที่ Over 50.5 → ชนะเฉพาะทอยเกิน 50.5 ทั้งที่ log บอก under 49.5)
    let pageSideApplied = null;        // ด้านที่กดยืนยันล่าสุดบนหน้าเว็บ
    let pageSideAppliedAt = 0;
    let pageSideMissAt = 0;
    let sideMismatchAt = 0;

    function sideLabelWords(side) {
        return side === "over"
            ? ["over", "สูงกว่า", "มากกว่า", "สูง"]
            : ["under", "ต่ำกว่า", "น้อยกว่า", "ต่ำ"];
    }

    // 🎯 ทางหลัก: เขียน target ตรงช่องของเกม — จาก DOM จริงบนหน้า Stake Dice:
    //    INPUT data-testid="reverse-roll" value 50.50 + ป้าย "ทอยให้ได้มากกว่า" = Over 50.5
    //    ตั้งเป็น 49.5 → เกมสลับเป็น "ทอยให้ได้น้อยกว่า 49.5" = Under 49.5 (chance 49.5%)
    function setRollTargetOnPage(side) {
        let inp = null;
        try {
            inp = document.querySelector('input[data-testid="reverse-roll"]') ||
                  document.querySelector('[data-testid="reverse-roll"] input');
        } catch (e) { return false; }
        if (!inp) return false;
        const chance = parseFloat(configChance) || 49.5;
        const want = (side === "over") ? (100 - chance) : chance;
        const cur = parseFloat(String(inp.value).replace(/,/g, ""));
        if (Number.isFinite(cur) && Math.abs(cur - want) <= 0.009) {
            pageSideApplied = side;
            pageSideAppliedAt = Date.now();
            return true;
        }
        try {
            inp.focus({ preventScroll: true });
            const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
            if (desc && desc.set) desc.set.call(inp, String(want)); else inp.value = String(want);
            inp.dispatchEvent(new Event("input", { bubbles: true }));
            inp.dispatchEvent(new Event("change", { bubbles: true }));
            inp.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", bubbles: true }));
        } catch (e) { return false; }
        let after = parseFloat(String(inp.value).replace(/,/g, ""));
        let ok = Number.isFinite(after) && Math.abs(after - want) <= 0.01;
        // ทางเสริม: พิมพ์ค่าทับผ่าน keyboard pipeline (บาง build ของเว็บไม่รับ value setter)
        if (!ok) {
            try {
                inp.focus({ preventScroll: true });
                if (typeof inp.select === "function") inp.select();
                document.execCommand("insertText", false, String(want));
                inp.dispatchEvent(new Event("input", { bubbles: true }));
                inp.dispatchEvent(new Event("change", { bubbles: true }));
                inp.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", bubbles: true }));
            } catch (e) {}
            after = parseFloat(String(inp.value).replace(/,/g, ""));
            ok = Number.isFinite(after) && Math.abs(after - want) <= 0.01;
        }
        if (ok) return true;
        try { trace("SIDE_TARGET_FAIL", { want: side, target: want, value: String(inp.value) }); } catch (e) {}
        return false;
    }

    function sideLabelMatches(text, side) {
        const t = String(text || "").replace(/\s+/g, " ").trim().toLowerCase();
        if (!t || t.length > 20) return false;
        const words = sideLabelWords(side);
        for (let i = 0; i < words.length; i++) {
            // "under" / "under 49.50" / "under (49.5%)" / "ต่ำกว่า 49.50"
            if (t.indexOf(words[i]) !== -1) return true;
        }
        return false;
    }

    // 🔎 เก็บตัวอย่าง element จริงบนหน้าเว็บ (ส่งไปกับ diag เมื่อหาปุ่มไม่เจอ)
    // เพื่อให้รู้ว่าปุ่มฝั่งบนเว็บชื่ออะไร (tag/testid/aria/text) แล้วล็อก selector ได้ตรง
    function collectSideDomSample() {
        const out = [];
        let nodes;
        try { nodes = document.querySelectorAll('button, [role], label, a, div, span, li, input'); } catch (e) { return out; }
        const anchor = document.querySelector('input[data-testid="chance"], input[data-testid="input-chance"]') ||
                       document.querySelector('input[data-testid="input-game-amount"]');
        const aRect = anchor ? anchor.getBoundingClientRect() : null;
        const seen = {};
        const limit = Math.min(nodes.length, 12000);
        for (let i = 0; i < limit && out.length < 40; i++) {
            const el = nodes[i];
            if (!el || el.children.length > 3) continue;
            if (!isVisibleEl(el)) continue;
            const txt = String(el.textContent || "").replace(/\s+/g, " ").trim();
            const isInput = el.tagName === "INPUT";
            if (!isInput && (!txt || txt.length > 24)) continue;
            const r = el.getBoundingClientRect();
            let d = null;
            if (aRect) d = Math.round(Math.hypot((r.left + r.width / 2) - (aRect.left + aRect.width / 2), (r.top + r.height / 2) - (aRect.top + aRect.height / 2)));
            if (d !== null && d > 420) continue;
            const item = {
                tag: el.tagName,
                text: isInput ? "" : txt.slice(0, 40),
                testid: el.getAttribute("data-testid") || "",
                role: el.getAttribute("role") || "",
                aria: el.getAttribute("aria-label") || "",
                ph: isInput ? (el.getAttribute("placeholder") || "") : "",
                val: isInput ? String(el.value || "").slice(0, 20) : "",
                x: Math.round(r.left), y: Math.round(r.top)
            };
            const key = item.tag + "|" + item.text + "|" + item.testid + "|" + item.aria + "|" + item.ph;
            if (seen[key]) continue;
            seen[key] = 1;
            out.push(item);
        }
        return out;
    }

    function isVisibleEl(el) {
        try {
            const r = el.getBoundingClientRect();
            if (!r || r.width < 2 || r.height < 2) return false;
            const cs = window.getComputedStyle(el);
            return cs.display !== "none" && cs.visibility !== "hidden" && parseFloat(cs.opacity || "1") > 0.05;
        } catch (e) { return false; }
    }

    function isClickableEl(el) {
        try {
            if (el.tagName === "BUTTON" || el.getAttribute("role") === "button" || el.hasAttribute("tabindex")) return true;
            return window.getComputedStyle(el).cursor === "pointer";
        } catch (e) { return false; }
    }

    // รู้แน่ชัดว่าเลือกอยู่ไหมเฉพาะแอตทริบิวต์มาตรฐาน (ไม่เดาจาก class เพื่อกัน false positive)
    function sideControlActive(el) {
        try {
            const pressed = el.getAttribute("aria-pressed");
            if (pressed === "true") return true;
            if (pressed === "false") return false;
            const sel = el.getAttribute("aria-selected") || el.getAttribute("data-active") || el.getAttribute("data-selected");
            if (sel === "true") return true;
            if (sel === "false") return false;
        } catch (e) {}
        return null;
    }

    function findRollSideControl(side) {
        let nodes;
        try { nodes = document.querySelectorAll('button, [role="button"], [role="radio"], [role="tab"], [role="option"], [role="switch"], label, a, div, span'); } catch (e) { return null; }
        const anchor = document.querySelector('input[data-testid="chance"], input[data-testid="input-chance"]') ||
                       document.querySelector('input[data-testid="input-game-amount"]');
        const aRect = anchor ? anchor.getBoundingClientRect() : null;
        const found = [];
        const limit = Math.min(nodes.length, 8000);
        for (let i = 0; i < limit; i++) {
            const el = nodes[i];
            if (!el || el.children.length > 2) continue;
            if (!sideLabelMatches(el.textContent, side)) continue;
            if (!isVisibleEl(el) || !isClickableEl(el)) continue;
            if (!aRect) { found.push({ el: el, d: 0 }); continue; }
            const r = el.getBoundingClientRect();
            const d = Math.hypot((r.left + r.width / 2) - (aRect.left + aRect.width / 2), (r.top + r.height / 2) - (aRect.top + aRect.height / 2));
            if (d > 500) continue; // ไกลเกินไป = ไม่ใช่ปุ่มของเกม
            found.push({ el: el, d: d });
        }
        if (!found.length) return null;
        found.sort(function (x, y) { return x.d - y.d; });
        return found[0].el;
    }

    // ==================================================
    // 6.2 ตรวจฝั่งจริงจากหน้าเว็บ (ป้าย + ช่อง target) — ใช้เป็นประตูก่อนยิงไม้จริง
    // ==================================================
    function readTargetField() {
        try {
            const inp = document.querySelector('input[data-testid="reverse-roll"]') ||
                        document.querySelector('[data-testid="reverse-roll"] input');
            if (!inp) return null;
            const v = parseFloat(String(inp.value).replace(/,/g, ""));
            return Number.isFinite(v) ? v : null;
        } catch (e) { return null; }
    }

    // อ่านป้ายของเกม: "ทอยให้ได้มากกว่า" = Over / "ทอยให้ได้น้อยกว่า" = Under
    function readSideLabelText() {
        try {
            const nodes = document.querySelectorAll('label, span, div, p');
            const limit = Math.min(nodes.length, 15000);
            for (let i = 0; i < limit; i++) {
                const el = nodes[i];
                if (el.children.length > 2) continue;
                const t = String(el.textContent || "").replace(/\s+/g, " ").trim();
                if (!t || t.length > 40) continue;
                if (t.indexOf("ทอยให้ได้") === -1 && !/roll\s*(under|over)/i.test(t)) continue;
                if (!isVisibleEl(el)) continue;
                return t;
            }
        } catch (e) {}
        return "";
    }

    // true = หน้าเว็บอยู่ฝั่งที่ต้องการ · false = ยังผิดฝั่ง · null = อ่านไม่ได้ (ไม่บล็อก)
    function verifyPageSide(side) {
        const label = readSideLabelText();
        if (label) {
            const under = label.indexOf("น้อยกว่า") !== -1 || /under/i.test(label);
            const over = label.indexOf("มากกว่า") !== -1 || /over/i.test(label);
            if (under || over) return (side === "under") ? under : over;
        }
        const t = readTargetField();
        if (t !== null) return (side === "under") ? (t < 50) : (t >= 50);
        return null;
    }

    function markSideApplied(side, via) {
        pageSideApplied = side;
        pageSideAppliedAt = Date.now();
        try { trace("SIDE_TARGET_SET", { want: side, via: via, target: readTargetField(), label: readSideLabelText().slice(0, 32) }); } catch (e) {}
    }

    // 🎚️ ทางสำรอง 1: ช่องเลื่อน dice-slider (หน้าเว็บจริง slider=51 คู่กับ target 50.5)
    //    เดาความสัมพันธ์ slider→target จากค่าปัจจุบัน แล้วลองหลายค่า — ยืนยันด้วยป้ายทุกครั้ง
    function setRollViaSlider(side) {
        let inp = null;
        try {
            inp = document.querySelector('input[data-testid="dice-slider"]') ||
                  document.querySelector('[data-testid="dice-slider"] input') ||
                  document.querySelector('input[type="range"]');
        } catch (e) { return false; }
        if (!inp) return false;
        const chance = parseFloat(configChance) || 49.5;
        const want = (side === "over") ? (100 - chance) : chance;
        const curT = readTargetField();
        const curS = parseFloat(String(inp.value).replace(/,/g, ""));
        const cands = [];
        if (curT !== null && Number.isFinite(curS)) cands.push(parseFloat((want + (curS - curT)).toFixed(2)));
        cands.push(want, Math.round(want), Math.floor(want), Math.ceil(want), 49, 50);
        const min = parseFloat(inp.getAttribute("min"));
        const max = parseFloat(inp.getAttribute("max"));
        const step = parseFloat(inp.getAttribute("step"));
        for (let i = 0; i < cands.length; i++) {
            let v = cands[i];
            if (!Number.isFinite(v)) continue;
            if (Number.isFinite(min) && v < min) v = min;
            if (Number.isFinite(max) && v > max) v = max;
            if (Number.isFinite(step) && step > 0) v = parseFloat((Math.round(v / step) * step).toFixed(4));
            try {
                const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
                if (desc && desc.set) desc.set.call(inp, String(v)); else inp.value = String(v);
                inp.dispatchEvent(new Event("input", { bubbles: true }));
                inp.dispatchEvent(new Event("change", { bubbles: true }));
                inp.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", bubbles: true }));
            } catch (e) { continue; }
            if (verifyPageSide(side) === true) {
                try { trace("SIDE_SLIDER_SET", { want: side, value: v }); } catch (e) {}
                return true;
            }
        }
        return false;
    }

    // ⬅️➡️ ทางสำรอง 2: กดปุ่มลูกศรเพิ่ม/ลดรอบช่อง target (สูงสุด 40 ครั้ง)
    function setRollViaArrows(side) {
        let anchor = null;
        try {
            anchor = document.querySelector('input[data-testid="reverse-roll"]') ||
                     document.querySelector('input[data-testid="chance"]');
        } catch (e) { return false; }
        if (!anchor) return false;
        const aRect = anchor.getBoundingClientRect();
        const nodes = document.querySelectorAll('button, [role="button"]');
        const plus = [];
        const minus = [];
        for (let i = 0; i < nodes.length && i < 4000; i++) {
            const el = nodes[i];
            if (!isVisibleEl(el)) continue;
            const r = el.getBoundingClientRect();
            const d = Math.hypot((r.left + r.width / 2) - (aRect.left + aRect.width / 2), (r.top + r.height / 2) - (aRect.top + aRect.height / 2));
            if (d > 80) continue; // ต้องติดช่อง target จริง (กันไปโดนปุ่ม +/- ของช่องยอด)
            const sym = String(el.textContent || "").trim();
            const label = (String(el.getAttribute("aria-label") || "") + " " + String(el.getAttribute("title") || "") + " " + sym).trim().toLowerCase();
            if (/^(−|-|–)$/.test(sym) || /decrease|minus|less|ลด|ลง/.test(label)) minus.push(el);
            else if (/^(\+|＋)$/.test(sym) || /increase|plus|more|เพิ่ม|ขึ้น/.test(label)) plus.push(el);
        }
        if (!plus.length && !minus.length) return false;
        const chance = parseFloat(configChance) || 49.5;
        const want = (side === "over") ? (100 - chance) : chance;
        for (let i = 0; i < 40; i++) {
            if (verifyPageSide(side) === true) {
                try { trace("SIDE_ARROW_SET", { want: side, clicks: i, target: readTargetField() }); } catch (e) {}
                return true;
            }
            const cur = readTargetField();
            let btn = null;
            if (cur === null) btn = minus[0] || plus[0];
            else if (!minus.length) btn = plus[0];
            else if (!plus.length) btn = minus[0];
            else btn = (cur > want) ? minus[0] : plus[0];
            if (!btn) break;
            try { btn.click(); } catch (e) { break; }
            // ปุ่มที่ไม่ทำให้ target ขยับ = ไม่ใช่ปุ่มของช่องนี้ → หยุด (กันคลิกรัวผิดปุ่ม)
            const afterClick = readTargetField();
            if (cur !== null && afterClick !== null && Math.abs(afterClick - cur) < 0.001) break;
        }
        return verifyPageSide(side) === true;
    }

    // 🔀 ป้าย "ทอยให้ได้มากกว่า/น้อยกว่า" = ตัวสลับฝั่งของเกม
    //    (diag build 175 พิสูจน์แล้ว: เขียน target 49.5 แล้ว chance ยอมรับ แต่ป้ายยังเป็น "มากกว่า")
    //    → ต้องคลิกป้ายนี้จริง ฝั่งจึงเปลี่ยน
    let lastToggleClickAt = 0;
    let sideLabelBeforeAction = "";

    function findSideLabelEl() {
        try {
            const nodes = document.querySelectorAll('span, label, div, button');
            const limit = Math.min(nodes.length, 12000);
            for (let i = 0; i < limit; i++) {
                const el = nodes[i];
                if (el.children.length > 1) continue;
                const t = String(el.textContent || "").replace(/\s+/g, " ").trim();
                if (!t || t.length > 40 || t.indexOf("ทอยให้ได้") === -1) continue;
                if (!isVisibleEl(el)) continue;
                return el;
            }
        } catch (e) {}
        return null;
    }

    function clickSideToggle(side) {
        const now = Date.now();
        if (now - lastToggleClickAt < 1500) return false; // กันสลับรัว/กลับไปกลับมา
        const el = findSideLabelEl();
        if (!el) return false;
        sideLabelBeforeAction = readSideLabelText();
        lastToggleClickAt = now;
        const target = el.closest('button, [role="button"], label, [tabindex]') || el.parentElement || el;
        try {
            const r = target.getBoundingClientRect();
            const opts = { bubbles: true, cancelable: true, view: window, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0 };
            try { target.dispatchEvent(new PointerEvent("pointerdown", opts)); } catch (e) {}
            target.dispatchEvent(new MouseEvent("mousedown", opts));
            try { target.dispatchEvent(new PointerEvent("pointerup", opts)); } catch (e) {}
            target.dispatchEvent(new MouseEvent("mouseup", opts));
            target.click();
            try { trace("SIDE_TOGGLE_CLICK", { want: side, label: sideLabelBeforeAction.slice(0, 32), tag: target.tagName }); } catch (e) {}
            return true;
        } catch (e) { return false; }
    }

    function applyRollSideToPage(side) {
        const chanceWant = parseFloat(configChance) || 49.5;
        const wantTarget = (side === "over") ? (100 - chanceWant) : chanceWant;
        // 0) ป้ายถูกฝั่งอยู่แล้ว → เช็คแต่ตัวเลข target ให้ตรง 49.5
        if (verifyPageSide(side) === true) {
            const cur = readTargetField();
            if (cur === null || Math.abs(cur - wantTarget) <= 0.01) { markSideApplied(side, "already"); return true; }
            if (setRollTargetOnPage(side) && verifyPageSide(side) !== false) { markSideApplied(side, "target"); return true; }
        }
        // 1) ทางหลัก: เขียนช่อง target (reverse-roll) แล้วยืนยันป้ายจริงทุกครั้ง
        if (setRollTargetOnPage(side)) {
            const ok = verifyPageSide(side);
            if (ok !== false) { markSideApplied(side, "target"); return true; }
            try { trace("SIDE_VERIFY_FAIL", { via: "target", want: side, label: readSideLabelText().slice(0, 32), target: readTargetField() }); } catch (e) {}
        }
        // 2) เขียนตัวเลขแล้วฝั่งยังไม่เปลี่ยน → คลิกป้าย “ทอยให้ได้…” เพื่อสลับUnder/Over จริง
        if (clickSideToggle(side)) {
            setRollTargetOnPage(side);
            markSideApplied(side, "toggle");
            return true;
        }
        // 3) ทางสำรอง: เขียนช่องเลื่อน dice-slider
        if (setRollViaSlider(side)) { markSideApplied(side, "slider"); return true; }
        // 4) ทางสำรอง: ปุ่มลูกศรเพิ่ม/ลด
        if (setRollViaArrows(side)) { markSideApplied(side, "arrow"); return true; }
        // 5) ทางสำรองสุดท้าย: กดป้าย/ปุ่มฝั่งบนหน้าเว็บ
        const el = findRollSideControl(side);
        if (!el) {
            pageSideApplied = null;
            const now = Date.now();
            if (now - pageSideMissAt > 60000) {
                pageSideMissAt = now;
                try { trace("SIDE_CONTROL_MISS", { want: side, dom: collectSideDomSample() }); } catch (e) {}
                log(`⚠️ หาปุ่ม ${side.toUpperCase()} บนหน้าเว็บไม่เจอ — ยังใช้ด้านที่หน้าเว็บตั้งไว้`, true);
            }
            return false;
        }
        if (sideControlActive(el) === true) { markSideApplied(side, "control"); return true; }
        try {
            el.click();
            markSideApplied(side, "control-click");
            return true;
        } catch (e) { return false; }
    }

    function applyRollSide() {
        if (!configAlternateRoll) {
            currentRollSide = "under";
        }
        pendingRollSide = currentRollSide;
        return applyRollSideToPage(currentRollSide);
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

    function applyBetSettings(force = false) {
        if (detectedMinBet === null) refreshBetLimits(); // อ่านขั้นต่ำ/สูงสุดจากช่องเดิมพันครั้งแรก
        // 🛡️ ป้องกันปุ่มเดิมพันติด disabled: เขียนยอดคำนวณจริงในช่องกรอก
        // 🌬️ แต่ถ้าอยู่โหมดแทงลม → เขียน 0 ลงช่องจริง (คำขอยังถูกบังคับ amount=0)
        const targetAmount = calculateCurrentBetAmount();
        const amountToWrite = (typeof isVirtualBetActive === "function" && isVirtualBetActive() && configVirtualWriteZero) ? 0 : targetAmount;
        // 🎯 กดฝั่ง Under/Over ก่อน แล้วค่อยเขียนยอด/โอกาส เพื่อให้ target สุดท้ายเป็นของฝั่งที่ต้องการ
        const sideOK = applyRollSide();
        const amountOK = setInput("input-game-amount", amountToWrite, force);
        const chanceOK = setInput("chance", configChance, force);
        return amountOK && chanceOK && sideOK;
    }

    // 🌬️ เขียน "0" ลงช่องยอดจริง ๆ ตอนแทงลม (ผู้ใช้ต้องการให้เห็น 0 ในช่อง)
    // เว็บจะตรวจขั้นต่ำแล้วปิดปุ่ม → ปลด disabled ให้คลิกได้ (คำขอถูกบังคับ amount=0 อยู่แล้ว)
    function writeZeroToAmountInput() {
        try {
            // หาช่องยอด (cache ก่อน แล้วค่อยค้น)
            let inp = (cachedAmountInput && document.body.contains(cachedAmountInput)) ? cachedAmountInput : null;
            if (!inp) {
                inp = document.querySelector('input[data-testid="input-game-amount"]') ||
                      document.querySelector('[data-testid="input-game-amount"] input') ||
                      document.querySelector('input[data-testid="bet-amount"]') ||
                      resolveAmountInput();
                if (inp) cachedAmountInput = inp;
            }
            if (!inp) return false;

            const btnNow = cachedBetBtn || getBetButton();
            const btnLocked = !!(btnNow && (btnNow.disabled || btnNow.getAttribute("aria-disabled") === "true"));
            // ⚡ เร็ว: ถ้าช่องเป็น 0 อยู่แล้วและปุ่มไม่ล็อก → ไม่ต้องเขียน/ยิง event ซ้ำ (ลด re-render)
            if (String(inp.value) === "0" && !btnLocked) {
                return true;
            }
            try { inp.focus({ preventScroll: true }); } catch (e) {}
            const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
            if (desc && desc.set) desc.set.call(inp, "0"); else inp.value = "0";
            // ⚠️ ไม่ยิง change/blur — เว็บจะตรวจขั้นต่ำแล้วคล็อคค่ากลับ ทำให้ "ค้าง"
            inp.dispatchEvent(new Event("input", { bubbles: true }));
            inp.dispatchEvent(new KeyboardEvent("keyup", { key: "0", bubbles: true }));

            const btn = cachedBetBtn || getBetButton();
            if (btn) {
                try {
                    if (btn.disabled) btn.disabled = false;
                    btn.removeAttribute("disabled");
                    btn.removeAttribute("aria-disabled");
                    btn.setAttribute("aria-disabled", "false");
                    btn.classList.remove("disabled");
                } catch (e) {}
            }
            return String(inp.value) === "0";
        } catch (e) { return false; }
    }

    // ==================================================
    // 6.5 SESSION LOG (ชุดเดียว) — ทะเบียนไม้ + เหตุการณ์ + ข้อความ อยู่ใน diag
    // ==================================================
    let ledgerGaps = 0;
    let lastLedgerBalance = null;
    let betSeq = 0;
    let lastTrace = null;

    function getAmountInputValue() {
        try {
            const inp = (cachedAmountInput && document.body.contains(cachedAmountInput)) ? cachedAmountInput : null;
            return inp ? String(inp.value) : null;
        } catch (e) { return null; }
    }

    function trace(type, data) {
        try {
            lastTrace = { at: Date.now(), type: type, data: data || {} };
            diagPush(type, null, data);
        } catch (e) {}
    }

    // event = trace (เก็บชุดเดียว)
    function recordEvent(type, data) { trace(type, data); }

    function ledgerRecord(rec) {
        try {
            const amount = parseFloat(Number(rec.amount || 0).toFixed(8));
            const delta = parseFloat(Number(rec.delta || 0).toFixed(8));
            const balance = (typeof rec.balance === "number" && isFinite(rec.balance)) ? parseFloat(rec.balance.toFixed(8)) : null;
            const bet = {
                n: ++betSeq, s: rec.step, a: amount, w: rec.win ? 1 : 0, dl: delta, bl: balance, src: rec.source || "?",
                r: (typeof rec.roll === "number") ? parseFloat(Number(rec.roll).toFixed(2)) : null,   // เลขลูกเต๋า
                tg: (typeof rec.target === "number") ? rec.target : null,                              // เป้า %
                cd: rec.cond || null,                                                                   // under/over
                sq: (typeof rec.seq === "number") ? rec.seq : null,                                     // ลำดับทอย
                ms: (typeof rec.latencyMs === "number") ? rec.latencyMs : null                          // คลิก→ผล (ms)
            };
            diagPush("BET", null, bet, true);

            if (lastLedgerBalance !== null && balance !== null) {
                const walked = parseFloat((balance - lastLedgerBalance).toFixed(8));
                const gap = parseFloat((walked - delta).toFixed(8));
                const tol = Math.max(1e-6, Math.abs(delta) * 1e-3);
                if (Math.abs(gap) > tol) {
                    ledgerGaps++;
                    log("🧾 LEDGER: ไม้ " + bet.n + " ยอดเดินไม่ตรง — คาด " + formatNumber(delta, 8) + " แต่จริง " + formatNumber(walked, 8) + " (ต่าง " + formatNumber(gap, 8) + ")", true);
                }
            }
            if (balance !== null) lastLedgerBalance = balance;
            return bet;
        } catch (e) {
            return null;
        }
    }

    // 📈 สถิติสรุปจาก ledger (ใช้ในไฟล์ diag)
    function ledgerCounters() {
        let bets = 0, wins = 0, losses = 0, realBets = 0, virtualBets = 0;
        let latRealSum = 0, latRealN = 0, latVirtSum = 0, latVirtN = 0;
        let reqSum = 0, reqN = 0, respSum = 0, respN = 0;
        for (let i = 0; i < diag.length; i++) {
            const e0 = diag[i];
            if (e0.k === "ZERO_RESULT" && e0.d) {
                if (typeof e0.d.reqMs === "number" && e0.d.reqMs >= 0) { reqSum += e0.d.reqMs; reqN++; }
                if (typeof e0.d.respMs === "number" && e0.d.respMs >= 0) { respSum += e0.d.respMs; respN++; }
            }
            const e = e0;
            if (e.k !== "BET" || !e.d) continue;
            bets++;
            if (e.d.w) wins++; else losses++;
            const isVirt = (e.d.src === "VIRTUAL");
            if (isVirt) virtualBets++; else realBets++;
            if (typeof e.d.ms === "number" && e.d.ms >= 0) {
                if (isVirt) { latVirtSum += e.d.ms; latVirtN++; } else { latRealSum += e.d.ms; latRealN++; }
            }
        }
        return {
            bets: bets, wins: wins, losses: losses, realBets: realBets, virtualBets: virtualBets,
            avgLatReal: latRealN ? Math.round(latRealSum / latRealN) : null,
            avgLatVirt: latVirtN ? Math.round(latVirtSum / latVirtN) : null,
            avgVirtualClickToReqMs: reqN ? Math.round(reqSum / reqN) : null,
            avgVirtualReqToRollMs: respN ? Math.round(respSum / respN) : null
        };
    }

    function eachBet(fn) {
        for (let i = 0; i < diag.length; i++) {
            const e = diag[i];
            if (e.k === "BET") fn(e.d);
        }
    }

    function ledgerSummaryByStep() {
        const map = {};
        eachBet(function (b) {
            const st = b.s;
            if (!map[st]) map[st] = { at: 0, wins: 0, net: 0 };
            map[st].at++;
            if (b.w) map[st].wins++;
            map[st].net = parseFloat((map[st].net + b.dl).toFixed(8));
        });
        return map;
    }

    function ledgerSummary() {
        let bets = 0, wins = 0, losses = 0, net = 0;
        eachBet(function (b) {
            bets++;
            if (b.w) wins++; else losses++;
            net += b.dl;
        });
        return {
            bets: bets,
            wins: wins,
            losses: losses,
            net: parseFloat(net.toFixed(8)),
            gaps: ledgerGaps,
            byStep: ledgerSummaryByStep()
        };
    }

    // ล้างเฉพาะไม้ (เริ่มเซสชันใหม่) แต่เก็บ log/event ไว้ดูย้อนหลัง
    function resetBetsOnly() {
        for (let i = diag.length - 1; i >= 0; i--) {
            if (diag[i].k === "BET") diag.splice(i, 1);
        }
        lastLedgerBalance = null;
        betSeq = 0;
        ledgerGaps = 0;
    }

    // แปลงบัฟเฟอร์เป็น JSON ที่อ่านง่าย (ณ จุดเดียว ใช้ทั้ง Alt+L และ Alt+D)
    function buildDiagExport(includeAll) {
        const bets = [], events = [], logs = [];
        const from = includeAll ? 0 : Math.max(0, diag.length - 400);
        for (let i = from; i < diag.length; i++) {
            const e = diag[i];
            const t = new Date(e.t).toISOString();
            if (e.k === "BET") {
                bets.push({
                    n: e.d.n, time: t, step: e.d.s, amount: e.d.a, win: !!e.d.w, delta: e.d.dl, balance: e.d.bl,
                    source: e.d.src, roll: (e.d.r === undefined ? null : e.d.r), target: (e.d.tg === undefined ? null : e.d.tg),
                    cond: (e.d.cd === undefined ? null : e.d.cd), seq: (e.d.sq === undefined ? null : e.d.sq),
                    latencyMs: (e.d.ms === undefined ? null : e.d.ms)
                });
            } else if (e.k === "LOG" || e.k === "LOG!") {
                logs.push({ time: t, lvl: e.k === "LOG!" ? "!" : "-", step: e.s, msg: e.m });
            } else {
                events.push({ time: t, step: e.s, type: e.k, data: e.d });
            }
        }
        return {
            version: EXT_VERSION + "+" + BUILD_NO,
            instance: (function () { try { return String(window.__stakeHybridInstanceId || "main"); } catch (e) { return "?"; } })(),
            time: new Date().toISOString(),
            summary: ledgerSummary(),
            // 📊 สรุปทั้งเซสชันจากตัวนับจริง — summary ด้านบนคิดจากบัฟเฟอร์ diag ที่ถูกตัดเมื่อเกิน DIAG_MAX
            //    เซสชันยาว (>1500 event) จะเห็นไม้แค่ช่วงท้าย ถ้าไม่มีบล็อกนี้จะอ่าน P/L ผิด
            session: {
                bets: PERF.bets,
                realBets: totalBets,
                virtualBets: PERF.virtBets,
                wins: winsCount,
                losses: lossesCount,
                net: parseFloat(Number(profit || 0).toFixed(8)),
                wagered: parseFloat(Number(totalWagered || 0).toFixed(8)),
                holdCapMinutes: SESSION_RECOVERY_MAX_EXTRA_MIN,
                maxStep: maxStepReached,
                // 📉 DD สูงสุดของเซสชัน (วัดจากยอดพีคที่เคยเห็นระหว่างเล่น — ตัวเลขวัดผล ไม่มีผลต่อการเดิมพัน)
                maxDrawdown: parseFloat(Number(maxDrawdown || 0).toFixed(8)),
                maxDrawdownPct: (peakBalance && peakBalance > 0) ? parseFloat((100 * maxDrawdown / peakBalance).toFixed(2)) : 0,
                peakBalance: (peakBalance === null ? null : parseFloat(Number(peakBalance).toFixed(8))),
                minutes: sessionStartedAt ? Math.round((Date.now() - sessionStartedAt) / 60000) : 0,
                bufferBets: bets.length,
                truncated: (bets.length < PERF.bets),
                perfResumed: perfResumed
            },
            state: {
                step: mStep,
                maxStep: maxStepReached,
                running: sessionRunning,
                inBet: isBetInProgress,
                virtualMode: virtualMode,
                parkedStep: parkedStep,
                parkedAmount: parkedAmount,
                virtualRolls: virtualRolls,
                virtualStallCount: virtualStallCount,
                zeroInField: configVirtualWriteZero,
                zeroModeText: virtualZeroModeText(),
                desyncStrikes: desyncStrikes,
                lastDesync: lastDesync,
                fieldValue: getAmountInputValue(),
                lastTrace: lastTrace
            },
            config: (function () {
                try {
                    return {
                        chance: configChance,
                        alternateRoll: configAlternateRoll,
                        dynamicBase: configDynamicBase,
                        fibMax: MAX_FIBO_STEPS,
                        lossTrigger: configVirtualLossTrigger,
                        zeroInField: configVirtualWriteZero,
                        stallLimit: VIRTUAL_STALL_LIMIT,
                        sessionMaxMinutes: (typeof configSessionMaxMinutes === "number" ? configSessionMaxMinutes : null),
                        targetMode: (typeof configTargetMode === "string" ? configTargetMode : null),
                        autoResync: configAutoResync
                    };
                } catch (e) { return { error: String(e && e.message || e) }; }
            })(),
            env: (function () {
                try {
                    return {
                        url: String(location.href).slice(0, 200),
                        topFrame: (window.top === window.self),
                        instance: String(window.__stakeHybridInstanceId || ""),
                        viewport: window.innerWidth + "x" + window.innerHeight,
                        ua: String(navigator.userAgent || "").slice(0, 160),
                        tz: String((Intl.DateTimeFormat().resolvedOptions() || {}).timeZone || "")
                    };
                } catch (e) { return { error: String(e && e.message || e) }; }
            })(),
            stats: (function () {
                try {
                    const ltc = ledgerCounters();
                    return Object.assign({}, netStats, {
                        bets: ltc.bets, wins: ltc.wins, losses: ltc.losses,
                        realBets: ltc.realBets, virtualBets: ltc.virtualBets,
                        avgLatencyRealMs: ltc.avgLatReal, avgLatencyVirtualMs: ltc.avgLatVirt,
                        avgVirtualClickToReqMs: ltc.avgVirtualClickToReqMs, avgVirtualReqToRollMs: ltc.avgVirtualReqToRollMs,
                        heals: healCount, stalls: virtualStallCount, desync: desyncStrikes,
                        sessionMinutes: sessionStartedAt ? Math.round((Date.now() - sessionStartedAt) / 60000) : 0,
                        perf: perfSnapshot()
                    });
                } catch (e) { return { error: String(e && e.message || e) }; }
            })(),
            entries: diag.length,
            analysis: analyzeDiag(),
            // 🔎 VERIFY — สรุปว่าการแก้ 5 จุดทำงานจริงหรือไม่ (อ่านจาก event ในบัฟเฟอร์)
            verify: (function () {
                try {
                    const c = {
                        SIDE_CONTROL_CLICK: 0, SIDE_CONTROL_MISS: 0, SIDE_MISMATCH: 0,
                        SIDE_TARGET_SET: 0, SIDE_TARGET_FAIL: 0, SIDE_VERIFY_FAIL: 0,
                        SIDE_SLIDER_SET: 0, SIDE_ARROW_SET: 0,
                        SIDE_GATE_RETRY: 0, SIDE_GATE_BLOCK: 0,
                        SIDE_TOGGLE_CLICK: 0,
                        ZERO_NUDGE: 0,
                        BALANCE_RESET: 0, BALANCE_SHORT: 0,
                        TWO_WIN_RECOVERED: 0, TWO_WIN_SHORT: 0, VIRTUAL_EXIT: 0,
                        CLOSE_ALL_ARMED: 0
                    };
                    for (let i = 0; i < diag.length; i++) {
                        const k = diag[i] && diag[i].k;
                        if (k && Object.prototype.hasOwnProperty.call(c, k)) c[k]++;
                    }
                    return {
                        side: {
                            want: pendingRollSide || currentRollSide || null,
                            appliedOnPage: pageSideApplied,
                            targetField: (function () { try { const i = document.querySelector('input[data-testid="reverse-roll"]'); return i ? String(i.value) : null; } catch (e) { return null; } })(),
                            chanceField: (function () { try { const i = document.querySelector('input[data-testid="chance"]'); return i ? String(i.value) : null; } catch (e) { return null; } })(),
                            label: readSideLabelText().slice(0, 40),
                            verified: verifyPageSide(pendingRollSide || currentRollSide || "under"),
                            lastServerCondition: lastServerCondition,
                            lastServerTarget: lastServerTarget,
                            clicks: c.SIDE_CONTROL_CLICK,
                            misses: c.SIDE_CONTROL_MISS,
                            mismatches: c.SIDE_MISMATCH,
                            targetSet: c.SIDE_TARGET_SET,
                            targetFail: c.SIDE_TARGET_FAIL,
                            verifyFail: c.SIDE_VERIFY_FAIL,
                            sliderSet: c.SIDE_SLIDER_SET,
                            arrowSet: c.SIDE_ARROW_SET,
                            gateRetry: c.SIDE_GATE_RETRY,
                            gateBlock: c.SIDE_GATE_BLOCK,
                            toggles: c.SIDE_TOGGLE_CLICK
                        },
                        recovery: {
                            twoWinRecovered: c.TWO_WIN_RECOVERED,
                            twoWinShort: c.TWO_WIN_SHORT,
                            balanceReset: c.BALANCE_RESET,
                            balanceShort: c.BALANCE_SHORT,
                            closeAllArmed: c.CLOSE_ALL_ARMED
                        },
                        virtual: {
                            mode: virtualMode,
                            exits: c.VIRTUAL_EXIT,
                            nudges: c.ZERO_NUDGE
                        },
                        ledger: {
                            lastSide: lastSettledSide,
                            lastTarget: lastSettledTarget
                        }
                    };
                } catch (e) { return { error: String(e && e.message || e) }; }
            })(),
            bets: bets,
            events: events,
            logs: logs
        };
    }

    // 🔎 ANALYZE — อ่านบัฟเฟอร์ชุดเดียวแล้วสรุปว่าอะไรผิด ที่ไหน บ่อยแค่ไหน
    function analyzeDiag() {
        let desync = 0, hangs = 0, zeroStalls = 0, guard = 0, exits = 0, forceAmount = 0;
        let sideClicks = 0, sideMisses = 0, sideMismatch = 0, balReset = 0, twoWinOk = 0, twoWinShort = 0;
        let sideSets = 0, sideVerifyFail = 0, sideSlider = 0, sideArrow = 0, sideGateBlock = 0, zeroNudges = 0, sideToggle = 0, closeAllArmed = 0;
        let lastStallReason = "";
        let lastStop = null;
        let stopCount = 0;
        for (let i = 0; i < diag.length; i++) {
            const e = diag[i];
            if (e.k === "DESYNC") desync++;
            else if (e.k === "HANG") hangs++;
            else if (e.k === "ZERO_STALL") { zeroStalls++; if (e.d && e.d.reason) lastStallReason = e.d.reason; }
            else if (e.k === "REAL_AMOUNT_GUARD") guard++;
            else if (e.k === "REAL_AMOUNT_FORCE") forceAmount++;
            else if (e.k === "VIRTUAL_EXIT") exits++;
            else if (e.k === "SIDE_CONTROL_CLICK") sideClicks++;
            else if (e.k === "SIDE_CONTROL_MISS") sideMisses++;
            else if (e.k === "SIDE_MISMATCH") sideMismatch++;
            else if (e.k === "SIDE_TARGET_SET") sideSets++;
            else if (e.k === "SIDE_VERIFY_FAIL") sideVerifyFail++;
            else if (e.k === "SIDE_SLIDER_SET") sideSlider++;
            else if (e.k === "SIDE_ARROW_SET") sideArrow++;
            else if (e.k === "SIDE_GATE_BLOCK") sideGateBlock++;
            else if (e.k === "SIDE_TOGGLE_CLICK") sideToggle++;
            else if (e.k === "ZERO_NUDGE") zeroNudges++;
            else if (e.k === "BALANCE_RESET") balReset++;
            else if (e.k === "TWO_WIN_RECOVERED") twoWinOk++;
            else if (e.k === "TWO_WIN_SHORT") twoWinShort++;
            else if (e.k === "CLOSE_ALL_ARMED") closeAllArmed++;
            else if (e.k === "STOP") { stopCount++; lastStop = (e.d && e.d.reason) ? e.d.reason : (e.m || null); }
        }
        const findings = [];
        if (stopCount) findings.push({ code: "STOP", sev: "high", msg: "หยุดเซสชัน " + stopCount + " ครั้ง — ล่าสุด: " + (lastStop || "?") });
        if (hangs) findings.push({ code: "HANG", sev: "high", msg: "ไม้ค้างนานผิดปกติ " + hangs + " ครั้ง (watchdog ปลดล็อกให้)" });
        if (zeroStalls) findings.push({ code: "ZERO_STALL", sev: "high", msg: "ไม้ 0$ ไม่ได้ทอย " + zeroStalls + " ครั้ง — " + (lastStallReason || "ไม่ทราบสาเหตุ") });
        if (guard) findings.push({ code: "REAL_AMOUNT_GUARD", sev: "med", msg: "ช่องยอดไม่ตรงตอนกลับมาแทงจริง " + guard + " ครั้ง" });
        if (forceAmount) findings.push({ code: "REAL_AMOUNT_FORCE", sev: "low", msg: "บังคับเขียนยอดซ้ำ " + forceAmount + " ครั้ง (เซสชันยังเดินต่อ)" });
        if (desync) findings.push({ code: "DESYNC", sev: desync >= 3 ? "high" : "med", msg: "ยอดเงินไม่ตรง " + desync + " ครั้ง (auto-resync " + (configAutoResync ? "เปิด" : "ปิด") + ")" });
        // 🔎 ตรวจการแก้ล่าสุด: ฝั่งเดิมพัน / คืนทุน / เงินไม่พอ
        if (sideSets) findings.push({ code: "SIDE_TARGET_SET", sev: "ok", msg: "ตั้งฝั่ง/เส้นแบ่งบนหน้าเว็บสำเร็จ " + sideSets + " ครั้ง (slider " + sideSlider + " · ลูกศร " + sideArrow + ")" });
        if (!sideSets && !sideClicks && totalBets > 0) findings.push({ code: "SIDE_NOT_SET", sev: "high", msg: "ไม่พบการตั้งฝั่ง Under บนหน้าเว็บเลย (miss " + sideMisses + " ครั้ง) — อาจยังแทงฝั่งเดิมของเว็บ" });
        if (sideMisses && !sideClicks && !sideSets) findings.push({ code: "SIDE_CONTROL_MISS", sev: "high", msg: "หา control ฝั่ง Under/Over บนหน้าเว็บไม่เจอ " + sideMisses + " ครั้ง" });
        if (sideVerifyFail) findings.push({ code: "SIDE_VERIFY_FAIL", sev: "med", msg: "เขียน target แล้วป้ายยังไม่เปลี่ยน " + sideVerifyFail + " ครั้ง — ใช้ทางสำรองต่อ" });
        if (sideToggle) findings.push({ code: "SIDE_TOGGLE_CLICK", sev: "low", msg: "คลิกป้ายสลับฝั่ง " + sideToggle + " ครั้ง" });
        if (sideGateBlock) findings.push({ code: "SIDE_GATE_BLOCK", sev: "high", msg: "ยืนยันฝั่งไม่ได้ก่อนยิงไม้จริง " + sideGateBlock + " ครั้ง — หยุดกันแทงผิดฝั่ง" });
        if (zeroNudges) findings.push({ code: "ZERO_NUDGE", sev: "low", msg: "คลิกซ้ำไม้ 0$ เพราะยังไม่มีทอย " + zeroNudges + " ครั้ง" });
        if (sideMismatch) findings.push({ code: "SIDE_MISMATCH", sev: "med", msg: "เว็บใช้ฝั่งอื่นแทนที่สั่ง " + sideMismatch + " ครั้ง (กดใหม่ไม้ถัดไป)" });
        if (twoWinShort) findings.push({ code: "TWO_WIN_SHORT", sev: "med", msg: "ชนะติด 2 แต่ยังไม่ถึงทุน " + twoWinShort + " ครั้ง (เล่นล้างหนี้ต่อ ไม่รีเซ็ต)" });
        if (twoWinOk) findings.push({ code: "TWO_WIN_OK", sev: "ok", msg: "ชนะติด 2 → คืนทุนจริงและรีเซ็ตไม้ 1 สำเร็จ " + twoWinOk + " ครั้ง" });
        if (balReset) findings.push({ code: "BALANCE_RESET", sev: "low", msg: "เงินไม่พอไม้เดิม → รีเซ็ตกลับไม้ 1 แล้วเล่นต่อ " + balReset + " ครั้ง" });
        if (closeAllArmed) findings.push({ code: "CLOSE_ALL_ARMED", sev: "ok", msg: "ชนะแล้วแพ้ → ตาถัดไปปิดหนี้ทั้งหมด " + closeAllArmed + " ครั้ง (ให้ W-L-W คืนทุน)" });
        if (!findings.length) findings.push({ code: "OK", sev: "ok", msg: "ไม่พบความผิดปกติในบัฟเฟอร์นี้" });
        return { generatedAt: Date.now(), entries: diag.length, virtualExits: exits, findings: findings };
    }

    // 🧹 ล้าง log เพื่อเริ่มดูใหม่ (ไม่แตะการตั้งค่า)
    function resetDiag() {
        diag.length = 0;
        lastLedgerBalance = null;
        betSeq = 0;
        ledgerGaps = 0;
        lastTrace = null;
        updateStatusText("🧹 ล้าง log แล้ว — เริ่มเก็บใหม่ (Alt+D เมื่อเกิดอาการ)", "#55e7ff");
    }

    // ==================================================
    // 🛠️ AUTO-HEAL — ซ่อมปัญหาที่รู้จักเองทั้งหมด (ผู้ใช้ไม่ต้องดู log)
    // ==================================================
    const HEAL_COOLDOWN_MS = 3000;
    let lastHealAt = 0;
    let healCount = 0;

    function autoHeal(reason) {
        try {
            if (!sessionRunning) return false;
            const now = Date.now();
            if (now - lastHealAt < HEAL_COOLDOWN_MS) return false;
            lastHealAt = now;
            healCount++;
            trace("HEAL", { reason: reason, count: healCount });
            autoDiag("heal-" + String(reason || "").replace(/[^a-z0-9-]/gi, "").slice(0, 12));

            // 1) ล้างแคช DOM แล้วค้นปุ่ม/ช่องใหม่
            cachedBetBtn = null;
            cachedAmountInput = null;
            cachedChanceInput = null;
            try { openManualTab(); } catch (e) {}

            // 2) เขียนยอด/ด้านใบใหม่ (โหมดลมจะเขียน 0 ตามสวิตช์เอง)
            try { applyBetSettings(true); } catch (e) {}

            // 3) ปลดล็อกปุ่มเดิมพัน
            try {
                const b = cachedBetBtn || getBetButton();
                if (b) {
                    if (b.disabled) b.disabled = false;
                    b.removeAttribute("disabled");
                    b.setAttribute("aria-disabled", "false");
                    b.classList.remove("disabled");
                }
            } catch (e) {}

            // 4) ปลดสถานะค้างแล้วเดินต่อ
            isBetInProgress = false;
            onDiceRollCallback = null;
            updateStatusText("🛠️ แก้ไขอัตโนมัติ (" + healCount + ") — เดินต่อ", "#55e7ff");
            betTimeoutId = setTimeout(scheduleNextBet, 500);

            if (healCount % 10 === 0) {
                log("🛠️ แก้ไขอัตโนมัติสะสม " + healCount + " ครั้ง — เดินต่อ (ไม่หยุด)", true);
            }
            return true;
        } catch (e) {
            return false;
        }
    }

    // 💾 เขียน log ลงเครื่องอัตโนมัติ (Downloads/stake_diag_*.json) เพื่อให้ AI อ่านได้เอง
    // 📉 เขียนไฟล์ diag น้อยที่สุด: เฉพาะครั้งแรกของแต่ละสาเหตุ + เพดานต่อเซสชัน
    let diagSessionWrites = 0;
    let diagSeenTags = Object.create(null);
    let diagCapNoted = false;
    const MAX_DIAG_FILES = 6;   // เพดานไฟล์ต่อเซสชัน (start/stop นับด้วย)

    function resetDiagSession() {
        diagSessionWrites = 0;
        diagSeenTags = Object.create(null);
        diagCapNoted = false;
    }

    function saveDiagToDisk(tag) {
        try {
            const payload = JSON.stringify(buildDiagExport(true), null, 2);
            const stamp = new Date().toISOString().replace(/[:.]/g, "-");
            const safeTag = String(tag || "stop").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24) || "stop";
            const filename = "stake_diag_" + stamp + "_" + safeTag + ".json";
            // 💾 บันทึกผ่าน background service worker เพื่อให้จัดเก็บลง D:\script stake\logs\ ไม่เกะกะ root ไดรฟ์ D:\
            try {
                window.postMessage({ type: "SAVE_DIAG", text: payload, filename: filename }, "*");
                return filename;
            } catch (e) {
                // สำรองถ้าไม่มี service worker
                const blob = new Blob([payload], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = filename;
                a.rel = "noopener";
                a.style.display = "none";
                (document.body || document.documentElement).appendChild(a);
                a.click();
                setTimeout(function () { try { a.remove(); URL.revokeObjectURL(url); } catch (e) {} }, 4000);
                return filename;
            }
        } catch (e) { return null; }
    }

    // 🧠 AI-DIAG: เขียนไฟล์เองทุกเหตุการณ์สำคัญ (กันข้อมูลหาย ไม่ต้องกดคีย์ลัด)
    function autoDiagWrote(tag) {
        try { return !!diagSeenTags[String(tag || "")]; } catch (e) { return false; }
    }

    function autoDiag(tag, force) {
        try {
            const t = String(tag || "auto");
            if (diagSeenTags[t]) return null;                       // สาเหตุนี้เขียนไปแล้ว
            if (!force && diagSessionWrites >= MAX_DIAG_FILES) {     // เกินเพดานเซสชัน
                if (!diagCapNoted) {
                    diagCapNoted = true;
                    try { log("🗂️ ถึงเพดานไฟล์ diag ต่อเซสชัน (" + MAX_DIAG_FILES + ") — หยุดเขียนเพิ่ม", true); } catch (e) {}
                }
                return null;
            }
            diagSeenTags[t] = true;
            diagSessionWrites++;
            return saveDiagToDisk(t);
        } catch (e) { return null; }
    }

    function copyLedger() {
        const summary = ledgerSummary();
        const payload = JSON.stringify(buildDiagExport(false), null, 2);
        let copied = false;
        try { if (typeof copy === "function") { copy(payload); copied = true; } } catch (e) {}
        log("🧾 LOG " + summary.bets + " ไม้ · ชนะ " + summary.wins + " / แพ้ " + summary.losses + " · P/L " + formatNumber(summary.net, 6) + " · กระทบยอดคลาด " + summary.gaps + " ครั้ง" + (copied ? " — คัดลอก JSON แล้ว" : ""), true);
        try { if (typeof console !== "undefined") console.log(payload); } catch (e) {}
        return summary;
    }

    function downloadDiagLog() {
        try {
            saveDiagToDisk("manual");
            updateStatusText("📥 ดาวน์โหลด log แล้ว (logs/stake_diag_*.json)", "#00e676");
        } catch (e) {}
    }

    // ==================================================
    // 6.7 MULTI-TAB GUARD — กันเปิดบอทสองแท็บแล้วเดิมพันซ้อน
    // ใช้ BroadcastChannel (ข้อความระหว่างแท็บในหน่วยความจำ ไม่เขียนดิสก์ -> ยัง zero-footprint)
    // กติกาใหม่: ตรวจเจออีกแท็บ = เตือนเฉย ๆ ไม่บล็อก START และไม่สั่งหยุดเซสชันเอง
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
                    // ❌ ไม่หยุดเซสชันเองแล้ว — แค่เตือน (เดิมทำให้บอทหยุดเองเมื่อมีแท็บอื่นเปิดอยู่)
                    if (sessionRunning) {
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

        autoStartPolling = setInterval(() => {
            attempts++;
            const bal = getBalance();
            const btn = getBetButton();

            if (bal !== null && bal > 0 && btn) {
                clearInterval(autoStartPolling);
                autoStartPolling = null;

                startBalance = bal;
                currentBalance = bal;
                peakBalance = bal;
                // 🧹 จุดเริ่มนับจริงของ Auto-Start — ล้างตัวนับ PERF ก่อนเริ่มจับเวลา ไม่ให้ตัวเลขความเร็วปนข้ามเซสชัน
                perfReset();
                syncHUDInputs();
                updateUI();

                ensureManualTab();
                applyBetSettings();

                // 🚫 ไม่มี F5 recovery แล้ว → ล้าง state เก่าทิ้ง กันกู้ mStep/โหมดแทงลมค้างจากบิลด์ก่อน
                let hasSavedRecovery = false;
                try {
                    localStorage.removeItem(STORAGE_RECOVERY_KEY);
                    sessionStorage.removeItem(STORAGE_RECOVERY_KEY);
                } catch (e) {}

                autoStartCountdown = hasSavedRecovery ? 1 : 2;
                updateStatusText(hasSavedRecovery
                    ? `🔄 Auto-Start กู้คืนสถานะใน ${autoStartCountdown}s (กด ESC ยกเลิก)`
                    : `🚀 Auto-Start เริ่มใน ${autoStartCountdown}s (กด ESC ยกเลิก)`, "#ffea00");

                autoStartCountdownTimer = setInterval(() => {
                    autoStartCountdown--;
                    if (autoStartCountdown > 0) {
                        updateStatusText(hasSavedRecovery
                            ? `🔄 Auto-Start กู้คืนสถานะใน ${autoStartCountdown}s (กด ESC ยกเลิก)`
                            : `🚀 Auto-Start เริ่มใน ${autoStartCountdown}s (กด ESC ยกเลิก)`, "#ffea00");
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

    // ⚡ SAFE TURBO PACER: คุมสปีดสูงสุด 3.0 - 3.5 ตา/วินาที ปลอดภัยจาก Rate Limit 429 100%
    const MIN_SAFE_BET_INTERVAL_MS = 280; // ป้องกันไม่ให้เกิน 3.5 ตา/วินาที (ปลอดภัยตามมาตรฐาน Cloudflare/Stake)
    let lastBetDispatchTime = 0;
    // 📶 สัญญาณ "คำขอเดิมพันออกแล้ว" — ใช้เวลาคลิกเดิมพันแทน เมื่อตัวดัก network จับรูปแบบ GraphQL
    //    ของเว็บปัจจุบันไม่ได้ (diag 29 ไฟล์พบ diceReq=0 ตลอด → lastDiceRequestAt ไม่เคยถูกตั้ง)
    function lastBetSignal() {
        return Math.max(lastDiceRequestAt || 0, lastBetDispatchTime || 0);
    }
    let isRateLimitPaused = false;

    // 🎲 CSPRNG Jitter (Web Crypto): สุ่ม micro-delay ด้วยความสุ่มแท้ Cryptographic แทนค่าคงที่ 0/15ms ซ้ำๆ
    function getCsprngDelay(minMs = 0, maxMs = 4) {
        try {
            if (window.crypto && window.crypto.getRandomValues) {
                const buf = new Uint32Array(1);
                window.crypto.getRandomValues(buf);
                return minMs + (buf[0] % (maxMs - minMs + 1));
            }
        } catch (e) {}
        return minMs;
    }

    // ==================================================
    // 🔍 DIAG WATCHERS (build 183) — เก็บหลักฐาน 2 เรื่องที่ยังไม่รู้สาเหตุ
    //  1) ROLL_KEYS : ชื่อฟิลด์ของ response ทอย (มี id/nonce ให้แยก "ผลซ้ำ" แม้น ๆ ไหม)
    //  2) IDLE_GAP  : ช่วงที่บอทนิ่ง 9–27 วิ — แท็บถูกซ่อน (timer ถูก throttle) หรือ state ค้าง
    // ==================================================
    let rollKeysSig = "";
    let lastRollId = "";            // id ของผลทอยล่าสุด (UUID จากเว็บ) — ใช้แยก "ผลเดิมส่งซ้ำ" แบบแม่น 100%
    let lastActivityAt = Date.now();
    let idleGapReported = false;
    let idleWatchId = null;
    let hiddenAtIdle = 0;

    function markActivity() { lastActivityAt = Date.now(); idleGapReported = false; }

    function startIdleWatch() {
        if (idleWatchId) return;
        idleWatchId = setInterval(function () {
            try {
                if (!sessionRunning) { lastActivityAt = Date.now(); return; }
                // กำลังรอผลไม้อยู่ = ไม่ใช่ "นิ่ง" (ไม้ที่ค้างมี watchdog HANG ดูแลอยู่แล้ว)
                if (isBetInProgress) { lastActivityAt = Date.now(); return; }
                const gap = Date.now() - lastActivityAt;
                if (gap > 2500 && !idleGapReported) {
                    idleGapReported = true;
                    trace("IDLE_GAP", {
                        gapMs: gap,
                        virtual: virtualMode,
                        running: sessionRunning,
                        inBet: isBetInProgress,
                        wait: isWaitingNextRound,
                        pendingTimer: betTimeoutId !== null,
                        rateLimited: isRateLimitPaused,
                        stalls: virtualStallCount,
                        hiddenNow: document.hidden,
                        hiddenDuringGap: hiddenAtIdle >= lastActivityAt && hiddenAtIdle > 0,
                        vis: document.visibilityState || "?",
                        field: getAmountInputValue()
                    });
                    log("⏸️ [IDLE] บอทนิ่ง " + Math.round(gap / 1000) + " วิ — บันทึกใน diag (แท็บ" + (document.hidden ? "ซ่อนอยู่" : "แสดงอยู่") + ")", true);
                } else if (gap <= 2500 && idleGapReported) {
                    idleGapReported = false;
                }
            } catch (e) {}
        }, 1000);
    }

    // บันทึกการซ่อน/แสดงแท็บ — ถ้าช่วงนิ่งทับกับช่วงที่แท็บถูกซ่อน = Chrome throttle timer
    try {
        document.addEventListener("visibilitychange", function () {
            try {
                if (document.hidden) {
                    hiddenAtIdle = Date.now();
                } else {
                    trace("VISIBILITY", { state: "visible", hiddenMs: hiddenAtIdle ? (Date.now() - hiddenAtIdle) : 0 });
                    hiddenAtIdle = 0; // ล้างหลังกลับมาแสดง — กันค่าเก่าค้างทำให้ hiddenDuringGap ผิด
                }
            } catch (e) {}
        });
    } catch (e) {}

    function scheduleNextBet() {
        if (!sessionRunning || isWaitingNextRound) return;
        if (isRateLimitPaused) {
            betTimeoutId = setTimeout(scheduleNextBet, 500);
            return;
        }
        const now = Date.now();
        const elapsed = now - lastBetDispatchTime;
        if (elapsed < MIN_SAFE_BET_INTERVAL_MS) {
            const waitMs = MIN_SAFE_BET_INTERVAL_MS - elapsed;
            betTimeoutId = setTimeout(executeNextBet, waitMs);
        } else {
            // ⚡ 0ms Microtask Execution: ไม่ติด 4ms Clamping ของ setTimeout
            if (typeof queueMicrotask === "function") {
                queueMicrotask(executeNextBet);
            } else {
                betTimeoutId = setTimeout(executeNextBet, 0);
            }
        }
    }

    function handleTakeProfitHit() {
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
    let configTargetMode = "pct"; // "usd" = ยอดเงินคงที่ · "pct" = % ของ startBalance

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
        setSafeStyle(el, "color", isPct ? "#55e7ff" : "#7f8b9b");
        setSafeStyle(el, "borderColor", isPct ? "#55e7ff" : "#2f4553");
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
        markActivity();
        startIdleWatch();
        if (!sessionRunning || isWaitingNextRound || isBetInProgress) return;

        // ⏳ เพิ่งออกจากโหมดแทงลม → รอเว็บอัปเดตยอดจริงก่อน (กันคลิกแล้วไม่มีผลกลับมา)
        const settleWait = postExitSettleUntil - Date.now();
        if (settleWait > 0) {
            betTimeoutId = setTimeout(executeNextBet, settleWait);
            return;
        }

        // ตรวจสอบ Take Profit รวม
        const profitTargetLimit = effectiveProfitTarget();
        if (profitTargetLimit > 0 && profit >= (profitTargetLimit - 0.000000001)) {
            handleTakeProfitHit();
            return;
        }

        const balanceBefore = getBalance();

        const virtualNow = isVirtualBetActive();
        if (virtualNow) {
            trace("ZERO_TICK", {
                step: mStep,
                parked: parkedStep,
                zeroInField: configVirtualWriteZero,
                stalls: virtualStallCount,
            });
        }

        // (SIM fallback removed: 0$ stall now exits back to real betting)
        
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

        // 🎯 ตรวจเช็กยอดฐานตอนวางแทงครั้งใหม่:
        // เมื่ออยู่ที่ไม้ 1 (รอบใหม่) ให้อัปเดตยอดฐานตาม Balance ล่าสุด (Base = Balance / 17,710)
        // เมื่อเข้าสู่การทบไม้แก้ตัว (mStep > 1) จะล็อกยอดฐานเดิมไว้ ไม่เปลี่ยนกลางคัน
        if (mStep === 1 && configDynamicBase) {
            updateBaseBetOnReset("ก่อนวางแทงไม้ 1 รอบใหม่");
        }

        // 2. ตั้งค่าตัวเลข Bet / Chance / ทิศทาง โดยตรงทุกรอบก่อนกดเดิมพัน
        const tPrep0 = perfNow();
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
                // ซ่อมเอง: ล้างแคช + ค้นปุ่ม/ช่องใหม่ + เปิดแท็บ Manual
                if (!autoHeal("no-button")) {
                    betTimeoutId = setTimeout(executeNextBet, 400);
                }
                return;
            }
            updateStatusText("⚠️ รอเปิดปุ่มเดิมพัน...", "#ffa726");
            betTimeoutId = setTimeout(executeNextBet, 150);
            return;
        }
        domResolveFails = 0;

        if (!virtualNow && !isBetButtonReady(betBtn)) {
            betRetryCount++;
            // 🛡️ LEVEL 1: ล้างแคชปุ่มและช่องกรอกทันทีหลังรอ 3 ครั้ง (90ms) เพื่อหาปุ่มที่เปิดอยู่จริง
            if (betRetryCount % 3 === 0) {
                cachedBetBtn = null;
                cachedAmountInput = null;
                cachedChanceInput = null;
            }
            // 🛡️ LEVEL 2: บังคับ re-dispatch input/change สดๆ เข้าช่องเดิมพันหลังรอ 6 ครั้ง (180ms)
            if (betRetryCount % 6 === 0) {
                applyBetSettings(true);
            }
            // 🛡️ LEVEL 3: บังคับกดแท็บ Manual หลังรอ 12 ครั้ง (360ms)
            if (betRetryCount % 12 === 0) {
                openManualTab();
            }
            // 🛡️ LEVEL 4: ปลดล็อก disabled และ aria-disabled บน DOM ตรงๆ หลังรอเกิน 15 ครั้ง (450ms)
            if (betRetryCount >= 15 && betBtn) {
                try {
                    if (betBtn.disabled) betBtn.disabled = false;
                    betBtn.removeAttribute("disabled");
                    betBtn.removeAttribute("aria-disabled");
                    betBtn.setAttribute("aria-disabled", "false");
                    betBtn.classList.remove("disabled");
                } catch (e) {}
            }
            // 🛡️ LEVEL 5: ถ้ารอเกิน 30 ครั้ง (~900ms) ล้างแคชและบังคับ re-dispatch ปลดล็อก
            if (betRetryCount > 30) {
                betRetryCount = 0;
                cachedBetBtn = null;
                applyBetSettings(true);
            }
            updateStatusText("⏳ รอเปิดปุ่มเดิมพัน...", "#ff9800");
            betTimeoutId = setTimeout(executeNextBet, 30);
            return;
        }
        betRetryCount = 0;

        // 🛡️ GATE: ต้องเห็นป้าย "ทอยให้ได้น้อยกว่า" (หรือ target < 50) ก่อนยิงไม้จริง
        // ถ้ายังไม่ติด → ลองสลับใหม่ (target/slider/ลูกศร/ปุ่มฝั่ง) แล้วรอ 220ms วนสูงสุด 8 ครั้ง
        if (!virtualNow) {
            const sideNow = currentRollSide || "under";
            let sideOK = verifyPageSide(sideNow);
            if (sideOK === false) {
                applyRollSideToPage(sideNow);
                sideOK = verifyPageSide(sideNow);
            }
            if (sideOK === false) {
                sideGateRetry++;
                try { trace("SIDE_GATE_RETRY", { want: sideNow, n: sideGateRetry, label: readSideLabelText().slice(0, 32), target: readTargetField() }); } catch (e) {}
                if (sideGateRetry <= 8) {
                    updateStatusText(`⏳ กำลังสลับฝั่งเป็น ${sideNow.toUpperCase()} (${sideGateRetry}/8)...`, "#ffa726");
                    betTimeoutId = setTimeout(executeNextBet, 260);
                    return;
                }
                sideGateRetry = 0;
                try { trace("SIDE_GATE_BLOCK", { want: sideNow, label: readSideLabelText().slice(0, 32), target: readTargetField() }); } catch (e) {}
                stopSession(`🚨 ยืนยันฝั่ง ${sideNow.toUpperCase()} บนหน้าเว็บไม่ได้ (ป้ายยังเป็นอีกฝั่ง) — หยุดกันแทงผิดฝั่ง`, "#ff3344");
                return;
            }
            sideGateRetry = 0;
        }

        // 🌬️ ไม้ 0$: ยังกดปุ่มเดิมพันจริง แต่ interceptor เขียน amount = 0 ให้ (ไม่แตะช่องยอดบน DOM → ปุ่มไม่ล็อก)
        const currentBetAmount = virtualNow ? 0 : parseFloat(calculateCurrentBetAmount());

        // 🚦 เพดานที่อ่านได้จากข้อความเป็นแค่คำเตือน (ค่าที่ sniff ได้อาจผิด) — ไม่หยุดเซสชันเอง
        if (!virtualNow && detectedMaxBet && currentBetAmount > detectedMaxBet) {
            updateStatusText(`⚠️ ยอด ${formatBetAmount(currentBetAmount)}$ เกินเพดานที่อ่านได้ ${formatBetAmount(detectedMaxBet)}$ — ส่งให้เว็บตัดสิน`, "#ffa726");
        }

        if (!virtualNow && balanceBefore !== null && currentBetAmount > balanceBefore) {
            balanceShortCount++;
            trace("BALANCE_SHORT", { need: currentBetAmount, have: balanceBefore, times: balanceShortCount });
            // 🚫 ไม่รอวนซ้ำ 3 นาทีแล้ว (ระหว่างรอเงินไม่มีทางเพิ่มเอง) — รีเซ็ตกลับไม้ 1 ถ้ายอดใหม่ไหว ไม่งั้นหยุดทันที
            const resetBase = configDynamicBase
                ? computeDynamicBaseBet(balanceBefore)
                : Math.max(parseFloat(getBaseBet()) || 0, effectiveMinBet());
            if (mStep > 1 && resetBase > 0 && resetBase <= balanceBefore) {
                const wasStep = mStep;
                mStep = 1;
                cycleProfit = 0;
                cycleStartBalance = (currentBalance !== null) ? currentBalance : balanceBefore;
                lockedCycleBaseBet = resetBase;
                configRealBaseBet = formatBetAmount(resetBase);
                virtualMode = false;
                parkedStep = 0;
                parkedAmount = 0;
                resetVirtualRun();
                balanceShortCount = 0;
                try { if (typeof syncHUDInputs === "function") syncHUDInputs(); } catch (e) {}
                trace("BALANCE_RESET", { fromStep: wasStep, need: currentBetAmount, have: balanceBefore, resetTo: resetBase });
                log(`🔁 [BALANCE RESET] เงินไม่พอไม้ ${wasStep} (ต้อง ${formatBetAmount(currentBetAmount)}$ มี ${formatBetAmount(balanceBefore)}$) → รีเซ็ตกลับไม้ 1 (${formatBetAmount(resetBase)}$) เล่นต่อทันที`, true);
                updateStatusText(`🔁 เงินไม่พอไม้ ${wasStep} → รีเซ็ตกลับไม้ 1 (${formatBetAmount(resetBase)}$) แล้วเล่นต่อ`, "#ffa726");
                applyBetSettings(true);
                betTimeoutId = setTimeout(executeNextBet, 200);
                return;
            }
            balanceShortCount = 0;
            flashHudAlert("#ff3344");
            stopSession(`🚨 เงินไม่พอไม้ถัดไป (ต้อง ${formatBetAmount(currentBetAmount)}$ มี ${formatBetAmount(balanceBefore)}$) — หยุด`, "#ff3344");
            return;
        }
        balanceShortCount = 0;

        // ยืนยันช่องยอดเฉพาะไม้จริง (ไม้ 0$ ใช้ยอดจริงบน DOM ต่อไปเพื่อไม่ให้ปุ่ม disabled)
        if (!virtualNow && !isAmountApplied(currentBetAmount)) {
            if (amountRetryCount === 0) trace("REAL_AMOUNT_GUARD", { expected: currentBetAmount, value: getAmountInputValue() });
            amountRetryCount++;
            if (amountRetryCount > 100) {
                amountRetryCount = 0;
                // เดิม: stopSession() — เปลี่ยนเป็นบังคับเขียนยอดแล้วเดินต่อ (การหยุดทำให้เข้าใจผิดว่าบอทค้าง)
                amountForceCount++;
                trace("REAL_AMOUNT_FORCE", { expected: currentBetAmount, value: getAmountInputValue(), times: amountForceCount });
                try { setInput("input-game-amount", currentBetAmount, true); } catch (e) {}
                if (amountForceCount % 5 === 0) autoHeal("amount-guard");
                betTimeoutId = setTimeout(executeNextBet, 200);
                return;
            }
            updateStatusText("⏳ กำลังยืนยันยอดเดิมพันในช่อง...", "#ff9800");
            betTimeoutId = setTimeout(executeNextBet, 3);
            return;
        }
        amountRetryCount = 0;
        amountForceCount = 0;

        isBetInProgress = true;
        lastBetSide = pendingRollSide || currentRollSide || "under";
        activeRollSide = lastBetSide; // ล็อกด้านของไม้ที่กำลังวิ่ง (badge fallback ใช้อ้างอิง)
        updateUI();

        lastBetDispatchTime = Date.now();
        if (totalBets === 0 && !window.__stakeFirstBetLogged) {
            try { window.__stakeFirstBetLogged = true; } catch (e) {}
            diagPush("FIRST_BET", null, diagDomProbe({ step: mStep, amount: currentBetAmount }));
        }
        const tickT0 = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
        if (virtualNow) {
            if (configVirtualWriteZero) {
                const zeroOK = writeZeroToAmountInput();
                const writeMs = ((typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now()) - tickT0;
                trace("ZERO_TIMING", { writeMs: Math.round(writeMs), value: getAmountInputValue(), disabled: !!betBtn.disabled });
                trace("ZERO_FIELD", { ok: zeroOK, value: getAmountInputValue(), disabled: !!betBtn.disabled });
            }
            trace("ZERO_CLICK", { step: mStep, amount: 0, value: getAmountInputValue(), seqBefore: serverRollSeq });
            perfAdd("prep", perfNow() - tPrep0, true);
            // ⏳ เว็บต้องใช้เวลารับค่า 0 ในช่องก่อน — คลิกทันทีหลังเขียนถูกเมินทุกครั้ง (diag 16:08: คลิกแรกถูกเมิน 9/9 ครั้ง)
            betTimeoutId = setTimeout(function () {
                if (!sessionRunning) return;
                clickBetButton(betBtn);
                // ไม้แทงลม = 0 (interceptor เขียน amount=0 ในคำขอให้)
                waitForBetCompletion(betBtn, balanceBefore, currentBetAmount, Date.now());
            }, VIRTUAL_WRITE_SETTLE_MS);
            return;
        }
        trace("REAL_CLICK", { step: mStep, amount: currentBetAmount, value: getAmountInputValue(), disabled: !!betBtn.disabled });
        clickBetButton(betBtn);
        perfAdd("prep", perfNow() - tPrep0, virtualNow);
        // ไม้จริง = ยอดจริง
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

    // 🎯 ด้าน/เส้นแบ่งที่ "ใช้ตัดสินผลจริง" ของไม้นี้ — ใช้บันทึกลง ledger ให้ตรงกับเว็บ
    // ลำดับความน่าเชื่อถือ: condition/target จาก response ของเว็บ → อนุมานจากผลเงินจริง + เลขทอย → ค่าที่โค้ดเข้าใจ
    function resolveSettledRollSpec(isWin, roll) {
        const chance = parseFloat(configChance) || 49.5;
        const underT = chance;
        const overT = 100 - chance;
        const serverSide = (lastServerCondition === "over" || lastServerCondition === "under") ? lastServerCondition : null;
        let side = serverSide;
        if (!side && typeof roll === "number" && isFinite(roll)) {
            if (isWin && roll >= 50) side = "over";          // ชนะด้วยทอยสูง → over
            else if (isWin && roll < 50) side = "under";     // ชนะด้วยทอยต่ำ → under
            else if (!isWin && roll > overT) side = "under"; // แพ้แต่ทอยสูงกว่าเส้น → under
            else if (!isWin && roll < underT) side = "over"; // แพ้แต่ทอยต่ำกว่าเส้น → over
        }
        // ทอยอยู่กลางเส้น (49.5-50.5) แพ้ทั้งสองด้าน → ใช้ด้านที่เพิ่งยืนยันได้ล่าสุดก่อนค่าที่โค้ดเดา
        if (!side) side = lastSettledSide || lastBetSide || activeRollSide || pendingRollSide || currentRollSide || "under";
        const expectedT = (side === "over") ? overT : underT;
        const target = (serverSide === side && typeof lastServerTarget === "number" && isFinite(lastServerTarget))
            ? lastServerTarget : expectedT;
        return { side: side, target: parseFloat(Number(target).toFixed(2)) };
    }

    function waitForBetCompletion(betBtn, balanceBefore, betAmount, startTime) {
        let isResolved = false;
        let checkInterval = null;
        let pollingDelayTimeout = null;
        let stallTimer = null; // ⏱️ ตัวตัดสิน STALL ของไม้ 0$ แบบอิสระ (กัน chain poll ตายเงียบแล้วค้าง 12 วิ)
        const dispatchRollSeq = serverRollSeq; // ลำดับทอยก่อนยิงไม้ (ไม้ 0$ ต้องมีทอยใหม่จริงเท่านั้น)
        // 🛡️ HARD TIMEOUT ต่อไม้: ใช้ setTimeout ตัวเดียว (ไม่พึ่ง setInterval ที่โดน throttle ในแท็บพื้นหลัง)
        //    ครบเวลาที่กำหนดแล้วยังไม่จบ → ปลดล็อกเอง + บันทึก HANG_TIMER (กันอาการค้าง >10 วิ)
        const myDispatch = lastBetDispatchTime;
        const hardLimitMs = (betAmount <= 0) ? 4000 : 5000;
        const hardTimer = setTimeout(function () {
            try {
                if (isResolved) return;
                if (lastBetDispatchTime !== myDispatch) return; // มีไม้ใหม่กว่าแล้ว → ตัวนี้ไม่เกี่ยวข้อง
                trace("HANG_TIMER", {
                    elapsed: Date.now() - startTime,
                    limitMs: hardLimitMs,
                    virtual: betAmount <= 0,
                    seq: serverRollSeq,
                    seqBefore: dispatchRollSeq,
                    fieldValue: getAmountInputValue(),
                    balanceBefore: balanceBefore,
                    balanceNow: getBalance(),
                    step: mStep
                });
                // ไม้ 0$: ใช้ทางเดียวกับ STALL ปกติ (นับ stall / ออกเมื่อครบ limit / ตั้งคิวไม้ถัดไปเอง)
                if (betAmount <= 0) { finishVirtualStall(); return; }
                isResolved = true;
                if (pollingDelayTimeout) { clearTimeout(pollingDelayTimeout); pollingDelayTimeout = null; }
                if (checkInterval) { clearInterval(checkInterval); checkInterval = null; }
                onDiceRollCallback = null;
                isBetInProgress = false;
                // autoHeal ตั้งคิวไม้ถัดไปเองอยู่แล้ว — เรียกซ้ำจะกลายเป็นสั่งซ้อน
                if (!autoHeal("hard-timeout")) scheduleNextBet();
            } catch (e) {}
        }, hardLimitMs);

        function finishBet(isWin, delta, newBal, serverBal) {
            if (isResolved) return;
            isResolved = true;
            // 🎯 ล็อกด้าน/เส้นแบ่งที่ใช้ตัดสินผลของไม้นี้ ก่อนบันทึก ledger
            const settledSpec = resolveSettledRollSpec(isWin, lastRollResult);
            lastSettledSide = settledSpec.side;
            lastSettledTarget = settledSpec.target;
            // 🔁 เว็บยังใช้ด้านอื่นอยู่ (กดฝั่งที่ต้องการแล้วไม่มีผล) → สั่งกดใหม่ในไม้ถัดไป
            if (betAmount > 0 && lastServerCondition && activeRollSide && lastServerCondition !== activeRollSide) {
                pageSideApplied = null;
                const nowSide = Date.now();
                if (nowSide - sideMismatchAt > 60000) {
                    sideMismatchAt = nowSide;
                    trace("SIDE_MISMATCH", { want: activeRollSide, server: lastServerCondition, target: lastSettledTarget });
                }
            }
            lastBetLatencyMs = Date.now() - startTime;
            if (betAmount <= 0) captureSiteError("zero-result");
            betBtnStalls = 0; // ได้ผลลัพธ์ = ปุ่มที่ใช้อยู่ทำงานถูก
            onDiceRollCallback = null;
            if (pollingDelayTimeout) {
                clearTimeout(pollingDelayTimeout);
                pollingDelayTimeout = null;
            }
            if (stallTimer) {
                clearTimeout(stallTimer);
                stallTimer = null;
            }
            if (hardTimer) {
                clearTimeout(hardTimer);
            }
            if (checkInterval) {
                clearInterval(checkInterval);
                checkInterval = null;
            }
            const isVirtualBet = betAmount <= 0;
            const tResult0 = perfNow();
            try {
                handleBetResult(isWin, delta, newBal, betAmount, serverBal);
            } catch (err) {
                // กันเอนจินตาย: บันทึกแล้วซ่อมเอง เดินไม้ต่อทันที
                trace("ERROR", { where: "handleBetResult", message: String(err && err.message || err), stack: String((err && err.stack) || "").split("\n").slice(0, 3).join(" | ") });
                isBetInProgress = false;
                autoHeal("handler-error");
                // กันคิวหลุด: สั่งไม้ถัดไปเสมอแม้ handler พัง
                try { scheduleNextBet(); } catch (e) {}
            }
            perfAdd("result", perfNow() - tResult0, isVirtualBet);
            perfAdd("wait", Date.now() - startTime, isVirtualBet);
            perfBetDone(isVirtualBet);
        }

        // 1. FAST PATH: ตรวจจับผลลัพธ์จริง 100% จากเซิร์ฟเวอร์ผ่าน Network Interceptor (Fetch & XHR)
        onDiceRollCallback = function (rollData, serverBal) {
            try {
                const hasRollResult = !!(rollData && (
                    (rollData.state && typeof rollData.state.result === "number") ||
                    typeof rollData.result === "number"
                ));
                // 🔍 วินิจฉัย: dump ชื่อฟิลด์ของ response ทอย (ครั้งแรก/เมื่อโครงเปลี่ยน) — ดูว่ามี id/nonce
                //    ให้แยก "ผลเดิมที่ส่งซ้ำ" ออกจาก "ทอยใหม่ที่บังเอิญเลขเท่ากัน" ได้หรือไม่
                try {
                    const stK = (rollData && rollData.state) || {};
                    const sigK = Object.keys(rollData || {}).sort().join(",") + "|" + Object.keys(stK).sort().join(",");
                    if (sigK !== rollKeysSig) {
                        rollKeysSig = sigK;
                        const peek = {};
                        ["id", "iid", "nonce", "betId", "payoutMultiplier", "amount", "payout", "target", "result"].forEach(function (k) {
                            if (rollData && rollData[k] !== undefined && typeof rollData[k] !== "object") peek[k] = rollData[k];
                        });
                        ["id", "nonce", "result", "target", "condition"].forEach(function (k) {
                            if (stK[k] !== undefined && typeof stK[k] !== "object") peek["state." + k] = stK[k];
                        });
                        trace("ROLL_KEYS", { top: Object.keys(rollData || {}).join(","), state: Object.keys(stK).join(","), peek: peek });
                    }
                } catch (e) {}

                // 🚫 ทอยเดียวกันถูกส่งมาซ้ำ (อ่าน response เดียวกันหลายทาง) → ไม่นับเป็นตาใหม่
                let rollVal = null;
                if (rollData && rollData.state && typeof rollData.state.result === "number") rollVal = rollData.state.result;
                else if (rollData && typeof rollData.result === "number") rollVal = rollData.result;
                if (rollVal !== null) {
                    const sig = String(rollVal) + "|" + String((rollData.state && rollData.state.condition) || rollData.condition || "");
                    const sigNow = Date.now();
                    // 🆔 ตัวหลัก: Stake ให้ `id` (UUID) ต่อการทอย 1 ครั้ง — ผลเดิมที่ส่งซ้ำจะมี id เดิม
                    //    ทอยใหม่จริงมี id ใหม่เสมอ แม้ตัวเลขจะบังเอิญเท่ากับตาก่อน → ไม่พลาดผลจริงอีก
                    const rollId = (rollData && typeof rollData.id === "string" && rollData.id) ? rollData.id : "";
                    if (rollId && rollId === lastRollId) {
                        netStats.dupBlocked++;
                        trace("ROLL_DUP", { by: "id", id: rollId, roll: rollVal, step: mStep, amount: betAmount });
                        return true; // ผลเดิมถูกส่งมาอีกครั้ง — ห้ามนับซ้ำ
                    }
                    // 🛟 สำรอง (ถ้าเว็บไม่ส่ง id): เทียบเลขทอย+เงื่อนไขภายใน 1.2 วิ เฉพาะไม้จริง
                    if (!rollId && betAmount > 0 && sig === lastRollSig && (sigNow - lastRollSigAt) < ROLL_DUP_MS) {
                        netStats.dupBlocked++;
                        trace("ROLL_DUP", { by: "value", roll: rollVal, gapMs: sigNow - lastRollSigAt, step: mStep, amount: betAmount });
                        return true;
                    }
                    if (rollId) lastRollId = rollId;
                    lastRollSig = sig;
                    lastRollSigAt = sigNow;
                }
                if (hasRollResult) {
                    serverRollSeq++;
                    netStats.rollSeen++;
                    if (lastDiceRequestAt) netStats.rollWithReq++;
                }
                // 🌬️ ไม้ 0$: ต้องเป็น "ทอยใหม่" ของไม้นี้เท่านั้น (ไม่มีทอยใหม่ → ปล่อยให้ตัวตรวจ stall ตัดสิน)
                if (betAmount <= 0 && !hasRollResult) return false;
                if (betAmount <= 0 && serverRollSeq === dispatchRollSeq) return false;
                const targetChance = parseFloat(configChance) || 49.5;
                // 🎯 เก็บด้าน/เส้นแบ่งที่เซิร์ฟเวอร์ใช้จริงของไม้นี้ (ความจริงจาก response ไม่ใช่ค่าที่โค้ดเดา)
                // ถ้า response ไม่มีเงื่อนไข → คงค่าที่รู้ล่าสุดไว้ ไม่ล้างเป็น null
                try {
                    const st = (rollData && rollData.state) || {};
                    const cRaw = String(st.condition || (rollData && rollData.condition) || "").toLowerCase();
                    const srvSide = (cRaw === "above" || cRaw === "over") ? "over"
                        : ((cRaw === "below" || cRaw === "under") ? "under" : null);
                    const tRaw = (typeof st.target === "number") ? st.target
                        : ((rollData && typeof rollData.target === "number") ? rollData.target : null);
                    if (srvSide) {
                        lastServerCondition = srvSide;
                        if (tRaw !== null && isFinite(tRaw)) lastServerTarget = tRaw;
                    }
                } catch (e) {}
                let isWin = false;
                let winMult = 99 / targetChance;

                // บันทึกตัวเลขที่ออกจริง (res) เข้าสู่ระบบเรดาร์สถิติและแสดงผล
                if (rollData.state && typeof rollData.state.result === 'number') {
                    lastRollResult = rollData.state.result;
                    trackRollValue(rollData.state.result);
                } else if (typeof rollData.result === 'number') {
                    lastRollResult = rollData.result;
                    trackRollValue(rollData.result);
                }

                if (betAmount <= 0 && rollData.state && typeof rollData.state.result === 'number') {
                    // 🌬️ ไม้ 0$: payout เป็น 0 เสมอ → ตัดสินจากเลขลูกเต๋าจริงกับ target/condition
                    const res = rollData.state.result;
                    const cond = String(rollData.state.condition || 'below').toLowerCase();
                    const tgt = typeof rollData.state.target === 'number'
                        ? rollData.state.target
                        : ((cond === 'below' || cond === 'under') ? targetChance : (100 - targetChance));
                    isWin = (cond === 'below' || cond === 'under') ? (res < tgt) : (res > tgt);
                } else if (typeof rollData.payoutMultiplier === 'number') {
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

        // (SIM fallback removed: 0$ stall now exits back to real betting)
        // ⏱️ Safety Timeout ไม้จริง: 6 วิ → 3 วิ (build 195) — latency จริง p50 449 ms / max 618 ms
        //    คลิกไม่ติด (ไม่มีคำขอ/ยอดไม่ขยับ) ไม่ต้องรอนาน 6 วิ และไม่คลิกซ้ำ → ไม่เสี่ยงแทงซ้ำ
        const maxTimeout = 3000;

        // 🌬️ ไม้ 0$: ต้องได้ "ทอยใหม่" จากเซิร์ฟเวอร์จริง — ไม่มีทอยใหม่ = STALL (ไม่นับแพ้/ชนะ)
        function finishVirtualStall() {
            if (isResolved) return;
            isResolved = true;
            const tStall0 = perfNow();
            onDiceRollCallback = null;
            if (pollingDelayTimeout) { clearTimeout(pollingDelayTimeout); pollingDelayTimeout = null; }
            if (stallTimer) { clearTimeout(stallTimer); stallTimer = null; }
            if (hardTimer) { clearTimeout(hardTimer); }
            if (checkInterval) { clearInterval(checkInterval); checkInterval = null; }

            virtualStallCount++;
            virtualStallReason = diagnoseVirtualStall(dispatchRollSeq, startTime);
            trace("ZERO_STALL", {
                count: virtualStallCount,
                seq: serverRollSeq,
                reason: virtualStallReason,
                step: mStep,
                gotRequest: lastDiceRequestAt >= (startTime - 500),
                rewroteZero: lastVirtualRewriteAt >= (startTime - 500),
                seqBefore: dispatchRollSeq,
                seqNow: serverRollSeq,
                fieldValue: getAmountInputValue(),
                zeroInField: configVirtualWriteZero
            });
            virtualStallAt = Date.now();
            isBetInProgress = false;
            betBtnStalls++;

            const limit = VIRTUAL_STALL_LIMIT;
            log(`🌬️ [VIRTUAL STALL ${virtualStallCount}/${limit}] ${virtualStallReason} — ไม่นับแพ้/ชนะ (พักไม้ ${mStep})`, true);
            updateStatusText(`🌬️ STALL ${virtualStallCount}/${limit}: ${virtualStallReason} (ไม่นับแพ้)`, "#ffa726");

            if (virtualStallCount === 3) {
                autoHeal("zero-stall");
                // ⚠️ สลับไป "ใช้ยอดจริงในช่อง" ได้เฉพาะเมื่อพิสูจน์แล้วว่าตัว rewrite amount=0 ในคำขอทำงาน
                //    (lastVirtualRewriteAt > 0) — ถ้า rewrite ตายอยู่ การคลิกจะกลายเป็นเดิมพันเงินจริง
                //    แต่ระบบยังบันทึกเป็นไม้ 0$ (เงินจริงหายโดยไม่ถูกนับเป็นแพ้)
                if (configVirtualWriteZero && lastVirtualRewriteAt > 0) {
                    configVirtualWriteZero = false;
                    trace("ZERO_SWITCH", { zeroInField: false, why: "stall3" });
                    log("🌬️ เขียน 0 ในช่องไม่ผ่าน → สลับเป็นใช้ยอดจริงในช่อง (คำขอยังส่ง 0$)", true);
                    applyBetSettings(true);
                } else if (configVirtualWriteZero) {
                    trace("ZERO_SWITCH_BLOCK", { zeroInField: true, why: "rewrite-not-proven", rewriteAt: lastVirtualRewriteAt });
                    log("🛡️ กันไว้: ไม่สลับเป็นยอดจริงในช่อง เพราะ rewrite amount=0 ยังไม่ทำงาน (กันเดิมพันเงินจริงหลุดในโหมดลม)", true);
                }
            }
            if (virtualStallCount >= limit) {
                virtualStallCount = 0;
                trace("ZERO_STALL_EXIT", { afterStalls: limit, reason: virtualStallReason });
                exitVirtualToReal(`0$ ไม่ได้ทอยจริงติดกัน ${limit} ครั้ง (${virtualStallReason}) — กลับไปแทงจริง`);
                updateUI();
                perfAdd("result", perfNow() - tStall0, true);
                perfAdd("wait", Date.now() - startTime, true);
                perfBetDone(true);
                scheduleNextBet();
                return;
            }

            if (betBtnStalls >= 2) {
                betBtnStalls = 0;
                const rotated = rotateBetButton();
                if (rotated) domStrategyNote("ปุ่มเดิมพัน ← " + rotated);
            }
            // ⚡ ข้ามการเขียนซ้ำเมื่อทุกอย่างยังเหมือนเดิม: ช่องเป็น 0 + ปุ่มไม่ล็อก + ฝั่งบนหน้าเว็บตรงกับที่ต้องการ
            //    ⚠️ ต้องเช็กฝั่งด้วย — ถ้าข้ามแล้วไม้ลมไปเดิมพันฝั่งที่เว็บตั้งไว้ ผลที่วัดได้จะไม่ใช่ Under 49.5
            let needSettings = true;
            try {
                const btnNow = cachedBetBtn || getBetButton();
                const btnLocked = !!(btnNow && (btnNow.disabled || btnNow.getAttribute("aria-disabled") === "true"));
                const sideOK = (pageSideApplied === currentRollSide) && (Date.now() - pageSideAppliedAt < 10000);
                needSettings = !(configVirtualWriteZero && String(getAmountInputValue()) === "0" && !btnLocked && sideOK);
            } catch (e) { needSettings = true; }
            if (needSettings) applyBetSettings(true);
            updateUI();
            perfAdd("result", perfNow() - tStall0, true);
            perfAdd("wait", Date.now() - startTime, true);
            perfBetDone(true);
            betTimeoutId = setTimeout(scheduleNextBet, 150); // ไม้ 0$ ค้าง → ลองใหม่เร็วขึ้น (เดิม 300ms)
        }

        if (betAmount <= 0) {
            let waited = 0;
            let nudges = 0;
            // ⏱️ ตัวตัดสิน STALL แบบอิสระ: ครบเวลาที่กำหนดแล้วยังไม่มีผล = ตัดสินทันที ไม่รอ watchdog 12 วิ
            //    (diag 29 ไฟล์: HANG 9 ครั้งเกิดที่ไม้ 0$ และ ZERO_STALL ไม่เคยถูกบันทึกเลย = chain poll ตายเงียบ)
            stallTimer = setTimeout(function () {
                try { if (!isResolved) finishVirtualStall(); } catch (e) {}
            }, VIRTUAL_ROLL_WAIT_MS + 400);
            const pollVirtualRoll = function () {
                if (isResolved) return;
                // 🔁 คลิกซ้ำ 1 ครั้งที่ 350ms เมื่อยังไม่มีทอยใหม่ (เดิม 3 ครั้ง 400/750/1100ms)
                //    เงื่อนไขใช้ "ยังไม่มีทอยใหม่" (serverRollSeq เดิม) ไม่ใช่สัญญาณคำขอ — lastBetSignal() จริงทันทีหลังคลิก
                //    ทำให้เงื่อนไขเดิมไม่เคยผ่าน = คลิกซ้ำไม่ทำงาน
                if (nudges < VIRTUAL_NUDGE_MAX && waited >= VIRTUAL_NUDGE_AT_MS * (nudges + 1) && serverRollSeq === dispatchRollSeq) {
                    nudges++;
                    try {
                        writeZeroToAmountInput();
                        const btn = cachedBetBtn || getBetButton();
                        if (btn) {
                            if (btn.disabled) btn.disabled = false;
                            btn.removeAttribute("disabled");
                            btn.setAttribute("aria-disabled", "false");
                            btn.click();
                        }
                        updateStatusText(`🌬️ คลิกซ้ำไม้ 0$ ครั้งที่ ${nudges} (ยังไม่มีทอย)`, "#ffa726");
                        try { trace("ZERO_NUDGE", { n: nudges, waited: waited }); } catch (e) {}
                    } catch (e) {}
                }
                if (serverRollSeq !== dispatchRollSeq && typeof lastRollResult === "number") {
                    const targetChance = parseFloat(configChance) || 49.5;
                    const isOver = (pendingRollSide || currentRollSide || "under") === "over";
                    const isWin = isOver ? (lastRollResult > (100 - targetChance)) : (lastRollResult < targetChance);
                    finishBet(isWin, 0, balanceBefore, null);
                    return;
                }
                waited += VIRTUAL_ROLL_POLL_MS;
                if (waited < VIRTUAL_ROLL_WAIT_MS) {
                    pollingDelayTimeout = setTimeout(pollVirtualRoll, VIRTUAL_ROLL_POLL_MS);
                    return;
                }
                finishVirtualStall();
            };
            pollingDelayTimeout = setTimeout(pollVirtualRoll, VIRTUAL_ROLL_POLL_MS);
            return; // ไม่ตั้ง polling balance สำหรับไม้ 0$
        }

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

                // ตรวจจากยอด Balance จริงในกระเป๋าเท่านั้น (ไม่เดาจากสี/badge) หลังรอ API เกิน 1200ms
                if (isReady && elapsed > 1200 && betAmount > 0 && balanceBefore !== null) {
                    const balanceNow = getBalance();
                    if (balanceNow !== null && Math.abs(balanceNow - balanceBefore) > 0.0000000001) {
                        const delta = parseFloat((balanceNow - balanceBefore).toFixed(8));
                        finishBet(delta > 0, delta, balanceNow);
                        return;
                    }
                }

                // ⛔ ไม่มีการ "คลิกซ้ำไม้จริง" แล้ว (ถอดออกตามคำสั่ง):
                //    หลังแก้รอ 400ms ตอนออกจากแทงลม อาการค้างหายแล้ว และการคลิกซ้ำเคยทำไม้ซ้ำ
                //    ปล่อยให้ Safety Timeout 6 วิ ด้านล่างจัดการแทน

                // Safety Timeout
                if (elapsed > maxTimeout) {
                    // หยุด polling ทันที ไม่ให้นับซ้ำ/สั่งแทงซ้อนหลายรอบ
                    if (checkInterval) {
                        clearInterval(checkInterval);
                        checkInterval = null;
                    }
                    const finalBal = getBalance();
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
                    scheduleNextBet();
                }
            }, 6);
        }, 12);
    }

    // ==================================================
    // 9. CORE FIBONACCI BET LOGIC HANDLER
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
            // ผ่อนเกณฑ์: ยอดจาก API มีการปัดเศษได้ถึงระดับ 1e-6 USDT — เก่า (1e-8) ทำให้แจ้ง DESYNC หลอก
            const tol = Math.max(1e-6, Math.abs(delta) * 1e-3);
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
        markActivity();
        isBetInProgress = false;
        const ledgerStep = mStep; // บันทึกลำดับไม้จริงของตาที่เพิ่งจบ (ก่อนบวก/รีเซ็ต)
        const prevStreak = currentStreak;   // ผลของตาก่อนหน้า (ก่อนอัปเดต)

        // ==========================================
        // 🌬️ LOSS-STREAK VIRTUAL BET HANDLER (แทงจริงแพ้ติด 3 -> แทงลม 0$ รอชนะลมติด 2 หรือรวม 2 -> ออกแทงลมลุยต่อไม้เดิม)
        // ==========================================
        if (betAmount <= 0) {
            // กันนับซ้ำ: ทอยเดิม (seq เดิม) ถูกประมวลผลไปแล้ว → ไม่นับซ้ำ
            if (serverRollSeq === virtualLastSeq) {
                trace("ZERO_DUP", { seq: serverRollSeq });
                isBetInProgress = false;
                scheduleNextBet();
                return;
            }
            virtualLastSeq = serverRollSeq;
            
            virtualStallCount = 0; // ได้ทอยจริงสักไม้ = ล้างตัวนับ stall
            trace("ZERO_RESULT", { win: !!isWin, roll: lastRollResult, source: "SERVER", seq: serverRollSeq, target: (lastSettledTarget !== null ? lastSettledTarget : (parseFloat(configChance) || null)), cond: (lastSettledSide || pendingRollSide || currentRollSide || "under"), latencyMs: (typeof lastBetLatencyMs === "number") ? lastBetLatencyMs : null, reqMs: (lastDiceRequestAt ? (lastDiceRequestAt - lastBetDispatchTime) : null), respMs: (lastDiceRequestAt ? (Date.now() - lastDiceRequestAt) : null) });
            virtualRolls++;
            virtualRollsTotal++;
            // 🧾 บันทึกไม้ 0$ ลง ledger (ยอด 0 / delta 0 / source VIRTUAL)
            ledgerRecord({
                step: mStep,
                amount: 0,
                win: !!isWin,
                delta: 0,
                balance: currentBalance,
                source: "VIRTUAL",
                roll: (typeof lastRollResult === "number") ? lastRollResult : null,
                target: (lastSettledTarget !== null ? lastSettledTarget : (parseFloat(configChance) || null)),
                cond: (lastSettledSide || pendingRollSide || currentRollSide || "under"),
                seq: serverRollSeq,
                latencyMs: (typeof lastBetLatencyMs === "number") ? lastBetLatencyMs : null
            });
            const rollTag = (typeof lastRollResult === "number") ? ` [ทอย ${lastRollResult.toFixed(2)}]` : "";
            const nextRealAmt = calculateCurrentBetAmount();
            if (isWin) {
                if (virtualExitDue()) {
                    exitVirtualToReal(`ชนะลมตาที่ ${virtualRolls}/${VIRTUAL_EXIT_AFTER_ROLLS} — กลับไปแทงจริงไม้เดิม`);
                } else {
                    log(`🌬️ [VIRTUAL WIN]${rollTag} ชนะลม (ตาที่ ${virtualRolls}/${VIRTUAL_EXIT_AFTER_ROLLS}) · รอต่อไม้ ${mStep} (${nextRealAmt}$)`);
                    updateStatusText(`🌬️ แทงลม 0$ (ตาที่ ${virtualRolls}/${VIRTUAL_EXIT_AFTER_ROLLS}): ชนะลม · รอต่อไม้ ${mStep} (${nextRealAmt}$)`, "#55e7ff");
                }
            } else {
                log(`🌬️ [VIRTUAL LOSS]${rollTag} แพ้ลม (ตาที่ ${virtualRolls}/${VIRTUAL_EXIT_AFTER_ROLLS}) · พักไม้ ${mStep} (${nextRealAmt}$)`);
                updateStatusText(`🌬️ แทงลม 0$ (ตาที่ ${virtualRolls}/${VIRTUAL_EXIT_AFTER_ROLLS}): แพ้ลม${rollTag} · พักไม้ ${mStep} (${nextRealAmt}$)`, "#8596a5");
                if (virtualExitDue()) {
                    exitVirtualToReal(`แพ้ลมตาที่ ${virtualRolls}/${VIRTUAL_EXIT_AFTER_ROLLS} — กลับไปแทงเงินจริงไม้เดิม`);
                }
            }
            if (configAlternateRoll) {
                currentRollSide = (currentRollSide === "under") ? "over" : "under";
            } else {
                currentRollSide = "under";
            }
            pendingRollSide = currentRollSide;
            updateUI();
            scheduleNextBet();
            return;
        }

        const usedCloseAll = closeAllNext;  // ตานี้ใช้กฎ "ปิดหนี้ทั้งหมด" หรือไม่
        closeAllNext = false;               // ใช้ครั้งเดียว (ไม้ 0$ ไม่ล้างค่าธงนี้)

        totalBets++;
        betTimestamps.push(Date.now());
        if (betTimestamps.length > 50) betTimestamps.shift();
        totalWagered = parseFloat((totalWagered + betAmount).toFixed(8));

        applyBetBalance(delta, newBalance, serverBal);
        ledgerRecord({
            step: ledgerStep, amount: betAmount, win: !!isWin, delta: delta, balance: currentBalance,
            source: (typeof serverBal === "number" ? "API" : "DOM"),
            roll: (typeof lastRollResult === "number") ? lastRollResult : null,
            target: (lastSettledTarget !== null ? lastSettledTarget : (parseFloat(configChance) || null)),
            cond: (lastSettledSide || activeRollSide || pendingRollSide || currentRollSide || "under"),
            seq: serverRollSeq,
            latencyMs: (typeof lastBetLatencyMs === "number") ? lastBetLatencyMs : null
        });
        // DESYNC สั่งหยุดไปแล้ว — ห้ามเอาข้อความ "ชนะ/แพ้" มาทับข้อความหยุด
        if (!sessionRunning) return;

        if (currentBalance !== null && startBalance !== null) {
            profit = parseFloat((currentBalance - startBalance).toFixed(8));
        } else {
            profit = parseFloat((profit + delta).toFixed(8));
        }
        cycleProfit = parseFloat((cycleProfit + delta).toFixed(8));
        const realCycleProfit = (currentBalance !== null && cycleStartBalance !== null)
            ? parseFloat((currentBalance - cycleStartBalance).toFixed(8))
            : cycleProfit;
        const genuineCyclePositive = (cycleProfit > 0) && (realCycleProfit > 0);

        if (currentBalance !== null) {
            if (peakBalance === null || currentBalance > peakBalance) peakBalance = currentBalance;
            const currentDrawdown = peakBalance - currentBalance;
            if (currentDrawdown > maxDrawdown) maxDrawdown = currentDrawdown;
        }

        if (betAmount > 0) lastBetAmount = betAmount;

        recordLossGap(!!isWin);

        if (isWin) {
            winsCount++;
            currentStreak = currentStreak > 0 ? currentStreak + 1 : 1;
            realLossStreakForVirtual = 0;
        } else {
            lossesCount++;
            currentStreak = currentStreak < 0 ? currentStreak - 1 : -1;
            realLossStreakForVirtual++;
        }

        // ==========================================
        // FIBONACCI 20 ไม้ (49.5% Under · ชนะถอย 2 ขั้น / รีเซ็ตไม้ 1)
        // ==========================================
        if (isWin) {
            successfulSnipes++;
            flashHudAlert("#00e676");
            const rollTag = (typeof lastRollResult === "number") ? ` [ทอย ${lastRollResult.toFixed(2)}]` : "";

            // ✅ กฎ "ชนะติดต่อกัน 2 ครั้ง = คืนทุนจริงเท่านั้น" — ต้องมียอดเงินกลับมาถึงทุนของรอบก่อนจึงรีเซ็ต
            // (ไม้ลึก K=2: ชนะ Hit 1 ปลดหนี้ 50% → ชนะ Hit 2 ปิดหนี้ 100% → ยอดกลับถึงทุน → รีเซ็ตไม้ 1)
            const isRealRecovery = (getCycleDeficit() <= 0.00000001) ||
                (currentBalance !== null && cycleStartBalance !== null && currentBalance >= cycleStartBalance);
            if (currentStreak >= 2 && mStep > 1 && isRealRecovery) {
                const wasStep = mStep;
                const wonCycle = (currentBalance !== null && cycleStartBalance !== null)
                    ? parseFloat((currentBalance - cycleStartBalance).toFixed(5))
                    : cycleProfit;
                mStep = 1;
                cycleProfit = 0;
                if (currentBalance !== null) cycleStartBalance = currentBalance;
                inRefreshRecovery = false;
                recoveryWinStreak = 0;
                updateBaseBetOnReset("ชนะติด 2 ครั้ง คืนทุนทันที");
                log(`🎉 [2-WIN RECOVERED]${rollTag} ชนะติดต่อกัน ${currentStreak} ครั้ง → คืนทุนทันที! (ไม้ ${wasStep} → 1 · รอบ ${wonCycle >= 0 ? "+" : ""}${wonCycle}$)`, true);
                                    trace("TWO_WIN_RECOVERED", { step: wasStep, streak: currentStreak, cycle: wonCycle, balance: currentBalance, cycleStart: cycleStartBalance });
                    if (usedCloseAll) { try { trace("CLOSE_ALL_WON", { step: wasStep, cycle: wonCycle }); } catch (e) {} }
                updateStatusText(`🎉 ชนะติด 2 ครั้ง → คืนทุนทันที! รีเซ็ตกลับไม้ 1`, "#00e676");
            } else if (currentStreak >= 2 && mStep > 1) {
                // ชนะ 2 ติดแต่ยอดจริงยังไม่ถึงทุน → ห้ามรีเซ็ตหลอก ต้องล้างหนี้ที่เหลือให้ครบก่อน
                const remainDeficit = getCycleDeficit();
                const prevStep = mStep;
                mStep = (remainDeficit > 0.00000001) ? Math.max(2, mStep - 1) : 1;
                const nextAmt = calculateCurrentBetAmount();
                log(`⚠️ [2-WIN SHORT]${rollTag} ชนะติด ${currentStreak} ครั้ง แต่ยอดจริงยังขาด ${formatNumber(remainDeficit, 5)}$ → ไม่รีเซ็ต, ไม้ ${prevStep} → ${mStep} ล้างหนี้ต่อ (${nextAmt}$)`, true);
                trace("TWO_WIN_SHORT", { step: prevStep, nextStep: mStep, streak: currentStreak, remain: remainDeficit, balance: currentBalance, cycleStart: cycleStartBalance });
                updateStatusText(`⚠️ ชนะติด 2 แต่ยังไม่ถึงทุน (ขาด ${formatNumber(remainDeficit, 5)}$) → ล้างหนี้ต่อ`, "#ffa726");
            } else if (inRefreshRecovery) {
                recoveryWinStreak++;
                log(`🎯 [F5-RECOVERY WIN]${rollTag} ชนะในรอบแก้ตัว ${recoveryWinStreak}/2 ตาติด (ไม้ ${mStep}) +$${delta.toFixed(8)}`, true);

                const isF5FullyRecovered = genuineCyclePositive || 
                    (currentBalance !== null && cycleStartBalance !== null && currentBalance >= cycleStartBalance) ||
                    (getCycleDeficit() <= 0.00000001);

                if (isF5FullyRecovered) {
                    const wasStep = mStep;
                    inRefreshRecovery = false;
                    recoveryWinStreak = 0;
                    mStep = 1;
                    cycleProfit = 0;
                    cycleStartBalance = currentBalance;
                    updateBaseBetOnReset("จบ F5 Recovery (คืนทุน 100%)"); // ปรับยอดฐานใหม่ตามบาลานซ์เมื่อรีเซ็ต
                    try {
                        localStorage.removeItem(STORAGE_RECOVERY_KEY);
                        sessionStorage.removeItem(STORAGE_RECOVERY_KEY);
                    } catch (e) {}
                    log(`🎉 [F5-RECOVERY DONE]${rollTag} ชนะกู้คืนสำเร็จ 100%! หลุดจากไม้ ${wasStep} → รีเซ็ตกลับไม้ 1 (โหมด 20 ไม้)`, true);
                    updateStatusText(`🎉 บวกคืนทุน 100% แล้ว! ปลดล็อกกลับไม้ 1`, "#00e676");
                    flashHudAlert("#00e676");
                } else {
                    const prevStep = mStep;
                    mStep = Math.max(1, mStep - 1);
                    const remainingDeficit = getCycleDeficit();
                    const nextAmt = calculateCurrentBetAmount();
                    log(`🎯 [F5-RECOVERY STEP-BACK]${rollTag} ชนะปลดหนี้ (ไม้ ${prevStep} → ${mStep}) หนี้เหลือ ${formatNumber(remainingDeficit, 5)}$ → สู้ต่อ (${nextAmt}$)`, true);
                    updateStatusText(`🎯 ชนะรอบแก้ตัว! (ไม้ ${prevStep} → ไม้ ${mStep}) หนี้เหลือ ${formatNumber(remainingDeficit, 5)}$`, "#00e676");
                }
            } else if (mStep === 1 && getCycleDeficit() <= 0.00000001) {
                cycleProfit = 0;
                cycleStartBalance = currentBalance;
                updateBaseBetOnReset("ชนะไม้ 1"); // ปรับยอดฐานใหม่ตามบาลานซ์เมื่อรีเซ็ต
                log(`🎯 [WIN]${rollTag} ไม้ 1 ชนะ +$${delta.toFixed(8)} (ชนะติด ${currentStreak})`, totalBets % 50 === 0);
                updateStatusText(`🎯 [WIN]${rollTag} +${delta.toFixed(5)}$ | ไม้ 1 (ชนะติด ${currentStreak})`, "#00e676");
            } else if (mStep === 1) {
                // ⚠️ ชนะที่ไม้ 1 แต่ "ยังมีหนี้ค้าง" (K=2 ปลดได้แค่ครึ่ง) → ห้ามรีเซ็ตรอบ (ไม่งั้นหนี้หายเกลี้ยง = ขาดทุนจริง)
                const remainDeficit = getCycleDeficit();
                mStep = 2;
                const nextAmt = calculateCurrentBetAmount();
                log(`⚠️ [DEBT-NOT-CLEARED]${rollTag} ชนะที่ไม้ 1 แต่หนี้ยังเหลือ ${formatNumber(remainDeficit, 5)}$ → ไม่รีเซ็ตรอบ, ต่อไม้ 2 ล้างหนี้ (${nextAmt}$)`, true);
                trace("DEBT_NOT_CLEARED", { remain: remainDeficit, nextAmount: nextAmt, streak: currentStreak });
                updateStatusText(`⚠️ หนี้ยังเหลือ ${formatNumber(remainDeficit, 5)}$ → ล้างหนี้ต่อ (${nextAmt}$)`, "#ffa726");
            } else if (activeEngineMode === "fibo") {
                // 📈 ระบบ Fibonacci 20 ไม้: กำไรรอบทบเป็นบวกจริง หรือ ถอยถึงไม้ 1 -> รีเซ็ตกลับไม้ 1 ทันที
                const isFiboRecovered = genuineCyclePositive || 
                    (currentBalance !== null && cycleStartBalance !== null && currentBalance >= cycleStartBalance) ||
                    (getCycleDeficit() <= 0.00000001);

                if (isFiboRecovered) {
                    const wasStep = mStep;
                    const wonCycle = (currentBalance !== null && cycleStartBalance !== null)
                        ? parseFloat((currentBalance - cycleStartBalance).toFixed(5))
                        : cycleProfit;
                    mStep = 1;
                    cycleProfit = 0;
                    cycleStartBalance = currentBalance;
                    updateBaseBetOnReset("Fibonacci บวกจริง");
                    log(`🎉 [FIBO RECOVERED]${rollTag} ชนะปลดล็อกไม้ ${wasStep} สำเร็จ! รอบทบคืนทุน (+${wonCycle >= 0 ? "+" : ""}${wonCycle}$) → รีเซ็ตกลับไม้ 1`, true);
                    updateStatusText(`🎉 [FIBO] ชนะกู้คืนสำเร็จ (+${delta.toFixed(5)}$)! รีเซ็ตกลับไม้ 1`, "#00e676");
                } else {
                    // ชนะทั่วไป: ถอยหลัง 2 ขั้น
                    const prevStep = mStep;
                    mStep = Math.max(1, mStep - 2);
                    if (mStep === 1) {
                        cycleProfit = 0;
                        cycleStartBalance = currentBalance;
                        updateBaseBetOnReset("Fibonacci ถอยกลับถึงไม้ 1");
                        log(`🎉 [FIBO DONE]${rollTag} ชนะถอย 2 ขั้น (ไม้ ${prevStep} → 1) กลับถึงไม้ 1 สำเร็จ! รีเซ็ตรอบใหม่`, true);
                        updateStatusText(`🎉 [FIBO] ถอยกลับถึงไม้ 1! ปลดล็อกรอบใหม่`, "#00e676");
                    } else {
                        const nextAmt = calculateCurrentBetAmount();
                        log(`🎯 [FIBO STEP-BACK]${rollTag} ชนะถอย 2 ขั้น (ไม้ ${prevStep} → ${mStep}) +$${delta.toFixed(8)} → ไม้ถัดไป ${nextAmt}$`, true);
                        updateStatusText(`🎯 [FIBO] ชนะถอย 2 ขั้น (ไม้ ${prevStep} → ไม้ ${mStep}) สู้ต่อ`, "#00e676");
                    }
                }
            } else {
                // 🛡️ ระบบ Hybrid หรือ Pure K=2
                // ตรวจสอบว่า คืนทุนครบ 100% จริงหรือไม่ (genuineCyclePositive หรือ บาลานซ์จริงกลับมาเท่าทุน/บวก)
                const isFullyRecovered = genuineCyclePositive || 
                    (currentBalance !== null && cycleStartBalance !== null && currentBalance >= cycleStartBalance) ||
                    (getCycleDeficit() <= 0.00000001);

                if (isFullyRecovered) {
                    // 🎯 ปลดหนี้ครบ 100% คืนทุนจริง! (ไม่ว่าจะชนะตาเดียวที่ไม้ตื้น หรือชนะกู้คืนที่ไม้ลึก)
                    const wasStep = mStep;
                    const wonCycle = (currentBalance !== null && cycleStartBalance !== null)
                        ? parseFloat((currentBalance - cycleStartBalance).toFixed(5))
                        : cycleProfit;
                    mStep = 1;
                    cycleProfit = 0;
                    if (currentBalance !== null) cycleStartBalance = currentBalance;
                    updateBaseBetOnReset("รอบทบคืนทุนสำเร็จ 100%");
                    log(`🎉 [RECOVERED]${rollTag} ปลดหนี้ไม้ ${wasStep} สำเร็จ 100%! รอบทบคืนทุนจริง (+${wonCycle >= 0 ? "+" : ""}${wonCycle}$) → รีเซ็ตกลับไม้ 1`, true);
                    if (usedCloseAll) { try { trace("CLOSE_ALL_WON", { step: wasStep, cycle: wonCycle }); } catch (e) {} }
                    updateStatusText(`🎉 [RECOVERED] ปลดหนี้สำเร็จ 100% (+${delta.toFixed(5)}$)! รีเซ็ตกลับไม้ 1`, "#00e676");
                } else {
                    // 🎯 ชนะปลดหนี้บางส่วน (ไม้ลึก): ถอย 1 ขั้น และเตรียมไม้ถัดไปล้างหนี้ต่อ
                    const prevStep = mStep;
                    mStep = (getCycleDeficit() > 0.00000001) ? Math.max(2, mStep - 1) : 1;
                    const remainingDeficit = getCycleDeficit();
                    const nextAmt = calculateCurrentBetAmount();
                    log(`🎯 [RECOVERY WIN]${rollTag} ชนะปลดหนี้! +$${delta.toFixed(8)} | หนี้เหลือ ${formatNumber(remainingDeficit, 5)}$ → ไม้ถัดไป ${nextAmt}$`, true);
                    updateStatusText(`🎯 [RECOVERY WIN] ชนะปลดหนี้! หนี้เหลือ ${formatNumber(remainingDeficit, 5)}$ → ไม้ถัดไป (${nextAmt}$)`, "#00e676");
                }
            }
        } else {
            const maxLimit = MAX_FIBO_STEPS;
            mStep = Math.min(maxLimit, mStep + 1);
            if (mStep > maxStepReached) maxStepReached = mStep;
            // 🎯 ชนะแล้วแพ้ (W→L) → ตาถัดไปปิดหนี้ทั้งหมด: ทำให้ลำดับ ชนะ-แพ้-ชนะ คืนทุนได้จริง
            if (prevStreak >= 1) {
                closeAllNext = true;
                const deficitNow = getCycleDeficit();
                const closeAmt = calculateCurrentBetAmount();
                try { trace("CLOSE_ALL_ARMED", { deficit: deficitNow, amount: closeAmt, step: mStep, streakBefore: prevStreak }); } catch (e) {}
                log(`🎯 [CLOSE-ALL] ชนะแล้วแพ้ → ตาถัดไปปิดหนี้ทั้งหมด ${formatNumber(deficitNow, 5)}$ (เดิมพัน ${closeAmt}$) ให้ W-L-W คืนทุน`, true);
            }
            const nextAmt = calculateCurrentBetAmount();
            const rollTag = (typeof lastRollResult === "number") ? ` [ทอย ${lastRollResult.toFixed(2)}]` : "";
            log(`⚠️ [LOSS]${rollTag} แพ้ -$${Math.abs(delta).toFixed(8)} → ขยับเป็นไม้ ${mStep}/${maxLimit} (${nextAmt}$)`, true);
            updateStatusText(`⚠️ [LOSS]${rollTag} -${formatNumber(Math.abs(delta), 5)}$ → ไม้ ${mStep}/${maxLimit} (${nextAmt}$)`, "#ffa726");

            // 🌬️ แทงเงินจริงแพ้ติดต่อกันครบ N ครั้ง -> ตัดเข้าโหมดแทงลม 0$ ทันที!
            const justLostStep = Math.max(1, mStep - 1);   // ไม้ที่เพิ่งแพ้ (mStep ถูก +1 ไปก่อนแล้ว)
            if (configVirtualBetEnabled && realLossStreakForVirtual >= configVirtualLossTrigger) {
                if (!(configVirtualLossTrigger > 0)) configVirtualLossTrigger = 3;
                virtualMode = true;
                virtualEnteredAt = Date.now();
                parkedStep = Math.max(1, mStep - 1);   // 🔒 ไม้ที่ "เพิ่งแพ้" (mStep ถูก +1 ไปก่อนแล้ว)
                parkedAmount = (function () {
                    const keep = mStep;
                    mStep = parkedStep;
                    const amt = parseFloat(calculateCurrentBetAmount());
                    mStep = keep;
                    return amt;
                })();
                const trigLosses = realLossStreakForVirtual;
                resetVirtualRun(); // reset counters of this virtual run
                recordEvent("VIRTUAL_ENTER", { by: "auto", losses: trigLosses, parkedStep: parkedStep, parkedAmount: parkedAmount });
                realLossStreakForVirtual = 0;
                log(`🌬️ [VIRTUAL ENTER]${rollTag} แพ้เงินจริงติดต่อกันครบ ${trigLosses} ครั้ง (ไม้ ${justLostStep} · เกณฑ์ ${configVirtualLossTrigger} ตา)! ตัดเข้าโหมดแทงลม 0$ (แทงลม ${VIRTUAL_EXIT_AFTER_ROLLS} ตา แล้วกลับไปแทงจริงที่ไม้ ${parkedStep}: ${formatBetAmount(parkedAmount)}$ — แพ้หรือชนะก็ออก)`, true);
                updateStatusText(`🌬️ แพ้จริงติด ${trigLosses} ครั้ง! เข้าแทงลม 0$ (${VIRTUAL_EXIT_AFTER_ROLLS} ตา → ต่อไม้ ${parkedStep}: ${formatBetAmount(parkedAmount)}$ แพ้/ชนะก็ออก)`, "#55e7ff");
            } else if (realLossStreakForVirtual >= configVirtualLossTrigger) {
                // แพ้ครบเงื่อนไขแล้วแต่ระบบแทงลมถูกปิด — บอกให้เห็นบน HUD ว่าติดที่สวิตช์
                updateStatusText(`🌬️ แพ้ติด ${realLossStreakForVirtual} ครั้ง แต่ระบบแทงลมถูกปิดอยู่ — กดปุ่ม 🌬️ บน HUD เพื่อเปิด`, "#ffa726");
            }

            // 🚫 ไม่รีเฟรชหน้าเว็บเองแล้ว (F5 recovery ถูกลบ) — แพ้ติดต่อให้เดินไม้ต่อตามลำดับปกติ
            if (inRefreshRecovery) {
                recoveryWinStreak = 0;
            }
        }

        // 🔄 สลับฝั่งอัตโนมัติทุกตา (ถ้าเปิดใช้งาน)
        if (configAlternateRoll) {
            currentRollSide = (currentRollSide === "under") ? "over" : "under";
        } else {
            currentRollSide = "under";
        }
        pendingRollSide = currentRollSide;

        updateUI();

        // ⏱️ GRACEFUL TIME EXIT: ครบเวลาแล้ว ต้องรอให้ยอดรวมเป็นบวก (profit > 0) และรีเซ็ตกลับไม้ 1 ก่อนพักเสมอ!
        if (sessionTimeExpired || sessionRecoveryActive) {
            publishRecoveryHold();
            const domBal = getBalance();
            const realProfit = (domBal !== null && startBalance !== null)
                ? parseFloat((domBal - startBalance).toFixed(8))
                : profit;
            // 🛑 [HOLD CAP] เพดานพยุงที่ประกาศไว้ (SESSION_RECOVERY_MAX_EXTRA_MIN) — เดิมไม่ถูกอ้างอิงที่ไหนเลย
            //    ผลจริง 18 พ.ย.: ครบ 20 นาที→เข้าโหมดพยุง→วิ่งต่อ 37 นาทีจนคนกดหยุดเอง (net -6.317$)
            if (sessionRecoveryActive && sessionHoldDeadlineAt && Date.now() >= sessionHoldDeadlineAt) {
                const totalMin = sessionStartedAt ? Math.round((Date.now() - sessionStartedAt) / 60000) : 0;
                log(`🛑 [HOLD CAP] พยุงเกินเพดาน ${SESSION_RECOVERY_MAX_EXTRA_MIN} นาที (รวม ${totalMin} นาที) — หยุดเพื่อความปลอดภัย`, true);
                stopSession(`⏰ พยุงครบเพดาน ${SESSION_RECOVERY_MAX_EXTRA_MIN} นาที (รวม ${totalMin} นาที) — หยุดเพื่อความปลอดภัย`, "#ff3344");
                return;
            }
            if (realProfit > 0 && mStep === 1) {
                log(`⏱️ [SAFE EXIT] ครบเวลาและยอดจริงเป็นบวก (+${formatNumber(realProfit, 4)}$) จบกลับยอดฐานไม้ 1 ปลอดภัย — ปิดเซสชันพักเบรก!`, true);
                stopSession(`⏰ ครบเวลา ${configSessionMaxMinutes} นาที ยอดเป็นบวก (+${formatNumber(realProfit, 4)}$) จบไม้ 1 สำเร็จ — พักเบรก`, "#00e676");
                return;
            } else {
                updateStatusText(`⏱️ ครบเวลาแล้ว — รอจบรอบไม้ 1 + ยอดบวกก่อนพัก (ยอด: ${formatNumber(realProfit, 4)}$, อยู่ไม้ ${mStep})`, "#ffea00");
            }
        }

        applyBetSettings(); // ตั้งยอดไม้ถัดไปล่วงหน้า ให้ช่องกรอกอัปเดตก่อนถึงรอบกด
        scheduleNextBet();
    }

    // เปิดโหมด "เดิมพันในทันที" (Instant Bet) อัตโนมัติ: เปิดเมนูเฟือง > หาปุ่มสวิตช์ > ตรวจสถานะ (data-active) > กดเฉพาะเมื่อยังปิดอยู่
    function findInstantBetLabel() {
        const exact = document.querySelector('button[data-testid="button-instantBetToggle"]');
        if (exact) return exact;
        const nodes = document.querySelectorAll('span, label, div');
        for (let i = 0; i < nodes.length; i++) {
            const n = nodes[i];
            if (n.children.length > 1) continue;
            const t = (n.textContent || "").trim();
            if (t === "เดิมพันในทันที" || /^instant\s*bet$/i.test(t)) return n;
        }
        return null;
    }

    function readToggleState(labelEl) {
        if (labelEl && labelEl.getAttribute) {
            const da = labelEl.getAttribute("data-active");
            if (da === "true" || da === "false") return { el: labelEl, on: da === "true" };
        }
        let node = labelEl;
        for (let depth = 0; depth < 5 && node; depth++) {
            const ctl = node.querySelector('input[type="checkbox"], [role="switch"], button[aria-checked], [aria-checked]');
            if (ctl) {
                if (ctl.tagName === "INPUT") return { el: ctl, on: !!ctl.checked };
                const aria = ctl.getAttribute("aria-checked");
                if (aria === "true" || aria === "false") return { el: ctl, on: aria === "true" };
                return null;
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
            const p = (window.location.pathname || "").toLowerCase();
            return p.includes("/dice");
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

    // 🎯 AUTO NAV: ปิดเป็นค่าเริ่มต้น ไม่ให้เปลี่ยนหน้าหรือรีเฟรชเว็บเองเด็ดขาด
    let configAutoGoDice = false;

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
                let gears = Array.from(document.querySelectorAll('button[data-testid="game-settings"]'));
                if (gears.length === 0) {
                    gears = Array.from(document.querySelectorAll('svg[data-ds-icon="Settings"]'))
                        .map((s) => s.closest('button'))
                        .filter(Boolean);
                }
                gears = gears.slice(0, 1);
                for (let i = 0; i < gears.length && !label; i++) {
                    gears[i].click();
                    await sleep(150);
                    label = findInstantBetLabel();
                    if (label) openedGear = gears[i];
                    else gears[i].click(); // ไม่ใช่เมนูที่ต้องการ ปิดกลับ
                }
            }
            if (!label) return "ไม่พบเมนู Instant Bet";
            const state = readToggleState(label);
            let result;
            if (!state) {
                result = "พบเมนูแต่อ่านสถานะสวิตช์ไม่ได้ (ไม่กด)";
            } else if (state.on) {
                result = "Instant Bet เปิดอยู่แล้ว";
            } else {
                state.el.click();
                await sleep(100);
                const after = readToggleState(label);
                result = after && after.on ? "เปิด Instant Bet สำเร็จ" : "กดแล้วแต่ยืนยันสถานะไม่ได้";
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
    // 🩹 RECOVERY HOLD — ครบเวลาแล้วถ้ายัง "ขาดทุน" ห้ามปิดบัญชี ให้พยุงต่อจนกว่าจะจบกลับไม้ 1 และยอดรวมเป็นบวก
    // เหตุผล: การตัดจบตอนขาดทุน = ล็อกขาดทุนทิ้ง และทิ้งบันไดค้างไว้กลางทาง
    const SESSION_RECOVERY_MAX_EXTRA_MIN = 60;  // เพดานพยุงสูงสุด (นาที) กันเซสชันค้างข้ามวัน
    const SESSION_HOLD_REFRESH_MS = 5000;       // รีเฟรช title STAKE_HOLD ทุก 5 วิ (เว็บอาจเขียนทับ)
    let configSessionMaxMinutes = 20; // ค่าเริ่มต้น 20 นาที (ครบเวลาแล้วไม่ตัดทันที แต่รอให้แก้ไม้จบก่อน)
    let sessionTimeExpired = false;
    let sessionRecoveryActive = false;  // กำลังพยุงอยู่ (ครบเวลาแต่ยังขาดทุน)
    let sessionRecoveryStreak = 0;      // ชนะติดกันกี่ไม้ นับจากวินาทีที่เริ่มพยุง
    let sessionHoldDeadlineAt = 0;      // 🛑 เวลาสิ้นสุดของโหมดพยุง (ms) — บังคับใช้ SESSION_RECOVERY_MAX_EXTRA_MIN
    let sessionHoldTitleTimerId = null;
    let sessionStartedAt = 0;
    let sessionTimerId = null;
    let sessionGraceTimerId = null;
    let lastSessionSummary = "";
    const LEDGER_HEADER = "date,account,start_bal,end_bal,profit,bets,max_step,minutes,stop_reason";

    function stopSessionTimer() {
        stopRecoveryHold();
        if (idleWatchId) { clearInterval(idleWatchId); idleWatchId = null; }
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
        sessionStartedAt = Date.now();
        markActivity();
        startIdleWatch();
        if (!configSessionMaxMinutes) return;
        sessionTimerId = setTimeout(function () {
            if (!sessionRunning) return;
            sessionTimeExpired = true;
            log("⏱️ [TIME LIMIT] ครบ " + configSessionMaxMinutes + " นาทีแล้ว — เข้าโหมดรอปลอดภัย: จะปิดเฉพาะหลังจากยอดบวกและจบกลับไม้ 1 เท่านั้น", true);
            // ✅ เรียก enterRecoveryHold เพื่อ set STAKE_HOLD title (ป้องกัน PS ปิดหน้าต่าง)
            // ✅ การตัดสินใจปิด session จริงๆ อยู่ใน handleBetResult หลังทุกไม้
            enterRecoveryHold(configSessionMaxMinutes);
        }, configSessionMaxMinutes * 60000);
    }

    // 🩹 RECOVERY HOLD — ครบเวลาแต่ยังขาดทุน: ไม่ปิดบัญชี รอจบกลับไม้ 1 ยอดบวกแล้วค่อยจบ
    function enterRecoveryHold(minutes) {
        sessionRecoveryActive = true;
        sessionHoldDeadlineAt = Date.now() + (SESSION_RECOVERY_MAX_EXTRA_MIN * 60000);
        sessionRecoveryStreak = 0;
        log("🩹 [HOLD] ครบ " + minutes + " นาทีแต่ยังขาดทุน " + formatNumber(profit, 4) + "$ — พยุงบัญชีต่อ ไม่ปิดตอนขาดทุน (รอจบรอบไม้ 1 ยอดบวก)...", true);
        updateStatusText("🩹 ครบเวลาแต่ยังขาดทุน — พยุงต่อ รอจบรอบไม้ 1 ยอดบวกก่อนปิด", "#ffea00");
        publishRecoveryHold();
        if (sessionHoldTitleTimerId) clearInterval(sessionHoldTitleTimerId);
        sessionHoldTitleTimerId = setInterval(publishRecoveryHold, SESSION_HOLD_REFRESH_MS);
    }

    function stopRecoveryHold() {
        sessionRecoveryActive = false;
        sessionHoldDeadlineAt = 0;
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
            const human = (accountName || "Account") + " (พยุง: P/L " + formatNumber(pnl, 4) + "$, ไม้ " + mStep + ")";
            document.title = "STAKE_HOLD|P=" + pnlStr + "|S=" + mStep + " :: " + human;
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
        // 🧹 เริ่มเซสชันใหม่ → สั่งปิด "แท็บ Stake เก่าที่จบเซสชันแล้ว" (title ขึ้นต้น STAKE_DONE / STAKE_IDLE)
        //    กันแท็บค้างสะสม: แต่ละเซสชันเปิดแท็บใหม่ แต่แท็บเก่าไม่ถูกปิด
        //    ⚠️ ปลอดภัย: ไม่แตะแท็บที่กำลังเล่น/STAKE_HOLD (เฉพาะที่ขึ้น DONE แลัวเท่านั้น)
        try {
            window.postMessage({ __stake_bot: true, type: "CLOSE_STALE_TABS" }, location.origin);
            trace("CLOSE_STALE_TABS", { at: Date.now() });
        } catch (e) {}
        // ⏳ รอ Balance โหลดก่อน (เดิมถ้าอ่านไม่ได้จะ return เงียบ ๆ → กด START แล้วไม่มีอะไรเกิดขึ้น)
        const balEarly = getBalance();
        if (balEarly === null) {
            const tries = (window.__stakeStartBalTries || 0) + 1;
            window.__stakeStartBalTries = tries;
            if (tries <= 20) {
                updateStatusText("⏳ รอโหลด Balance ก่อนเริ่ม (" + tries + "/20)", "#ffa726");
                setTimeout(startSession, 500);
                return;
            }
            window.__stakeStartBalTries = 0;
            diagPush("START_BLOCK", null, { reason: "no-balance", tries: tries, probe: diagDomProbe() });
            autoDiag("startblock", true);
            updateStatusText("❌ เริ่มไม่ได้: อ่านยอดเงิน Balance ไม่พบ (กด F5 หรือเช็กว่าล็อกอินอยู่)", "#ff5252");
            log("❌ START ถูกบล็อก: อ่าน Balance ไม่ได้ 20 ครั้งติด — บันทึกไฟล์ diag startblock แล้ว", true);
            return;
        }
        window.__stakeStartBalTries = 0;

        resetDiagSession();
        perfReset();
        try { window.__stakeFirstBetLogged = false; } catch (e) {}
        startAttemptAt = Date.now();

        // 🚨 ถ้า 8 วิหลัง START ยังไม่มีการยิงไม้แรก → เก็บหลักฐาน (ไฟล์ nobet) + ซ่อมเอง
        setTimeout(function () {
            try {
                if (!startAttemptAt) return;
                if (lastBetDispatchTime || totalBets > 0) return;
                // ผู้ใช้กดหยุดเองภายใน 5 วิ = ตั้งใจ ไม่ต้องเขียนไฟล์
                if (lastStopAt && (Date.now() - lastStopAt) < 5000) return;
                if (autoDiagWrote("nobet")) return;
                const probe = diagDomProbe({ reason: "no-first-bet-8s" });
                diagPush("NOBET_PROBE", null, probe);
                autoDiag("nobet", true);
                log("🚨 8 วิหลัง START ยังไม่ยิงไม้แรก — " + JSON.stringify({ btn: probe.btn, btnDisabled: probe.btnDisabled, amountInput: probe.amountInput, amountValue: probe.amountValue, balance: probe.balance, health: probe.domHealth && probe.domHealth.msg }), true);
                autoHeal("no-first-bet");
            } catch (e) {}
        }, 8000);
        cancelAutoStart();
        clearTimers();
        closeAnyStakeModal();

        const bal = getBalance();
        if (bal === null) {
            // ไม่ควรเกิด (รอไปแล้วด้านบน) — ถ้าเกิดจริงให้บันทึกไว้
            diagPush("START_BLOCK", null, { reason: "no-balance-late", probe: diagDomProbe() });
            autoDiag("startblock", true);
            updateStatusText("❌ อ่าน Balance ไม่ได้ตอนเริ่ม", "#ff5252");
            return;
        }

        if (peerIsRunning()) {
            // ❌ ไม่บล็อก START แล้ว — เตือนเฉย ๆ (เดิมเจอแท็บอื่นค้างแล้วกด START ไม่ติด)
            updateStatusText("⚠️ พบอีกแท็บกำลังเดิมพัน — เดินหน้าต่อ (ระวังกดซ้อน)", "#ffa726");
            log("⚠️ MULTI-TAB: พบแท็บอื่นกำลังเดิมพัน (id " + (peerRunning ? peerRunning.id : "?") + ") — เดินหน้าต่อ", true);
        }

        startBalance = bal;
        currentBalance = bal;
        peakBalance = bal;

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
        resetBetsOnly();
        healCount = 0;
        lastHealAt = 0;
        amountForceCount = 0;
        balanceShortCount = 0;
        ledgerGaps = 0;

        ensureManualTab();
        applyBetSettings();

        sniffBetLimits(false);

        const domHealth = probeDomHealth();
        if (!domHealth.ok) updateStatusText("⚠️ " + domHealth.msg, "#ffa726");

        sessionRunning = true;
        isWaitingNextRound = false;
        isBetInProgress = false;
        lastBetDispatchTime = 0;
        applyAutoMini(true);   // 🤖 เริ่มทำงาน → ย่อเป็น mini bar อัตโนมัติ
        publishBotState();
        if (!sessionStartedAt) sessionStartedAt = Date.now();
        diagPush("START_OK", null, { balance: bal, domHealth: domHealth, probe: diagDomProbe() });
        autoDiag("start");

        let savedRecovery = null;
        try {
            const raw = localStorage.getItem(STORAGE_RECOVERY_KEY) || sessionStorage.getItem(STORAGE_RECOVERY_KEY);
            if (raw) {
                // 🚫 ปิดการกู้คืน F5 ถาวร (ฟีเจอร์รีเฟรชถูกลบ) — เริ่มเซสชันใหม่สะอาดทุกครั้ง
                savedRecovery = null;
            }
        } catch (e) {}

        if (savedRecovery) {
            // 🔁 เส้นทาง resume: PERF เริ่มนับใหม่จากจุดนี้ (ตัวนับไม้ยังใช้ค่าที่กู้คืนมา แต่ความเร็ว/เวลาเริ่มนับใหม่)
            perfReset(true);
            inRefreshRecovery = true;
            if (savedRecovery.activeEngineMode === "hybrid" || savedRecovery.activeEngineMode === "fibo" || savedRecovery.activeEngineMode === "k2") {
                activeEngineMode = savedRecovery.activeEngineMode;
            }
            if (typeof savedRecovery.configVirtualBetEnabled === "boolean") configVirtualBetEnabled = savedRecovery.configVirtualBetEnabled;
            // 🛡️ ยอมรับเฉพาะค่าที่ใช้งานได้ (>= 1) — ค่า 0 จาก state เก่าจะทำให้ระบบแทงลมเปิดไม่ติดตลอดไป
            if (typeof savedRecovery.configVirtualLossTrigger === "number" && savedRecovery.configVirtualLossTrigger >= 1) configVirtualLossTrigger = savedRecovery.configVirtualLossTrigger;
            if (typeof savedRecovery.virtualRollsTotal === "number") virtualRollsTotal = savedRecovery.virtualRollsTotal;
            mStep = Math.max(1, savedRecovery.mStep || 1);
            recoveryWinStreak = savedRecovery.recoveryWinStreak || 0;
            cycleProfit = savedRecovery.cycleProfit || 0;
            cycleStartBalance = (typeof savedRecovery.cycleStartBalance === "number") ? savedRecovery.cycleStartBalance : bal;
            lockedCycleBaseBet = savedRecovery.lockedCycleBaseBet || null;
            if (typeof savedRecovery.startBalance === "number") startBalance = savedRecovery.startBalance;
            if (typeof savedRecovery.peakBalance === "number" && savedRecovery.peakBalance > peakBalance) peakBalance = savedRecovery.peakBalance;
            if (typeof savedRecovery.maxDrawdown === "number" && savedRecovery.maxDrawdown > maxDrawdown) maxDrawdown = savedRecovery.maxDrawdown;
            if (typeof savedRecovery.maxStepReached === "number" && savedRecovery.maxStepReached > maxStepReached) maxStepReached = savedRecovery.maxStepReached;
            if (typeof savedRecovery.totalBets === "number") totalBets = savedRecovery.totalBets;
            if (typeof savedRecovery.totalWagered === "number") totalWagered = savedRecovery.totalWagered;
            if (typeof savedRecovery.winsCount === "number") winsCount = savedRecovery.winsCount;
            if (typeof savedRecovery.lossesCount === "number") lossesCount = savedRecovery.lossesCount;
            if (savedRecovery.sessionStartedAt) sessionStartedAt = savedRecovery.sessionStartedAt;

            virtualMode = Boolean(savedRecovery.virtualMode);
            realLossStreakForVirtual = savedRecovery.realLossStreakForVirtual || 0;
            virtualRolls = 0;

            profit = parseFloat((bal - startBalance).toFixed(8));

            log(`🔄 [F5-RECOVERY RESUME] กู้คืนสถานะหลังรีเฟรชสำเร็จ! ทบต่อที่ไม้ ${mStep} | ชนะสะสม ${recoveryWinStreak}/2 | ทุนเดิม ${formatNumber(startBalance, 4)}$`, true);
            updateStatusText(`🔄 กู้คืนสถานะ: ลุยต่อไม้ ${mStep} (ชนะสะสม ${recoveryWinStreak}/2)`, "#ffea00");
        } else {
            inRefreshRecovery = false;
            recoveryWinStreak = 0;
            mStep = 1; // เริ่มเซสชันใหม่ที่ยอดฐานทุกครั้ง
            maxStepReached = 1;
            cycleProfit = 0;
            cycleStartBalance = currentBalance;
            virtualMode = false;
            realLossStreakForVirtual = 0;
            virtualRolls = 0;
            virtualRollsTotal = 0;
            updateBaseBetOnReset("เริ่มเซสชันใหม่");
        }

        startSessionTimer();

        enableAudioKeepAlive();
        requestScreenWakeLock();

        const baseAmt = getBaseBet();
        syncHUDInputs();
        log(`🚀 เริ่มต้นเซสชัน (Fibonacci 20 ไม้ · 49.5% Under): ทุน ${formatNumber(bal, 4)} USDT | ยอดฐาน ${baseAmt}$ | ชนะติด 2 ตา / ถอย 2 ขั้น รีเซ็ตไม้ 1`, true);
        updateStatusText(`🚀 สตาร์ทแล้ว! ยอดฐาน ${baseAmt}$ (Fibonacci 20 ไม้)`, "#00e676");
        updateUI();

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
        if (s.indexOf("เงินในกระเป๋าไม่พอ") >= 0) return "NO_FUNDS";
        if (s.indexOf("ตั้งยอดเดิมพัน") >= 0) return "BET_FAIL";
        if (s.indexOf("ปุ่ม ESC") >= 0 || s.indexOf("ผู้ใช้สั่งหยุด") >= 0) return "MANUAL";
        return "OTHER";
    }

    // รูปแบบ: STAKE_DONE|R=<code>|P=<pnl>|S=<step>|D=<yyyy-mm-dd> :: <ข้อความให้คนอ่าน>
    // คงคาว่า STAKE_DONE ไว้หน้าเสมอ เพื่อให้ FindDoneWindows() ใน PowerShell ยังจับได้เหมือนเดิม
    function buildDoneTitle(rStr) {
        const bal = getBalance();
        const endBal = bal !== null ? bal : currentBalance;
        const pnl = (endBal !== null && startBalance !== null) ? (endBal - startBalance) : profit;
        const d = new Date();
        const p2 = function (n) { return String(n).padStart(2, "0"); };
        const day = d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate());
        const code = deriveStopCode(rStr);
        const step = mStep; // ลำดับไม้ Fibonacci ปัจจุบัน (rotate-accounts.ps1 อ่านจาก S=)
        const human = (accountName || "Account") + " (" + String(rStr || "").split("|").join("/").slice(0, 35) + ")";
        let pnlStr = "0.00000";
        try { pnlStr = Number(pnl || 0).toFixed(5); } catch (e) { pnlStr = "0.00000"; }
        let wagerStr = "0.0000";
        try { wagerStr = Number(totalWagered || 0).toFixed(4); } catch (e) { wagerStr = "0.0000"; }
        let mdStr = "0.0000";
        try { mdStr = Number(maxDrawdown || 0).toFixed(4); } catch (e) { mdStr = "0.0000"; }
        return "STAKE_DONE|R=" + code + "|P=" + pnlStr + "|S=" + step + "|D=" + day + "|B=" + (totalBets || 0) + "|W=" + wagerStr + "|MS=" + (maxStepReached || 1) + "|MD=" + mdStr + " :: " + human;
    }

    let lastStopAt = 0;
    let startAttemptAt = 0;   // เวลาที่กด START (ใช้ตรวจว่าเริ่มแล้วไม่แทงหรือไม่)
    function stopSession(reason, statusColor = "#b1bad3") {
        // 🛡️ กันเรียกซ้ำ: ปุ่ม/คีย์ลัดอาจยิงพร้อมกัน ทำให้ไฟล์ diag ซ้ำและ rotate 2 รอบ
        const stopNow = Date.now();
        if (stopNow - lastStopAt < 1500) {
            trace("STOP_DUP", { reason: String(reason || ""), gapMs: stopNow - lastStopAt });
            return;
        }
        lastStopAt = stopNow;
        try { diagPush("STOP", String(reason || ""), { step: mStep, bal: getBalance() }); } catch (e) {}
        autoDiag("stop", true);
        const durMs = sessionStartedAt ? (Date.now() - sessionStartedAt) : 0;
        if (durMs > 0) {
            lastSessionSummary = buildSessionSummary(durMs, reason);
            log("📋 SESSION: " + lastSessionSummary, true);
        }
        stopSessionTimer();
        sessionRunning = false;
        applyAutoMini(false);  // 🤖 หยุด → ขยายแผงกลับให้เห็นสรุปเต็ม
        publishBotState();
        isWaitingNextRound = false;
        isBetInProgress = false;
        mStep = 1;
        cycleProfit = 0;
        cycleStartBalance = null;
        lockedCycleBaseBet = null;
        clearTimers();

        try {
            localStorage.removeItem(STORAGE_RECOVERY_KEY);
            sessionStorage.removeItem(STORAGE_RECOVERY_KEY);
        } catch (e) {}
        inRefreshRecovery = false;
        recoveryWinStreak = 0;

        if (screenWakeLock) {
            try { screenWakeLock.release(); } catch (e) {}
            screenWakeLock = null;
        }

        broadcastTabState("idle");
        log("🛑 หยุดการทำงาน: " + (reason || "คำสั่งผู้ใช้"));
        try {
            const a = analyzeDiag();
            for (let i = 0; i < a.findings.length; i++) {
                log("🔎 วิเคราะห์: [" + a.findings[i].code + "] " + a.findings[i].msg, true);
            }
            // คัดลอกชุดข้อมูลไว้ให้อัตโนมัติ (ถ้าเบราว์เซอร์อนุญาต) — ผู้ใช้แค่วางในแชท
            try { if (typeof copy === "function") copy(JSON.stringify(buildDiagExport(true), null, 2)); } catch (e2) {}
            // (ไฟล์ stop ถูกเขียนไปแล้วที่ต้น stopSession — ห้ามเขียนซ้ำ ทำให้ได้ไฟล์คู่)
        } catch (e) {}
        trace("STOP", {
            reason: String(reason || ""),
            step: mStep,
            bets: totalBets,
            desyncStrikes: desyncStrikes,
            lastDesync: lastDesync,
            fieldValue: getAmountInputValue(),
            zeroInField: configVirtualWriteZero,
            virtualMode: virtualMode,
            parkedStep: parkedStep
        });
        updateStatusText(reason || "หยุดเซสชันแล้ว", statusColor);
        updateUI();

        // 🔄 AUTO-CLOSE TAB & ROTATE ACCOUNT:
        // เมื่อจบรอบสำเร็จ (ถึงเป้ากำไร, ตัดขาดทุนตามแผน, ครบเวลา, หรือเงื่อนไขหยุดใดๆ) ให้ส่งสัญญาณและสั่งปิดแท็บอัตโนมัติ
        const rStr = String(reason || "");
        const isManualUserStop = rStr.includes("ผู้ใช้สั่งหยุด") || rStr.includes("ปุ่ม ESC");
        // 🔒 ปิดแท็บเฉพาะ "จบรอบตามแผน" เท่านั้น (ถึงเป้ากำไร / ครบเวลา)
        //    หยุดเพราะเหตุขัดข้อง (เงินไม่พอ ฯลฯ) = ไม่ปิด ให้ผู้ใช้เห็นสถานะบนจอ
        const isScheduledEnd = rStr.includes("ถึงเป้ากำไร") || rStr.includes("ครบเวลา");
        const shouldAutoClose = isScheduledEnd && !isManualUserStop;
        trace("STOP_DECISION", { reason: rStr, autoClose: shouldAutoClose, scheduled: isScheduledEnd, manual: isManualUserStop });

        // 🏷️ หยุดแบบ "ไม่ปิดแท็บ" → เปลี่ยน title เป็น STAKE_IDLE ทันที
        //    เดิม title ค้างเป็น STAKE_RUN|P=...|S=... ตลอด → ตัวปิดแท็บเก่าจับไม่ได้
        //    และแท็บที่หยุดแล้วก็ดูเหมือนยังเล่นอยู่ (build 187)
        if (!shouldAutoClose) {
            try {
                document.title = "STAKE_IDLE" + buildDoneTitle(rStr).slice("STAKE_DONE".length);
                trace("TITLE_IDLE", { reason: rStr });
            } catch (e) {}
        }

        if (!shouldAutoClose && !isManualUserStop) {
            log("🛑 ไม่ปิดแท็บ: หยุดด้วยเหตุ \"" + rStr + "\" (ปิดเฉพาะเมื่อถึงเป้ากำไรหรือครบเวลา)", true);
        }

        if (shouldAutoClose) {
            log("🚀 [AUTO-ROTATE] จบเซสชันแล้ว (" + rStr + ") — ปิดแท็บใน 3 วิ เพื่อสลับบัญชี...", true);
            let left = 3;
            try { updateStatusText("⏳ จะปิดแท็บใน " + left + " วิ — " + rStr, "#00e676"); } catch (e) {}
            const cd = setInterval(function () {
                left--;
                try {
                    if (left > 0) updateStatusText("⏳ จะปิดแท็บใน " + left + " วิ — " + rStr, "#00e676");
                    else clearInterval(cd);
                } catch (e) { clearInterval(cd); }
            }, 1000);
            try {
                document.title = buildDoneTitle(rStr);
            } catch (e) {}

            // 1. ส่งสัญญาณ Beacon ไปยัง PowerShell Listener ทันที (ถ้ามี)
            try {
                const beaconUrl = "http://127.0.0.1:18888/done?account=" + encodeURIComponent(accountName || "") + "&reason=" + encodeURIComponent(rStr);
                fetch(beaconUrl, { mode: "no-cors" }).catch(() => {});
            } catch (e) {}

            // 2. ส่ง postMessage ให้ bridge.js แจ้ง background.js ปิดแท็บ
            setTimeout(() => {
                try {
                    window.postMessage({
                        __stake_bot: true,
                        type: "CLOSE_SESSION_TAB",
                        action: "STAKE_BOT_CLOSE_SESSION",
                        reason: rStr,
                        account: accountName || ""
                    }, "*");
                } catch (e) {}
                try {
                    window.close();
                } catch (e) {}
            }, 3000);
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
        if (configDynamicBase) getBaseBet();
        const activeEl = shadowRootRef ? shadowRootRef.activeElement : null;
        const activeBase = formatBetAmount(configRealBaseBet);
        if (hudEls.inRealBase && activeEl !== hudEls.inRealBase) hudEls.inRealBase.value = activeBase;
        if (hudEls.inTarget && activeEl !== hudEls.inTarget) hudEls.inTarget.value = configProfitTarget;
        if (hudEls.inChance && activeEl !== hudEls.inChance) hudEls.inChance.value = configChance;
        if (hudEls.inVirtualLoss && activeEl !== hudEls.inVirtualLoss) hudEls.inVirtualLoss.value = String(configVirtualLossTrigger);
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

        if (configDynamicBase) getBaseBet();
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

        if (titleStep) {
            setSafeText(titleStep, "🎯 FIBONACCI 20 ไม้");
            setSafeStyle(titleStep, "color", "#00e676");
        }

        if (integrityEl) {
            setSafeText(integrityEl,
                "🩺 DD " + formatNumber(maxDrawdown, 4) + "$ · Waged " + formatNumber(totalWagered, 2) + "$ · Peak " + formatNumber(peakBalance === null ? 0 : peakBalance, 2) +
                " · Gaps " + ledgerGaps + " · Drift " + domDriftCount + " · Resync " + resyncCount + " · Sync " + cleanSyncStreak + " · Cut " + cutLossSnipes);
        }
        if (paramStep) setSafeText(paramStep, `⚙️ พารามิเตอร์ Fibonacci:`);
        if (safetyStep) setSafeText(safetyStep, `ไม้ ${mStep} = ${formatBetAmount(calculateCurrentBetAmount())}$ (${getFibonacciMultiplier(mStep)}x)`);
        if (safetyStop) {
            setSafeText(safetyStop, "เพดาน 20 ไม้");
        }
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
                ? `↔️ AUTO-RESYNC: ON (ซิงก์แล้ว ${resyncCount} ครั้ง)`
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
        const virtualActive = isVirtualBetActive();

        if (hudEls.toggleVirtualBtn) {
            if (configVirtualBetEnabled && configVirtualLossTrigger > 0) {
                if (virtualActive) {
                    setSafeText(hudEls.toggleVirtualBtn, `🌬️ ลม 0$ (${virtualRolls}/${VIRTUAL_EXIT_AFTER_ROLLS})${virtualStallCount > 0 ? " · STALL " + virtualStallCount + "/" + VIRTUAL_STALL_LIMIT : ""}`);
                    setSafeStyle(hudEls.toggleVirtualBtn, "color", "#ffea00");
                    setSafeStyle(hudEls.toggleVirtualBtn, "borderColor", "#ffea00");
                } else {
                    setSafeText(hudEls.toggleVirtualBtn, `🌬️ แทงลม: ON (${realLossStreakForVirtual}/${configVirtualLossTrigger})`);
                    setSafeStyle(hudEls.toggleVirtualBtn, "color", "#55e7ff");
                    setSafeStyle(hudEls.toggleVirtualBtn, "borderColor", "#55e7ff");
                }
            } else {
                setSafeText(hudEls.toggleVirtualBtn, "🌬️ แทงลม: OFF");
                setSafeStyle(hudEls.toggleVirtualBtn, "color", "#8596a5");
                setSafeStyle(hudEls.toggleVirtualBtn, "borderColor", "#2f4553");
            }
        }

        if (modeBadge) {
            if (virtualActive) {
                setSafeText(modeBadge, `🌬️ แทงลม 0$ (ตาที่ ${virtualRolls}/${VIRTUAL_EXIT_AFTER_ROLLS})${virtualStallCount > 0 ? " · STALL " + virtualStallCount + "/" + VIRTUAL_STALL_LIMIT + " " + virtualStallReason : ""} · พักไม้ ${parkedStep >= 1 ? parkedStep : mStep} (${formatBetAmount(parkedAmount > 0 ? parkedAmount : 0)}$) · ${virtualExitRuleText()} · ${virtualZeroModeText()}`);
                setSafeStyle(modeBadge, "background", "#0a2538");
                setSafeStyle(modeBadge, "color", "#55e7ff");

            } else {
                const vInfo = (configVirtualBetEnabled && configVirtualLossTrigger > 0)
                    ? ` (แพ้ติด ${realLossStreakForVirtual}/${configVirtualLossTrigger})`
                    : "";
                setSafeText(modeBadge, `🎯 แทงจริง ไม้ ${mStep}: ${amt}$${vInfo}`);
                setSafeStyle(modeBadge, "background", "#013e00");
                setSafeStyle(modeBadge, "color", "#00e676");
            }
        }

        if (nextBetEl) {
            if (virtualActive) {
                setSafeText(nextBetEl, `0.00000000 USDT (${"ยิงจริง"} · รอต่อไม้ ${mStep}: ${amt}$)`);
                setSafeStyle(nextBetEl, "color", "#55e7ff");
            } else {
                setSafeText(nextBetEl, displayAmt);
                setSafeStyle(nextBetEl, "color", "#00e676");
            }
        }

        if (miniStep) {
            if (virtualActive) {
                setSafeText(miniStep, `🌬️ ลม 0$ (${virtualRolls}/${VIRTUAL_EXIT_AFTER_ROLLS}) · พักไม้ ${parkedStep >= 1 ? parkedStep : mStep} (${parkedAmount > 0 ? formatBetAmount(parkedAmount) : amt}$)`);
                setSafeStyle(miniStep, "color", "#55e7ff");
            } else {
                const vMini = (configVirtualBetEnabled && configVirtualLossTrigger > 0)
                    ? ` · 🌬️ ${realLossStreakForVirtual}/${configVirtualLossTrigger}`
                    : " · 🌬️ OFF";
                setSafeText(miniStep, `🎯 ไม้ ${mStep} (${amt}$)` + vMini);
                setSafeStyle(miniStep, "color", "#00e676");
            }
        }
        if (miniProfit) {
            setSafeText(miniProfit, (profit >= 0 ? "+" : "") + formatNumber(profit, 4) + "$");
            setSafeStyle(miniProfit, "color", profit >= 0 ? "#00e676" : "#ff5252");
        }

        // 🌿 ULTRA ECO & MINIMIZED THROTTLING: ถ้าแผงถูกยุบอยู่ ให้ข้ามการคำนวณและเรนเดอร์องค์ประกอบขนาดใหญ่ เพื่อประหยัด CPU 100%
        if (isPanelMinimized) return;

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
            setSafeText(snipesCountEl, `🎯 ยิงเข้าเป้า: ${successfulSnipes}`);
        }

        if (winrateEl) {
            const wr = totalBets > 0 ? ((winsCount / totalBets) * 100).toFixed(1) : "0.0";
            setSafeText(winrateEl, `${wr}% (${winsCount}W / ${lossesCount}L - รวม ${totalBets})${getBetRateText()}`);
        }

        if (theoryEl) {
            const realWr = totalBets > 0 ? (winsCount / totalBets) * 100 : 0;
            const expectedEv = -0.01 * totalWagered; // RTP 99% → ขาดทุนคาดหวัง 1% ของยอดที่วาง
            const targetChance = parseFloat(configChance) || 49.5;
            const limitText = detectedMinBet !== null || detectedMaxBet !== null
                ? ` | เว็บ: ขั้นต่ำ ${formatBetAmount(detectedMinBet || AUTO_MIN_BET)}$${detectedMaxBet ? " สูงสุด " + formatBetAmount(detectedMaxBet) + "$" : ""}`
                : ` | ขั้นต่ำ ${formatBetAmount(AUTO_MIN_BET)}$ (default)`;
            // ถ้ามี strike ค้างอยู่ ให้แปรผลต่างลงบรรทัดนี้ด้วย (สถานะอาจถูกข้อความอื่นทับไปแล้ว)
            const desyncText = desyncStrikes > 0 && lastDesync.dom !== null
                ? ` | ⚠️ ยอดจริง ${formatNumber(lastDesync.dom, 6)} vs คำนวณ ${formatNumber(lastDesync.model, 6)} (ต่าง ${(lastDesync.diff >= 0 ? "+" : "−") + formatNumber(Math.abs(lastDesync.diff), 6)}) [${lastDesync.source || "?"}]`
                : "";
            const engineDesc = (activeEngineMode === "hybrid")
                ? "⚡ Hybrid (ไม้ ≤4: คืนทุนตาเดียว | ไม้ ≥5: K=2 เซฟพอร์ต)"
                : ((activeEngineMode === "fibo")
                    ? "Fibonacci 20 ไม้ (ถอย 2 / รีเซ็ตเมื่อบวกจริง)"
                    : "K=2 Deficit Partitioning (ปลดหนี้ 50%/ตา • คืนทุนรีเซ็ตไม้ 1)");
            setSafeText(theoryEl,
                `📊 จริง ${realWr.toFixed(1)}% vs ทฤษฎี ${targetChance.toFixed(1)}% | EV คาด ${expectedEv <= 0 ? "−" : "+"}${formatNumber(Math.abs(expectedEv), 6)} (วาง ${formatNumber(totalWagered, 5)}$) | ${engineDesc}${limitText}${desyncText}`);
            setSafeStyle(theoryEl, "color", desyncStrikes > 0 ? "#ffa726" : "#8596a5");
        }

        try { syncEngineModeUI(); } catch (e) {}

        if (rngEl) {
            const m = getLossGapMetrics();
            if (m.avgGap === null && m.postWinLossPct === null) {
                setSafeText(rngEl, `🔍 ก้อนแพ้คั่น: รอข้อมูลรอบแรก... (กำลังแพ้สะสม ${m.currentGap} ตา)`);
                setSafeStyle(rngEl, "color", "#8596a5");
            } else {
                const alertLevel = (m.postWinLossPct !== null && m.postWinLossPct >= 70) ? "🚨 ตรวจพบก้อนแพ้คั่นชุกชุม!"
                    : ((m.postWinLossPct !== null && m.postWinLossPct >= 55) ? "⚠️ ก้อนแพ้เริ่มคั่น" : "✓ ปกติ");
                const color = (m.postWinLossPct !== null && m.postWinLossPct >= 70) ? "#ff5252"
                    : ((m.postWinLossPct !== null && m.postWinLossPct >= 55) ? "#ffa726" : "#55e7ff");
                const recentStr = m.recentGaps.length ? ` · ล่าสุด: [${m.recentGaps.join(",")}]` : "";
                setSafeText(rngEl, `🔍 ก้อนแพ้คั่น: เฉลี่ย ${m.avgGap || "-"} ตา (สูงสุด ${m.maxGap} | กำลังแพ้ ${m.currentGap}) · แพ้หลังชนะ ${m.postWinLossPct !== null ? m.postWinLossPct + "%" : "-"} (${alertLevel})${recentStr}`);
                setSafeStyle(rngEl, "color", color);
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

    // 🔄 ซิงก์ข้อความและธีมของ HUD ให้ตรงกับระบบที่เลือกใช้งานจริง (Hybrid, K=2 หรือ Fibonacci) 100% ไร้มโน
    function syncEngineModeUI() {
        if (!hudEls) return;
        if (activeEngineMode === "hybrid") {
            if (hudEls.titleStep) {
                setSafeText(hudEls.titleStep, "⚡ HYBRID (K1 ตื้น + K2 ลึก)");
                setSafeStyle(hudEls.titleStep, "color", "#00e676");
            }
            if (hudEls.engineToggleBtn) {
                setSafeText(hudEls.engineToggleBtn, "🔄 โหมด: HYBRID");
                setSafeStyle(hudEls.engineToggleBtn, "color", "#00e676");
                setSafeStyle(hudEls.engineToggleBtn, "borderColor", "#00e676");
            }
            if (hudEls.paramStep) {
                setSafeText(hudEls.paramStep, "⚙️ พารามิเตอร์ Hybrid (ไม้ 2-4 คืนทุนตาเดียว · ไม้ 5+ เซฟพอร์ต):");
                setSafeStyle(hudEls.paramStep, "color", "#00e676");
            }
            if (hudEls.safetyEngineName) {
                setSafeText(hudEls.safetyEngineName, "⚡ Hybrid 2 ชั้น");
            }
            if (hudEls.safetyStep) {
                setSafeText(hudEls.safetyStep, "ไม้ 2-4 คืนทุนตาเดียว • ไม้ 5+ เซฟพอร์ตปลดหนี้ 50%");
            }
            if (hudEls.safetyStop) {
                setSafeText(hudEls.safetyStop, "คำนวณตามหนี้จริง");
            }
            if (hudEls.safetyBadge) {
                setSafeStyle(hudEls.safetyBadge, "borderColor", "#00e676");
                setSafeStyle(hudEls.safetyBadge, "color", "#00e676");
            }
            if (hudEls.safetyIcon) {
                setSafeText(hudEls.safetyIcon, "⚡");
            }
        } else if (activeEngineMode === "fibo") {
            if (hudEls.titleStep) {
                setSafeText(hudEls.titleStep, "🎯 FIBONACCI 20 ไม้");
                setSafeStyle(hudEls.titleStep, "color", "#55e7ff");
            }
            if (hudEls.engineToggleBtn) {
                setSafeText(hudEls.engineToggleBtn, "🔄 โหมด: FIBO");
                setSafeStyle(hudEls.engineToggleBtn, "color", "#55e7ff");
                setSafeStyle(hudEls.engineToggleBtn, "borderColor", "#55e7ff");
            }
            if (hudEls.paramStep) {
                setSafeText(hudEls.paramStep, "⚙️ พารามิเตอร์ Fibonacci 20 ไม้:");
                setSafeStyle(hudEls.paramStep, "color", "#55e7ff");
            }
            if (hudEls.safetyEngineName) {
                setSafeText(hudEls.safetyEngineName, "Fibonacci 20 ไม้");
            }
            if (hudEls.safetyStep) {
                setSafeText(hudEls.safetyStep, "ชนะติด 2 ตา / ถอย 2 ขั้น รีเซ็ต");
            }
            if (hudEls.safetyStop) {
                setSafeText(hudEls.safetyStop, "เพดาน 20 ไม้");
            }
            if (hudEls.safetyBadge) {
                setSafeStyle(hudEls.safetyBadge, "borderColor", "#55e7ff");
                setSafeStyle(hudEls.safetyBadge, "color", "#55e7ff");
            }
            if (hudEls.safetyIcon) {
                setSafeText(hudEls.safetyIcon, "📈");
            }
        } else { // activeEngineMode === "k2"
            if (hudEls.titleStep) {
                setSafeText(hudEls.titleStep, "🛡️ DEFICIT PARTITIONING (K=2)");
                setSafeStyle(hudEls.titleStep, "color", "#ffea00");
            }
            if (hudEls.engineToggleBtn) {
                setSafeText(hudEls.engineToggleBtn, "🔄 โหมด: PURE K2");
                setSafeStyle(hudEls.engineToggleBtn, "color", "#ffea00");
                setSafeStyle(hudEls.engineToggleBtn, "borderColor", "#ffea00");
            }
            if (hudEls.paramStep) {
                setSafeText(hudEls.paramStep, "⚙️ พารามิเตอร์ K=2 (Deficit Recovery):");
                setSafeStyle(hudEls.paramStep, "color", "#ffea00");
            }
            if (hudEls.safetyEngineName) {
                setSafeText(hudEls.safetyEngineName, "K=2 กู้คืนทุนจริง");
            }
            if (hudEls.safetyStep) {
                setSafeText(hudEls.safetyStep, "ปลดหนี้ 50%/ตา • คืนทุนรีเซ็ตไม้ 1");
            }
            if (hudEls.safetyStop) {
                setSafeText(hudEls.safetyStop, "คำนวณตามหนี้จริงไร้แคป");
            }
            if (hudEls.safetyBadge) {
                setSafeStyle(hudEls.safetyBadge, "borderColor", "#ffea00");
                setSafeStyle(hudEls.safetyBadge, "color", "#ffea00");
            }
            if (hudEls.safetyIcon) {
                setSafeText(hudEls.safetyIcon, "🛡️");
            }
        }
    }

    function toggleEngineMode() {
        if (activeEngineMode === "hybrid") {
            activeEngineMode = "fibo";
        } else if (activeEngineMode === "fibo") {
            activeEngineMode = "k2";
        } else {
            activeEngineMode = "hybrid";
        }
        try {
            localStorage.setItem(STORAGE_ENGINE_MODE_KEY, activeEngineMode);
        } catch (e) {}
        syncEngineModeUI();
        applyBetSettings();
        updateUI();
        const modeDesc = (activeEngineMode === "hybrid")
            ? "⚡ Hybrid (ไม้ 1-4 คืนทุนตาเดียว + ไม้ 5+ เซฟพอร์ต)"
            : ((activeEngineMode === "fibo") ? "📈 Fibonacci 20 ไม้" : "🛡️ Pure Deficit Partitioning (K=2)");
        log(`🔄 [ENGINE TOGGLE] สลับระบบเป็น: ${modeDesc} | ไม้ ${mStep} (${calculateCurrentBetAmount()}$)`, true);
    }

    function createStealthPanel() {
        if (!document.body || hostContainer) return;

        hostContainer = document.createElement("div");
        hostContainer.style.all = "initial";

        const shadow = hostContainer.attachShadow({ mode: 'closed' });
        shadowRootRef = shadow;

        const wrapper = document.createElement("div");
        // 🔖 ฝัง build ไว้บน DOM — ตรวจได้ว่า Chrome โหลดไฟล์เวอร์ชันล่าสุดจริง (DevTools → Elements)
        try {
            wrapper.dataset.build = BUILD_STAMP;
            wrapper.dataset.extVersion = EXT_VERSION;
            wrapper.title = "Stake Dice Hybrid " + BUILD_STAMP;
        } catch (e) {}
        wrapper.style.cssText = `
            position: fixed;
            top: 60px;
            left: 20px;
            width: 330px;
            background: #1a242d;
            border: 1px solid #2f4553;
            border-radius: 10px;
            padding: 12px;
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
                <div style="display:flex; align-items:center; gap:5px; flex-wrap:wrap;">
                    <span id="sniperTitleStep" style="font-weight:bold; font-size:12px; color:#00e676;">🛡️ K=2 DEFICIT RECOVERY</span>
                    <button id="sniperEngineToggleBtn" style="background:#0f1923; border:1px solid #55e7ff; border-radius:4px; color:#55e7ff; font-size:9px; font-weight:bold; padding:1px 5px; cursor:pointer;" title="กดสลับระหว่างระบบ Deficit Partitioning (K=2) กับระบบ Fibonacci 20 ไม้">🔄 สลับเป็น FIBO</button>
                    <span style="font-size:9px; color:#7f8b9b;" title="รุ่นของโค้ด — ใช้ตรวจว่าติดตั้งไฟล์ล่าสุดหรือยัง">${BUILD_STAMP}</span>
                    <button id="sniperMinimizeBtn" style="background:#0f1923; border:1px solid #2f4553; border-radius:4px; color:#00e676; font-size:10px; padding:1px 5px; cursor:pointer;" title="ย่อ/ขยายหน้าจอเพื่อประหยัดพลังงาน">🔽</button>
                    <button id="sniperReloadBtn" style="background:#0f1923; border:1px solid #2f4553; border-radius:4px; color:#55e7ff; font-size:10px; padding:1px 5px; cursor:pointer;" title="🔄 รีเฟรชหน้าเว็บ (F5) ทันทีเพื่อล้างแคชและรีเซ็ตหน่วยความจำ">🔄</button>
                    <button id="sniperAdvBtn" style="background:#0f1923; border:1px solid #2f4553; border-radius:4px; color:#ffea00; font-size:10px; padding:1px 5px; cursor:pointer;" title="ซ่อน/แสดงเครื่องมือเพิ่มเติม (SELF-TEST · RESYNC · เริ่มไม้ · เรดาร์ · สถิติ · RNG · Integrity)">🧰</button>
                </div>
                <div style="display:flex; gap:4px; align-items:center; flex-wrap:wrap; justify-content:flex-end;">
                    <span id="sniperAcctBadge" style="font-size:9px; background:#0f1923; border:1px solid #ffea00; padding:1px 5px; border-radius:4px; color:#ffea00; font-weight:bold; cursor:pointer; max-width:86px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="ยังจับชื่อบัญชีไม่ได้ — กดเพื่อตั้งชื่อเอง">👤 ?</span>
                    <button id="sniperCycleBadge" style="font-size:9px; background:#0f1923; border:1px solid #ffea00; padding:1px 5px; border-radius:4px; color:#ffea00; font-weight:bold; cursor:pointer;" title="ลูปรอบ — ON = ถึงเป้ากำไรแล้วเริ่มรอบใหม่ทันที / OFF = หยุดเมื่อถึงเป้า (กดเพื่อสลับ)">🔁 ON</button>
                </div>
            </div>

            <!-- COMPACT MINI BAR (แสดงเมื่อกดย่อหน้าต่างเพื่อประหยัดพลังงานจอ) -->
            <div id="sniperMiniBar" style="display:none; align-items:center; justify-content:space-between; font-size:11px; margin-top:2px;">
                <div style="display:flex; align-items:center; gap:5px;">
                    <span id="sniperMiniStep" style="font-weight:bold; color:#00e676;">ไม้ 1 (0.001$)</span>
                    <span id="sniperMiniProfit" style="margin-left:4px; font-weight:bold; color:#00e676;">+0.0000$</span>
                    <span id="sniperMiniTime" style="font-size:10px; font-weight:bold; color:#ffea00;" title="เวลาทำงานของเซสชัน · เวลาที่เหลือก่อนจบรอบ">⏱ --:--</span>
                    <span id="sniperMiniBuild" style="font-size:9px; color:#7f8b9b;" title="รุ่นของโค้ด — เทียบกับ Version ใน chrome://extensions">${BUILD_SHORT}</span>
                </div>
                <div style="display:flex; gap:4px;">
                    <button id="sniperMiniReloadBtn" style="background:#0f1923; border:1px solid #2f4553; border-radius:4px; color:#55e7ff; font-size:10px; padding:2px 5px; cursor:pointer;" title="🔄 รีเฟรชหน้าเว็บ">🔄</button>
                    <button id="sniperMiniStartBtn" style="background:#00e701; color:#013e00; border:none; padding:3px 8px; border-radius:4px; font-weight:bold; font-size:10px; cursor:pointer;">START</button>
                    <button id="sniperMiniStopBtn" style="background:#ed4245; color:#fff; border:none; padding:3px 8px; border-radius:4px; font-weight:bold; font-size:10px; cursor:pointer;">STOP</button>
                </div>
            </div>

            <div id="sniperPanelBody">
                <!-- 🧰 ADVANCED 1: เครื่องมือ (ซ่อนไว้ กด 🧰 ที่หัวแผงเพื่อแสดง) -->
                <div class="sniperAdv" style="display:none;">
                <div style="display:flex; gap:6px; align-items:center; margin-bottom:6px;">
                    <span id="sniperEcoBadge" style="font-size:9px; background:#0f1923; border:1px solid #2f4553; padding:1px 5px; border-radius:4px; color:#7f8b9b; font-weight:bold;">🌿 FULL</span>
                    <span id="sniperAntiSleep" style="font-size:9px; background:#0f1923; padding:1px 5px; border-radius:4px; color:#7f8b9b; font-weight:bold;">IDLE</span>
                    <button id="sniperGoDiceBtn" style="font-size:9px; background:#0f1923; border:1px solid #55e7ff; padding:1px 6px; border-radius:4px; color:#55e7ff; font-weight:bold; cursor:pointer;" title="พาแท็บนี้ไปหน้า Stake Dice (ใช้ภาษาตามหน้าเว็บปัจจุบัน ไม่เปิดแท็บใหม่)">🎯 ไปหน้า Dice</button>
                    <span id="sniperAutoGoDiceBadge" style="font-size:9px; background:#0f1923; border:1px solid #00e676; padding:1px 5px; border-radius:4px; color:#00e676; font-weight:bold; cursor:pointer;" title="พาเว็บไปหน้า Dice เองเมื่อเปิดหน้า (ปิดได้ด้วยการกด)">🎯 auto: ON</span>
                    <span id="sniperSessionTimeBadge" style="font-size:9px; background:#0f1923; border:1px solid #ffea00; padding:1px 5px; border-radius:4px; color:#ffea00; font-weight:bold; cursor:pointer;" title="จบเซสชันอัตโนมัติเมื่อครบเวลา (15/30/60/ปิด) — กดเพื่อเปลี่ยน">⏱️ 30m</span>
                    <button id="sniperCopySummaryBtn" style="font-size:9px; background:#0f1923; border:1px solid #00e676; padding:1px 6px; border-radius:4px; color:#00e676; font-weight:bold; cursor:pointer;" title="คัดลอกสรุปเซสชันล่าสุดเป็น CSV 1 แถว (ไว้จด/วางในชีต) — ใช้ตอนวนบัญชี">📋 สรุป</button>
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
                <button id="sniperResyncBtn" style="width:100%; background:#0f1923; border:1px dashed #ffa726; border-radius:4px; padding:3px; font-size:9px; font-weight:bold; color:#ffa726; cursor:pointer; margin-bottom:8px;" title="เปิด = เมื่อยอดจริงเพี้ยนติดกัน ระบบจะยอมรับยอดจริงบนหน้าจอเป็นยอดใหม่แล้วเล่นต่อ (ไม่จำกัดจำนวนครั้ง) แทนการหยุดทันที">↔️ AUTO-RESYNC: OFF</button>

                </div>
                <!-- /ADVANCED 1 -->

                <!-- FIBONACCI PARAMETERS (20 ไม้ · ชนะถอย 2 ขั้น / รีเซ็ตไม้ 1) -->
                <div style="background:#0f1923; border:1px solid #243442; border-radius:8px; padding:8px; margin-bottom:8px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                        <span id="sniperParamStep" style="color:#00e676; font-size:11px; font-weight:bold;">⚙️ พารามิเตอร์ Fibonacci:</span>
                        <button id="sniperResetBtn" style="background:#1a242d; border:1px solid #00e676; border-radius:4px; padding:2px 6px; font-size:10px; font-weight:bold; color:#00e676; cursor:pointer;" title="รีเซ็ตเป็นค่ามาตรฐาน (Fibonacci 20 ไม้ · 49.5% Under)">
                            ✨ รีเซ็ตค่า
                        </button>
                    </div>
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;">
                        <div>
                            <div style="color:#8596a5; font-size:10px; margin-bottom:2px;">ยอดฐาน ไม้ 1 ($):</div>
                            <input id="sniperInRealBase" type="text" value="${configRealBaseBet}" style="width:100%; background:#1a242d; border:1px solid #2f4553; border-radius:4px; color:#fff; font-size:11px; padding:3px 4px; box-sizing:border-box; outline:none; font-family:inherit;">
                        </div>
                        <div>
                            <div style="color:#55e7ff; font-size:10px; margin-bottom:2px;">โอกาสชนะ (%):</div>
                            <input id="sniperInChance" type="text" value="${configChance}" style="width:100%; background:#1a242d; border:1px solid #2f4553; border-radius:4px; color:#55e7ff; font-size:11px; padding:3px 4px; box-sizing:border-box; outline:none; font-family:inherit;">
                        </div>
                    </div>
                </div>

                <!-- SAFETY BADGE -->
                <div id="sniperSafetyBadge" style="background:#0f1923; border:1px solid #00e676; border-radius:6px; padding:5px 6px; font-size:10px; font-weight:bold; color:#00e676; margin-bottom:8px; text-align:center;">
                    <span id="sniperSafetyIcon">🛡️</span> <span id="sniperSafetyEngineName">K=2 กู้คืนทุนจริง</span> • <span id="sniperSafetyStep">ปลดหนี้ 50%/ตา • คืนทุนรีเซ็ตไม้ 1</span> • <span id="sniperSafetyStop">คำนวณตามหนี้จริงไร้แคป</span>
                </div>

                <!-- 🌬️ แทงลมเมื่อแพ้จริงติดกัน 3 ครั้ง -> แทงลม 3 ตา -> ออกแทงลมแทงจริงต่อจากเดิม -->
                <div style="display:flex; align-items:center; justify-content:space-between; gap:4px; background:#0f1923; border:1px solid #243442; border-radius:6px; padding:6px 8px; margin-bottom:8px;">
                    <button id="sniperToggleVirtualBtn" style="background:#0f1923; border:1px solid #55e7ff; border-radius:4px; padding:3px 6px; font-size:10px; font-weight:bold; color:#55e7ff; cursor:pointer;" title="เปิด/ปิด โหมดแทงลม 0$ (เมื่อแพ้จริงติดครบกำหนดจะเข้าแทงลม 3 ตาแล้วกลับมาแทงจริงต่อไม้เดิม)">🌬️ แทงลม: ON (0/3)</button>
                    <div style="display:flex; align-items:center; gap:4px;">
                        <span style="color:#8596a5; font-size:10px;">แพ้ติด:</span>
                        <input id="sniperInVirtualLoss" type="number" min="1" max="20" value="${configVirtualLossTrigger}" title="แพ้เงินจริงติดต่อกันกี่ครั้ง จึงเข้าแทงลม 0$" style="width:34px; background:#1a242d; border:1px solid #ffa726; border-radius:4px; color:#ffa726; font-size:11px; font-weight:bold; padding:2px 2px; text-align:center; outline:none; font-family:inherit;">
                    </div>
                </div>

                <!-- สลับ Under/Over ทุกตา: [เปิด / ปิด] -->
                <div style="display:flex; align-items:center; justify-content:space-between; background:#0f1923; border:1px solid #243442; border-radius:6px; padding:6px 10px; margin-bottom:8px;">
                    <span style="color:#b1bad3; font-size:11px; font-weight:bold;">สลับ Under/Over ทุกตา:</span>
                    <button id="sniperToggleAltBtn" style="background:#0f1923; border:1px solid #00e676; border-radius:4px; padding:3px 12px; font-size:11px; font-weight:bold; color:#00e676; cursor:pointer;" title="คลิกเพื่อ เปิด / ปิด การสลับฝั่งทุกตา">เปิด (ON)</button>
                </div>

                <div style="margin-bottom:8px; min-height:20px;">
                    <span style="color:#b1bad3; font-size:11px;">สถานะ:</span>
                    <span id="sniperStatusText" style="font-weight:bold; color:#b1bad3; margin-left:4px; font-size:11px;">พร้อมเริ่มงาน</span>
                </div>

                <!-- REAL-TIME STATUS BOX -->
                <div style="background:#0f1923; border:1px solid #243442; border-radius:8px; padding:8px; margin-bottom:8px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                        <span style="color:#b1bad3; font-size:11px;">สถานะโหมด:</span>
                        <span id="sniperModeBadge" style="font-size:10px; font-weight:bold; background:#013e00; padding:2px 6px; border-radius:4px; color:#00e676;">🎯 ไม้ 1: 0.00012$</span>
                    </div>
                    <div style="display:flex; justify-content:space-between; font-size:12px; margin-top:2px;">
                        <span style="color:#b1bad3;">ไม้ถัดไป:</span>
                        <span id="sniperNextBet" style="font-weight:bold; color:#00e676;">0.001 USDT</span>
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
                <div id="sniperRng" style="font-size:10px; color:#8596a5; background:#0f1923; border:1px dashed #55e7ff; border-radius:6px; padding:4px 6px; margin-bottom:6px; line-height:1.4;" title="ระบบเดินเงิน Fibonacci 20 ไม้">🎯 Fibonacci 20 ไม้</div>

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
            miniTime: shadow.getElementById("sniperMiniTime"),
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
            engineToggleBtn: shadow.getElementById("sniperEngineToggleBtn"),
            paramStep: shadow.getElementById("sniperParamStep"),
            safetyBadge: shadow.getElementById("sniperSafetyBadge"),
            safetyIcon: shadow.getElementById("sniperSafetyIcon"),
            safetyEngineName: shadow.getElementById("sniperSafetyEngineName"),
            safetyStep: shadow.getElementById("sniperSafetyStep"),
            safetyStop: shadow.getElementById("sniperSafetyStop"),
            toggleVirtualBtn: shadow.getElementById("sniperToggleVirtualBtn"),
            inVirtualLoss: shadow.getElementById("sniperInVirtualLoss"),
            toggleAltBtn: shadow.getElementById("sniperToggleAltBtn"),
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
        if (hudEls.engineToggleBtn) {
            hudEls.engineToggleBtn.addEventListener("click", () => toggleEngineMode());
        }
        hudEls.acctBadge.addEventListener("click", () => { setAccountNameManually(); });
        hudEls.goDiceBtn.addEventListener("click", () => { goToDicePage(); });
        hudEls.autoGoDiceBadge.addEventListener("click", () => {
            configAutoGoDice = !configAutoGoDice;
            syncAutoGoDiceBadge();
            updateStatusText(configAutoGoDice ? "🎯 ไปหน้า Dice อัตโนมัติ: เปิด" : "🎯 ไปหน้า Dice อัตโนมัติ: ปิด", configAutoGoDice ? "#00e676" : "#7f8b9b");
        });
        hudEls.sessionTimeBadge.addEventListener("click", () => { cycleSessionTimeLimit(); });
        hudEls.copySummaryBtn.addEventListener("click", () => { copySummaryToClipboard(); });
        if (hudEls.targetModeBadge) hudEls.targetModeBadge.addEventListener("click", () => { toggleTargetMode(); });
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
        hudEls.miniReloadBtn.addEventListener("click", () => {
            log("🔄 ผู้ใช้สั่งรีเฟรชหน้าเว็บ (Reloading page)...", true);
            window.location.reload();
        });
        // ⏱️ นาฬิกาแผงย่อ — เดินทุก 1 วิ เฉพาะตอนย่ออยู่ (ไม่เขียน DOM ถ้าแผงขยาย)
        if (hudEls.miniTime) {
            setInterval(function () { if (isPanelMinimized) updateMiniTimer(); }, 1000);
            updateMiniTimer();
        }
        hudEls.ecoBtn.addEventListener("click", () => { toggleEcoMode(); });
        if (hudEls.ecoBadge) {
            hudEls.ecoBadge.style.cursor = "pointer";
            hudEls.ecoBadge.addEventListener("click", () => { toggleEcoMode(); });
        }
        hudEls.resyncBtn.addEventListener("click", () => {
            configAutoResync = !configAutoResync;
            if (!configAutoResync) resyncCount = 0;
            log(configAutoResync
                ? `↔️ AUTO-RESYNC เปิด: ยอดเพี้ยนติด 5 ครั้ง → ยอมรับยอดจริงแล้วเล่นต่อ (ไม่จำกัดจำนวนครั้ง)`
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
        if (hudEls.toggleVirtualBtn) {
            hudEls.toggleVirtualBtn.addEventListener("click", () => {
                if (virtualMode) {
                    // ถ้ากำลังอยู่ในโหมดแทงลม แล้วผู้ใช้กดปุ่ม -> ออกจากแทงลมกลับไปแทงเงินจริงต่อจากเดิมทันที
                    exitVirtualToReal("ผู้ใช้สั่งออกจากแทงลม");
                } else {
                    configVirtualBetEnabled = true;
                    virtualMode = true;
                    virtualEnteredAt = Date.now();
                    parkedStep = Math.max(1, mStep);             // 🔒 กดเอง: พักไม้ปัจจุบัน
                    parkedAmount = parseFloat(calculateCurrentBetAmount());
                    resetVirtualRun();
                    recordEvent("VIRTUAL_ENTER", { by: "manual", parkedStep: parkedStep, parkedAmount: parkedAmount });
                    realLossStreakForVirtual = 0;
                    log(`🌬️ ผู้ใช้สั่งเข้าแทงลม 0$ ทันที → ลุยเงินจริงต่อไม้ ${mStep} (${calculateCurrentBetAmount()}$)`, true);
                    updateStatusText(`🌬️ เข้าแทงลม 0$ แล้ว (ไม้ ${mStep} พักไว้)`, "#55e7ff");
                }
                applyBetSettings();
                updateUI();
                if (sessionRunning && !isBetInProgress && !isWaitingNextRound) {
                    scheduleNextBet();
                }
            });
        }
        if (hudEls.inVirtualLoss) {
            const onVirtualLossInput = (e) => {
                const val = parseInt(e.target.value, 10);
                if (Number.isFinite(val) && val >= 0 && val <= 20) {
                    configVirtualLossTrigger = val;
                    if (val === 0) {
                        configVirtualBetEnabled = false;
                        virtualMode = false;
                    } else {
                        configVirtualBetEnabled = true;
                    }
                    applyBetSettings();
                    updateUI();
                }
            };
            hudEls.inVirtualLoss.addEventListener("input", onVirtualLossInput);
            hudEls.inVirtualLoss.addEventListener("change", onVirtualLossInput);
        }
        if (hudEls.toggleAltBtn) {
            hudEls.toggleAltBtn.addEventListener("click", () => {
                configAlternateRoll = !configAlternateRoll;
                if (!configAlternateRoll) currentRollSide = "under";
                applyRollSide();
                updateUI();
                log(configAlternateRoll ? "🎲 สลับ Under/Over ทุกตา: เปิด (ON)" : "🎲 สลับ Under/Over ทุกตา: ปิด (OFF) — แทง Under ฝั่งเดียว", true);
            });
        }
        hudEls.resetBtn.addEventListener("click", () => {
            configDynamicBase = true;
            configRealBaseBet = FIXED_BASE_BET;
            configProfitTarget = 0;
            configChance = "49.5";
            configAlternateRoll = false;
            currentRollSide = "under";
            pendingRollSide = "under";
            configVirtualBetEnabled = true;
            configVirtualLossTrigger = 3;
            virtualMode = false;
            realLossStreakForVirtual = 0;
            virtualRolls = 0;
            updateBaseBetOnReset("กด Reset บน HUD");
            syncEngineModeUI();
            syncHUDInputs();
            applyBetSettings();
            updateUI();
            log(`✨ รีเซ็ตพารามิเตอร์เรียบร้อย (ระบบ ${activeEngineMode.toUpperCase()} · แพ้จริงติด ${configVirtualLossTrigger} เข้าแทงลม ${VIRTUAL_EXIT_AFTER_ROLLS} ตา · Dynamic Base = balance/${DYNAMIC_BASE_DIVISOR})`, true);
        });

        // อัปเดตค่าในหน่วยความจำทันทีที่พิมพ์ (In-Memory Only ไร้ร่องรอยใน Storage)
        const onBaseInput = (e) => {
            const val = parseFloat(e.target.value);
            if (val > 0) {
                // ผู้ใช้พิมพ์แก้เอง -> สลับเป็นค่าที่กำหนดเองจนกว่าจะกด Reset
                configDynamicBase = false;
                lockedCycleBaseBet = null;
                configRealBaseBet = (val >= 0.01) ? val.toFixed(2) : String(val);
            }
            applyBetSettings();
            updateUI();
        };
        hudEls.inRealBase.addEventListener("input", onBaseInput);
        hudEls.inRealBase.addEventListener("change", onBaseInput);

        if (hudEls.inTarget) {
            const onTargetInput = (e) => {
                const val = parseFloat(e.target.value);
                if (val > 0) configProfitTarget = val;
                updateUI();
            };
            hudEls.inTarget.addEventListener("input", onTargetInput);
            hudEls.inTarget.addEventListener("change", onTargetInput);
        }

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

        applyMinimizedState();
        syncEngineModeUI();
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

    // ⏱️ นาฬิกาบนแผงย่อ: เวลาทำงานสะสม + เวลาที่เหลือของเซสชัน (อัปเดตทุก 1 วิ)
    function fmtMinSec(sec) {
        const s = Math.max(0, Math.floor(sec));
        const m = Math.floor(s / 60);
        const r = s % 60;
        return String(m).padStart(2, "0") + ":" + String(r).padStart(2, "0");
    }
    function updateMiniTimer() {
        try {
            const el = hudEls && hudEls.miniTime;
            if (!el) return;
            if (!sessionRunning || !sessionStartedAt) { setSafeText(el, "⏱ --:--"); return; }
            const elapsed = (Date.now() - sessionStartedAt) / 1000;
            let txt = "⏱ " + fmtMinSec(elapsed);
            if (configSessionMaxMinutes) {
                const left = configSessionMaxMinutes * 60 - elapsed;
                txt += (left > 0) ? " · เหลือ " + fmtMinSec(left) : " · ครบเวลา";
            }
            if (sessionRecoveryActive) txt += " 🩹";
            setSafeText(el, txt);
        } catch (e) {}
    }

    // 🤖 AUTO MINI: เริ่มแทง → ย่อเป็น mini bar อัตโนมัติ / หยุด → ขยายแผงกลับ
    let autoMiniOn = true;
    try { const am = localStorage.getItem("_st_auto_mini"); if (am !== null) autoMiniOn = (am === "1"); } catch (e) {}
    function applyAutoMini(collapse) {
        try {
            if (!autoMiniOn || !hudEls) return;
            if (isPanelMinimized === !!collapse) return; // สถานะตรงอยู่แล้ว ไม่ต้องเขียน DOM ซ้ำ
            isPanelMinimized = !!collapse;
            applyMinimizedState();
            localStorage.setItem("_st_hud_minimized", isPanelMinimized ? "1" : "0");
            trace("AUTO_MINI", { minimized: isPanelMinimized });
        } catch (e) {}
    }

    function applyMinimizedState() {
        if (!hudEls) return;
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
        isPanelMinimized = !isPanelMinimized;
        applyMinimizedState();
        try {
            localStorage.setItem("_st_hud_minimized", isPanelMinimized ? "1" : "0");
        } catch (e) {}
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
    // 🗑️ WIPE OLD HISTORY — ล้างประวัติการแทงเก่าทั้งหมด (ครั้งเดียว)
    // ==================================================
    const HISTORY_WIPE_FLAG = "_st_history_wipe_v1";

    function clearAllBetHistory() {
        // 1) ตัวนับ/สถิติในหน่วยความจำ
        totalBets = 0;
        totalWagered = 0;
        winsCount = 0;
        lossesCount = 0;
        currentStreak = 0;
        profit = 0;
        mStep = 1;
        maxStepReached = 1;
        betTimestamps.length = 0;
        diag.length = 0;
        lastLedgerBalance = null;
        betSeq = 0;
        lastTrace = null;
        ledgerGaps = 0;
        recentRollValues.length = 0;
        statsUnderCount = 0;
        statsOverCount = 0;
        lastRollResult = null;
        lastRollSig = "";
        lastRollSigAt = 0;
        // 2) ตัววิเคราะห์ก้อนแพ้
        lossGapTracker.currentLossGap = 0;
        lossGapTracker.gaps.length = 0;
        lossGapTracker.maxGap = 0;
        lossGapTracker.totalWins = 0;
        lossGapTracker.winsFollowedByLoss = 0;
        lossGapTracker.winsFollowedByWin = 0;
        lossGapTracker.lastBetWasWin = null;
        lossGapTracker.isolatedWinCount = 0;
        // 3) สถานะแทงลม
        virtualMode = false;
        realLossStreakForVirtual = 0;
        resetVirtualRun();
        // 4) ที่เก็บถาวร
        try {
            localStorage.removeItem(STORAGE_RECOVERY_KEY);
            sessionStorage.removeItem(STORAGE_RECOVERY_KEY);
        } catch (e) {}
        try { window.postMessage({ type: "CLEAR_STATS" }, "*"); } catch (e) {}
        try { localStorage.setItem(HISTORY_WIPE_FLAG, "1"); } catch (e) {}
        log("🗑️ ล้างประวัติการแทงเก่าทั้งหมดแล้ว (สถิติ/ledger/roll radar/chrome.storage)", true);
    }

    function maybeWipeOldHistoryOnce() {
        let done = false;
        try { done = localStorage.getItem(HISTORY_WIPE_FLAG) === "1"; } catch (e) {}
        if (done) return;
        clearAllBetHistory();
    }

    // ==================================================
    // 11. BOOTSTRAP INITIALIZATION
    // ==================================================
    function init() {
        if (isInitialized) return;
        isInitialized = true;

        maybeWipeOldHistoryOnce(); // 🗑️ ล้างประวัติเก่าครั้งเดียวหลังอัปเดต
        applyEcoStyles(configEcoMode);
        log("🔖 BUILD " + BUILD_STAMP + " — fibonacci 20 steps / 49.5% under / self-test / ledger / tab-guard • ยอดฐาน = " + configRealBaseBet + "$", true);

        initTabGuard();
        if (tabChannel) {
            setInterval(function () { if (sessionRunning) broadcastTabState("running"); }, 3000);

            syncAccountBadge();
            syncAutoGoDiceBadge();
            syncSessionTimeBadge();
            syncTargetModeBadge();
            // maybeAutoGoDice() ปิดไว้ เพื่อไม่ให้เกิดการเปลี่ยนหน้าหรือรีเฟรชเว็บเองตอนเริ่ม
        }

        window.addEventListener("keydown", function (e) {
            if (e.altKey && !e.ctrlKey && !e.metaKey) {
                const k = String(e.key || "").toLowerCase();
                if (k === "t") { e.preventDefault(); runSelfTest(); }
                else if (k === "l") { e.preventDefault(); copyLedger(); }
                else if (k === "d") { e.preventDefault(); downloadDiagLog(); }
                else if (k === "x") { e.preventDefault(); resetDiag(); }
                else if (k === "a") {
                    e.preventDefault();
                    const a = analyzeDiag();
                    try { if (typeof copy === "function") copy(JSON.stringify(a, null, 2)); } catch (err) {}
                    updateStatusText("🔎 " + a.findings.map(function (f) { return f.code + ": " + f.msg; }).join(" | "), a.findings[0].sev === "ok" ? "#00e676" : "#ffa726");
                }
                else if (k === "z") {
                    e.preventDefault();
                    configVirtualWriteZero = !configVirtualWriteZero;
                    trace("ZERO_SWITCH", { zeroInField: configVirtualWriteZero });
                    updateStatusText("⚙️ " + virtualZeroModeText(), "#55e7ff");
                    applyBetSettings(true);
                    updateUI();
                }
            }
        });

        // ♻️ WATCHDOG: ถ้าไม้ค้าง (ไม่มีความคืบหน้า) ให้ปลดล็อกและเดินต่อ ไม่ปล่อยให้ค้างเงียบ
        //    ไม้ 0$ ไม่มีความเสี่ยงเงิน → ปลดล็อกเร็ว 6 วิ / ไม้จริงคง 12 วิ (ไม้ 0$ มีตัวตัดสิน STALL ที่ 1.5 วิเป็นหลักอยู่แล้ว)
        const checkHang = function () {
            try {
                if (!sessionRunning) return;
                let limitMs = 12000;
                try { if (isVirtualBetActive()) limitMs = 6000; } catch (e) {}
                if (isBetInProgress && lastBetDispatchTime && (Date.now() - lastBetDispatchTime > limitMs)) {
                    trace("HANG", {
                        sinceMs: Date.now() - lastBetDispatchTime,
                        lastDispatch: lastBetDispatchTime,
                        limitMs: limitMs,
                        lastDiceRequestAt: lastDiceRequestAt,
                        lastBetSignalAt: lastBetSignal(),
                        lastVirtualRewriteAt: lastVirtualRewriteAt,
                        fieldValue: getAmountInputValue(),
                        zeroInField: configVirtualWriteZero,
                        stalls: virtualStallCount,
                        step: mStep
                    });
                    isBetInProgress = false;
                    onDiceRollCallback = null;
                    if (!autoHeal("hang")) {
                        betTimeoutId = setTimeout(scheduleNextBet, 300);
                        updateStatusText("♻️ ปลดล็อกไม้ค้าง (ไม่มีผลลัพธ์ " + Math.round(limitMs / 1000) + " วิ) — เดินต่อ", "#ffa726");
                    }
                }
            } catch (e) {}
        };
        setInterval(checkHang, 5000);
        // 👁️ แท็บถูกซ่อน = Chrome throttle timer (diag พบ HANG ค้าง 42-51 วิ) → ตรวจซ้ำทันทีเมื่อกลับมาแสดง
        try {
            document.addEventListener("visibilitychange", function () {
                if (!document.hidden) setTimeout(checkHang, 300);
            });
        } catch (e) {}

        // 🛡️ ดัก exception ที่หลุดจากทุกเส้นทาง (ไม่ให้เงียบจนบอทหยุด)
        window.addEventListener("error", function (ev) {
            try { trace("ERROR", { where: "window.error", message: String((ev && ev.message) || "") }); } catch (e) {}
        });
        window.addEventListener("unhandledrejection", function (ev) {
            try { trace("ERROR", { where: "unhandledrejection", message: String((ev && ev.reason && ev.reason.message) || ev.reason || "") }); } catch (e) {}
        });

        // 🚑 PUMP: ถ้าเซสชันรันอยู่แต่ไม่มีคิวไม้ (เอนจินหลุด) ให้สั่งไม้ใหม่เอง
        setInterval(function () {
            try {
                if (selfSupersededCheck()) { return; }
                if (!sessionRunning || isBetInProgress || isWaitingNextRound) return;
                if (betTimeoutId) return;
                const idle = Date.now() - (lastBetDispatchTime || 0);
                if (idle < 3000) return;
                trace("PUMP", { idleMs: idle });
                scheduleNextBet();
            } catch (e) {}
        }, 2000);


        setInterval(function () {
            try {
                if (!sessionRunning) return;
                diagPush("SNAP", null, {
                    step: mStep,
                    bal: getBalance(),
                    inBet: isBetInProgress,
                    wait: isWaitingNextRound,
                    virtual: virtualMode,
                    rolls: virtualRolls,
                    stalls: virtualStallCount,
                    field: getAmountInputValue(),
                    lastRoll: lastRollResult,
                    seq: serverRollSeq,
                    lastBetAt: lastBetDispatchTime,
                    heal: healCount
                });
            } catch (e) {}
        }, 60000);

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
