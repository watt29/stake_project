---
name: stake-bot-testing-protocol
description: STRICT testing protocol for the Stake dice bot. Use this skill whenever you modify the bot to verify it runs without crashing, syntax errors, or scope errors.
---

# Stake Bot Testing Protocol

Whenever you make ANY changes to `dice_bot_utf8.py`, `config.json`, or related `.bat` scripts, you MUST follow this protocol to verify your work. DO NOT assume a code edit is successful just because it looks correct.

## 1. Syntax Verification
Before running the bot, always check for syntax and indentation errors (especially because this project has strict spacing rules and Thai characters).
Run this terminal command: `python -m py_compile dice_bot_utf8.py`

## 2. Safe Execution (Simulation Mode)
NEVER test the bot using real money. Always use the `--simulate` flag.
To prevent the bot from running indefinitely as a background task, always use the `--duration 1` flag (auto-stops after 1 minute).
Run this terminal command: `python dice_bot_utf8.py --simulate --duration 1`

## 3. Log Monitoring
Use the `manage_task` tool to check the `status` of the running task after ~10-15 seconds.
- **Success Criteria:** The logs MUST show the bot successfully passing the "Hot Reload Success" phase, patching the driver, and entering the main loop (printing the Dashboard / "STRATEGIC STATUS & GUARD").
- **Failure Criteria:** If you see `[ERROR]`, `UnboundLocalError`, `NameError`, or `[RESURRECTION] Restarting...`, the test FAILED. You must kill the task, fix the scope/variable issue, and test again.

## 4. Task Cleanup
Once you have verified the bot runs smoothly without crashing, use the `manage_task` tool to `kill` the background task. Do not leave ghost processes running in the workspace.
