# ENR V3 — public presentation demo only (19 November 2026)

This is a **standalone, temporary, static UI simulation** for a nursing presentation. It is intentionally separate from the real `/api`-dependent ENR frontend.

## What participants can try

Open `demo/` and follow the steps:

1. Choose example nursing ward (including ward 34).
2. Choose a fictional patient with a `DEMO-` identifier.
3. Create a fictional F–A(S,O)–G–I–E Nursing Note.
4. Edit a DRAFT, simulate SIGNED (which locks the original), add an Addendum, or cancel with a reason.
5. View the per-patient summary. Use **เริ่มต้นใหม่** to clear the in-memory simulation.

**No login, real database, API calls, browser storage or attendee data collection.** All entered text lives in the current tab's JavaScript memory, and disappears when the page reloads or closes. The demo sets `connect-src 'none'` in its Content Security Policy. There is no cross-device synchronization or permanent audit trail. Never type real patient information or hospital credentials.

## Preview locally before the talk

From the repository root:

```bash
python3 -m http.server 8081
```

Then open `http://localhost:8081/demo/` and run through the 5 steps. For slides/projector, open the demo in a clean browser tab. For mobile testing, use the GitHub Pages deployment once it has been enabled and verified.

## Publishing the demo with GitHub Pages

This branch includes `.github/workflows/demo-pages.yml`, which intentionally uploads **only the `demo/` folder**, not the full ENR source, to GitHub Pages.

A repository owner needs to visit **Settings → Pages → Build and deployment → Source → GitHub Actions** and enable GitHub Pages. The workflow runs on pushes to `chore/github-clean-frontend-v3` and may require GitHub Actions permission or a manual rerun after enabling Pages. Review the GitHub Actions job and the live site before distributing a QR code. **Do not circulate an unverified guessed Pages URL.**

If site publishing does not work, the local static preview is still usable for the presenter; public attendee access will require a verified hosted URL.

## After the presentation

1. Disable the Pages site under **Settings → Pages**.
2. Remove the demo workflow and `demo/` from the release branch, or archive/delete the demo repository after preserving any code you need.
3. **Never assume deleting the live site or commits makes once-public source private again** — Git history, forks, clones and caches can remain.
4. Keep production hospital deployment separate, private, approved, and backed by authenticated Node/Express/PostgreSQL services, server-side RBAC/RLS and audit controls.

## Tests

```bash
node --test tests/demo-state.test.cjs
python3 scripts/check_frontend.py
python3 scripts/preflight_public.py
```

These are static/unit tests, **not** approval for clinical use.
