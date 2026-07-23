import re

with open('dice_bot_utf8.py', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace virtual_state = 'NONE' initialization (keep it just in case)
content = re.sub(r"v_state = s\.get\('virtual_state', 'NONE'\)", "v_state = 'NONE'", content)

# Remove the big virtual state trigger and breaker blocks
# From: if virtual_state == 'NONE': (around 2721) to before '--- BET SIZING ---'
pattern1 = r'(\s*)if virtual_state == "NONE":.*?# --- BET SIZING ---'
content = re.sub(pattern1, r'\1# --- BET SIZING ---', content, flags=re.DOTALL)

# Fix bet sizing
pattern2 = r'(\s*)if virtual_state != "NONE":\s*current_bet = 0\.0\s*else:\s*current_bet = round\(base_bet \* get_fib_multiplier\(fib_step\), 8\)'
content = re.sub(pattern2, r'\1current_bet = round(base_bet * get_fib_multiplier(fib_step), 8)', content, flags=re.DOTALL)

# Fix proactive balance check
content = content.replace('if virtual_state == "NONE" and current_bet > balance:', 'if current_bet > balance:')

# Remove virtual_state checking from rotation trigger
content = content.replace('time_trigger = (virtual_state == "NONE" and total_bets >= self.next_rotation_bet)', 'time_trigger = (total_bets >= self.next_rotation_bet)')

# Remove take profit reset to virtual
content = content.replace('virtual_state = "TAKE_PROFIT_RESET"', '')

# Remove mode_str virtual
content = content.replace('mode_str = f"VIRTUAL({virtual_state})" if virtual_state != "NONE" else "REAL"', 'mode_str = "REAL"')

with open('dice_bot_utf8.py', 'w', encoding='utf-8') as f:
    f.write(content)

with open('accounting_bot.py', 'r', encoding='utf-8') as f:
    content2 = f.read()

content2 = content2.replace('mode = "VIRTUAL" if virtual_state != "NONE" else "REAL"', 'mode = "REAL"')
with open('accounting_bot.py', 'w', encoding='utf-8') as f:
    f.write(content2)

print('Patched successfully')
