#!/usr/bin/env python3
# cleanup_virtual.py — Remove fake virtual betting variables from content.js
import re, sys

path = r"d:\script stake\stake_extension\content.js"

with open(path, 'r', encoding='utf-8') as f:
    src = f.read()

original_len = len(src)
changes = []

# ============================================================
# 1. BUILD_NO and BUILD_STAMP (already done via edit_file)
# ============================================================

# ============================================================
# 2. REMOVE the entire VIRTUAL_ENTRY_STAGES block + virtualStageInCycle + virtualStageRow + virtualStageNo + virtualTriggerNow
# ============================================================
# Remove VIRTUAL_ENTRY_STAGES constant (multi-line)
src, n = re.subn(
    r'    // 🌬️ VIRTUAL ENTRY STAGE.*?    \];\n',
    '',
    src, count=1, flags=re.DOTALL
)
changes.append(('VIRTUAL_ENTRY_STAGES block', n))

# Remove virtualStageInCycle declaration line
src, n = re.subn(r'    let virtualStageInCycle = 0;.*?\n', '', src, count=1)
changes.append(('virtualStageInCycle decl', n))

# Remove virtualStageRow function
src, n = re.subn(
    r'    function virtualStageRow\(\) \{[^}]+\}\n',
    '', src, count=1, flags=re.DOTALL
)
changes.append(('virtualStageRow', n))

# Remove virtualStageNo function
src, n = re.subn(
    r'    function virtualStageNo\(\) \{[^}]+\}\n',
    '', src, count=1, flags=re.DOTALL
)
changes.append(('virtualStageNo', n))

# Remove virtualTriggerNow function (multi-line)
src, n = re.subn(
    r'    function virtualTriggerNow\(\) \{.*?\}\n',
    '', src, count=1, flags=re.DOTALL
)
changes.append(('virtualTriggerNow', n))

# ============================================================
# 3. REMOVE configVirtualWinTarget declaration
# ============================================================
src, n = re.subn(r'    let configVirtualWinTarget = 1;.*?\n', '', src, count=1)
changes.append(('configVirtualWinTarget decl', n))

# ============================================================
# 4. REMOVE virtualWinStreak and virtualWinsInRun declarations
# ============================================================
src, n = re.subn(r'    let virtualWinStreak = 0;.*?\n', '', src, count=1)
changes.append(('virtualWinStreak decl', n))

src, n = re.subn(r'    let virtualWinsInRun = 0;.*?\n', '', src, count=1)
changes.append(('virtualWinsInRun decl', n))

# ============================================================
# 5. REMOVE userForcedVirtual declaration
# ============================================================
src, n = re.subn(r'    let userForcedVirtual = false;.*?\n', '', src, count=1)
changes.append(('userForcedVirtual decl', n))

# ============================================================
# 6. SIMPLIFY isVirtualBetActive: remove userForcedVirtual reference
# ============================================================
old = '        return Boolean(userForcedVirtual || configVirtualBetEnabled);\n'
new = '        return Boolean(configVirtualBetEnabled);\n'
src, n = re.subn(re.escape(old), new, src, count=1)
changes.append(('isVirtualBetActive body', n))

# Remove the comment line inside isVirtualBetActive
src, n = re.subn(r'        // อยู่ในโหมดลม \+ สวิตช์เปิด.*?\n', '', src, count=1)
changes.append(('isVirtualBetActive comment', n))

# ============================================================
# 7. REMOVE virtualWinTargetEffective function
# ============================================================
src, n = re.subn(
    r'    function virtualWinTargetEffective\(\) \{[^}]+\}\n\n',
    '', src, count=1, flags=re.DOTALL
)
changes.append(('virtualWinTargetEffective', n))

# ============================================================
# 8. REMOVE virtualTargetAtEntry declaration
# ============================================================
src, n = re.subn(
    r'    // 🎯 เป้าชนะลมที่.*?\n    let virtualTargetAtEntry = 1;\n',
    '', src, count=1, flags=re.DOTALL
)
changes.append(('virtualTargetAtEntry', n))

# ============================================================
# 9. REMOVE configVirtualCapNonWin and VIRTUAL_CAP_STORE_KEY
# ============================================================
src, n = re.subn(
    r'    // 🚪 ทางออกจากโหมดแทงลมที่ไม่ใช่เงื่อนไขชนะ.*?\n    let configVirtualCapNonWin = true;\n    const VIRTUAL_CAP_STORE_KEY = "[^"]+";',
    '', src, count=1, flags=re.DOTALL
)
changes.append(('configVirtualCapNonWin+CAP_STORE_KEY', n))

# ============================================================
# 10. REMOVE virtualTargetLocked function
# ============================================================
src, n = re.subn(
    r'    function virtualTargetLocked\(\) \{[^}]+\}\n',
    '', src, count=1, flags=re.DOTALL
)
changes.append(('virtualTargetLocked', n))

# ============================================================
# 11. REMOVE virtualWinStreak=0 and virtualWinsInRun=0 from resetVirtualRun
# ============================================================
src, n = re.subn(r'        virtualWinStreak = 0;\n', '', src)
changes.append(('virtualWinStreak=0 usages', n))

src, n = re.subn(r'        virtualWinsInRun = 0;\n', '', src)
changes.append(('virtualWinsInRun=0 usages (4-space)', n))

