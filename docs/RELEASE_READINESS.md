# ENR V3 — release readiness review (12 Nov 2026)

This repository is a **frontend prototype** for demonstration and review. It has **not** been approved for live clinical records or public patient access.

## Verified static checks

- 33 HTML pages and 41 JavaScript files parsed/checked.
- 161 local HTML script/style/image references resolve.
- Public-content preflight passed its simple rule-based scan; this is **not** an assurance that no confidential information exists.
- Login redirect is restricted to same-origin HTML under the current app mount path, with Node tests.
- A missing `change-password.html` redirect is replaced by a blocked sign-in with an administrator message. **Password-changing remains a missing backend-integrated feature.**
- Admin links now work for a static preview at `/` and for an ENR deployment at `/v3/`.

## Blocking issues before real use or merge approval

1. **Clinical information in browser storage — HIGH.** Some clinical and legacy pages still store patient profile, HN/AN, notes, monitoring values, clinical events or discharge information in `localStorage`. This can persist on shared workstations. Remove or migrate sensitive state to authenticated server-backed storage, establish session/logout cleanup, and test against approved privacy requirements. Do not use real patient data in the prototype.
2. **Backend integration — HIGH.** The authorized Node/Express/PostgreSQL backend is not present in this repository. End-to-end login, RBAC/RLS, clinical signing/cancel/amendment, and audit trails cannot be verified from the frontend alone.
3. **Password-change flow — HIGH.** The backend endpoint and account recovery workflow have not been provided. Accounts flagged `mustChangePassword` are deliberately blocked and instructed to use an approved administrator workflow. Implement an authenticated password-change flow when its backend contract is known.
4. **Clinical taxonomy licensing — REVIEW REQUIRED.** The published source includes TCNP v1.8 master terms in `data/tcnp_master_codes_v1.8.*` and nursing diagnosis content in `data.js`. Verify institutional/rights-holder permission to redistribute these data in a **public** repository. If permission cannot be confirmed, remove the terminology datasets from the public branch/history and load them privately from an authorized backend.
5. **Public repository exposure — REVIEW REQUIRED.** Some UI pages contain hospital labels and clinical workflows. Confirm approval to publish these artefacts and check every source/fixture for identifiers and internal system details.

## Automated checks

`python3 scripts/preflight_public.py`

`python3 scripts/check_frontend.py`

`node --test tests/*.test.cjs`

GitHub Actions workflow: `.github/workflows/frontend-ci.yml` runs all checks on pushes and pull requests.

## Browser testing

An attempted local Chromium/Playwright browser test was blocked by the current runtime's browser restrictions (`net::ERR_BLOCKED_BY_ADMINISTRATOR`), not by a verified application failure. No full browser/E2E or clinical backend testing is claimed.

## Release decision

**Not approved for production deployment. Keep PR #1 as Draft until the HIGH issues and permissions are resolved.**
