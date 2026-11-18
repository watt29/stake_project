# Claude & AI Agent Coding Standards (Stake Dice Bot)

> **MANDATORY FOR ALL AI AGENTS (Claude, Antigravity, Cursor, Copilot, Codex)**:
> Read and strictly follow `AGENTS.md` (especially **Rule 0 — Production `v2.4.5`**) before reading or modifying this repository.

## Core Rules Summary (`v2.4.5`, 2026-11-16)
1. **Active Extension:** `stake_extension/` (`v2.4.5`, **Safe Turbo Pacer (3.0-3.5 BPS)**, **100% Rate Limit 429 Protection**, 0ms Microtask, Button ready fix, **Hybrid Engine: K=1 Shallow + K=2 Deep + Fibonacci 20 ไม้**, 3 selectable modes on HUD `[🔄 โหมด: HYBRID / FIBO / PURE K2]`, HUD Dynamic Truthful Display with zero hallucination, Loss Gap Analyzer, Continuous 20m play without Deep-Loss Exit, Ultra ECO Mode, F5 Refresh strictly on 5 consecutive losses, Auto-Nav disabled).
2. **Hybrid Engine Mechanics (Default):**
   - **Shallow Tier (Steps 1–4): $K=1$ Full Deficit Recovery:**
     - Step 1: Base bet.
     - Steps 2–4: $\text{Bet} = \text{Actual Deficit} + \text{Base}$ (Uncapped, covers 100% debt).
     - **Single Win:** Clears 100% of debt immediately, locks +Base profit, and resets to Step 1 in a single win! (Zero need for 2 consecutive wins).
   - **Deep Tier (Steps 5+): $K=2$ Port Preservation Shield:**
     - Steps 5+: $\text{Bet} = \frac{\text{Actual Deficit}}{2} + \text{Base}$.
     - Single Win: Clears 50% of debt, retreats 1 step. Once it retreats to Step 4, it executes $K=1$ to wipe out remaining debt in one go!
3. **Selectable Modes:**
   - `hybrid`: ⚡ Hybrid 2-Tier (K1 Shallow + K2 Deep)
   - `fibo`: 📈 Fibonacci 20 ไม้ (`[1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377, 610, 987, 1597, 2584, 4181, 6765]`)
   - `k2`: 🛡️ Pure Deficit Partitioning K=2
4. **Common Mathematics:**
   - Win chance: Fixed `49.5%` Under (`target: 49.50`, `condition: "below"`, Payout 2.0000x) via GraphQL `DiceRoll` rewrite.
   - Base bet: $\text{Base} = \lfloor\text{Balance} / 17,710\rfloor$ (divisor 17,710 is 20-step sum). Locked during recovery ($mStep > 1$), updated only on step 1 reset (`updateBaseBetOnReset`).
4. **HUD Ground Truth ("มันต้องความจริง"):**
   - When K=2 is active, HUD header shows `🛡️ DEFICIT PARTITIONING (K=2)` and safety badge shows debt partition details.
   - When Fibonacci is active, HUD header shows `🎯 FIBONACCI 20 ไม้`.
5. **Loss Gap Analyzer:**
   - Real-time tracking of `GAP` (average loss streak) and `PWL%` (post-win loss percentage), displayed on HUD and in `STAKE_RUN` title every 5s.
6. **F5 Recovery State Machine:**
   - Refresh F5 triggers ONLY on 5 consecutive losses (`currentStreak <= -5`) -> save state to stealth storage -> F5 reload.
   - Resumes immediately at step 6 (`inRefreshRecovery = true`).
7. **No Guessing ("ไม่มโน"):**
   - Read `isWin`, `state.result`, and currency-matched `serverBal` strictly from the actual `DiceRoll` GraphQL response.
8. **Single Account & Automation (`tools/rotate-accounts.ps1`):**
   - `Profile 4` (`watt29`) only.
   - `20m` session + `STAKE_HOLD` recovery (`40m` extra, no cut-loss) + `0s` cooldown (immediate next round).
   - Live 5s status -> `data/live-status.txt`; round ledger -> `data/rotate-ledger.csv`.
9. **Mandatory SOP:** Run `powershell -ExecutionPolicy Bypass -File ..\tools\backup-version.ps1` BEFORE edits -> bump `stake_extension\manifest.json` -> verify `node -c "content.js"` and `node ..\tools\_test_engine.cjs` and `node ..\tools\_test_title_v2.cjs` -> save `.ps1` as UTF-8 with BOM.