# ============================================================
# 12. REMOVE VIRTUAL_MAX_ROLLS, shouldExitVirtualRun, VIRTUAL_MAX_MS, virtualTimedOut, virtualCapExitDue
# ============================================================
# Remove VIRTUAL_MAX_ROLLS comment + declaration
src, n = re.subn(
    r'    // 🎯 กฎออกจากโหมดแทงลม.*?\n    const VIRTUAL_MAX_ROLLS = 30;.*?\n',
    '', src, count=1, flags=re.DOTALL
)
changes.append(('VIRTUAL_MAX_ROLLS decl block', n))

# Remove shouldExitVirtualRun function
src, n = re.subn(
    r'    function shouldExitVirtualRun\(\) \{.*?\}\n\n',
    '', src, count=1, flags=re.DOTALL
)
changes.append(('shouldExitVirtualRun', n))

# Remove VIRTUAL_MAX_MS comment + declaration
src, n = re.subn(
    r'    // ⏱️ เพดานเวลาในโหมดแทงลม.*?\n    const VIRTUAL_MAX_MS = [^;]+;\n',
    '', src, count=1, flags=re.DOTALL
)
changes.append(('VIRTUAL_MAX_MS', n))

# Remove virtualTimedOut function
src, n = re.subn(
    r'    function virtualTimedOut\(\) \{[^}]+\}\n\n',
    '', src, count=1, flags=re.DOTALL
)
changes.append(('virtualTimedOut', n))

# Simplify virtualExitDue: remove the two old lines inside it and replace with simple check
# The old body is:
#   if (virtualCapExitDue()) return true;
#   if (userForcedVirtual) return shouldExitVirtualRun();
#   return virtualRolls >= VIRTUAL_EXIT_AFTER_ROLLS;
old_body = (
    '    function virtualExitDue() {\n'
    '        if (virtualCapExitDue()) return true;\n'
    '        if (userForcedVirtual) return shouldExitVirtualRun();\n'
    '        return virtualRolls >= VIRTUAL_EXIT_AFTER_ROLLS;\n'
    '    }\n'
)
new_body = (
    '    function virtualExitDue() {\n'
    '        return virtualRolls >= VIRTUAL_EXIT_AFTER_ROLLS;\n'
    '    }\n'
)
src, n = re.subn(re.escape(old_body), new_body, src, count=1)
changes.append(('virtualExitDue simplify', n))

# Remove virtualCapExitDue function
src, n = re.subn(
    r'    function virtualCapExitDue\(\) \{[^}]+\}\n\n',
    '', src, count=1, flags=re.DOTALL
)
changes.append(('virtualCapExitDue', n))

# ============================================================
# 13. Simplify exitVirtualToReal: remove streak/total/target from info and recordEvent
# ============================================================
# Remove streak, total, target from info object
src, n = re.subn(r'            streak: virtualWinStreak,\n', '', src, count=1)
changes.append(('info.streak', n))

src, n = re.subn(r'            total: virtualWinsInRun,\n', '', src, count=1)
changes.append(('info.total', n))

src, n = re.subn(r'            target: virtualTargetLocked\(\),\n', '', src, count=1)
changes.append(('info.target', n))

# Remove streak/total/target from recordEvent VIRTUAL_EXIT call
src, n = re.subn(r'            streak: info\.streak,\n', '', src, count=1)
changes.append(('recordEvent streak', n))

src, n = re.subn(r'            total: info\.total,\n', '', src, count=1)
changes.append(('recordEvent total', n))

src, n = re.subn(r'            target: info\.target,\n', '', src, count=1)
changes.append(('recordEvent target', n))

# Remove userForcedVirtual = false from exitVirtualToReal
src, n = re.subn(r'        userForcedVirtual = false;\n', '', src, count=1)
changes.append(('userForcedVirtual=false in exitVirtual', n))

# ============================================================
# 14. Simplify virtualExitRuleText
# ============================================================
old_rule = (
    '    function virtualExitRuleText() {\n'
    '        const t = virtualTargetLocked();\n'
    '        const tail = configVirtualCapNonWin\n'
    '            ? `ทอย ${virtualRolls}/${VIRTUAL_MAX_ROLLS} หรือ ${Math.round(VIRTUAL_MAX_MS / 60000)} นาที`\n'
    '            : `ทอย ${virtualRolls} (เพดานนอกเงื่อนไข: ปิด)`;\n'
    '        // โหมดอัตโนมัติ: ออกตามจำนวนตาที่ตั้งไว้ ไม่ต้องรอชนะ\n'
    '        if (!userForcedVirtual) return `ออกเมื่อ แทงลมครบ ${VIRTUAL_EXIT_AFTER_ROLLS} ตา (แพ้/ชนะก็ออก) · เพดาน ${VIRTUAL_MAX_ROLLS} ตา / ${Math.round(VIRTUAL_MAX_MS / 60000)} นาที`;\n'
    '        return `ออกเมื่อ ชนะรวม ${virtualWinsInRun}/${t} หรือติด ${virtualWinStreak}/${t} · ${tail}`;\n'
    '    }\n'
)
new_rule = (
    '    function virtualExitRuleText() {\n'
    '        return `ออกเมื่อ แทงลมครบ ${VIRTUAL_EXIT_AFTER_ROLLS} ตา (แพ้/ชนะก็ออก)`;\n'
    '    }\n'
)
src, n = re.subn(re.escape(old_rule), new_rule, src, count=1)
changes.append(('virtualExitRuleText', n))

