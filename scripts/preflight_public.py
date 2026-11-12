#!/usr/bin/env python3
"""Preflight scan for potentially risky files and token-looking strings."""
from pathlib import Path
import re
import sys
root = Path(__file__).resolve().parents[1]
forbidden = {'.pdf','.zip','.7z','.rar','.xls','.xlsx','.csv','.db','.sqlite','.dump','.sql','.pem','.key','.p12','.pfx'}
pat = [
 re.compile(r'(?i)\b(?:ghp|gho|github_pat)_[A-Za-z0-9_]{15,}\b'),
 re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'),
 re.compile(r'(?i)(?:postgresql|postgres|mysql)://[^\s:@/]+:[^\s@/]+@'),
 re.compile(r'(?i)value=["\']1234["\']'),
]
errors=[]
for p in sorted(root.rglob('*')):
 if not p.is_file() or '.git' in p.parts:continue
 if p.suffix.lower() in forbidden or '.backup' in p.name.lower() or p.name in {'.DS_Store'}: errors.append(str(p.relative_to(root))+': forbidden file');continue
 if p.suffix.lower() in {'.html','.js','.json','.md','.css','.txt','.yml','.yaml'}:
  try: data=p.read_text('utf8')
  except (UnicodeError,OSError): errors.append(str(p.relative_to(root))+': unreadable source');continue
  for rx in pat:
   if rx.search(data):errors.append(str(p.relative_to(root))+': possible secret')
print('Preflight:', 'PASS (manual review required)' if not errors else 'FAIL')
for e in errors:print(' -',e)
sys.exit(bool(errors))
