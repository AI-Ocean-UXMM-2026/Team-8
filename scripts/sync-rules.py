"""Regenerate the browser rule catalog from the project's business-rule document."""
import json
import re
from pathlib import Path
project = Path(__file__).resolve().parents[1]
source = project / 'rule.md'
text = source.read_text()
rules = []
for section, route in [('AI Review rules', 'AI'), ('Human Review rules', 'Human')]:
    body = text.split('## ' + section, 1)[1].split('\n## ', 1)[0]
    for number, title, description in re.findall(r'^(\d+)\. \*\*(.*?)\*\* — (.*)$', body, re.M):
        rules.append(dict(id=int(number), title=title, review=route, description=description))
assert sorted(rule['id'] for rule in rules) == list(range(1, 40)), 'Expected exactly rules 1–39'
target = project / 'dist' / 'rule-catalog.js'
target.write_text('const REVIEW_RULES=' + json.dumps(sorted(rules, key=lambda rule: rule['id']), ensure_ascii=False, indent=2) + ';\n')
print('Synced 39 business rules from', source.name)