# ============================================================
# 15. Simplify handleBetResult virtual win/loss handler
# ============================================================
# Win case: replace complex block with simple exitDue check
old_win = (
    '            if (isWin) {\n'
    '                virtualWinStreak++;\n'
    '                virtualWinsInRun++;\n'
    '                const vTgt = virtualTargetLocked();\n'
    '                const enoughRolls = virtualRolls >= vTgt; // กันนับซ้ำ: 1 ทอย = 1 ชนะ ไม่ควรถึงเป้าก่อนจำนวนตา\n'
    '                if (virtualExitDue()) {\n'
    '                    const wonStreak = virtualWinStreak;\n'
    '                    const wonTotal = virtualWinsInRun;\n'
    '                    const totalVRolls = virtualRolls;\n'
    '                    const vTgtNow = virtualTargetLocked();\n'
    '                    let exitReason;\n'
    '                    if (wonStreak >= vTgtNow) exitReason = `ชนะลมติดต่อกันครบ ${wonStreak}/${vTgtNow} ครั้ง`;\n'
    '                    else if (wonTotal >= vTgtNow) exitReason = `ชนะลมสะสมครบ ${wonTotal}/${vTgtNow} ครั้ง`;\n'
    '                    else if (!userForcedVirtual && virtualRolls >= VIRTUAL_EXIT_AFTER_ROLLS) exitReason = `ครบ ${virtualRolls} ตาในโหมดแทงลม (ตาสุดท้ายชนะ) — กลับไปแทงจริงไม้เดิม`;\n'
    '                    else if (virtualTimedOut()) exitReason = `อยู่ในโหมดแทงลมครบ ${Math.round(VIRTUAL_MAX_MS / 60000)} นาที (ชนะรวม ${wonTotal}/${vTgtNow}) — กลับไปแทงจริง`;\n'
    '                    else exitReason = `ครบเพดานทอยลม ${totalVRolls} ตา (ชนะรวม ${wonTotal}/${vTgtNow}) — กลับไปแทงจริง`;\n'
    '                    exitVirtualToReal(exitReason);\n'
    '                } else {\n'
    '                    log(`🌬️ [VIRTUAL WIN]${rollTag} ชนะลม (ติด: ${virtualWinStreak}/${vTgt} · รวม: ${virtualWinsInRun}/${vTgt} · ตาที่ ${virtualRolls}) · รอต่อไม้ ${mStep} (${nextRealAmt}$)`);\n'
    '                    updateStatusText(`🌬️ แทงลม 0$ (ตาที่ ${virtualRolls}): ชนะลม (ติด ${virtualWinStreak}/${vTgt} | รวม ${virtualWinsInRun}/${vTgt}) · รอต่อไม้ ${mStep} (${nextRealAmt}$)`, "#55e7ff");\n'
    '                }\n'
    '            } else {\n'
    '                virtualWinStreak = 0;\n'
    '                const vTgtLoss = virtualWinTargetEffective();\n'
    '                log(`🌬️ [VIRTUAL LOSS]${rollTag} แพ้ลม (ติด: 0/${vTgtLoss} · รวม: ${virtualWinsInRun}/${vTgtLoss} · ตาที่ ${virtualRolls}) · พักไม้ ${mStep} (${nextRealAmt}$)`);\n'
    '                updateStatusText(`🌬️ แทงลม 0$ (ตาที่ ${virtualRolls}): แพ้ลม${rollTag} (ติด 0/${vTgtLoss} | รวม ${virtualWinsInRun}/${vTgtLoss}) · พักไม้ ${mStep} (${nextRealAmt}$)`, "#8596a5");\n'
    '                // 🌬️ ตาสุดท้าย (ตาที่ 6) แพ้ → กลับไปแทงเงินจริง (K2) ที่ไม้เดิมทันที\n'
    '                if (!userForcedVirtual && virtualRolls >= VIRTUAL_EXIT_AFTER_ROLLS) {\n'
    '                    exitVirtualToReal(`แพ้ลมตาที่ ${virtualRolls}/${VIRTUAL_EXIT_AFTER_ROLLS} — กลับไปแทงเงินจริง (K2) ไม้เดิม`);\n'
    '                }\n'
    '            }\n'
)
new_win = (
    '            if (isWin) {\n'
    '                if (virtualExitDue()) {\n'
    '                    exitVirtualToReal(`ชนะลม ตาที่ ${virtualRolls}`);\n'
    '                } else {\n'
    '                    log(`🌬️ [VIRTUAL WIN]${rollTag} ชนะลม ตาที่ ${virtualRolls}/${VIRTUAL_EXIT_AFTER_ROLLS} · รอต่อไม้ ${mStep} (${nextRealAmt}$)`);\n'
    '                    updateStatusText(`🌬️ แทงลม 0$ (ตาที่ ${virtualRolls}/${VIRTUAL_EXIT_AFTER_ROLLS}): ชนะลม · รอต่อไม้ ${mStep} (${nextRealAmt}$)`, "#55e7ff");\n'
    '                }\n'
    '            } else {\n'
    '                log(`🌬️ [VIRTUAL LOSS]${rollTag} แพ้ลม ตาที่ ${virtualRolls}/${VIRTUAL_EXIT_AFTER_ROLLS} · พักไม้ ${mStep} (${nextRealAmt}$)`);\n'
    '                updateStatusText(`🌬️ แทงลม 0$ (ตาที่ ${virtualRolls}/${VIRTUAL_EXIT_AFTER_ROLLS}): แพ้ลม${rollTag} · พักไม้ ${mStep} (${nextRealAmt}$)`, "#8596a5");\n'
    '                if (virtualExitDue()) {\n'
    '                    exitVirtualToReal(`แพ้ลมตาที่ ${virtualRolls}/${VIRTUAL_EXIT_AFTER_ROLLS} — กลับไปแทงเงินจริงไม้เดิม`);\n'
    '                }\n'
    '            }\n'
)
src, n = re.subn(re.escape(old_win), new_win, src, count=1)
changes.append(('handleBetResult virtual win/loss', n))

