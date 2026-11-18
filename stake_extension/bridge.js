// stake_extension/bridge.js — ISOLATED world v3.0.0
// รับสถิติจาก MAIN world (content.js) ผ่าน window.postMessage แล้วรวมเป็นชุดก่อนเขียนลง chrome.storage.local
// (ทุก 5 วินาที หรือครบ 30 รายการ) ลดภาระ I/O และกัน race condition
(function () {
    'use strict';

    if (window.__sdBridgeLoaded) return;
    window.__sdBridgeLoaded = true;

    const STATS_KEY = 'stake_stats_v1';
    const FLUSH_MS = 5000;
    const FLUSH_COUNT = 30;

    let queue = [];
    let flushTimer = null;

    function flush() {
        if (!queue.length) return;
        const batch = queue.splice(0, queue.length);
        try {
            chrome.storage.local.get([STATS_KEY], (cur) => {
                const prev = (cur && cur[STATS_KEY]) || { bets: 0, wins: 0, losses: 0, sessions: [] };
                for (const r of batch) {
                    prev.bets += 1;
                    if (r.profit > 0) prev.wins += 1; else prev.losses += 1;
                }
                prev.sessions = (prev.sessions || []).concat(batch.filter((r) => r.type === 'session')).slice(-50);
                prev.updatedAt = Date.now();
                chrome.storage.local.set({ [STATS_KEY]: prev });
            });
        } catch (e) {
            // extension context invalidated — ปล่อยผ่าน (ไม่ให้ล้มทั้งหน้า)
        }
        scheduleFlush();
    }

    function scheduleFlush() {
        if (flushTimer) return;
        flushTimer = setTimeout(() => { flushTimer = null; flush(); }, FLUSH_MS);
    }

    window.addEventListener('message', (ev) => {
        if (ev.source !== window) return;
        const d = ev.data;
        if (!d) return;

        // 🗑️ ล้างสถิติ/ประวัติเก่าที่เก็บไว้ใน chrome.storage.local
        if (d.type === 'CLEAR_STATS') {
            queue = [];
            try {
                chrome.storage.local.remove(STATS_KEY);
            } catch (e) { /* extension context invalidated */ }
            return;
        }

        // 💾 เขียนไฟล์ diagnostics ลงเครื่อง (Downloads) ผ่าน background
        if (d.type === 'SAVE_DIAG') {
            try {
                chrome.runtime.sendMessage({ type: 'SAVE_DIAG', text: d.text, filename: d.filename });
            } catch (e) { /* ข้าม */ }
            return;
        }

        // 🧹 เริ่มเซสชันใหม่ → ให้ background ปิดแท็บ Stake เก่าที่จบเซสชันแลัว (STAKE_DONE)
        if (d.type === 'CLOSE_STALE_TABS') {
            try {
                chrome.runtime.sendMessage({ type: 'CLOSE_STALE_TABS' });
            } catch (e) { /* ข้าม */ }
            return;
        }

        // รับคำสั่งปิดแท็บจาก content.js (รองรับทุกรูปแบบ)
        if (d.type === 'CLOSE_SESSION_TAB' || d.type === 'STAKE_BOT_CLOSE_SESSION') {
            try {
                chrome.runtime.sendMessage({ type: 'CLOSE_SESSION_TAB' });
            } catch (e) { /* ข้าม */ }
            return;
        }

        if (d.__stake_bot !== true) return;

        queue.push({ type: d.type || 'bet', profit: Number(d.profit) || 0, at: Date.now() });
        if (queue.length >= FLUSH_COUNT) flush(); else scheduleFlush();
    });

    window.addEventListener('pagehide', flush);
})();
