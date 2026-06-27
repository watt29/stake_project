---
name: stake-bot-log-review
description: Review and interpret Stake dice bot logs, console snapshots, and dashboard output to find likely causes of incorrect behavior. Use when a user says the bot is not following the required system, shows confusing steps or modes, behaves differently in live use than expected, or needs root-cause analysis from logs before editing `dice_bot_utf8.py`.
---

# Stake Bot Log Review

Use this skill when the user provides logs, console output, or screenshots of bot behavior and wants to know what is wrong.

## Goal

Translate log symptoms into likely logic faults before editing code.

## Review Order

Inspect evidence in this order:

1. current mode labels shown on screen
2. current step shown on screen
3. last result (`WIN` or `LOSS`)
4. recent history string
5. whether bet amount looks real or virtual
6. whether the next transition matches the intended rules

After that, map the symptom to the most likely code area.

## What To Infer

Infer which layer is wrong:

- result parsing
- money-state update
- virtual-state update
- final real/virtual bet gate
- persistence/resume state
- dashboard rendering only

Do not assume the formula is wrong first. Often the problem is ordering, stale state, or display mismatch.

## Output Style

When reviewing logs:

1. state the most likely fault
2. name the code area to inspect first
3. mention the next one or two fallback suspects
4. say whether this looks like a real logic bug or only a display bug

Keep findings first. Keep summaries short.

## Common High-Value Checks

- If virtual mode is shown but steps stop changing, suspect an early return or misplaced gate.
- If Step 8+ looks wrong after losses, inspect recovery progression before payout math.
- If log says one mode but bet sizing matches another, suspect dashboard/rendering drift.
- If behavior changes after restart or reconnect, inspect saved stats and resume safety.
- If W-W reset appears during recovery, money-state separation is broken.

## References

Read `references/symptom-map.md` for symptom-to-cause mapping and `references/review-template.md` for a compact review format.