# ============================================================
# 16. Remove virtualStageInCycle usages in updateBaseBetOnReset
# ============================================================
src, n = re.subn(r'        virtualStageInCycle = 0;.*?\n', '', src)
changes.append(('virtualStageInCycle=0 usages', n))

# ============================================================
# 17. Simplify auto-entry block at ~line 4580 
# ============================================================
old_entry = (
    '            const justLostStep = Math.max(1, mStep - 1);   // ไม้ที่เพิ่งแพ้ (mStep ถูก +1 ไปก่อนแล้ว)\n'
    '            const virtualTrig = virtualTriggerNow();\n'
    '            const virtualWinT = virtualWinTargetEffective();\n'
    '            // 🚪 เข้าได้เฉพาะเมื่อยังไม่เคยเข้าแทงลมในรอบนี้ (virtualStageInCycle === 0) — กันเข้าซ้ำก่อนชนะจริงติด 2\n'
    '            if (configVirtualBetEnabled && virtualStageInCycle === 0 && realLossStreakForVirtual >= virtualTrig) {\n'
    '                if (!(configVirtualLossTrigger > 0)) configVirtualLossTrigger = 3; // เก็บค่าฐานที่ผู้ใช้ตั้งไว้ ห้ามทับด้วยเกณฑ์ที่ลดแล้ว\n'
    '                configVirtualWinTarget = virtualWinT;\n'
    '                virtualMode = true;\n'
    '                virtualEnteredAt = Date.now();\n'
    '                virtualTargetAtEntry = virtualWinT; // 🔒 ล็อกเป้าของรอบนี้\n'
    '                parkedStep = Math.max(1, mStep - 1);   // 🔒 ไม้ที่ "เพิ่งแพ้" (mStep ถูก +1 ไปก่อนแล้ว)\n'
    '                parkedAmount = (function () {\n'
    '                    const keep = mStep;\n'
    '                    mStep = parkedStep;\n'
    '                    const amt = parseFloat(calculateCurrentBetAmount());\n'
    '                    mStep = keep;\n'
    '                    return amt;\n'
    '                })();\n'
    '                const trigLosses = realLossStreakForVirtual; // ⚠️ ต้องประกาศก่อนใช้ (เดิมใช้ก่อน = ReferenceError → บอทหยุดตอนแพ้ 3 ไม้)\n'
    '                resetVirtualRun(); // reset counters of this virtual run\n'
    '                recordEvent("VIRTUAL_ENTER", { by: "auto", losses: trigLosses, target: configVirtualWinTarget, parkedStep: parkedStep, parkedAmount: parkedAmount });\n'
    '                // 🔄 รีเซ็ตตัวนับตอนเข้าแทงลม (นับใหม่หลังออกลม) แต่จำ "ด่าน" ไว้ → ด่าน 2 ต้องแพ้จริงติดใหม่ 5 ตา\n'
    '                realLossStreakForVirtual = 0;\n'
    '                virtualStageInCycle++;   // เข้าแทงลมแล้ว 1 ครั้งในรอบนี้ → ครั้งถัดไปใช้ด่าน 2 (5 ตา)\n'
    '                // ⚠️ ใช้ parkedStep/parkedAmount (ไม้ที่จะกลับไปจริง) — เดิมใช้ mStep/nextAmt ที่ถูก +1 ไปแล้ว → ข้อความบอก "ไม้ 6" แต่ตอนออกกลับไปไม้ 5 (log ขัดกัน)\n'
    '                log(`🌬️ [VIRTUAL ENTER]${rollTag} แพ้เงินจริงติดต่อกันครบ ${trigLosses} ครั้ง (ด่าน ${virtualStageNo()} · ไม้ ${justLostStep} · เกณฑ์ ${virtualTrig} ตา)! ตัดเข้าโหมดแทงลม 0$ (แทงลม ${VIRTUAL_EXIT_AFTER_ROLLS} ตา แล้วกลับไปแทงจริง (K2) ที่ไม้ ${parkedStep}: ${formatBetAmount(parkedAmount)}$ — แพ้หรือชนะก็ออก)`, true);\n'
    '                updateStatusText(`🌬️ แพ้จริงติด ${trigLosses} ครั้ง! เข้าแทงลม 0$ (${VIRTUAL_EXIT_AFTER_ROLLS} ตา → ต่อไม้ ${parkedStep}: ${formatBetAmount(parkedAmount)}$ แพ้/ชนะก็ออก)`, "#55e7ff");\n'
    '            } else if (realLossStreakForVirtual >= virtualTrig) {\n'
    '                // แพ้ครบเงื่อนไขแล้วแต่ระบบแทงลมถูกปิด — บอกให้เห็นบน HUD ว่าติดที่สวิตช์\n'
    '                updateStatusText(`🌬️ แพ้ติด ${realLossStreakForVirtual} ครั้ง แต่ระบบแทงลมถูกปิดอยู่ — กดปุ่ม 🌬️ บน HUD เพื่อเปิด`, "#ffa726");\n'
    '            }\n'
)
new_entry = (
    '            const justLostStep = Math.max(1, mStep - 1);   // ไม้ที่เพิ่งแพ้ (mStep ถูก +1 ไปก่อนแล้ว)\n'
    '            const virtualTrig = configVirtualLossTrigger > 0 ? configVirtualLossTrigger : 3;\n'
    '            if (configVirtualBetEnabled && realLossStreakForVirtual >= virtualTrig) {\n'
    '                if (!(configVirtualLossTrigger > 0)) configVirtualLossTrigger = 3;\n'
    '                virtualMode = true;\n'
    '                virtualEnteredAt = Date.now();\n'
    '                parkedStep = Math.max(1, mStep - 1);   // 🔒 ไม้ที่ "เพิ่งแพ้" (mStep ถูก +1 ไปก่อนแล้ว)\n'
    '                parkedAmount = (function () {\n'
    '                    const keep = mStep;\n'
    '                    mStep = parkedStep;\n'
    '                    const amt = parseFloat(calculateCurrentBetAmount());\n'
    '                    mStep = keep;\n'
    '                    return amt;\n'
    '                })();\n'
    '                const trigLosses = realLossStreakForVirtual;\n'
    '                resetVirtualRun();\n'
    '                recordEvent("VIRTUAL_ENTER", { by: "auto", losses: trigLosses, parkedStep: parkedStep, parkedAmount: parkedAmount });\n'
    '                realLossStreakForVirtual = 0;\n'
    '                log(`🌬️ [VIRTUAL ENTER]${rollTag} แพ้เงินจริงติดต่อกันครบ ${trigLosses} ครั้ง (ไม้ ${justLostStep} · เกณฑ์ ${virtualTrig} ตา)! ตัดเข้าโหมดแทงลม 0$ (${VIRTUAL_EXIT_AFTER_ROLLS} ตา → กลับไปแทงจริงที่ไม้ ${parkedStep}: ${formatBetAmount(parkedAmount)}$ — แพ้หรือชนะก็ออก)`, true);\n'
    '                updateStatusText(`🌬️ แพ้จริงติด ${trigLosses} ครั้ง! เข้าแทงลม 0$ (${VIRTUAL_EXIT_AFTER_ROLLS} ตา → ต่อไม้ ${parkedStep}: ${formatBetAmount(parkedAmount)}$ แพ้/ชนะก็ออก)`, "#55e7ff");\n'
    '            } else if (realLossStreakForVirtual >= virtualTrig) {\n'
    '                updateStatusText(`🌬️ แพ้ติด ${realLossStreakForVirtual} ครั้ง แต่ระบบแทงลมถูกปิดอยู่ — กดปุ่ม 🌬️ บน HUD เพื่อเปิด`, "#ffa726");\n'
    '            }\n'
)
src, n = re.subn(re.escape(old_entry), new_entry, src, count=1)
changes.append(('auto-entry block', n))

