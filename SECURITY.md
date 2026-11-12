# Security and Privacy

This public repository contains a **prototype frontend**, not a deployed clinical service.

- Never commit patient records, personal identifiers, hospital numbers (HN), screenshots of real cases, research data, access credentials, secrets, or clinical PDF content.
- Clinical authentication, authorizations, signed-record lifecycle, RLS and audit logging **must be validated by the backend**. Client-side checks are not sufficient.
- No real patient data should be placed in browser localStorage/sessionStorage.
- Rotate any credential disclosed in Git history immediately; deleting the latest version of a file is insufficient.
- Use only fictitious patient data for demos and training.
- Obtain permission for every externally licensed clinical classification or reference material before redistributing.
