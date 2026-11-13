// ==UserScript==
// @name Stake Dice Dynamic 22-Step (Fibonacci • ชนะถอย 2 / ชนะติด 2 รีเซ็ต / แพ้ +1)
// @namespace http://tampermonkey.net/
// @version 2026.11.18
// @description Stake Dice Dynamic 22-Step • Fibonacci (แพ้ +1, ชนะถอย 2, ชนะติด 2 รีเซ็ต) • ฮาร์ดสต็อปที่ไม้ 22 • โหมด ECO
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
    // Stake ส่งยอดกระเป๋ากลับมาพร้อมผลทอยในฟิลด์ balance / balances.available
    function findBalanceValue(node, depth) {
        if (!node || typeof node !== 'object' || depth > 6) return null;
        if (typeof node.balance === 'number' && isFinite(node.balance) && node.balance > 0) return node.balance;
        if (node.balances && typeof node.balances === 'object') {
            const cand = [node.balances.available, node.balances.total, node.balances.usdt];
            for (let i = 0; i < cand.length; i++) {
                if (typeof cand[i] === 'number' && isFinite(cand[i]) && cand[i] > 0) return cand[i];
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
    // 1. CONFIGURATION & STATE: DYNAMIC 22-STEP FIBONACCI
    // ==================================================

    let isInitialized = false;
    let configEcoMode = true; // โหมดประหยัดพลังงาน (Low-Power ECO Mode: ปิดกราฟิก 3D/ลดการเรนเดอร์)
    let isPanelMinimized = false; // สถานะการย่อขนาดหน้าจอ HUD

    function log() {
        // Silent Zero-Footprint Mode: ไม่ทิ้งข้อความใดๆ ลงใน Console ของเบราว์เซอร์
    }

    // ==================================================
    // 1.0 LOW-POWER ECO DISPLAY STYLES INJECTOR (ไร้ ID บน DOM)
    // ==================================================
    let ecoStyleEl = null;
    function applyEcoStyles(enable) {
        try {
            if (enable) {
                if (!ecoStyleEl) {
                    ecoStyleEl = document.createElement("style");
                    ecoStyleEl.textContent = `
                        [data-testid="dice-game"] canvas,
                        div[class*="game-display"] canvas,
                        div[class*="CanvasWrapper"],
                        div[class*="live-feed"],
                        div[class*="recent-bets-scroll"],
                        .animated,
                        [class*="particle"],
                        [class*="sparkle"] {
                            display: none !important;
                        }
                    `;
                    document.head.appendChild(ecoStyleEl);
                }
            } else {
                if (ecoStyleEl) {
                    ecoStyleEl.remove();
                    ecoStyleEl = null;
                }
            }
        } catch (e) {}
    }

    // 1.1 พารามิเตอร์หลักของระบบ Fibonacci 22 ไม้ (เก็บใน Memory ล้วน 100% ไม่แตะ Storage)
    let configChance = "49"; // โอกาสชนะ 49% (ตามที่กำหนดสำหรับ input[data-testid="chance"])
    let configDynamicScale = false; // ปิดโหมดทบต้นอัตโนมัติ เพื่อล็อกไม้เริ่มต้นไว้ที่ 0.001 ตามที่ผู้ใช้กำหนด
    let configRealBaseBet = "0.00029"; // ไม้จริงเริ่มต้น (Step 1) — 0.00029 คือค่าที่รองรับ 22 ไม้ได้พอดีด้วยทุน ~22.38$ (ต้องการ 21.76$)
    let configMaxRealSteps = 22; // เพดานไม้สูงสุดที่ยอมวางเงินจริง (แพ้ไม้ที่ 22 = HARD STOP) — 22 ไม้ด้วย base 0.00029 ใช้ทุน 21.76$ | (0.51)^22 ≈ หลุด 1 ใน 2.7 ล้านตา
    // 🎛️ AUTO TUNE: คำนวณไม้ 1 + เพดานไม้จากทุนจริงของแต่ละบัญชีอัตโนมัติทุกครั้งที่ขึ้นรอบใหม่
    let configAutoTune = true;
    const AUTO_MIN_BET = 0.00015; // ขั้นต่ำที่เว็บยอมรับ (USDT)
    const AUTO_SAFETY_RATIO = 0.65; // ใช้ทุนได้ไม่เกิน 65% ของพอร์ต เหลือกันชนไว้ปัดเศษทศนิยม
    const AUTO_STEP_TIERS = [22, 20, 18, 16, 14, 12, 10, 8]; // เรียงจากทนได้มาก → น้อย (ตัวหาร 75,023 / 28,655 / 10,944 / 4,179 / 1,595 / 376 / 143 / 54)
    // 🛡️ DESYNC GUARD: เทียบยอดเงินจริงบนหน้าจอกับยอดที่ระบบคำนวณเอง
    let configDesyncGuard = true;
    const DESYNC_STRIKE_LIMIT = 3; // ไม่ตรงติดกันกี่ไม้ จึงหยุดระบบ
    // ↔️ AUTO-RESYNC: ยืดหยุ่นแทนการหยุด — ยอมรับยอดจริงบนหน้าจอเป็นยอดใหม่แล้วเล่นต่อ
    let configAutoResync = false;
    const RESYNC_LIMIT = 5; // ซิงก์ได้ไม่เกินกี่ครั้งต่อเซสชัน ก่อนหยุดจริง
    let resyncCount = 0;
    let desyncStrikes = 0;
    let lastBetAmount = 0; // ไม้จริงล่าสุด ใช้เป็นเกณฑ์ตรวจ desync
    // ⏱️ ตัวแปรจับ "ยอดนิ่งหรือยัง" — กัน false DESYNC จากยอดบนจอที่อัปเดตช้ากว่าผลทอย
    let lastBetResolvedAt = 0;      // เวลาที่ไม้ล่าสุดรู้ผล
    let lastServerBalance = null;   // ยอดจริงจาก API (แม่นกว่า DOM 100%)
    let lastServerBalanceAt = 0;
    const SERVER_BAL_TTL_MS = 30000; // ยอดจาก API เก่าเกินนี้ = เลิกใช้ กลับไปใช้ DOM
    const DOM_SETTLE_MS = 700;      // ต้องไม่มีไม้ใหม่นานเท่านี้ ก่อนจะอ่าน DOM ไปตัดสิน
    const DOM_STABLE_MS = 250;      // ค่าบน DOM ต้องนิ่งติดกันนานเท่านี้
    let domSettle = { val: null, at: 0 };
    let cleanSyncStreak = 0;        // เทียบตรงติดกันกี่ไม้ → คืนเครดิต resync
    // รายละเอียดการไม่ตรงครั้งล่าสุด — แสดงบน HUD เพื่อหาสาเหตุได้ทันที
    let lastDesync = { dom: null, model: null, diff: 0, tol: 0, source: "" };
    // 🚦 BOUNDARY CONSTRAINTS: ขั้นต่ำ/สูงสุดที่อ่านได้จากช่องเดิมพันจริง (ถ้าเว็บประกาศไว้)
    let detectedMinBet = null;
    let detectedMaxBet = null;
    // 🛑 SESSION KILL SWITCH: ขาดทุนสุทธิถึงเท่านี้แล้วหยุดทั้งเซสชัน (0 = ปิด)
    let configSessionMaxLoss = 0;
    let configVirtualBetEnabled = true; // เปิดระบบแทงลม Anti-Chop & Cluster Loss เพื่อป้องกันทุน
    let virtualMode = false;
    let virtualRolls = 0;
    let virtualWinStreak = 0; // นับจำนวนตาที่ชนะติดกันในโหมดแทงลม
    let configChopWindow = 20; // หน้าต่างตัดสินใจของโหมดแทงลม: ใช้ผล 20 ตาล่าสุด
    let recentOutcomes = []; // ประวัติผลแพ้ชนะ 20 ตาล่าสุด (true = win, false = loss)
    let configAntiChopMinStep = 5; // เริ่มตรวจจับความผิดปกติตั้งแต่ไม้ 5 ขึ้นไป
    let configVirtualStallLimit = 5; // แทงลม (0$) ไม่ตอบสนองติดกันกี่ครั้ง จึงหยุดระบบเพื่อกันลูปค้าง
    let virtualStallCount = 0; // นับจำนวนครั้งที่แทงลม 0$ แล้วไม่มีผลลัพธ์กลับมา
    let configProfitTarget = 1.0; // กำไรเป้าหมายต่อรอบ (Take-Profit: +1.00 USDT)
    let configStopLoss = 550.0; // ตัวเลขอ้างอิงงบรวมยามหลุดทั้งกระดาน (ไม่ได้ใช้ตัดสินใจในโค้ด — ตัวหยุดจริงคือ HARD STOP ที่ configMaxRealSteps)
    let configAutoStart = true; // เปิดทำงานอัตโนมัติเมื่อตรวจพบยอดเงิน

    // 1.2 ตัวแปรสถานะการทำงาน (State Machine)
    let realStep = 1; // สเต็ปไม้ปัจจุบัน (เริ่มไม้ 1 เสมอ: 1..19)
    let successfulSnipes = 0; // สถิติจำนวนรอบที่ชนะไม้จริงเข้าเป้า
    let cutLossSnipes = 0; // สถิติจำนวนรอบที่หลุดเพดานไม้แล้วยอมคัทลอสตามแผน

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

    // คำนวณโอกาสรอดชีวิตตามคณิตศาสตร์ (Survival Probability) ที่ไม้ปัจจุบัน
    function getSurvivalProbabilityText() {
        const remainingSteps = Math.max(0, configMaxRealSteps - realStep);
        if (remainingSteps === 0) return "⚠️ ไม้สุดท้าย (เสี่ยง 100%)";
        // โอกาสที่จะแพ้รวดจนถึงไม้ 19 = (0.51)^remainingSteps
        const lossProb = Math.pow(0.51, remainingSteps);
        const survivalRate = ((1 - lossProb) * 100).toFixed(remainingSteps > 7 ? 4 : 2);
        return `โอกาสรอด: ${survivalRate}% (อีก ${remainingSteps} ไม้)`;
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

    let autoCycleRounds = true;
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
    let amountRetryCount = 0;

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
    function enableAudioKeepAlive() {
        try {
            if (!audioKeepAliveCtx) {
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                if (AudioCtx) {
                    audioKeepAliveCtx = new AudioCtx();
                    const osc = audioKeepAliveCtx.createOscillator();
                    const gain = audioKeepAliveCtx.createGain();
                    gain.gain.value = 0.00001; // เงียบสนิท ไร้เสียงรบกวน
                    osc.connect(gain);
                    gain.connect(audioKeepAliveCtx.destination);
                    osc.start();
                }
            }
            if (audioKeepAliveCtx && audioKeepAliveCtx.state === "suspended") {
                audioKeepAliveCtx.resume();
            }
        } catch (e) {}
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
    }

    // ==================================================
    // 5. DOM SELECTORS & BALANCE READER
    // ==================================================
    function parseBalanceElement(el) {
        if (!el || !document.body || !document.body.contains(el)) return null;
        if (el.closest('[data-testid="dice-game"], [data-testid*="bet-amount"], [data-testid*="input-game"], [data-testid*="chance"], [data-testid*="payout"], [data-testid*="profit"], [class*="game-sidebar"], [class*="bet-control"]')) {
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
                'span[data-ds-text="true"][style*="max-width"]',
                'span.edge-typography-body-md-strong.text-ellipsis',
                '[data-testid="coin-toggle"] span',
                'button[data-testid*="wallet"] span',
                'button[data-testid="wallet-balance-button"] span',
                'span[data-testid="wallet-balance"]',
                'div[data-testid="wallet-balance"] span',
                'div[data-testid*="wallet"] span',
                'header span[data-ds-text="true"]',
                'nav span[data-ds-text="true"]',
                'div[class*="BalanceWrap"] span',
                'div[class*="balance"] span',
                'span[class*="edge-typography-body-md-strong"][data-ds-text="true"]'
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
                        document.querySelector('[data-testid="bet-amount"] input');
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
                        document.querySelector('input[data-testid="game-chance"]');
                if (input) cachedChanceInput = input;
            }
        } else {
            input = document.querySelector(`input[data-testid="${testid}"]`) ||
                    document.querySelector(`[data-testid="${testid}"] input`);
        }

        if (!input) return false;

        // ลดพลังงานการแสดงผล: หากค่ายอดเดิมในช่องตรงกับค่าใหม่อยู่แล้ว ข้ามการ dispatch event ไม่ให้ React ทำงานซ้ำซ้อน
        if (input.value === String(value)) {
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
    // 6. DYNAMIC FIBONACCI STEP CALCULATION ENGINE
    // ==================================================

    let cycleBase = null; // ไม้ 1 ที่ล็อกไว้ตลอดรอบ (คำนวณใหม่เฉพาะตอนเริ่มรอบใหม่ที่ไม้ 1)

    function calculateDynamicBaseBet() {
        const userBase = parseFloat(configRealBaseBet) || 0.001;
        if (!configDynamicScale) {
            return userBase;
        }
        // ระหว่างรอบ (ไม้ 2 ขึ้นไป) ใช้ค่าที่ล็อกไว้เสมอ เพื่อให้ ไม้ N = base × 2^(N-1) ถูกต้อง แม้พอร์ตลดลงจากการแพ้ติด
        if (cycleBase !== null) {
            return cycleBase;
        }
        // ถ้าเปิดโหมด Dynamic Scale (📈 ทบต้น: ON): คำนวณไม้ 1 จากยอดเงินในกระเป๋าหารผลรวม Fibonacci 26 ขั้น (514,227 หน่วย)
        const domBal = getBalance();
        const bal = (currentBalance && currentBalance > 0)
            ? (domBal && domBal > currentBalance ? domBal : currentBalance)
            : domBal;
        if (bal && bal > 0) {
            const dynamicBase = parseFloat((bal / 514227).toFixed(8));
            // ล็อกค่าเฉพาะตอนอยู่ที่ไม้ 1 เท่านั้น (กันล็อกค่าที่หดแล้วกลางรอบ)
            if (realStep === 1) cycleBase = dynamicBase;
            return dynamicBase;
        }
        return userBase;
    }

    // ปัดขึ้นตามความละเอียดของช่องยอด (≥0.01 ใช้ 4 ตำแหน่ง, น้อยกว่านั้นใช้ 8 ตำแหน่ง) เพื่อไม่ให้ยอดทบต่ำกว่าที่ต้องใช้คืนทุน
    function ceilBetUnit(x) {
        if (x >= 0.01) return Math.ceil(x * 1e4 - 1e-6) / 1e4;
        return Math.ceil(x * 1e8 - 1e-4) / 1e8;
    }

    // ลำดับเดินเงิน Fibonacci ลด 1 เหลือตัวเดียว (1, 2, 3, 5, 8, 13, 21, 34, 55, ...) × ไม้เริ่มต้น
    // แพ้ขยับขึ้น +1 ขั้น, ชนะถอยลง -2 ขั้น, ชนะติด 2 ตารีเซ็ต
    let betSeqCache = { base: null, arr: [] };
    function getBetSequence(base, steps) {
        if (betSeqCache.base !== base || betSeqCache.arr.length <= steps) {
            const b = parseFloat(base.toFixed(8));
            const arr = [0, b];
            let fPrev = 1;
            let fCurr = 2;
            for (let k = 2; k <= Math.max(steps, 2); k++) {
                const amt = ceilBetUnit(b * fCurr);
                arr.push(amt);
                const fNext = fPrev + fCurr;
                fPrev = fCurr;
                fCurr = fNext;
            }
            betSeqCache = { base: base, arr: arr };
        }
        return betSeqCache.arr;
    }

    // แปลงยอดเป็นสตริงทศนิยมล้วน ห้ามออกมาเป็นรูป 4.8e-7 (ช่องยอดของ Stake ไม่รับ)
    function formatBetAmount(x) {
        if (x >= 0.01) return x.toFixed(4);
        return x.toFixed(8).replace(/0+$/, '').replace(/\.$/, '');
    }

    function calculateCurrentBetAmount() {
        const base = calculateDynamicBaseBet();
        let step = realStep;
        if (step < 1) step = 1;

        const seq = getBetSequence(base, step);
        const amt = seq[step];
        return formatBetAmount(amt);
    }

    // ยอดเดิมพันของขั้นที่ระบุ (ใช้ตรวจ/แสดงเพดานไม้โดยไม่ต้องขยับ realStep จริง)
    function calculateBetAmountForStep(step) {
        const base = calculateDynamicBaseBet();
        const s = Math.max(1, Math.floor(step));
        return formatBetAmount(getBetSequence(base, s)[s]);
    }

    // ==================================================
    // 6.1 AUTO TUNE — ปรับไม้ 1 และเพดานไม้ให้พอดีกับทุนของแต่ละบัญชี
    // ==================================================
    // ผลรวมลำดับเดินเงิน (1, 2, 3, 5, 8, ...) ของ N ไม้ = ตัวหารทุนที่ต้องใช้จริงทั้งหมด
    function fibStepSum(steps) {
        let a = 1, b = 2, sum = 1;
        for (let k = 2; k <= steps; k++) {
            sum += b;
            const next = a + b;
            a = b;
            b = next;
        }
        return sum;
    }

    // เลือกจำนวนไม้ "มากที่สุด" ที่ยังทำให้ไม้ 1 ไม่ต่ำกว่าขั้นต่ำของเว็บ และใช้ทุนรวมไม่เกิน 65%
    function computeAutoPlan(bal) {
        if (!bal || bal <= 0) return null;
        const minBet = effectiveMinBet();
        for (let i = 0; i < AUTO_STEP_TIERS.length; i++) {
            const steps = AUTO_STEP_TIERS[i];
            const divisor = fibStepSum(steps);
            const raw = (bal * AUTO_SAFETY_RATIO) / divisor;
            if (raw >= minBet) {
                const base = Math.max(minBet, Math.floor(raw * 1e8 + 1e-6) / 1e8);
                return { steps: steps, base: base, divisor: divisor };
            }
            // ทุนไม่พอสำหรับไม้ 1 ตามสัดส่วน 65% แต่ยังพอลุยด้วยไมขั้นต่ำ: ใช้ไม้นี้เลย (ทนได้มากกว่า)
            if (minBet * divisor <= bal * 0.9) {
                return { steps: steps, base: minBet, divisor: divisor };
            }
        }
        return null; // ทุนน้อยเกินกว่าจะแทงได้แน่
    }

    function applyAutoTune(quiet) {
        if (!configAutoTune) return false;
        const bal = getBalance();
        if (bal === null || bal <= 0) return false;
        const plan = computeAutoPlan(bal);
        if (!plan) return false;
        const newBase = String(plan.base);
        const changed = plan.steps !== configMaxRealSteps || newBase !== configRealBaseBet;
        configMaxRealSteps = plan.steps;
        configRealBaseBet = newBase;
        configDynamicScale = false; // ใช้ค่าที่ AUTO คำนวณแล้ว ไม่ต้องหารซ้ำด้วยโหมดทบต้น
        cycleBase = plan.base; // ล็อกไม้ 1 ของรอบนี้ (ไม้ N = base × ลำดับ Fibonacci)
        if (changed && !quiet) {
            log(`🎛️ AUTO TUNE: ทุน ${formatNumber(bal, 4)} USDT → ไม้ 1 = ${formatBetAmount(plan.base)} | ทนแพ้ ${plan.steps} ไม้ (ใช้ทุนสูงสุด ${formatNumber(bal * AUTO_SAFETY_RATIO, 4)}$)`, true);
        }
        return true;
    }

    // ==================================================
    // 6.2 DESYNC GUARD — จับกรณีที่ยอดเงินจริงไม่ตรงกับที่ระบบคำนวณ
    // (เว็บปฏิเสธเดิมพัน / อ่านผลผิด / คำนวณ payout พลาด)
    // หลักการ: เชื่อ "ยอดจาก API" ก่อนเสมอ (แม่นระดับทศนิยม 8 ตำแหน่ง)
    // จะอ่าน DOM ก็ต่อเมื่อระบบนิ่งจริง (ไม่มีไม้ใหม่ > 700ms + ค่านั่งนิ่ง > 250ms)
    // ==================================================
    // ความคลาดเคลื่อนสูงสุดที่ "ไม้เดียว" ทำให้ยอดขยับได้ (เดิมพันทั้งก้อน หรือ กำไรเมื่อชนะ)
    function maxSingleBetSwing() {
        const chance = parseFloat(configChance) || 49;
        const mult = 99 / chance; // 49% → 2.0204 เท่า
        return Math.max(1e-8, Math.abs(lastBetAmount || 0) * mult);
    }

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
            domSettle = { val: null, at: 0 };
            log(`↔️ [RESYNC ${resyncCount}/${RESYNC_LIMIT}] ปรับยอดในระบบเป็น ${formatNumber(actualBal, 8)} (เดิม ${formatNumber(lastDesync.model, 8)}, ต่าง ${signed}) — เดาว่าจะเกิดจากผลหลุด/มีตัวอื่นแทงซ้อน`, true);
            updateStatusText(`↔️ ซิงก์ยอดใหม่ (ต่าง ${signed}) — เล่นต่อ ${resyncCount}/${RESYNC_LIMIT}`, "#ffa726");
            return;
        }
        stopSession(`🚨 DESYNC: ยอดจริงต่าง ${signed} จากที่คำนวณ ${desyncStrikes} ครั้งติด — หยุดเพื่อกันคำนวณไม้ผิด`, "#ff3344");
    }

    // ⚠️ สาเหตุเดิมของ DESYNC ปลอม: บอทแทงไม้ใหม่ทุก ~15ms แต่ยอดบนหน้าจอ (DOM/WebSocket)
    // อัปเดตช้ากว่าผลทอย 300-800ms → อ่าน DOM ทันทีหลังรู้ผลจึงได้ "ยอดก่อนหน้า"
    // แล้วส่วนต่าง = กำไร/ขาดทุนของไม้เดียวพอดี (ดูจาก log: ต่าง −0.00114334 vs กำไร 0.00114344)
    // แก้: (1) ใช้ยอดจาก API เป็นหลัก (2) อ่าน DOM เฉพาะตอนระบบนิ่งจริง ไม่ใช่กลางลูป
    function verifyBalanceSync() {
        if (!configDesyncGuard || !sessionRunning || isBetInProgress) return;
        if (currentBalance === null) return;

        // 🥇 ทางหลัก: ยอดจริงจาก API (ไม่ขึ้นกับอนิเมชัน/DOM หน่วง)
        if (lastServerBalance !== null && (Date.now() - lastServerBalanceAt) <= SERVER_BAL_TTL_MS) {
            return; // เทียบไปแล้วตอนรับผลไม้ (applyBetBalance) — ไม่ต้องเทียบซ้ำ
        }

        // 🥈 ทางสำรอง: DOM — ต้อง "นิ่ง" ทั้งเรื่องเวลาและค่า ก่อนจึงจะตัดสิน
        const now = Date.now();
        if (now - lastBetResolvedAt < DOM_SETTLE_MS) {
            domSettle = { val: null, at: 0 }; // ยังอยู่ในช่วงที่ยอดบนจอกำลังวิ่งตาม → ไม่ตัดสิน
            return;
        }
        const domBal = getBalance();
        if (domBal === null) return; // อ่านไม่ได้ = ไม่ตัดสิน (ไม่ลงโทษ)
        if (domSettle.val === null || Math.abs(domBal - domSettle.val) > 1e-8) {
            domSettle = { val: domBal, at: now }; // ค่ายังเปลี่ยน → ยังไม่นิ่ง
            return;
        }
        if (now - domSettle.at < DOM_STABLE_MS) return;

        const tol = maxSingleBetSwing(); // ยอมรับได้ถึง "ไม้เดียวเต็ม ๆ" — นี่คือความไม่แน่นอนที่ legit
        const diff = parseFloat((domBal - currentBalance).toFixed(8));
        if (Math.abs(diff) <= tol) {
            registerBalanceSync();
            lastDesync = { dom: domBal, model: currentBalance, diff: 0, tol: tol, source: "DOM" };
            return;
        }
        registerBalanceMismatch(diff, domBal, tol, "DOM");
    }

    // ==================================================
    // 6.3 BET BOUNDARY — อ่านขั้นต่ำ/สูงสุดจาก attribute ของช่องเดิมพัน
    // ==================================================
    function refreshBetLimits() {
        try {
            const inp = cachedAmountInput ||
                document.querySelector('input[data-testid="input-game-amount"]') ||
                document.querySelector('[data-testid="input-game-amount"] input') ||
                document.querySelector('input[data-analytics="input-game-amount"]');
            if (!inp) return;
            const min = parseFloat(inp.getAttribute("min"));
            const max = parseFloat(inp.getAttribute("max"));
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
    const RNG_MAX_SAMPLES = 32768;
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

    function applyBetSettings() {
        if (detectedMinBet === null) refreshBetLimits(); // อ่านขั้นต่ำ/สูงสุดจากช่องเดิมพันครั้งแรก
        const targetAmount = virtualMode ? "0" : calculateCurrentBetAmount();
        const amountOK = setInput("input-game-amount", targetAmount);
        const chanceOK = setInput("chance", configChance);
        return amountOK && chanceOK;
    }

    function resetToStepOne() {
        realStep = 1;
        cycleBase = null; // เริ่มรอบใหม่: คำนวณไม้ 1 ใหม่จากพอร์ตปัจจุบัน
        applyAutoTune(); // 🎛️ ปรับไม้ 1 + เพดานไม้ให้พอดีทุนล่าสุดก่อนเริ่มรอบ
        virtualMode = false;
        virtualRolls = 0;
        virtualWinStreak = 0;
        virtualStallCount = 0;
        recentOutcomes = [];
        // ไม่แตะ DOM ที่นี่: executeNextBet() เรียก openManualTab/applyBetSettings ก่อนแทงทุกตาอยู่แล้ว
        log(`🎯 [Dynamic ${configMaxRealSteps}-Step] รีเซ็ตกลับไปไม้ 1 (ทนแพ้ ${configMaxRealSteps} ตาติด)`);
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
            }

            if (attempts > 30) {
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

    // 🎲 CSPRNG Jitter (Web Crypto): สุ่ม micro-delay ด้วยความสุ่มแท้ Cryptographic แทนค่าคงที่ 0/15ms ซ้ำๆ
    function getCsprngDelay(minMs = 12, maxMs = 28) {
        try {
            if (window.crypto && window.crypto.getRandomValues) {
                const buf = new Uint32Array(1);
                window.crypto.getRandomValues(buf);
                return minMs + (buf[0] % (maxMs - minMs + 1));
            }
        } catch (e) {}
        return minMs;
    }

    function scheduleNextBet() {
        if (!sessionRunning || isWaitingNextRound) return;
        betTimeoutId = setTimeout(executeNextBet, getCsprngDelay(12, 28));
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
            resetToStepOne();

            applyBetSettings();

            updateStatusText(`🚀 ชนะรอบ ${completedRounds}! ลุยต่อรอบที่ ${completedRounds + 1} ทันที`, "#00e676");
            updateUI();
            betTimeoutId = setTimeout(executeNextBet, 0);
        } else {
            stopSession(`🎯 ถึงเป้ากำไร: +${formatNumber(bankedProfit)} USDT (Hit & Run สำเร็จ!)`, "#00e676");
        }
    }

    function executeNextBet() {
        if (!sessionRunning || isWaitingNextRound || isBetInProgress) return;

        // ตรวจสอบ Take Profit รวม
        const profitTargetLimit = Math.abs(parseFloat(configProfitTarget)) || 0;
        if (profitTargetLimit > 0 && profit >= (profitTargetLimit - 0.000000001)) {
            handleTakeProfitHit();
            return;
        }

        // 🛑 SESSION KILL SWITCH: ขาดทุนสุทธิถึงเพดานที่ตั้งไว้ → หยุดทั้งเซสชันทันที
        const maxLossLimit = Math.abs(parseFloat(configSessionMaxLoss)) || 0;
        if (maxLossLimit > 0 && profit <= -(maxLossLimit - 1e-9)) {
            stopSession(`🛑 ตัดขาดทุนเซสชัน: ขาดทุน ${formatNumber(Math.abs(profit), 4)}$ ถึงเพดาน ${formatNumber(maxLossLimit, 4)}$`, "#ff5252");
            return;
        }

        // 🛑 เพดานไม้ (Hard Step Cap): กันชั้นที่สอง ไม่มีทางวางเงินจริงเกินไม้ที่กำหนด
        if (realStep > configMaxRealSteps) {
            cutLossSnipes++;
            stopSession(`🛑 ถึงเพดานไม้ ${configMaxRealSteps} แล้ว — หยุดเพื่อกันพอร์ตแตก`, "#ff5252");
            return;
        }

        // 🛡️ ตรวจว่าเงินในกระเป๋าจริงตรงกับที่ระบบคำนวณไว้ (ก่อนเริ่มไม้ถัดไป)
        verifyBalanceSync();
        if (!sessionRunning) return;

        // 1. ตรวจแท็บ Manual ทุก 25 ตา (และทุกครั้งที่หาปุ่มไม่เจอ/ปุ่มไม่พร้อม ดูด้านล่าง) แทนการตรวจทุกตา
        if (totalBets % 25 === 0) openManualTab();

        // 2. ตั้งค่าตัวเลข Bet และ Chance โดยตรงทุกรอบก่อนกดเดิมพัน
        applyBetSettings();

        const betBtn = getBetButton();
        if (!betBtn) {
            openManualTab();
            updateStatusText("⚠️ รอเปิดปุ่มเดิมพัน...", "#ffa726");
            betTimeoutId = setTimeout(executeNextBet, 500);
            return;
        }

        if (!isBetButtonReady(betBtn)) {
            betRetryCount++;
            if (betRetryCount > 6) {
                openManualTab();
                betRetryCount = 0;
            }
            updateStatusText("⏳ รอเปิดปุ่มเดิมพัน...", "#ff9800");
            betTimeoutId = setTimeout(executeNextBet, 4);
            return;
        }
        betRetryCount = 0;

        const balanceBefore = getBalance();
        const currentBetAmount = virtualMode ? 0 : parseFloat(calculateCurrentBetAmount());

        // 🛑 หยุดก่อนขาดทุน "เกิน" เพดาน: ถ้าไม้ถัดไปแพ้แล้วจะทะลุเพดาน ให้ไม่วางไม้นั้นเลย
        if (maxLossLimit > 0 && currentBetAmount > 0 && (profit - currentBetAmount) < -maxLossLimit) {
            stopSession(`🛑 หยุดก่อนเกินเพดานขาดทุน: ไม้ถัดไป ${formatBetAmount(currentBetAmount)}$ จะทำให้ขาดทุน ${formatNumber(Math.abs(profit - currentBetAmount), 4)}$ เกิน ${formatNumber(maxLossLimit, 4)}$`, "#ff5252");
            return;
        }

        // 🚦 กันยอดเกินเพดานสูงสุดที่เว็บประกาศไว้ (ถ้าอ่านได้)
        if (detectedMaxBet && currentBetAmount > detectedMaxBet) {
            stopSession(`🛑 ยอดไม้ ${formatBetAmount(currentBetAmount)}$ เกินเพดานเว็บ ${formatBetAmount(detectedMaxBet)}$ — หยุดก่อนถูกปฏิเสธ`, "#ff5252");
            return;
        }

        if (!virtualMode && balanceBefore !== null && currentBetAmount > balanceBefore) {
            flashHudAlert("#ff3344");
            stopSession("🚨 เงินในกระเป๋าไม่พอไม้ถัดไป!", "#ff3344");
            return;
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
            betTimeoutId = setTimeout(executeNextBet, 3);
            return;
        }
        amountRetryCount = 0;

        isBetInProgress = true;
        updateUI();

        clickBetButton(betBtn);
        waitForBetCompletion(betBtn, balanceBefore, currentBetAmount, Date.now());
    }

    function getLatestBadgeInfo() {
        try {
            const badge = document.querySelector('[data-testid="dice-history"] button:first-child, [data-testid*="dice-history"] button:first-child, [data-testid*="past-bet"] button:first-child, [data-testid*="recent-bet"] button:first-child') ||
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

        let isRollOver = false;
        try {
            const condBtn = document.querySelector('button[data-testid="roll-condition"], button[data-testid="dice-roll-condition"], button[data-analytics="dice-roll-condition"], input[data-testid*="roll"], [data-testid*="condition"]');
            if (condBtn) {
                const txt = (condBtn.innerText || condBtn.textContent || condBtn.value || "").toLowerCase();
                const aria = (condBtn.getAttribute("aria-label") || "").toLowerCase();
                if (txt.includes("over") || txt.includes("สูง") || txt.includes("มาก") || txt.includes(">") || aria.includes("over") || aria.includes("สูง")) {
                    isRollOver = true;
                } else if (txt.includes("under") || txt.includes("ต่ำ") || txt.includes("น้อย") || txt.includes("<") || aria.includes("under") || aria.includes("ต่ำ")) {
                    isRollOver = false;
                }
            }
        } catch (e) {}

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
            virtualStallCount = 0; // มีผลลัพธ์กลับมา = ลูปยังปกติ
            onDiceRollCallback = null;
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
                const targetChance = parseFloat(configChance) || 49;
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

                // ตรวจการเปลี่ยนแปลงยอด Balance จริงในกระเป๋า (เมื่อปุ่มพร้อมและผ่านไปเกิน 120ms เพื่อให้ยอดนิ่ง)
                if (isReady && elapsed > 120 && betAmount > 0 && balanceBefore !== null) {
                    const balanceNow = getBalance();
                    if (balanceNow !== null && Math.abs(balanceNow - balanceBefore) > 0.0000000001) {
                        const delta = parseFloat((balanceNow - balanceBefore).toFixed(8));
                        finishBet(delta > 0, delta, balanceNow);
                        return;
                    }
                }

                // ตรวจสอบตัวเลขใน History Badge เปลี่ยนแปลง (เฉพาะเมื่อผ่านไปเกิน 250ms แล้วยังไม่ได้รับผลจาก Network/Balance)
                if (elapsed > 250) {
                    const currentBadge = getLatestBadgeInfo();
                    if (currentBadge && currentBadge.text && currentBadge.text !== initialBadgeText) {
                        if (typeof currentBadge.roll === 'number') trackRollValue(currentBadge.roll);
                        const targetChance = parseFloat(configChance) || 49;
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
                    // 🛡️ แทงลม (0$) ไม่ตอบสนอง: เว็บอาจปฏิเสธยอด 0 — ห้ามวนไม่จำกัด
                    if (betAmount <= 0) {
                        virtualStallCount++;
                        if (virtualStallCount >= configVirtualStallLimit) {
                            if (checkInterval) {
                                clearInterval(checkInterval);
                                checkInterval = null;
                            }
                            flashHudAlert("#ff3344");
                            stopSession(`🚨 แทงลม 0$ ไม่ตอบสนองติดกัน ${virtualStallCount} ครั้ง — เว็บอาจไม่รับยอด 0$ ระบบหยุดเพื่อกันลูปค้าง (กด START เพื่อเล่นต่อ)`, "#ff3344");
                            return;
                        }
                        updateStatusText(`⚠️ แทงลมไม่ตอบสนอง (${virtualStallCount}/${configVirtualStallLimit}) — ลองใหม่`, "#ffa726");
                    } else {
                        virtualStallCount = 0;
                    }
                    isBetInProgress = false;
                    scheduleNextBet();
                }
            }, 25);
        }, 80);
    }

    // ==================================================
    // 9. CORE REAL FIBONACCI STEP LOGIC HANDLER
    // ==================================================

    function isChopPattern(history) {
        if (!history || history.length < 4) return false;
        // ตรวจสอบ 4 ตาล่าสุดว่าสลับกันแบบ [true, false, true, false] หรือ [false, true, false, true] หรือไม่
        const len = history.length;
        const o1 = history[len - 4];
        const o2 = history[len - 3];
        const o3 = history[len - 2];
        const o4 = history[len - 1];
        return (o1 !== o2) && (o2 !== o3) && (o3 !== o4);
    }

    // กลยุทธ์ที่ A: เช็คอัตราการชนะใน 20 ตาล่าสุด (Low Winrate / Cluster Loss Detector - อิงหลักการสถิติ NIST Frequency)
    // โอกาสชนะ p ควรชนะ ~ N * p ถ้าชนะต่ำกว่า 60% ของค่าที่ควรจะเป็น (เช่น 49% ควรชนะ ~10 ตา ถ้าชนะ <= 6 ตา) แปลว่ากราฟกำลังเป็นหลุมดำดูดเงิน
    function isClusterLossPattern(history) {
        if (!history || history.length < configChopWindow) return false;
        const winsInWindow = history.slice(-configChopWindow).filter(Boolean).length;
        const targetChance = parseFloat(configChance) || 49;
        const threshold = Math.round(configChopWindow * (targetChance / 100) * 0.6); // ชนะ <= 60% ของค่าเฉลี่ยทางทฤษฎี
        return winsInWindow <= threshold;
    }

    // อัปเดตยอดในระบบจากผลไม้หนึ่งครั้ง
    // - ถ้ามียอดจาก API: ใช้เป็นความจริงที่สุด แล้วเทียบกับที่โมเดลคำนวณไว้ทันที (จับ payout เพี้ยนได้แม่น)
    // - ถ้าไม่มียอดจาก API: บวก delta ตามปกติ (แล้วรอตรวจกับ DOM ตอนระบบนิ่ง)
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
            lastServerBalance = server;
            lastServerBalanceAt = Date.now();
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
        lastBetResolvedAt = Date.now();

        // บันทึกประวัติผลการทอย (เก็บ 10 ตาล่าสุด)
        recentOutcomes.push(isWin);
        if (recentOutcomes.length > configChopWindow) recentOutcomes.shift();

        // ==========================================
        // 🛡️ ANTI-CHOP VIRTUAL MODE HANDLER
        // ==========================================
        if (virtualMode) {
            virtualRolls++;
            if (isWin) {
                virtualWinStreak++;
            } else {
                virtualWinStreak = 0;
            }

            // เงื่อนไขปลดล็อคออกจากแทงลม: ผลในลมต้อง "ชนะติดต่อกัน 2 ตา" (ยืนยันว่าหลุดฟันปลาชัวร์ 100%)
            if (virtualWinStreak >= 2) {
                virtualMode = false;
                const resumeAmt = calculateCurrentBetAmount();
                log(`🛡️ [ANTI-CHOP] หลุดสลับฟันปลาแล้ว (ชนะลมติดกัน ${virtualWinStreak} ตา หลังแทงลมไป ${virtualRolls} ตา) ➔ กลับมาวางเงินจริงที่ไม้เดิม ${realStep} (${resumeAmt} USDT)`, true);
                updateStatusText(`🛡️ หลุดฟันปลาแล้ว! ออกแทงลม ➔ ลุยเงินจริงไม้เดิม ${realStep} (${resumeAmt}$)`, "#00e676");
                virtualRolls = 0;
                virtualWinStreak = 0;
                recentOutcomes = []; // ล้างประวัติเพื่อเริ่มจับจังหวะรอบใหม่
                updateUI();
            } else {
                const pendingAmt = calculateCurrentBetAmount();
                updateStatusText(`🌬️ แทงลมหลบฟันปลาตาที่ ${virtualRolls} [รอชนะติด 2 ตา: ชนะสะสม ${virtualWinStreak}/2] (พักไม้จริง ${realStep}: ${pendingAmt}$)`, "#55e7ff");
                if (virtualRolls % 5 === 0) {
                    log(`🌬️ [VIRTUAL CHOP] กำลังแทงลมหลบฟันปลา ${virtualRolls} ตา (ไม้จริงค้างที่ไม้ ${realStep})`);
                }
            }

            applyBetSettings(); // เตรียมยอด (0 หรือยอดเงินจริงเมื่อหลุดลม)
            scheduleNextBet();
            return;
        }

        totalBets++;
        betTimestamps.push(Date.now());
        if (betTimestamps.length > 50) betTimestamps.shift();
        totalWagered = parseFloat((totalWagered + betAmount).toFixed(8));

        applyBetBalance(delta, newBalance, serverBal);
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

        if (isWin) {
            winsCount++;
            currentStreak = currentStreak > 0 ? currentStreak + 1 : 1;
        } else {
            lossesCount++;
            currentStreak = currentStreak < 0 ? currentStreak - 1 : -1;
        }

        // ==========================================
        // TRUE FIBONACCI STEP TRANSITIONS (ชนะถอย 2 ขั้นเสมอจนถึงไม้ 1 การันตีคืนทุน+กำไรทุกรอบ, แพ้ +1 ไปต่อเรื่อยๆ)
        // ==========================================
        if (isWin) {
            successfulSnipes++;
            flashHudAlert("#00e676");
            const wonStep = realStep;
            const isMilestone = wonStep > 1 || totalBets % 50 === 0;
            if (wonStep <= 3) {
                resetToStepOne(); // ถอย 2 ขั้นแล้วกลับมาถึงไม้ 1 (จบรอบการแก้ไม้ ได้กำไรสุทธิครบ 100%)
                log(`🎯 [WIN] ชนะไม้ ${wonStep}! กำไร +$${delta.toFixed(8)} | จบรอบแก้ไม้ รีเซ็ตกลับไม้ 1`, isMilestone);
                updateStatusText(`🎯 [WIN] ชนะไม้ ${wonStep}! (+${delta.toFixed(5)}$) จบรอบกลับไม้ 1`, "#00e676");
            } else {
                realStep = wonStep - 2;
                const nextAmt = calculateCurrentBetAmount();
                log(`🎯 [WIN] ชนะไม้ ${wonStep}! กำไร +$${delta.toFixed(8)} | ถอย 2 ขั้น ➔ ไม้ ${realStep} (${nextAmt} USDT)`, isMilestone);
                updateStatusText(`🎯 [WIN] ชนะไม้ ${wonStep}! (+${delta.toFixed(5)}$) ถอย 2 ➔ ไม้ ${realStep} (${nextAmt}$)`, "#00e676");
            }
        } else {
            // แพ้ -> ขยับ +1 ขั้น แต่ห้ามเกินเพดานไม้ (Hard Step Cap)
            if (realStep >= configMaxRealSteps) {
                cutLossSnipes++;
                const wouldBe = calculateBetAmountForStep(realStep + 1);
                log(`🛑 [HARD STOP] แพ้ไม้ ${realStep} ครบเพดาน ${configMaxRealSteps} ไม้ — หยุดทันที ไม่ยอมเดินไม้ ${realStep + 1} (จะเสีย ${wouldBe} USDT)`, true);
                stopSession(`🛑 [HARD STOP] แพ้ครบ ${configMaxRealSteps} ไม้ติด! หยุดตามแผนกันพอร์ตแตก (ไม้ ${realStep + 1} จะเสีย ${wouldBe}$)`, "#ff5252");
                return;
            }
            realStep++;
            const nextAmt = calculateCurrentBetAmount(); // ยอดจริงถูกใส่ใน executeNextBet() ผ่าน applyBetSettings()
            log(`⚠️ [STEP] ไม้ ${realStep - 1} พลาด! ขยับ +1 ➔ ไม้ ${realStep} (${nextAmt} USDT)`, true);
            updateStatusText(`⚠️ [LOSS] พลาดไม้ ${realStep - 1}! ขยับ +1 ➔ ไม้ ${realStep} (${nextAmt}$)`, "#ffa726");
        }

        updateUI();

        // ==========================================
        // 🛡️ ANTI-CHOP & CLUSTER LOSS DETECTOR
        // ==========================================
        if (configVirtualBetEnabled && !virtualMode && realStep >= configAntiChopMinStep && recentOutcomes.length >= configChopWindow) {
            const hasChop = isChopPattern(recentOutcomes);
            const hasClusterLoss = isClusterLossPattern(recentOutcomes);

            if (hasChop || hasClusterLoss) {
                virtualMode = true;
                virtualRolls = 0;
                virtualWinStreak = 0;
                flashHudAlert("#55e7ff");
                const curChance = parseFloat(configChance) || 49;
                const clusterThreshold = Math.round(configChopWindow * (curChance / 100) * 0.6);
                const reason = hasChop ? "สลับฟันปลา" : `แพ้กระจุกตัว (${configChopWindow} ตาล่าสุดชนะ ≤ ${clusterThreshold} ตา จากทฤษฎี ${Math.round(configChopWindow * curChance / 100)})`;
                log(`🛡️ [DEFENSE TRIGGER] ตรวจพบ${reason}ที่ไม้สูง (${realStep}) ➔ ตัดเข้าโหมดแทงลม (ยอด 0$) ทันทีเพื่อล็อกเงินทุน!`, true);
                updateStatusText(`🛡️ เจอ${reason}ที่ไม้ ${realStep}! ตัดเข้าแทงลมล็อกทุน ➔ รอชนะติด 2 ตา`, "#55e7ff");
                applyBetSettings();
                scheduleNextBet();
                return;
            }
        }

        // Take-Profit Circuit Breaker
        const profitTargetLimit = Math.abs(parseFloat(configProfitTarget)) || 0;
        if (profitTargetLimit > 0 && profit >= (profitTargetLimit - 0.000000001)) {
            handleTakeProfitHit();
            return;
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
                gears = gears.slice(0, 3);
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
        lastBetResolvedAt = 0;
        lastServerBalance = null;
        lastServerBalanceAt = 0;
        domSettle = { val: null, at: 0 };

        resetToStepOne();

        ensureManualTab();
        applyBetSettings();

        sessionRunning = true;
        isWaitingNextRound = false;
        isBetInProgress = false;

        enableAudioKeepAlive();
        requestScreenWakeLock();

        const baseAmt = calculateDynamicBaseBet();
        const modeDesc = configAutoTune
            ? `🎛️ AUTO TUNE (คำนวณจากทุนเอง | ใช้สูงสุด ${formatNumber(bal * AUTO_SAFETY_RATIO, 2)}$)`
            : (configDynamicScale ? "📈 ทบต้น: ON (Balance ÷ 514,227)" : "🔒 ทบต้น: OFF (ล็อกไม้คงที่ เซฟกำไร)");
        log(`🚀 เริ่มต้นเซสชัน ${configMaxRealSteps}-Step: ทุน ${formatNumber(bal, 4)} USDT | ไม้ 1: ${baseAmt}$ | โหมด: ${modeDesc}`, true);
        updateStatusText(`🚀 สตาร์ท ${configMaxRealSteps}-Step เรียบร้อย! (${configDynamicScale ? "ทบต้น ON" : "ล็อกไม้ OFF"})`, "#00e676");
        updateUI();

        ensureInstantBet().then((msg) => {
            updateStatusText(`⚡ ${msg}`, "#ffea00");
        }).finally(() => {
            if (sessionRunning && !betTimeoutId) betTimeoutId = setTimeout(executeNextBet, 150);
        });
    }

    function stopSession(reason, statusColor = "#b1bad3") {
        sessionRunning = false;
        isWaitingNextRound = false;
        isBetInProgress = false;
        clearTimers();

        if (screenWakeLock) {
            try { screenWakeLock.release(); } catch (e) {}
            screenWakeLock = null;
        }

        log("🛑 หยุดการทำงาน: " + (reason || "คำสั่งผู้ใช้"));
        updateStatusText(reason || "หยุดเซสชันแล้ว", statusColor);
        updateUI();
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
        const activeBase = configDynamicScale ? formatBetAmount(calculateDynamicBaseBet()) : configRealBaseBet;
        if (hudEls.inRealBase && activeEl !== hudEls.inRealBase) hudEls.inRealBase.value = activeBase;
        if (hudEls.inTarget && activeEl !== hudEls.inTarget) hudEls.inTarget.value = configProfitTarget;
        if (hudEls.inChance && activeEl !== hudEls.inChance) hudEls.inChance.value = configChance;
        if (hudEls.inMaxLoss && activeEl !== hudEls.inMaxLoss) hudEls.inMaxLoss.value = String(configSessionMaxLoss);
    }

    function updateUI() {
        if (!shadowRootRef) return;
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
            autoBtn, autoTuneBtn, titleStep, paramStep, safetyStep, safetyStop, resyncBtn,
            inMaxLoss,
            dynamicBtn, cycleBtn, ecoBtn, ecoBadge, modeBadge, nextBetEl,
            startBalEl, currBalEl, profitEl, streakEl, winrateEl, theoryEl, rngEl,
            snipesCountEl, startBtn, stopBtn, antiSleepBadge,
            miniStep, miniProfit, miniStartBtn, miniStopBtn, inRealBase
        } = hudEls;

        if (inRealBase && shadowRootRef.activeElement !== inRealBase) {
            const activeBase = configDynamicScale ? formatBetAmount(calculateDynamicBaseBet()) : configRealBaseBet;
            if (inRealBase.value !== activeBase) inRealBase.value = activeBase;
        }

        if (inMaxLoss && shadowRootRef.activeElement !== inMaxLoss) {
            const lossText = String(configSessionMaxLoss);
            if (inMaxLoss.value !== lossText) inMaxLoss.value = lossText;
        }

        if (antiSleepBadge) {
            if (sessionRunning) {
                setSafeText(antiSleepBadge, "ACTIVE");
                setSafeStyle(antiSleepBadge, "color", "#00e676");
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

        if (autoTuneBtn) {
            setSafeText(autoTuneBtn, configAutoTune ? "🎛️ AUTO: ON" : "🎛️ AUTO: OFF");
            setSafeStyle(autoTuneBtn, "color", configAutoTune ? "#55e7ff" : "#7f8b9b");
            setSafeStyle(autoTuneBtn, "borderColor", configAutoTune ? "#55e7ff" : "#2f4553");
        }

        if (titleStep) setSafeText(titleStep, `🎯 DYNAMIC ${configMaxRealSteps}-STEP`);
        if (paramStep) setSafeText(paramStep, `⚙️ พารามิเตอร์ Dynamic ${configMaxRealSteps}-Step:`);
        if (safetyStep) setSafeText(safetyStep, String(configMaxRealSteps));
        if (safetyStop) setSafeText(safetyStop, String(configMaxRealSteps));

        if (resyncBtn) {
            setSafeText(resyncBtn, configAutoResync
                ? `↔️ AUTO-RESYNC: ON (${resyncCount}/${RESYNC_LIMIT})`
                : "↔️ AUTO-RESYNC: OFF (หยุดเมื่อยอดเพี้ยน)");
            setSafeStyle(resyncBtn, "color", configAutoResync ? "#00e676" : "#ffa726");
            setSafeStyle(resyncBtn, "borderColor", configAutoResync ? "#00e676" : "#ffa726");
        }

        if (dynamicBtn) {
            setSafeText(dynamicBtn, configDynamicScale ? "📈 ทบต้น: ON" : "🔒 ทบต้น: OFF");
            setSafeStyle(dynamicBtn, "color", configDynamicScale ? "#00e676" : "#7f8b9b");
            setSafeStyle(dynamicBtn, "borderColor", configDynamicScale ? "#00e676" : "#2f4553");
        }

        if (cycleBtn) {
            setSafeText(cycleBtn, autoCycleRounds ? "🔁 ลูปรอบ: ON" : "⏹️ ลูป: OFF");
            setSafeStyle(cycleBtn, "color", autoCycleRounds ? "#ffea00" : "#7f8b9b");
            setSafeStyle(cycleBtn, "borderColor", autoCycleRounds ? "#ffea00" : "#2f4553");
        }

        const amt = calculateCurrentBetAmount();
        const displayAmt = virtualMode ? `0.00000000 (ลม) [ไม้จริง ${realStep}: ${amt}]` : `${amt} USDT`;

        if (modeBadge) {
            if (virtualMode) {
                setSafeText(modeBadge, `🌬️ แทงลมหลบฟันปลา (รอชนะ 2 ตา) [พักไม้ ${realStep}]`);
                setSafeStyle(modeBadge, "background", "#0d3b66");
                setSafeStyle(modeBadge, "color", "#55e7ff");
            } else {
                setSafeText(modeBadge, `🎯 ไม้ปัจจุบัน: ${realStep} (${amt}$)`);
                setSafeStyle(modeBadge, "background", "#013e00");
                setSafeStyle(modeBadge, "color", "#00e676");
            }
        }

        if (nextBetEl) {
            setSafeText(nextBetEl, displayAmt);
            setSafeStyle(nextBetEl, "color", virtualMode ? "#55e7ff" : "#00e676");
        }

        if (miniStep) {
            setSafeText(miniStep, virtualMode ? `ลม (พักไม้ ${realStep})` : `ไม้ ${realStep} (${amt}$)`);
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
            setSafeStyle(hudEls.survivalProbEl, "color", realStep >= 12 ? "#ff5252" : (realStep >= 6 ? "#ffa726" : "#00e676"));
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
            const targetChance = parseFloat(configChance) || 49;
            const lossProb = Math.max(0.01, (100 - targetChance) / 100);
            const capProb = Math.pow(lossProb, configMaxRealSteps);
            const capOneIn = capProb > 0 ? Math.round(1 / capProb) : 0;
            const limitText = detectedMinBet !== null || detectedMaxBet !== null
                ? ` | เว็บ: ขั้นต่ำ ${formatBetAmount(detectedMinBet || AUTO_MIN_BET)}$${detectedMaxBet ? " สูงสุด " + formatBetAmount(detectedMaxBet) + "$" : ""}`
                : ` | ขั้นต่ำ ${formatBetAmount(AUTO_MIN_BET)}$ (default)`;
            // ถ้ามี strike ค้างอยู่ ให้แปรผลต่างลงบรรทัดนี้ด้วย (สถานะอาจถูกข้อความอื่นทับไปแล้ว)
            const desyncText = desyncStrikes > 0 && lastDesync.dom !== null
                ? ` | ⚠️ ยอดจริง ${formatNumber(lastDesync.dom, 6)} vs คำนวณ ${formatNumber(lastDesync.model, 6)} (ต่าง ${(lastDesync.diff >= 0 ? "+" : "−") + formatNumber(Math.abs(lastDesync.diff), 6)}) [${lastDesync.source || "?"}]`
                : "";
            setSafeText(theoryEl,
                `📊 จริง ${realWr.toFixed(1)}% vs ทฤษฎี ${targetChance.toFixed(0)}% | EV คาด ${expectedEv <= 0 ? "−" : "+"}${formatNumber(Math.abs(expectedEv), 6)} (วาง ${formatNumber(totalWagered, 5)}$) | แพ้ติด ${configMaxRealSteps} ไม้ = 1/${capOneIn.toLocaleString()}${limitText}${desyncText}`);
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
                <div style="display:flex; align-items:center; gap:6px;">
                    <span id="sniperTitleStep" style="font-weight:bold; font-size:13px; color:#00e676;">🎯 DYNAMIC ${configMaxRealSteps}-STEP</span>
                    <span style="font-size:9px; color:#7f8b9b;" title="รุ่นของโค้ด — ใช้ตรวจว่าติดตั้งไฟล์ล่าสุดหรือยัง">v2.5</span>
                    <button id="sniperMinimizeBtn" style="background:#0f1923; border:1px solid #2f4553; border-radius:4px; color:#00e676; font-size:10px; padding:1px 5px; cursor:pointer;" title="ย่อ/ขยายหน้าจอเพื่อประหยัดพลังงาน">🔽</button>
                    <button id="sniperReloadBtn" style="background:#0f1923; border:1px solid #2f4553; border-radius:4px; color:#55e7ff; font-size:10px; padding:1px 5px; cursor:pointer;" title="🔄 รีเฟรชหน้าเว็บ (F5) ทันทีเพื่อล้างแคชและรีเซ็ตหน่วยความจำ">🔄</button>
                </div>
                <div style="display:flex; gap:4px; align-items:center;">
                    <span id="sniperEcoBadge" style="font-size:9px; background:#013e00; border:1px solid #00e676; padding:1px 5px; border-radius:4px; color:#00e676; font-weight:bold;">🌱 ECO</span>
                    <span id="sniperAntiSleep" style="font-size:9px; background:#0f1923; padding:1px 5px; border-radius:4px; color:#7f8b9b; font-weight:bold;">IDLE</span>
                </div>
            </div>

            <!-- COMPACT MINI BAR (แสดงเมื่อกดย่อหน้าต่างเพื่อประหยัดพลังงานจอ) -->
            <div id="sniperMiniBar" style="display:none; align-items:center; justify-content:space-between; font-size:11px; margin-top:2px;">
                <div>
                    <span id="sniperMiniStep" style="font-weight:bold; color:#00e676;">ไม้ 1 (0.001$)</span>
                    <span id="sniperMiniProfit" style="margin-left:8px; font-weight:bold; color:#00e676;">+0.0000$</span>
                </div>
                <div style="display:flex; gap:4px;">
                    <button id="sniperMiniReloadBtn" style="background:#0f1923; border:1px solid #2f4553; border-radius:4px; color:#55e7ff; font-size:10px; padding:2px 5px; cursor:pointer;" title="🔄 รีเฟรชหน้าเว็บ">🔄</button>
                    <button id="sniperMiniStartBtn" style="background:#00e701; color:#013e00; border:none; padding:3px 8px; border-radius:4px; font-weight:bold; font-size:10px; cursor:pointer;">START</button>
                    <button id="sniperMiniStopBtn" style="background:#ed4245; color:#fff; border:none; padding:3px 8px; border-radius:4px; font-weight:bold; font-size:10px; cursor:pointer;">STOP</button>
                </div>
            </div>

            <div id="sniperPanelBody">
                <!-- TOGGLE BUTTONS (4 ปุ่ม) -->
                <div style="display:grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap:3px; margin-bottom:8px;">
                    <button id="sniperAutoBtn" style="background:#0f1923; border:1px solid #00e676; border-radius:4px; padding:4px 1px; font-size:9px; font-weight:bold; color:#00e676; cursor:pointer;" title="เริ่มอัตโนมัติ">
                        🚀 AUTO: ON
                    </button>
                    <button id="sniperDynamicBtn" style="background:#0f1923; border:1px solid #00e676; border-radius:4px; padding:4px 1px; font-size:9px; font-weight:bold; color:#00e676; cursor:pointer;" title="เปิด/ปิดโหมดทบต้นตามขนาดพอร์ต (ค่าเริ่มต้น: เปิด หาร 514,227 ทนแพ้ 26 ไม้)">
                        📈 ทบต้น: ON
                    </button>
                    <button id="sniperCycleBtn" style="background:#0f1923; border:1px solid #ffea00; border-radius:4px; padding:4px 1px; font-size:9px; font-weight:bold; color:#ffea00; cursor:pointer;" title="ลูปรอบ">
                        🔁 ลูป: ON
                    </button>
                    <button id="sniperEcoBtn" style="background:#0f1923; border:1px solid #00e676; border-radius:4px; padding:4px 1px; font-size:9px; font-weight:bold; color:#00e676; cursor:pointer;" title="เปิด/ปิดโหมดประหยัดพลังงาน (ปิดกราฟิก 3D/ลดการเรนเดอร์)">
                        🌱 ECO: ON
                    </button>
                </div>

                <button id="sniperResyncBtn" style="width:100%; background:#0f1923; border:1px dashed #ffa726; border-radius:4px; padding:3px; font-size:9px; font-weight:bold; color:#ffa726; cursor:pointer; margin-bottom:8px;" title="เปิด = เมื่อยอดจริงเพี้ยน 3 ครั้งติด ระบบจะยอมรับยอดจริงบนหน้าจอเป็นยอดใหม่แล้วเล่นต่อ (จำกัด 5 ครั้ง/เซสชัน) แทนการหยุดทันที">↔️ AUTO-RESYNC: OFF</button>

                <!-- DYNAMIC FIBONACCI STEP PARAMETERS -->
                <div style="background:#0f1923; border:1px solid #243442; border-radius:8px; padding:8px; margin-bottom:8px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                        <span id="sniperParamStep" style="color:#00e676; font-size:11px; font-weight:bold;">⚙️ พารามิเตอร์ Dynamic ${configMaxRealSteps}-Step:</span>
                        <button id="sniperAutoTuneBtn" style="background:#1a242d; border:1px solid #55e7ff; border-radius:4px; padding:2px 6px; font-size:10px; font-weight:bold; color:#55e7ff; cursor:pointer;" title="คำนวณไม้ 1 และเพดานไม้จากยอดเงินในกระเป๋าเองทุกครั้งที่ขึ้นรอบใหม่">
                            🎛️ AUTO: ON
                        </button>
                        <button id="sniperResetBtn" style="background:#1a242d; border:1px solid #00e676; border-radius:4px; padding:2px 6px; font-size:10px; font-weight:bold; color:#00e676; cursor:pointer;" title="รีเซ็ตเป็นค่ามาตรฐาน (ไม้ 1 เริ่ม 0.00029$ ทน 22 ไม้)">
                            ✨ รีเซ็ตค่า
                        </button>
                    </div>
                    <div style="display:grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap:6px;">
                        <div>
                            <div style="color:#8596a5; font-size:10px; margin-bottom:2px;">ไม้จริงเริ่ม ($):</div>
                            <input id="sniperInRealBase" type="text" value="${configRealBaseBet}" style="width:100%; background:#1a242d; border:1px solid #2f4553; border-radius:4px; color:#fff; font-size:11px; padding:3px 4px; box-sizing:border-box; outline:none; font-family:inherit;">
                        </div>
                        <div>
                            <div style="color:#ffea00; font-size:10px; margin-bottom:2px;">เป้ากำไร ($):</div>
                            <input id="sniperInTarget" type="text" value="${configProfitTarget}" style="width:100%; background:#1a242d; border:1px solid #ffea00; border-radius:4px; color:#ffea00; font-size:11px; padding:3px 4px; box-sizing:border-box; outline:none; font-family:inherit;">
                        </div>
                        <div>
                            <div style="color:#55e7ff; font-size:10px; margin-bottom:2px;">โอกาสชนะ (%):</div>
                            <input id="sniperInChance" type="text" value="${configChance}" style="width:100%; background:#1a242d; border:1px solid #2f4553; border-radius:4px; color:#55e7ff; font-size:11px; padding:3px 4px; box-sizing:border-box; outline:none; font-family:inherit;">
                        </div>
                        <div>
                            <div style="color:#ff8a80; font-size:10px; margin-bottom:2px;" title="ขาดทุนสุทธิถึงจำนวนนี้แล้วหยุดทั้งเซสชัน (0 = ปิด)">ตัดขาดทุน ($):</div>
                            <input id="sniperInMaxLoss" type="text" value="${configSessionMaxLoss}" style="width:100%; background:#1a242d; border:1px solid #ff8a80; border-radius:4px; color:#ff8a80; font-size:11px; padding:3px 4px; box-sizing:border-box; outline:none; font-family:inherit;">
                        </div>
                    </div>
                </div>

                <!-- SAFETY BADGE -->
                <div style="background:#0f1923; border:1px solid #00e676; border-radius:6px; padding:5px 6px; font-size:10px; font-weight:bold; color:#00e676; margin-bottom:8px; text-align:center;">
                    🛡️ Fibonacci <span id="sniperSafetyStep">${configMaxRealSteps}</span>-Step • ชนะถอย 2 / แพ้ +1 • HARD STOP ไม้ <span id="sniperSafetyStop">${configMaxRealSteps}</span> • ECO
                </div>

                <div style="margin-bottom:8px; min-height:20px;">
                    <span style="color:#b1bad3; font-size:11px;">สถานะ:</span>
                    <span id="sniperStatusText" style="font-weight:bold; color:#b1bad3; margin-left:4px; font-size:11px;">พร้อมเริ่มงาน</span>
                </div>

                <!-- REAL-TIME STATUS BOX -->
                <div style="background:#0f1923; border:1px solid #243442; border-radius:8px; padding:8px; margin-bottom:8px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                        <span style="color:#b1bad3; font-size:11px;">สถานะโหมด:</span>
                        <span id="sniperModeBadge" style="font-size:10px; font-weight:bold; background:#013e00; padding:2px 6px; border-radius:4px; color:#00e676;">🎯 ไม้ปัจจุบัน: 1 (0.001$)</span>
                    </div>
                    <div style="display:flex; justify-content:space-between; font-size:12px; margin-top:2px;">
                        <span style="color:#b1bad3;">ไม้ถัดไป:</span>
                        <span id="sniperNextBet" style="font-weight:bold; color:#00e676;">0.001 USDT</span>
                    </div>
                    <div style="display:flex; justify-content:space-between; font-size:11px; margin-top:4px; border-top:1px dashed #243442; padding-top:4px;">
                        <span style="color:#00e676; font-weight:bold;" id="sniperStatsCount">🎯 ยิงเข้าเป้า: 0</span>
                    </div>
                </div>

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
            miniReloadBtn: shadow.getElementById("sniperMiniReloadBtn"),
            ecoBadge: shadow.getElementById("sniperEcoBadge"),
            ecoBtn: shadow.getElementById("sniperEcoBtn"),
            resyncBtn: shadow.getElementById("sniperResyncBtn"),
            panelBody: shadow.getElementById("sniperPanelBody"),
            miniBar: shadow.getElementById("sniperMiniBar"),
            miniStep: shadow.getElementById("sniperMiniStep"),
            miniProfit: shadow.getElementById("sniperMiniProfit"),
            miniStartBtn: shadow.getElementById("sniperMiniStartBtn"),
            miniStopBtn: shadow.getElementById("sniperMiniStopBtn"),
            antiSleepBadge: shadow.getElementById("sniperAntiSleep"),
            autoBtn: shadow.getElementById("sniperAutoBtn"),
            dynamicBtn: shadow.getElementById("sniperDynamicBtn"),
            autoTuneBtn: shadow.getElementById("sniperAutoTuneBtn"),
            titleStep: shadow.getElementById("sniperTitleStep"),
            paramStep: shadow.getElementById("sniperParamStep"),
            safetyStep: shadow.getElementById("sniperSafetyStep"),
            safetyStop: shadow.getElementById("sniperSafetyStop"),
            cycleBtn: shadow.getElementById("sniperCycleBtn"),
            resetBtn: shadow.getElementById("sniperResetBtn"),
            inRealBase: shadow.getElementById("sniperInRealBase"),
            inTarget: shadow.getElementById("sniperInTarget"),
            inChance: shadow.getElementById("sniperInChance"),
            inMaxLoss: shadow.getElementById("sniperInMaxLoss"),
            statusText: shadow.getElementById("sniperStatusText"),
            modeBadge: shadow.getElementById("sniperModeBadge"),
            nextBetEl: shadow.getElementById("sniperNextBet"),
            snipesCountEl: shadow.getElementById("sniperStatsCount"),
            streakEl: shadow.getElementById("sniperStreak"),
            theoryEl: shadow.getElementById("sniperTheory"),
            rngEl: shadow.getElementById("sniperRng"),
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
        hudEls.reloadBtn.addEventListener("click", () => {
            log("🔄 ผู้ใช้สั่งรีเฟรชหน้าเว็บ (Reloading page)...", true);
            window.location.reload();
        });
        hudEls.miniReloadBtn.addEventListener("click", () => {
            log("🔄 ผู้ใช้สั่งรีเฟรชหน้าเว็บ (Reloading page)...", true);
            window.location.reload();
        });
        hudEls.ecoBtn.addEventListener("click", () => {
            toggleEcoMode();
        });
        hudEls.resyncBtn.addEventListener("click", () => {
            configAutoResync = !configAutoResync;
            if (!configAutoResync) resyncCount = 0;
            log(configAutoResync
                ? `↔️ AUTO-RESYNC เปิด: ยอดเพี้ยนติด 3 ครั้ง → ยอมรับยอดจริงแล้วเล่นต่อ (สูงสุด ${RESYNC_LIMIT} ครั้ง/เซสชัน)`
                : "↔️ AUTO-RESYNC ปิด: ยอดเพี้ยนติด 3 ครั้ง → หยุดเซสชัน", true);
            updateUI();
        });
        hudEls.autoBtn.addEventListener("click", () => {
            toggleAutoStart();
        });
        hudEls.autoTuneBtn.addEventListener("click", () => {
            configAutoTune = !configAutoTune;
            if (configAutoTune) {
                applyAutoTune();
            } else {
                cycleBase = null;
            }
            syncHUDInputs();
            applyBetSettings();
            updateUI();
            log(configAutoTune ? "🎛️ AUTO TUNE: ON — คำนวณไม้ 1 + เพดานไม้จากทุนเองทุกครั้งที่ขึ้นรอบใหม่" : "🔒 AUTO TUNE: OFF — ใช้ไม้ 1 และเพดานไม้ที่ตั้งไว้เอง", true);
        });
        hudEls.dynamicBtn.addEventListener("click", () => {
            configDynamicScale = !configDynamicScale;
            if (configDynamicScale) configAutoTune = false; // สองโหมดคุมไม้ 1 พร้อมกันไม่ได้
            cycleBase = null;
            applyBetSettings();
            updateUI();
            const currentBase = calculateDynamicBaseBet();
            log(configDynamicScale ? `📈 เปิดโหมด Dynamic: คำนวณไม้ 1 จากพอร์ต ÷ 514,227 (${currentBase} USDT)` : `🔒 ปิดโหมด Dynamic: ล็อกไม้ 1 คงที่ (${currentBase} USDT) เพื่อเซฟกำไรสะสม`, true);
        });
        hudEls.cycleBtn.addEventListener("click", () => {
            autoCycleRounds = !autoCycleRounds;
            updateUI();
        });
        hudEls.resetBtn.addEventListener("click", () => {
            configRealBaseBet = "0.00029";
            configProfitTarget = 1.0;
            configChance = "49";
            configDynamicScale = false;
            resetToStepOne();
            syncHUDInputs();
            applyBetSettings();
            updateUI();
            log("✨ รีเซ็ตพารามิเตอร์เรียบร้อย", true);
        });

        // อัปเดตค่าในหน่วยความจำทันทีที่พิมพ์ (In-Memory Only ไร้ร่องรอยใน Storage)
        const onBaseInput = (e) => {
            const val = parseFloat(e.target.value);
            if (val > 0) {
                configRealBaseBet = (val >= 0.01) ? val.toFixed(2) : String(val);
                configDynamicScale = false;
                cycleBase = null;
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

        const onMaxLossInput = (e) => {
            const val = parseFloat(e.target.value);
            configSessionMaxLoss = (Number.isFinite(val) && val > 0) ? val : 0;
            updateUI();
        };
        hudEls.inMaxLoss.addEventListener("input", onMaxLossInput);
        hudEls.inMaxLoss.addEventListener("change", onMaxLossInput);

        // Draggable
        makeDraggable(shadow.getElementById("sniperDragHeader"), wrapper);

        updateUI();
    }

    function toggleEcoMode() {
        configEcoMode = !configEcoMode;
        applyEcoStyles(configEcoMode);
        updateUI();
        log(configEcoMode ? "🌱 เปิดโหมด ECO: ปิดกราฟิก 3D และลดภาระ CPU/GPU สำเร็จ" : "🌿 ปิดโหมด ECO: เปิดการแสดงผลกราฟิกปกติ", true);
    }

    function toggleMinimizePanel() {
        isPanelMinimized = !isPanelMinimized;
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