# ============================================================
# 18. Remove toggleVirtualCapNonWin function
# ============================================================
src, n = re.subn(
    r'    function toggleVirtualCapNonWin\(\) \{.*?\}\n\n',
    '', src, count=1, flags=re.DOTALL
)
changes.append(('toggleVirtualCapNonWin', n))

# ============================================================
# 19. startSession savedRecovery path: remove configVirtualWinTarget restore, virtualWinStreak, virtualWinsInRun
# ============================================================
src, n = re.subn(
    r'            if \(typeof savedRecovery\.configVirtualWinTarget === "number".*?\n',
    '', src, count=1
)
changes.append(('savedRecovery configVirtualWinTarget restore', n))

src, n = re.subn(r'            virtualWinStreak = savedRecovery\.virtualWinStreak \|\| 0;\n', '', src, count=1)
changes.append(('savedRecovery virtualWinStreak restore', n))

src, n = re.subn(r'            virtualWinsInRun = savedRecovery\.virtualWinsInRun \|\| 0;\n', '', src, count=1)
changes.append(('savedRecovery virtualWinsInRun restore', n))

# startSession new session path: virtualMode line uses userForcedVirtual - fix it
src, n = re.subn(
    r'            virtualMode = userForcedVirtual; // เคารพคำสั่งผู้ใช้:.*?\n',
    '            virtualMode = false;\n',
    src, count=1
)
changes.append(('startSession virtualMode=userForcedVirtual', n))

# ============================================================
# 20. Storage save (SNAP diagPush): remove wins and streak fields
# ============================================================
src, n = re.subn(r'                    wins: virtualWinsInRun,\n', '', src, count=1)
changes.append(('SNAP wins', n))

src, n = re.subn(r'                    streak: virtualWinStreak,\n', '', src, count=1)
changes.append(('SNAP streak', n))

# ============================================================
# 21. Storage export (buildReport): remove winTarget, capNonWin, maxRolls, maxMs from config
# ============================================================
src, n = re.subn(r'                        winTarget: configVirtualWinTarget,\n', '', src)
changes.append(('buildReport winTarget', n))

src, n = re.subn(r'                        capNonWin: configVirtualCapNonWin,\n', '', src, count=1)
changes.append(('buildReport capNonWin', n))

