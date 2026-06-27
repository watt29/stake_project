# State Rules

## Purpose

Use this reference when editing the Stake dice bot's step progression, recovery flow, or virtual betting filter.

## Architecture

The bot has two separate layers:

1. `money_state`
   - `FIBONACCI`
   - `RECOVERY`
2. `virtual_state`
   - `NONE`
   - `LOSS_STREAK`
   - `SAWTOOTH`

`virtual_state` is a gate on real betting only. It is not the owner of step progression.

## Required Execution Order

The correct order per round is:

1. get result
2. append recent history
3. update money state
4. update virtual state
5. compute planned bet
6. decide real bet or virtual bet at the end

Bad pattern:

```python
if virtual_state != "NONE":
    current_bet = 0.0
    return
```

Good pattern:

```python
update_recent()
update_money_state()
update_virtual_state()
planned_bet = calculate_next_bet()

if virtual_state != "NONE":
    current_bet = 0.0
else:
    current_bet = planned_bet
```

## Fibonacci Rules

- Steps: 1 to 7 only
- Loss: `+1` step
- Win: `-2` steps, minimum Step 1
- Two consecutive wins: reset to Step 1
- Loss on Step 7: switch to recovery

## Recovery Rules

- Continue Martingale on each loss
- Stay in recovery until a win occurs
- Win in recovery resets to Step 1 and returns to Fibonacci

## Virtual Rules

During virtual betting:

- read every result
- update `recent`
- update `money_state`
- update `step`
- do not place a real bet

## Practical Edit Checklist

Before finishing a change:

1. Confirm no early return blocks money-state updates during virtual mode.
2. Confirm recovery logic does not run Fibonacci W-W rules.
3. Confirm Fibonacci rules do not leak into recovery.
4. Confirm saved stats persist both money and virtual states.
5. Confirm logs still explain mode switches clearly.
