# Claude & AI Agent Coding Standards (Stake Dice Bot)

> **MANDATORY FOR ALL AI AGENTS (Claude, Antigravity, Cursor, Copilot, ChatGPT)**:  
> All agents must read and strictly adhere to `AGENTS.md` before reading or modifying this repository.

---

## 🎯 Ground Truth Rules & Core Architecture (v2.7.0 - Pure 68% Safe Base & 3-Win Recovery)

1. **Win Chance 68% & Single Win Recovery (+73.12%):**
   - **Win Chance:** 72% constant (Payout = 1.3750x, Net Profit = +37.50%).
   - **Single Invariant Base Bet:** Strictly `0.00015$` (USDT) at all times.
   - ❌ **Recovery Boost Purged 100%:** No base bet inflation or jumping after 20 minutes.
   - **Exact Single-Win Martingale Multiplier Formula:**
     $$\text{profitRate} = \frac{99}{72} - 1 = 0.3750$$
     $$\text{multPct} = \frac{1}{1 \times 0.3750} \times 100\% = \mathbf{+266.67\%} \quad (\approx 1.7312\text{x})$$
     - Win 1 roll (`isWin`) recovers 100% of previous losses and immediately resets to step 1!

2. **Single Account Mode (user directive 2026-11-13):**
   - ONLY Profile 4 (`watt29`) runs. All other profiles are cancelled.
   - No account rotation; the fleet loop repeats on watt29 only.
   - Do NOT add or run other profiles unless the user asks explicitly.

3. **Strict No Cut-Loss / No Forced Stop-Loss Directive:**
   - The user strictly commands: **"ไม่เอา ตัดขาดทุน"** (No Stop-Loss).
   - Sessions hold and recover at base bet `0.00015$` until positive or safety exit. `$RecoveryExtraMinutes` in PowerShell is set to 40 minutes, with `isStillHolding` check (`STAKE_HOLD`).

4. **Zero-Race Condition Exit:**
   - `content.js` must persist `document.title` containing `STAKE_DONE` for $\ge 2,500\text{ms}$ before requesting tab close.
   - PowerShell poller in `rotate-accounts.ps1` runs at 100ms interval.

---

## 📦 MANDATORY CODING PROTOCOL: Versioning & Automated Backup
Whenever any modification or bug fix is made:
1. **Auto-Backup:** Execute `powershell -ExecutionPolicy Bypass -File .\tools\backup-version.ps1` to snapshot the previous state into `backups/`.
2. **Version Bump:** Bump `version` in `stake_extension/manifest.json`.
3. **Verification:** Test syntax with `node -c stake_extension/content.js`.
4. **PowerShell Encoding:** All `.ps1` files with Thai text MUST be saved as **UTF-8 with BOM (`0xEF, 0xBB, 0xBF`)**.
