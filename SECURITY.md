# Security policy

This repository is a **public code repository for a demonstration-only frontend**. It is not an approved clinical deployment.

## Never commit

- Real patient data, hospital number (HN) lists, medical record numbers, names, contact details, photos, exports, or screenshots containing identifiers.
- Database dumps, internal hospital configuration, API credentials, JWT secrets, passwords, access tokens, private keys, or real environment files.
- Copyrighted clinical classification/reference PDFs without explicit permission.
- Backup/original copies containing old passwords or test accounts.

## Development and publication

1. Run the preflight checker before every public release: `python3 scripts/preflight_public.py`.
2. Review every added file manually; a pattern scan cannot guarantee the absence of sensitive information.
3. Keep the backend, PostgreSQL database, private hospital APIs and production configuration outside this public repository.
4. Never rely on frontend-only checks for authentication, authorization, or clinical record signing.
5. Verify that all published screenshots and demo fixtures are entirely synthetic.
6. If a secret is ever committed, **revoke/rotate it immediately**. Removing it in a later commit does not erase it from Git history.

## Reporting

Report vulnerabilities privately to the repository owner rather than opening an issue containing secrets or patient data.
