# Artifact hooks (Copilot kit)

Git hook enforcement for canonical docs (no IDE runtime hooks in Copilot).

- Pre-commit: `tools/check-artifacts.mjs` → `verify-artifacts.mjs` (this folder)
- Orchestrator audits under `artifacts/audit/` must include **Command iteration ledger** (see `audit-trail-template.md`)
- Policy: `artifact-policy.json`

Install: enable `.githooks/pre-commit` via `git config core.hooksPath .githooks`.
