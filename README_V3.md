# ENR Frontend V3

Active integration version for Electronic Nursing Record (Chonburi Hospital).

## Current checkpoint: Checkpoint 2 — Template + Clinical-time hardening

### Main flow

`login.html → ward.html → patient_list.html → paperless.html → nursing_notes.html → nursing_note_new.html`

Additional pages:

- `summary.html` — Nursing Care Summary (Active / Resolved Problems)
- `pdf-preview.html` — printable F-A(S,O)-G-I-E form
- `legacy_nursing_note.html` — V1 reference only
- `legacy_summary.html` — V1 reference only

### Implemented in this checkpoint

- Login / Ward / Patient / Paperless navigation shell
- Patient header + patient settings modal
- All-access patient-setting behavior for the frontend prototype with local audit stub
- Clinical datetime separated from system-created datetime
- Shift display: DAY 08–16, EVENING 16–24, NIGHT 00–08
- Frontend clinical-time validation: no future time, backdate no more than 2 shifts
- F / A_S / A_O / G / I / E editor
- MANUAL item available by default in every section
- Flexible TCNP search by code / Thai / English
- TCNP snapshot fields kept with each selected item
- Template search + template selection + template application
- Sample template `RESP-001` mapped from `ENR_V3_TCNP_Template_Mapping.xlsx`
- Evaluation trend: IMPROVED / STABLE / WORSE
- Problem status: IN_PROGRESS / RESOLVED
- Note history page with Create New / Summary / PDF
- Nursing Care Summary groups repeated notes by nursing problem
- PDF preview includes F-A(S,O)-G-I-E, trend, problem status, clinical datetime, and system-created datetime

## Prototype storage warning

This frontend checkpoint still uses browser storage for development data. It is NOT the production clinical source of truth.

Next backend integration will replace prototype persistence with REST API + Node/Express + PostgreSQL, while backend/RLS/audit/business rules remain authoritative.

## Authentication

No demo credentials are distributed. Use an authorized test account from a separately configured development backend. Never expose production credentials or patient records in a public repository.

## TCNP

TCNP v1.8 master is stored under `data/tcnp_master_codes_v1.8.*` for frontend prototype search only. In production, TCNP search should be served by the backend API.
