---
description: Copilot starter kit always-on governance
applyTo: "**"
---

# GitHub Copilot — Starter Kit Governance

Same content as `.github/copilot-instructions.md`. See [COPILOT-FLOW.md](../../COPILOT-FLOW.md) and [KIT-SCOPE.md](../../KIT-SCOPE.md).

## Command spine (12 shipped)

```
/generate-brd → /propose-architecture → /plan-sprint
 → /generate-ui-design + /implement-api → /implement-ui
 → /expand-test-coverage → /run-tests → /run-eval
 → /close-eval-gaps (loop until fix-queue clear)
 → /review-changes → /application-summary
```

## Human gates

BRD Accepted → plan Approved → test-package Approved → completeness ledger + fix-queue → review.

## Always-on rules in this kit

`00`, `01`, `02`, `07`, `09`, `10`, `11`, `22`, `31` under `.github/instructions/`.

## Implement note

Agent-owned Spring/Next.js per `docs/architecture/stack-conventions.md`. No J2 template render pipeline in kit DoD.