src, n = re.subn(r'                        maxRolls: VIRTUAL_MAX_ROLLS,\n', '', src, count=1)
changes.append(('buildReport maxRolls', n))

src, n = re.subn(r'                        maxMs: VIRTUAL_MAX_MS,\n', '', src, count=1)
changes.append(('buildReport maxMs', n))

# state block: virtualWinStreak/virtualWinsInRun
src, n = re.subn(r'                virtualWinStreak: virtualWinStreak,\n', '', src, count=1)
changes.append(('state virtualWinStreak', n))

src, n = re.subn(r'                virtualWinsInRun: virtualWinsInRun,\n', '', src, count=1)
changes.append(('state virtualWinsInRun', n))

# virtualTarget from state: uses virtualTargetLocked() — remove
src, n = re.subn(r'                virtualTarget: virtualTargetLocked\(\),\n', '', src, count=1)
changes.append(('state virtualTarget', n))

# virtual sub-block in perf: remove winTarget and lockTarget
src, n = re.subn(r'                        lockTarget: virtualTargetLocked\(\),\n', '', src, count=1)
changes.append(('perf lockTarget', n))

# ============================================================
# 22. HUD: remove sniperVirtualCapBtn HTML element
# ============================================================
src, n = re.subn(
    r'\s*<button id="sniperVirtualCapBtn"[^>]+>[^<]+</button>\n',
    '', src, count=1
)
changes.append(('sniperVirtualCapBtn HTML', n))

# ============================================================
# 23. HUD: remove sniperInVirtualWin input HTML element and surrounding labels
# ============================================================
# Remove: <span style="color:#8596a5; font-size:10px;">ชนะลม:</span>  + input sniperInVirtualWin
src, n = re.subn(
    r'\s*<span style="color:#8596a5; font-size:10px;">ชนะลม:</span>\s*\n\s*<input id="sniperInVirtualWin"[^>]+>\n',
    '', src, count=1
)
changes.append(('sniperInVirtualWin HTML', n))

# ============================================================
# 24. HUD element references: remove virtualCapBtn and inVirtualWin
# ============================================================
src, n = re.subn(r'            virtualCapBtn: shadow\.getElementById\("sniperVirtualCapBtn"\),\n', '', src, count=1)
changes.append(('hudEls virtualCapBtn ref', n))

src, n = re.subn(r'            inVirtualWin: shadow\.getElementById\("sniperInVirtualWin"\),\n', '', src, count=1)
changes.append(('hudEls inVirtualWin ref', n))

# ============================================================
# 25. Remove virtualCapBtn event listener block
# ============================================================
src, n = re.subn(
    r'        if \(hudEls\.virtualCapBtn\) \{\n            hudEls\.virtualCapBtn\.addEventListener\([^}]+\};\n        \}\n',
    '', src, count=1, flags=re.DOTALL
)
changes.append(('virtualCapBtn addEventListener', n))

# ============================================================
# 26. Remove inVirtualWin event listener block (the whole if block)
# ============================================================
src, n = re.subn(
    r'        if \(hudEls\.inVirtualWin\) \{.*?\n        \}\n',
    '', src, count=1, flags=re.DOTALL
)
changes.append(('inVirtualWin addEventListener block', n))

# ============================================================
# 27. updateUI: virtualCapBtn display block → remove
# ============================================================
src, n = re.subn(
    r'        if \(hudEls\.virtualCapBtn\) \{[^}]+\}\n',
    '', src, count=1, flags=re.DOTALL
)
changes.append(('updateUI virtualCapBtn block', n))

# ============================================================
# 28. toggleVirtualBtn updateUI: simplify display (remove virtualWinStreak/virtualWinsInRun/virtualTargetLocked)
# ============================================================
old_tvbtn_active = (
    '                if (configVirtualBetEnabled && configVirtualLossTrigger > 0 && configVirtualWinTarget > 0) {\n'
    '                if (virtualActive) {\n'
    '                    const bestWin = Math.max(virtualWinStreak, virtualWinsInRun);\n'
    '                    setSafeText(hudEls.toggleVirtualBtn, `🌬️ ลม${"0$"}${virtualStallCount > 0 ? " · STALL " + virtualStallCount + "/" + VIRTUAL_STALL_LIMIT : ""}: ชนะ ${bestWin}/${virtualTargetLocked()}`);\n'
)
new_tvbtn_active = (
    '                if (configVirtualBetEnabled && configVirtualLossTrigger > 0) {\n'
    '                if (virtualActive) {\n'
    '                    setSafeText(hudEls.toggleVirtualBtn, `🌬️ ลม${"0$"}${virtualStallCount > 0 ? " · STALL " + virtualStallCount + "/" + VIRTUAL_STALL_LIMIT : ""}: ตาที่ ${virtualRolls}/${VIRTUAL_EXIT_AFTER_ROLLS}`);\n'
)
src, n = re.subn(re.escape(old_tvbtn_active), new_tvbtn_active, src, count=1)
changes.append(('toggleVirtualBtn active text', n))

# Fix the else branch that shows virtualTriggerNow()
src, n = re.subn(
    r'                    setSafeText\(hudEls\.toggleVirtualBtn, `🌬️ แทงลม: ON \(\$\{realLossStreakForVirtual\}/\$\{virtualTriggerNow\(\)\}\)`\);',
    '                    setSafeText(hudEls.toggleVirtualBtn, `🌬️ แทงลม: ON (${realLossStreakForVirtual}/${configVirtualLossTrigger > 0 ? configVirtualLossTrigger : 3})`);',
    src, count=1
)
changes.append(('toggleVirtualBtn OFF text virtualTriggerNow', n))

