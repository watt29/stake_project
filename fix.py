import codecs
import re

with codecs.open('dice_bot.py', 'r', 'utf-8-sig') as f:
    content = f.read()

# Fix indentation and remove the inspect module stuff
content = re.sub(r' +import inspect\n +print\(f" +\[DEBUG\] Calling execute_async_script from: \{inspect\.stack\(\)\[1\]\.function\} / \{inspect\.stack\(\)\[2\]\.function\}"\)', '', content)
content = content.replace('print("   [DEBUG] execute_async_script returned!")', '')

with codecs.open('dice_bot.py', 'w', 'utf-8-sig') as f:
    f.write(content)
print("Done")
