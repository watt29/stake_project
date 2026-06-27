---
name: stake-bot-strict-rules
description: STRICT development rules and anti-patterns for the Stake dice bot. Use this to prevent breaking the bot with generic assumptions, syntax errors, or hallucinated variables.
---

# Stake Bot Strict Rules (DO NOT GUESS)

This project has highly specific legacy structures. To avoid breaking the bot and to ensure all fixes are permanent (`การแก้ไขไม่มั่ว`), you MUST ALWAYS follow these rules when editing `dice_bot_utf8.py`:

## 1. Argument Parsing (No `argparse`)
- **Rule:** DO NOT import or use `argparse`. 
- **Reason:** The bot parses arguments manually from `sys.argv` (e.g., looking for `--config` and `--duration`). Implementing `argparse` will conflict with the legacy system and cause `NameError` or crash the bot.

## 2. Safe Imports Only
- **Rule:** ALL `import` statements MUST be placed at the very top of the file.
- **Reason:** Placing `import sys`, `import time`, etc., inside `except` blocks or loops causes `UnboundLocalError: cannot access local variable 'sys' where it is not associated`.

## 3. Handling Strings and Foreign Characters
- **Rule:** DO NOT use blanket regex replacements (e.g., `re.sub(r'[^\x00-\x7F]')`) on the entire file.
- **Reason:** The file contains Thai characters and Emojis that, if improperly stripped, will accidentally delete necessary spaces (`\xa0`) or merge lines, resulting in `SyntaxError` (e.g., `invalid decimal literal` or `invalid character`). Edit strings individually or safely.

## 4. Dashboard & Variable Strictness
- **Rule:** DO NOT invent or hallucinate variables for the dashboard UI.
- **Reason:** Variables like `current_step` or `get_strategy_mode_label` do not exist. Always read the exact state fields (e.g., `fib_step`, `virtual_state`, `current_loss_streak`) from the `_bot_state` or `persistent` dictionaries. Check `dice_bot_backup.py` if unsure of the original variable names.

## 5. Indentation Awareness
- **Rule:** DO NOT blindly apply standard 4-space dedent/indent logic.
- **Reason:** The file has a unique, heavily indented structure (some loops are indented 20 or 24 spaces). Before moving a block of code (e.g., moving notification spam logic), check the exact indentation of the target destination block first.
