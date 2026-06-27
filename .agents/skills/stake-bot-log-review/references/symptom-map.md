# Symptom Map

## Bot says virtual but still behaves like real betting

Likely causes:

- final gate is in the wrong place
- `current_bet` is not zeroed during virtual rounds
- dashboard label is stale

Inspect:

- pre-bet calculation
- virtual gate
- dashboard fields

## Bot says virtual and step freezes

Likely causes:

- early `return` inside virtual logic
- money-state update moved below virtual gate

Inspect:

- round execution order
- post-result state updates

## Bot does not leave Fibonacci at Step 7 loss

Likely causes:

- wrong step comparison
- state switch is blocked by another branch
- stale loaded step/state

Inspect:

- Fibonacci loss branch
- saved `step`
- saved `money_state`

## Recovery keeps resetting too early

Likely causes:

- reset path triggered outside recovery win
- virtual logic touching money state
- resume mismatch logic clearing too aggressively

Inspect:

- recovery win branch
- reset branches
- resume mismatch handler

## Recovery loss does not continue Martingale

Likely causes:

- next recovery bet derived from `current_bet` zero during virtual mode
- Fibonacci code still running in recovery

Inspect:

- recovery loss branch
- planned bet vs real bet variables

## W-W reset fires in the wrong mode

Likely causes:

- consecutive-win logic not limited to Fibonacci mode
- recovery path leaks into Fibonacci logic

Inspect:

- win handling by state
- consecutive-win counters

## Dashboard step looks wrong but behavior seems right

Likely causes:

- display uses old variable like `fib_step` instead of `current_step`
- render block does not use state-based labels

Inspect:

- dashboard output only

## Restart causes strange behavior

Likely causes:

- new fields not saved
- old fields loaded without fallback
- resume balance mismatch reset changed state

Inspect:

- `load_stats`
- saved stats payload
- resume safety block
