#!/usr/bin/env python3
"""Check HTML file references and JS syntax with only stdlib + installed Node.

Checks source structure only; it does NOT test clinical correctness, patient-data
privacy, API contracts, backend authorization, or licensing.
"""
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse, unquote
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]


class References(HTMLParser):
    def __init__(self):
        super().__init__()
        self.base = None
        self.refs = []

    def handle_starttag(self, tag, attrs):
        data = dict(attrs)
        if tag == 'base' and data.get('href'):
            self.base = data['href']
        if tag in {'script', 'img', 'link'}:
            ref = data.get('src' if tag != 'link' else 'href')
            if ref:
                self.refs.append((tag, ref))


def static_ref(html_file, base, value):
    parsed = urlparse(value)
    if parsed.scheme or parsed.netloc or value.startswith(('#', 'data:', '//')):
        return None
    if parsed.path.startswith('/'):
        # Absolute paths are deployment-specific; backend owns API routes.
        return None
    anchor = html_file.parent
    if base:
        anchor = anchor / urlparse(base).path
    candidate = (anchor / unquote(parsed.path)).resolve()
    if not candidate.is_relative_to(ROOT.resolve()):
        raise ValueError(f'path escapes repository: {value}')
    return candidate


def main():
    problems = []
    checked_refs = 0
    pages = sorted(ROOT.rglob('*.html'))
    js_files = sorted(ROOT.rglob('*.js'))
    for html in pages:
        scan = References()
        scan.feed(html.read_text(encoding='utf-8'))
        for kind, ref in scan.refs:
            if kind == 'link' and not ref.lower().split('?')[0].endswith('.css'):
                continue
            try:
                file = static_ref(html, scan.base, ref)
            except ValueError as exc:
                problems.append(f'{html.relative_to(ROOT)}: {exc}')
                continue
            if file is not None:
                checked_refs += 1
                if not file.is_file():
                    problems.append(f'{html.relative_to(ROOT)}: missing {ref}')
    for js in js_files:
        check = subprocess.run(['node', '--check', str(js)], capture_output=True, text=True)
        if check.returncode:
            problems.append(f'{js.relative_to(ROOT)}: JavaScript syntax error: {check.stderr.strip()}')
    # The old frontend linked to a nonexistent password-change screen.
    for file in [*pages, *js_files]:
        if 'change-password.html' in file.read_text(encoding='utf-8'):
            problems.append(f'{file.relative_to(ROOT)}: obsolete, missing change-password.html route')
    print(f'Static frontend check: {len(pages)} HTML, {len(js_files)} JS, {checked_refs} local asset references')
    if problems:
        print('FAIL:')
        for line in problems: print(' -', line)
        return 1
    print('PASS: all checked HTML references exist and JS syntax is valid.')
    return 0

if __name__ == '__main__':
    sys.exit(main())
