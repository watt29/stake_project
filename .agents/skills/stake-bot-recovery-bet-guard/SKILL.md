---
name: stake-bot-recovery-bet-guard
description: >-
  Restores code integrity for the Stake dice bot, configures currency-based
  dynamic minimum bet guards, and resets history files to start fresh.
---

# Stake Bot Recovery & Dynamic Bet Guard

## Overview
This skill outlines how to recover the Stake dice bot (`dice_bot.py`) from local git history if it becomes corrupted, configure it to dynamically enforce minimum bet limits based on the active currency (e.g. 0.0005 TRX vs 0.00000001 BTC), and reset history/statistics files.

## Dependencies
None.

## Quick Start

### 1. Recover Code Integrity from Git
If the `dice_bot.py` file is corrupted or contains syntax errors, restore it to a clean state from git main branch:
```bash
git checkout HEAD -- dice_bot.py
```

### 2. Set Up Dynamic Bet Guard
Ensure that `dice_bot.py` dynamically selects the minimum bet size.
- **For TRX**: 0.0005
- **For Other Currencies**: 0.00000001

Add or verify the `get_min_bet` helper inside `dice_bot.py` after the `_active_bot` declaration:
```python
def get_min_bet(currency_str):
    c = currency_str.lower()
    if c == 'trx':
        return 0.0005
    return 0.00000001
```

Verify that in `dice_bot.py` bet sizing section, the base bet is guarded:
```python
min_bet_allowed = get_min_bet(self.currency)
if base_bet < min_bet_allowed:
    base_bet = min_bet_allowed
```

Ensure the configuration check command (`--check`) also validates against the dynamic minimum bet size:
```python
min_bet_allowed = get_min_bet(CURRENCY)
if BASE_BET < min_bet_allowed:
    raise ValueError(f"base_bet must be at least {min_bet_allowed} {CURRENCY.upper()}")
```

### 3. Reset Bot History
To reset stats, databases, and logs, execute the reset script:
```bash
python reset_history.py
```

## Common Mistakes
- **Hardcoding BTC limits**: Ensure that you do not write hardcoded limits like `0.05` or `0.00000001` directly in currency checks or error messages; always format using the active currency symbol and dynamic limit.
- **UTF-16 encoding corruptions**: When modifying `dice_bot.py`, preserve UTF-8/UTF-16 formatting to prevent syntax errors. Always check the file syntax after any edits:
  ```bash
  python -c "import ast; ast.parse(open('dice_bot.py', encoding='utf-8').read())"
  ```