# ============================================================
# 29. modeBadge: remove bestWin/virtualTargetLocked
# ============================================================
old_badge = (
    '                const bestWin = Math.max(virtualWinStreak, virtualWinsInRun);\n'
    '                setSafeText(modeBadge, `🌬️ แทงลม ${"0$ (ยิงจริง)"}${virtualStallCount > 0 ? " · STALL " + virtualStallCount + "/" + VIRTUAL_STALL_LIMIT + " " + virtualStallReason : ""} · รอชนะ ${bestWin}/${virtualTargetLocked()} · พักไม้ ${parkedStep >= 1 ? parkedStep : mStep} (${formatBetAmount(parkedAmount > 0 ? parkedAmount : 0)}$) · ${virtualExitRuleText()} · ${virtualZeroModeText()}`);\n'
)
new_badge = (
    '                setSafeText(modeBadge, `🌬️ แทงลม ${"0$ (ยิงจริง)"}${virtualStallCount > 0 ? " · STALL " + virtualStallCount + "/" + VIRTUAL_STALL_LIMIT + " " + virtualStallReason : ""} · ตาที่ ${virtualRolls}/${VIRTUAL_EXIT_AFTER_ROLLS} · พักไม้ ${parkedStep >= 1 ? parkedStep : mStep} (${formatBetAmount(parkedAmount > 0 ? parkedAmount : 0)}$) · ${virtualExitRuleText()} · ${virtualZeroModeText()}`);\n'
)
src, n = re.subn(re.escape(old_badge), new_badge, src, count=1)
changes.append(('modeBadge text', n))

# modeBadge non-virtual: replace virtualTriggerNow() with direct value
src, n = re.subn(
    r'                    \? ` \(แพ้ติด \$\{realLossStreakForVirtual\}/\$\{virtualTriggerNow\(\)\}\)`',
    '                    ? ` (แพ้ติด ${realLossStreakForVirtual}/${configVirtualLossTrigger > 0 ? configVirtualLossTrigger : 3})`',
    src, count=1
)
changes.append(('modeBadge non-virtual virtualTriggerNow', n))

# ============================================================
# 30. miniStep: remove bestWin/virtualTargetLocked
# ============================================================
old_mini_active = (
    '                const bestWin = Math.max(virtualWinStreak, virtualWinsInRun);\n'
    '                setSafeText(miniStep, `🌬️ ลม${"0$"} W${bestWin}/${virtualTargetLocked()} · พักไม้ ${parkedStep >= 1 ? parkedStep : mStep} (${parkedAmount > 0 ? formatBetAmount(parkedAmount) : amt}$)`);\n'
)
new_mini_active = (
    '                setSafeText(miniStep, `🌬️ ลม${"0$"} ตาที่ ${virtualRolls}/${VIRTUAL_EXIT_AFTER_ROLLS} · พักไม้ ${parkedStep >= 1 ? parkedStep : mStep} (${parkedAmount > 0 ? formatBetAmount(parkedAmount) : amt}$)`);\n'
)
src, n = re.subn(re.escape(old_mini_active), new_mini_active, src, count=1)
changes.append(('miniStep active text', n))

# miniStep non-virtual: remove userForcedVirtual and virtualTriggerNow
old_mini_inactive = (
    '                const vMini = (configVirtualBetEnabled && (configVirtualLossTrigger > 0 || userForcedVirtual))\n'
    '                    ? ` · 🌬️ ${realLossStreakForVirtual}/${virtualTriggerNow()}`\n'
    '                    : " · 🌬️ OFF";\n'
)
new_mini_inactive = (
    '                const vMini = (configVirtualBetEnabled && configVirtualLossTrigger > 0)\n'
    '                    ? ` · 🌬️ ${realLossStreakForVirtual}/${configVirtualLossTrigger}`\n'
    '                    : " · 🌬️ OFF";\n'
)
src, n = re.subn(re.escape(old_mini_inactive), new_mini_inactive, src, count=1)
changes.append(('miniStep non-virtual text', n))

