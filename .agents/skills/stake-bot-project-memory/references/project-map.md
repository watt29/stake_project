# Project Map

## Primary File

`dice_bot_utf8.py`

Use this as the main execution file for current bot behavior unless the user says another file is live.

## What To Inspect In `dice_bot_utf8.py`

### 1. Stats bootstrap

Read the default stats payload and the variables restored from persistent state.

Look for:

- `strategy_state` / `money_state`
- `step`
- `consecutive_wins`
- `bet_amount`
- `virtual_state`
- `last_known_balance`

### 2. Bet preparation

Read the block that:

- chooses condition and target
- calculates planned bet
- applies the final virtual gate
- performs proactive balance checks

### 3. Roll result handling

Read the section that:

- parses roll data
- determines win/loss
- updates balance
- updates money progression
- updates recent history
- updates virtual mode

### 4. Persistence and dashboard

Read the block that:

- saves stats
- updates `_bot_state`
- prints strategy and virtual mode

## Supporting Files

- `.agents/skills/stake-bot-money-virtual-guard/`
  Use this when changing progression rules or virtual betting separation.
- `reset_history.py`
  Use this when the user wants a clean state reset.

## Practical Rule

If a user says "bot not following log" or "ใช้งานจริงไม่ตรง", start from state ordering, not from payout math.
