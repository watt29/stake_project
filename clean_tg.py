import ast

with open('dice_bot_utf8.py', 'r', encoding='utf-8') as f:
    lines = f.readlines()

with open('dice_bot_utf8.py', 'r', encoding='utf-8') as f:
    source = f.read()

class TelegramVisitor(ast.NodeVisitor):
    def __init__(self):
        self.remove_lines = set()

    def visit_Call(self, node):
        if isinstance(node.func, ast.Name) and node.func.id in ['tg', 'tg_edit', 'tg_answer_callback']:
            for i in range(node.lineno, node.end_lineno + 1):
                self.remove_lines.add(i)
        self.generic_visit(node)

    def visit_FunctionDef(self, node):
        if node.name in ['tg', 'tg_edit', 'tg_answer_callback', '_telegram_polling_thread', '_handle_command', 'main_menu_markup', 'tp_menu_markup', 'sl_menu_markup']:
            for i in range(node.lineno, node.end_lineno + 1):
                self.remove_lines.add(i)
        self.generic_visit(node)

    def visit_Assign(self, node):
        for t in node.targets:
            if isinstance(t, ast.Name) and t.id in ['TELEGRAM_TOKEN', 'TELEGRAM_CHAT_ID', 'tg_thread']:
                for i in range(node.lineno, node.end_lineno + 1):
                    self.remove_lines.add(i)
        self.generic_visit(node)
        
    def visit_Attribute(self, node):
        if isinstance(node.value, ast.Name) and node.value.id == 'tg_thread':
            for i in range(node.lineno, node.end_lineno + 1):
                self.remove_lines.add(i)
        self.generic_visit(node)

    def visit_Expr(self, node):
        if isinstance(node.value, ast.Call):
            if isinstance(node.value.func, ast.Attribute) and isinstance(node.value.func.value, ast.Name) and node.value.func.value.id == 'tg_thread':
                for i in range(node.lineno, node.end_lineno + 1):
                    self.remove_lines.add(i)
            elif isinstance(node.value.func, ast.Name) and node.value.func.id == 'print':
                for arg in node.value.args:
                    if isinstance(arg, ast.JoinedStr):
                        for val in arg.values:
                            if isinstance(val, ast.FormattedValue) and isinstance(val.value, ast.Name) and val.value.id == 'TELEGRAM_CHAT_ID':
                                for i in range(node.lineno, node.end_lineno + 1):
                                    self.remove_lines.add(i)
        self.generic_visit(node)

tree = ast.parse(source)
visitor = TelegramVisitor()
visitor.visit(tree)

new_lines = []
for i, line in enumerate(lines, 1):
    if i not in visitor.remove_lines:
        new_lines.append(line)

with open('dice_bot_utf8.py', 'w', encoding='utf-8') as f:
    f.writelines(new_lines)
print(f"Removed {len(visitor.remove_lines)} lines of Telegram code.")
