---
name: stake-bot-dashboard-guard
description: Prevents the AI from hallucinating variables or functions when modifying the dashboard UI in dice_bot_utf8.py. Use when modifying console output or UI.
---

# Stake Bot Dashboard Guard

This skill was created from a past mistake where the AI hallucinated non-existent variables (`strategy_state`) and functions (`get_strategy_mode_label`) while trying to make the dashboard look more "professional". This caused the bot to crash during runtime.

## Core Rules for Modifying the Dashboard

1. **NO HALLUCINATIONS**: Never invent new state variables, tracker variables, or helper functions to make the UI look better. If a variable does not exist in the main betting loop, do not try to display it.
2. **USE EXISTING VARIABLES**: You must only use variables that are explicitly defined and available in the local scope of the `while True:` betting loop (e.g., `virtual_state`, `fib_step`, `current_condition`, `pattern_str`, `virtual_rolls_seen`).
3. **CROSS-REFERENCE BACKUP**: If you are unsure what variables are available to print, always check `dice_bot_backup.py` to see how the original `print()` statements formatted the data. 
4. **DON'T OVERENGINEER**: The dashboard should reflect the *actual* state of the bot. Do not add complex strategy labels or recovery trackers if the bot's underlying logic does not natively track them.

When updating the UI, keep it simple, accurate, and perfectly aligned with the bot's actual memory state.
