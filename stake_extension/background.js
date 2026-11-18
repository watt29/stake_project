// stake_extension/background.js — service worker v3.0.0
// MV3: listener ต้องลงทะเบียนที่ top-level แบบ synchronous
// รับ CLOSE_SESSION_TAB จาก bridge แล้วหน่วง >= 500ms ก่อนปิดแท็บ (ให้ title STAKE_DONE ถูกอ่านทัน)

const CLOSE_DELAY_MS = 500;

// ==========================================================
// 🧹 TAB SWEEPER — เก็บกวาดแท็บ Stake ที่ค้างอยู่
// หลักการ: ปิด "เฉพาะแท็บที่หยุดแล้ว" และไม่แตะแท็บที่กำลังแทง
//   1) title STAKE_DONE / STAKE_IDLE        = จบเซสชันแน่นอน → ปิด
//   2) window.__stakeBotState.running=true  = กำลังแทง → ข้าม
//   3) running=false (build 188+)          = หยุดแล้ว → ปิด
//   4) ไม่มีธง (build เก่า)                 = เฝ้า title 12 วิ ถ้านิ่งสนิทจึงปิด
// ==========================================================
const STAKE_URL_PATTERNS = [
    '*://*.stake.com/*', '*://*.stake.bet/*', '*://*.stake.games/*',
    '*://*.stake.bz/*', '*://*.stake.ceo/*', '*://*.stake.mba/*'
];
const STALE_SAMPLE_MS = 12000;

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function closeTab(tabId) {
    return chrome.tabs.remove(tabId).catch(() => { /* แท็บถูกปิดไปแล้ว */ });
}

// อ่านธงจากหน้าเว็บ: true = กำลังแทง, false = หยุดแล้ว, null = อ่านไม่ได้/build เก่า
async function readBotRunning(tabId) {
    try {
        const out = await chrome.scripting.executeScript({
            target: { tabId: tabId },
            world: 'MAIN',
            func: () => (window.__stakeBotState ? !!window.__stakeBotState.running : null)
        });
        const v = out && out[0] ? out[0].result : null;
        return (v === true || v === false) ? v : null;
    } catch (e) {
        return null; // แท็บปิดไปแล้ว / ยังโหลดไม่เสร็จ
    }
}

async function sweepStaleTabs(selfTabId) {
    let tabs = [];
    try { tabs = await chrome.tabs.query({ url: STAKE_URL_PATTERNS }); } catch (e) { return { ok: false, closed: 0 }; }

    const closed = [];
    const pending = [];  // build เก่า: ไม่มีธง → ต้องเฝ้า title ก่อน

    for (const t of tabs) {
        if (!t || t.id === selfTabId) continue;
        const title = String(t.title || '');

        if (/^(STAKE_DONE|STAKE_IDLE)/.test(title)) { await closeTab(t.id); closed.push(t.id); continue; }
        if (!/^STAKE_RUN/.test(title)) continue;      // ไม่ใช่แท็บที่บอทเคยทำงาน

        const running = await readBotRunning(t.id);
        if (running === true) continue;               // 🛡️ กำลังแทง → ห้ามแตะ
        if (running === false) { await closeTab(t.id); closed.push(t.id); continue; }
        pending.push({ id: t.id, title: title });
    }

    if (pending.length) {
        await sleep(STALE_SAMPLE_MS);
        for (const c of pending) {
            let t = null;
            try { t = await chrome.tabs.get(c.id); } catch (e) { continue; }       // แท็บถูกปิดไปแล้ว
            if (String(t.title || '') !== c.title) continue;                       // title ขยับ = ยังทำงาน
            if ((await readBotRunning(c.id)) === true) continue;
            await closeTab(c.id);
            closed.push(c.id);
        }
    }

    return { ok: true, closed: closed.length, ids: closed };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    // 💾 เซฟ log อัตโนมัติลงโฟลเดอร์ logs/ (ไม่เกะกะ root ไดรฟ์)
    if (msg && msg.type === 'SAVE_DIAG') {
        try {
            const text = String(msg.text || '');
            if (!text) { sendResponse({ ok: false }); return; }
            const rawFilename = String(msg.filename || ('stake_diag_' + Date.now() + '.json')).replace(/^[/\\]+/, '');
            const targetFilename = rawFilename.startsWith('logs/') ? rawFilename : ('logs/' + rawFilename);
            const url = 'data:application/json;charset=utf-8,' + encodeURIComponent(text);
            chrome.downloads.download({
                url: url,
                filename: targetFilename,
                saveAs: false
            }, () => { try { sendResponse({ ok: !chrome.runtime.lastError }); } catch (e) {} });
        } catch (e) { sendResponse({ ok: false }); return; }
        // ⚠️ MV3: sendResponse ถูกเรียกใน callback ของ chrome.downloads (asynchronous)
        //    ต้อง return true เพื่อคง message channel ไว้ ไม่งั้น sendResponse ไม่ถึงผู้ส่ง
        return true;
    }

    // 🧹 เก็บกวาดแท็บ Stake ที่ค้าง (เรียกตอนเริ่มเซสชันใหม่) — ตรรกะอยู่ใน sweepStaleTabs()
    if (msg && msg.type === 'CLOSE_STALE_TABS') {
        sweepStaleTabs(sender && sender.tab && sender.tab.id)
            .then((r) => { try { sendResponse(r); } catch (e) {} })
            .catch(() => { try { sendResponse({ ok: false, closed: 0 }); } catch (e) {} });
        return true; // async sendResponse
    }

    if (!msg || msg.type !== 'CLOSE_SESSION_TAB') return;

    const tabId = sender && sender.tab && sender.tab.id;
    setTimeout(() => {
        if (typeof tabId === 'number') {
            chrome.tabs.remove(tabId).catch(() => { /* แท็บถูกปิดไปแล้ว */ });
        }
    }, CLOSE_DELAY_MS);

    sendResponse({ ok: true });
});
