import sys, io, codecs
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
with codecs.open('c:/Users/Lenovo/Desktop/stake_project_3/dice_bot_original.py', 'r', 'utf-16') as f:
    lines = f.readlines()
for i, line in enumerate(lines):
    if 'tg(f' in line and not line.strip().startswith('#'):
        stripped = line.rstrip()
        if not stripped.endswith(')'):
            print(f'L{i+1}:', repr(line[:100]))
            if i+1 < len(lines):
                print(f'L{i+2}:', repr(lines[i+1][:100]))
            print('---')