# ============================================================
# 31. HUD toggleVirtualBtn click handler: simplify enter path
# ============================================================
old_enter_path = (
    '                    configVirtualBetEnabled = true;\n'
    '                    virtualMode = true;\n'
    '                    virtualEnteredAt = Date.now();\n'
    '                    userForcedVirtual = true;\n'
    '                    virtualTargetAtEntry = virtualWinTargetEffective(); // 🔒 ล็อกเป้าของรอบนี้\n'
    '                    parkedStep = Math.max(1, mStep);             // 🔒 กดเอง: พักไม้ปัจจุบัน\n'
    '                    parkedAmount = parseFloat(calculateCurrentBetAmount());\n'
    '                    resetVirtualRun();\n'
    '                    recordEvent("VIRTUAL_ENTER", { by: "manual", target: configVirtualWinTarget, parkedStep: parkedStep, parkedAmount: parkedAmount });\n'
    '                    realLossStreakForVirtual = 0;\n'
    '                    log(`🌬️ ผู้ใช้สั่งเข้าแทงลม 0$ ทันที: รอชนะลม ${configVirtualWinTarget} ครั้ง (ติดกันหรือรวม) → ลุยเงินจริงต่อไม้ ${mStep} (${calculateCurrentBetAmount()}$)`, true);\n'
    '                    updateStatusText(`🌬️ เข้าแทงลม 0$ แล้ว (ไม้ ${mStep} พักไว้) — รอชนะลม ${configVirtualWinTarget} ครั้ง`, "#55e7ff");\n'
)
new_enter_path = (
    '                    configVirtualBetEnabled = true;\n'
    '                    virtualMode = true;\n'
    '                    virtualEnteredAt = Date.now();\n'
    '                    parkedStep = Math.max(1, mStep);\n'
    '                    parkedAmount = parseFloat(calculateCurrentBetAmount());\n'
    '                    resetVirtualRun();\n'
    '                    realLossStreakForVirtual = 0;\n'
    '                    recordEvent("VIRTUAL_ENTER", { by: "manual", parkedStep: parkedStep, parkedAmount: parkedAmount });\n'
    '                    log(`🌬️ ผู้ใช้สั่งเข้าแทงลม 0$ ทันที (${VIRTUAL_EXIT_AFTER_ROLLS} ตา) → ลุยเงินจริงต่อไม้ ${mStep} (${calculateCurrentBetAmount()}$)`, true);\n'
    '                    updateStatusText(`🌬️ เข้าแทงลม 0$ แล้ว (ไม้ ${mStep} พักไว้) — แทงลม ${VIRTUAL_EXIT_AFTER_ROLLS} ตาแล้วกลับ`, "#55e7ff");\n'
)
src, n = re.subn(re.escape(old_enter_path), new_enter_path, src, count=1)
changes.append(('toggleVirtualBtn enter path', n))

# Fix exit path: remove userForcedVirtual = false
old_exit_path = (
    '                    virtualMode = false;\n'
    '                    userForcedVirtual = false;\n'
    '                    resetVirtualRun();\n'
    '                    realLossStreakForVirtual = 0;\n'
)
new_exit_path = (
    '                    virtualMode = false;\n'
    '                    resetVirtualRun();\n'
    '                    realLossStreakForVirtual = 0;\n'
)
src, n = re.subn(re.escape(old_exit_path), new_exit_path, src, count=1)
changes.append(('toggleVirtualBtn exit userForcedVirtual', n))

# ============================================================
# 32. Reset HUD button: remove configVirtualWinTarget = 1 line
# ============================================================
src, n = re.subn(r'            configVirtualWinTarget = 1;.*?\n', '', src, count=1)
changes.append(('resetBtn configVirtualWinTarget', n))

# Fix the log message in resetBtn that mentions configVirtualWinTarget
src, n = re.subn(
    r'            log\(`✨ รีเซ็ตพารามิเตอร์เรียบร้อย \(ระบบ \$\{activeEngineMode\.toUpperCase\(\)\} · แพ้จริงติด \$\{configVirtualLossTrigger\} เข้าแทงลม รอชนะลม \$\{configVirtualWinTarget\} · Dynamic Base = balance/\$\{DYNAMIC_BASE_DIVISOR\}\)`, true\);',
    'log(`✨ รีเซ็ตพารามิเตอร์เรียบร้อย (ระบบ ${activeEngineMode.toUpperCase()} · แพ้จริงติด ${configVirtualLossTrigger} เข้าแทงลม ${VIRTUAL_EXIT_AFTER_ROLLS} ตา · Dynamic Base = balance/${DYNAMIC_BASE_DIVISOR})`, true);',
    src, count=1
)
changes.append(('resetBtn log message', n))

# ============================================================
# 33. syncHUDInputs: remove inVirtualWin update
# ============================================================
src, n = re.subn(
    r'        if \(hudEls\.inVirtualWin && activeEl !== hudEls\.inVirtualWin\) hudEls\.inVirtualWin\.value = String\(configVirtualWinTarget\);\n',
    '', src, count=1
)
changes.append(('syncHUDInputs inVirtualWin', n))

# ============================================================
# 34. clearAllBetHistory: remove userForcedVirtual = false
# ============================================================
src, n = re.subn(r'        userForcedVirtual = false;\n', '', src, count=1)
changes.append(('clearAllBetHistory userForcedVirtual', n))

# ============================================================
# 35. init(): remove VIRTUAL_CAP_STORE_KEY loading
# ============================================================
src, n = re.subn(
    r'        try \{\n            const capSaved = localStorage\.getItem\(VIRTUAL_CAP_STORE_KEY\);\n            if \(capSaved !== null\) configVirtualCapNonWin = capSaved === "1";\n        \} catch \(e\) \{\}\n',
    '', src, count=1
)
changes.append(('init VIRTUAL_CAP_STORE_KEY load', n))

# ============================================================
# Print report
# ============================================================
print("=" * 60)
print("CHANGE REPORT")
print("=" * 60)
for name, count in changes:
    status = "✅" if count > 0 else "❌ MISSED"
    print(f"  {status} {name}: {count} replacement(s)")

missed = [(n, c) for n, c in changes if c == 0]
print(f"\nTotal changes: {len(changes)}, Missed: {len(missed)}")
if missed:
    print("MISSED:")
    for n, _ in missed:
        print(f"  - {n}")

with open(path, 'w', encoding='utf-8') as f:
    f.write(src)

print(f"\nFile written. Original size: {original_len}, New size: {len(src)}, Reduction: {original_len - len(src)} chars")
