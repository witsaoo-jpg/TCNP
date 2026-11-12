# TCNP / ENR V3 — Release readiness review (12 Nov 2026)

## Two deployment modes

- `main` and development source branch: **actual V3 frontend**, `USE_MOCK_DATA: false`, requires approved Node/Express/PostgreSQL backend.
- `gh-pages`: **same V3 screens**, `USE_MOCK_DATA: true`, browser-only API adapter and synthetic records in localStorage, for conference testing only.

The old standalone `demo/` site was intentionally removed. The publicly accessible application is now the original V3 interface, **not a reduced mockup**.

## Verified checks

- Static checks: 33 HTML pages, 43 JavaScript files and 195 local references.
- Node regression tests: 15/15 PASS (login safety, TCNP search, synthetic ward/patient records, note lifecycle, localStorage isolation).
- Public-file/secret preflight PASS for configured patterns, **not** a guarantee of privacy or source-content rights.
- TCNP v1.8 source dataset contains 960 Focus/F and 2,108 Procedure/P terms.
- No real clinical authentication, server-side signing, auditable backend or PHI are implemented in the Pages version.

## Limitations

1. **Do not enter real patient data.** Browser localStorage is not approved storage for HN, AN, personal identifiers or clinical records. Use synthetic DEMO-* records only.
2. No real server, PostgreSQL integration, RBAC, RLS, audit trail or clinical sign-off in GitHub Pages. The simulated DRAFT/SIGNED/Addendum transitions are for user training only.
3. Hospital integration requires reconnecting the authorized backend with full security and clinical workflow testing.
4. Some Admin Analytics and backend-dependent functions are not available in public Pages.
5. Confirm copyright and redistribution permission for TCNP terminology and other nursing reference material before wider public distribution.
6. Browser end-to-end UI navigation could not be executed in this restricted test environment; static/link and model transport tests are not a replacement for a hands-on cross-browser acceptance test.

## Publication and retirement

Use **Settings → Pages → Deploy from a branch → `gh-pages` → `/(root)`**.
Check GitHub Pages reports live status and test on attendees' mobiles before creating a QR code.
After the event, disable Pages and have attendees clear their local demo data. Deleting a live site does not erase Git history.

**No use with real patients is approved.**