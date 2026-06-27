# Log Signals

## Symptom: Bot looks stuck in one system

Check whether:

- mode labels match internal state
- a reset path forced `current_step = 1`
- old virtual logic is still overriding the live path

## Symptom: Virtual mode breaks step progression

Check whether:

- there is an early `return` during virtual mode
- money-state updates happen after the virtual gate instead of before it
- state saving omitted `virtual_state` or money-state fields

## Symptom: Recovery does not continue after loss

Check whether:

- recovery loss uses planned bet sizing instead of real bet zero
- Fibonacci rules leaked into recovery
- a reset path clears recovery too early

## Symptom: Dashboard is confusing

Check whether:

- displayed step comes from `current_step`
- displayed strategy mode comes from `strategy_state`
- displayed virtual mode is separate from strategy mode
- displayed bet amount represents planned bet during virtual rounds

## Symptom: Restart or reconnect causes strange state

Check whether:

- `last_known_balance` mismatch reset ran
- stats restored old fields but not new ones
- a new field was added but never saved
