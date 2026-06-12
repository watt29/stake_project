import ftfy
import codecs

with codecs.open('dice_bot.py', 'r', 'utf-8-sig') as f:
    text = f.read()

fixed_text = ftfy.fix_text(text)

with codecs.open('dice_bot.py', 'w', 'utf-8-sig') as f:
    f.write(fixed_text)

print("ftfy finished.")
