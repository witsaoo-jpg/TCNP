# GitHub-clean checklist

- [x] Exclude PDF reference material, ZIPs, backups and OS metadata
- [x] Remove prefilled sample account/password from login UI
- [x] Replace mock patient names and identifiers with synthetic labels
- [x] Set frontend-only README, SECURITY.md and .gitignore
- [x] Static syntax validation of JS source, where supported
- [ ] Manual review for any other PHI/identifiers, credentials, operational internal URLs and clinical licensing
- [ ] Functional browser test with an approved test backend (not performed here)
- [ ] Owner review of Pull Request before public merge

**Notice:** frontend source contains clinical terms and test workflows; no production use is implied by repository publication.
