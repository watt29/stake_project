---
name: stake-bot-money-virtual-guard
description: Keep the Stake dice bot's money progression and virtual betting layers separate. Use when editing `dice_bot_utf8.py` or related bot logic for Fibonacci steps, Martingale recovery, W-W reset, virtual betting (`LOSS_STREAK` / `SAWTOOTH`), dashboard state, resume state, or live-betting safeguards.
---

# Stake Bot Money Virtual Guard

Use this skill to preserve the bot's two-layer architecture while changing betting logic.

## Core Rule

Treat the bot as two independent state machines:

- `money_state`: controls money progression only
- `virtual_state`: controls whether the next round is real or virtual only

Never let `virtual_state` reset, skip, pause, or rewrite `money_state`.

## Workflow

Follow this order when changing the bot:

1. Read the current round result (`W` or `L`).
2. Update recent history.
3. Update `money_state` and step progression.
4. Update `virtual_state`.
5. Calculate the next planned bet from `money_state`.
6. Apply the final gate:
   if `virtual_state != "NONE"`, set `current_bet = 0.0` and do not place a real bet.

Do not return early when virtual betting is active.

## Money State Rules

Use `state == FIBONACCI` or `state == RECOVERY` logic explicitly. Do not infer mode from step ranges alone.

In Fibonacci mode:

- Use Step 1 through Step 7 only.
- On loss, move forward exactly `+1` step.
- On win, move back `-2` steps but never below Step 1.
- On two consecutive wins, reset to Step 1 and clear the consecutive-win counter.
- On loss at Step 7, switch to recovery and log `Switching from Fibonacci to Martingale Recovery`.

In Recovery mode:

- Do not use Fibonacci rules.
- On loss, continue Martingale progression.
- On win, reset bet sizing, reset to Step 1, switch back to Fibonacci, and log:
  `Recovery win: reset to Step 1`
  `Switched back to Fibonacci Mode`

## Virtual State Rules

`virtual_state` may be:

- `NONE`
- `LOSS_STREAK`
- `SAWTOOTH`

When `virtual_state != "NONE"`:

- Keep reading results.
- Keep updating recent history.
- Keep updating money progression.
- Keep updating step numbers.
- Set `current_bet = 0.0`.
- Skip real-money placement only at the final gate.

Do not let virtual mode:

- reset Fibonacci steps
- alter recovery reset behavior
- alter W-W reset behavior
- stop history updates
- stop money-state updates

## File Focus

When working in this project, inspect these areas in `dice_bot_utf8.py` first:

- persistent state loading and saving
- pre-bet sizing and final real/virtual gate
- post-result money-state updates
- post-result virtual-state updates
- dashboard and logging output

If behavior looks wrong in logs, verify the execution order before changing formulas.

## Logging Contract

Preserve these logs when the related behavior exists:

- `WW reset triggered in Fibonacci mode`
- `Switching from Fibonacci to Martingale Recovery`
- `Recovery win: reset to Step 1`
- `Switched back to Fibonacci Mode`
- `Entering virtual mode: LOSS_STREAK`
- `Entering virtual mode: SAWTOOTH`
- `Virtual bet active: current_bet = 0.0`
- `Virtual escape pattern matched: returning to real betting`

## References

Read `references/state-rules.md` before major logic edits.
