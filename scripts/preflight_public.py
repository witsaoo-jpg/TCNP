#!/usr/bin/env python3
"""Simple safety preflight for a public *frontend-only* ENR repository.

This is a heuristic safety gate, not a substitute for manual privacy and
security review. Run from any directory: python3 scripts/preflight_public.py
"""
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
TEXT_EXTENSIONS = {".html", ".htm", ".js", ".mjs", ".cjs", ".jsx", ".ts",
                   ".tsx", ".css", ".json", ".md", ".txt", ".yml", ".yaml"}
BLOCK_EXTENSIONS = {".zip", ".7z", ".rar", ".pdf", ".csv", ".tsv", ".xls",
                    ".xlsx", ".db", ".sqlite", ".sqlite3", ".dump", ".sql",
                    ".pem", ".key", ".p12", ".pfx"}
BLOCK_NAMES = {".ds_store", "thumbs.db", "desktop.ini", ".env",
               "id_rsa", "id_rsa.pub"}
BLOCK_DIRS = {".git", "__macosx", "node_modules", "backups", "backup",
              "patient_data", "clinical_data", "uploads", "secrets",
              "credentials"}
PATTERNS = [
    ("possible hardcoded demo password",
     re.compile(r"""(?i)(?:password|passwd|รหัสผ่าน)\s*[:=]\s*['\"]?1234\b""")),
    ("GitHub token",
     re.compile(r"\b(?:ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{15,}\b")),
    ("potential API secret",
     re.compile(r"\bsk-[A-Za-z0-9_-]{20,}\b")),
    ("private key",
     re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----")),
    ("database URI with embedded credential",
     re.compile(r"(?i)(?:postgres(?:ql)?|mysql)://[^\s:@/]+:[^\s@/]+@")),
]

def check():
    findings = []
    scanned = 0
    for path in sorted(ROOT.rglob("*")):
        if not path.is_file():
            continue
        relative = path.relative_to(ROOT)
        if any(p.lower() in {".git", "node_modules", "__pycache__"}
               for p in relative.parts[:-1]):
            continue
        if any(p.lower() in BLOCK_DIRS - {".git", "node_modules"}
               for p in relative.parts[:-1]):
            findings.append(f"{relative}: blocked directory")
            continue
        lower = path.name.lower()
        if lower in BLOCK_NAMES or lower.startswith(".env.") or                 lower.endswith((".bak", ".backup", ".orig", ".old")) or                 path.suffix.lower() in BLOCK_EXTENSIONS:
            findings.append(f"{relative}: blocked file type/name")
            continue
        if path.suffix.lower() in TEXT_EXTENSIONS:
            scanned += 1
            try:
                content = path.read_text(encoding="utf-8")
            except (OSError, UnicodeError):
                findings.append(f"{relative}: unreadable text file")
                continue
            for label, pattern in PATTERNS:
                if pattern.search(content):
                    findings.append(f"{relative}: {label}")
    print(f"ENR public release preflight: scanned {scanned} text files.")
    if findings:
        print(f"FAIL: {len(findings)} potential release hazards found:")
        for issue in findings:
            print(f"  - {issue}")
        return 1
    print("PASS: no matched hazards. Manual privacy review is still required.")
    return 0

if __name__ == "__main__":
    sys.exit(check())
