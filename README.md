# TCNP / Electronic Nursing Record — Frontend V3

Frontend prototype for an Electronic Nursing Record (ENR) and Thai nursing practice classification interface.

## Status and scope

- This repository contains **frontend code only**. It is **not** a hospital production deployment.
- Requires a separately configured, trusted backend for auth, RBAC, RLS, auditing, patient access and clinical record lifecycle controls.
- Do not upload any real patient data, passwords, API keys or clinical PDF references.
- Demo patients in `assets/js/mock/patients.js` are synthetic.
- API base is configured as `/api` in `assets/js/core/config.js`.
- This frontend is not intended for direct public use with real patient data or hospital systems.

## Run a local preview

```bash
python3 -m http.server 8081
```

Open `http://localhost:8081/`. With `USE_MOCK_DATA: false`, login and API-backed pages require a separately configured test backend. Do **not** assume the local static server simulates the API.

See [README_V3.md](README_V3.md) for frontend features and [SECURITY.md](SECURITY.md) for safe-publication requirements.

## Development

Please review interface access/usage rights and all clinical content licenses before further public distribution. This repository is a demonstration only.
