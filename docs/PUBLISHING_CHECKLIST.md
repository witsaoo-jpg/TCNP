# ENR frontend V3 — GitHub-clean publication checklist

Target: `witsaoo-jpg/TCNP` (public repository), **frontend only**.
Prepared for a demonstration on **19 November 2026**; not a hospital production deployment.

## Source intake

- [ ] Obtain the complete cleaned `frontend_V3` source files in an accessible workspace.
- [ ] Verify the original UI and clinical business logic are unchanged.
- [ ] Keep original relative paths for HTML/CSS/JS/image assets.
- [ ] Exclude `.DS_Store`, `__MACOSX`, backups, `*.orig`, database files, archives and PDFs (including NANDA/reference PDFs).
- [ ] Remove any real credentials or default passwords from README, login hints and source code.
- [ ] Check for personal/clinical data in demo HTML, JS, JSON, comments, screenshots and assets.
- [ ] Inspect external API URLs, frontend authentication flow, localStorage use, and CORS assumptions.
- [ ] Run `python3 scripts/preflight_public.py`, and inspect all warnings manually.
- [ ] Validate that relative assets load and every V3 demonstration screen works against an approved test backend.
- [ ] Verify no hospital endpoint or production credential is exposed.
- [ ] Add files on this branch only; do not commit directly to `main`.
- [ ] Review the PR diff and approve publication before merging.

## Important limitations

A `.gitignore` file only affects **untracked** files. It does not remove files already in Git history. Static frontends cannot safely contain server-side secrets or substitute for a backend's RBAC/RLS enforcement.

### Scope of this preparation

This branch contains publication safeguards. **It does not yet include the frontend V3 application files**, which must be independently audited before they can be published.
