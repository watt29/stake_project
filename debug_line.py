import sys
sys.stdout.reconfigure(encoding='utf-8')

with open('dice_bot.py', encoding='utf-8') as f:
    lines = f.readlines()

# Print lines around 3518
for i in range(3514, 3525):
    if i < len(lines):
        print(f"Line {i+1}: {repr(lines[i][:200])}")
