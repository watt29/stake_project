---
name: stake-bot-project-memory
description: Project memory for the Stake dice bot in `stake_project_3`. Use when maintaining or debugging `dice_bot_utf8.py`, stats persistence, betting-state transitions, virtual betting behavior, auto-pause behavior, recovery sizing, or dashboard/log output in this project.
---

# Stake Bot Project Memory

Use this skill to rebuild local project context quickly before editing the Stake bot.

## Starting Point

Treat `dice_bot_utf8.py` as the primary live file unless the user clearly directs work elsewhere.

Before changing logic, inspect:

1. state loading near the stats bootstrap
2. pre-bet calculation and bet gating
3. post-result state updates
4. state persistence back to stats
5. dashboard and log rendering

## Important Project Facts

- The project uses a live bot structure with persistent stats and resume behavior.
- `dice_bot_utf8.py` currently contains the main working flow for money state and virtual state.
- The bot must separate real betting decisions from progression logic.
- Resume safety matters because power loss, internet loss, or app interruption can leave stale state behind.

## Debugging Order

When behavior in logs looks wrong, check in this order:

1. Was the last result interpreted correctly as `W` or `L`?
2. Was `recent` updated?
3. Was money progression updated?
4. Was virtual mode updated after money progression?
5. Was the real/virtual gate applied only at the end?
6. Was the updated state saved?

## Known Sensitive Areas

Be careful when editing:

- `current_step`
- `strategy_state` / `money_state`
- `virtual_state`
- `bet_amount`
- `current_bet`
- `recent`
- resume mismatch handling
- auto-pause after goal or safety conditions

Small changes in ordering can cause the bot to appear to ignore the intended system even when syntax still passes.

## Working Style For This Project

- Prefer reading logs and state flow before changing formulas.
- Keep dashboard labels aligned with actual internal state.
- Preserve clear logs for every mode switch.
- Persist new state fields explicitly when adding them.
- Re-check syntax after every meaningful edit.

## References

Read `references/project-map.md` for file roles and `references/log-signals.md` for symptom-based debugging.
