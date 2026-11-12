# TCNP / Electronic Nursing Record — Frontend V3

Frontend prototype for an Electronic Nursing Record (ENR) and Thai nursing practice classification interface.

## Status and scope

- This repository contains **frontend code only**. It is **not** a hospital production deployment.
- Requires a separately configured, trusted backend for auth, RBAC, RLS, auditing, patient access and clinical record lifecycle controls.
- Do not upload any real patient data, passwords, API keys or clinical PDF references.
- Demo patients in `assets/js/mock/patients.js` are synthetic.
- API base is configured as `/api` in `assets/js/core/config.js`.
- This frontend is not intended for direct public use with real patient data or hospital systems.

## Temporary presentation demo — 19 Nov 2026

For lecture attendees, use the **standalone, fully synthetic** [presentation demo](demo/index.html). It has no authentication or API/backend, stores state **only in current tab memory**, and does not send information to a server. It is **not** the hospital-integrated ENR application. Do not enter any real patient data.

Instructions for the presenter, GitHub Pages deployment, and post-event removal: [Presentation demo guide](docs/PRESENTATION_DEMO.md).

## Run a local preview

```bash
python3 -m http.server 8081
```

Open `http://localhost:8081/`. With `USE_MOCK_DATA: true`, login and API-backed pages require a separately configured test backend. Do **not** assume the local static server simulates the API.

See [README_V3.md](README_V3.md) for frontend features and [SECURITY.md](SECURITY.md) for safe-publication requirements.

## Development

Please review interface access/usage rights and all clinical content licenses before further public distribution. This repository is a demonstration only.

## Automated validation

```bash
python3 scripts/preflight_public.py
python3 scripts/check_frontend.py
node --test tests/*.test.cjs
```

See [release readiness review](docs/RELEASE_READINESS.md) for known blockers. This public branch still contains localStorage-based clinical prototype modules, so **never use real patient data**. The TCNP v1.8 and nursing terminology redistributability must be reviewed before merging/publishing more broadly.

## Frontend V3 (full interface) — GitHub Pages presentation

The **real V3 frontend screens** are available, not a separate simplified demo. In the `gh-pages` branch, the presentation-only adapter at `assets/js/mock/browser-api.js` preserves TCNP v1.8 lookup, all ward names, simulated patients and DRAFT/SIGNED/Addendum workflows in this browser.

No hospital backend is connected. Entries are stored only in this browser's localStorage and **do not sync between attendees**. Never enter real names, HN/AN, passwords or clinical notes. Use the yellow **ล้างข้อมูลทดลอง** button to reset data after the session. Simulation status is not a clinical sign-off or audit trail. Backend-only analytics and some administrative workflows remain unavailable.

For the hospital source version, set `USE_MOCK_DATA: false` and implement secure backend API, RBAC, auditing and server-side records before any live data use. Static content and any third-party TCNP terminology must be cleared for public distribution by the rights holder.
