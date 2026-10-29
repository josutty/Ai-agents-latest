---
name: close-eval-gaps
description: Walk eval fix-queue; inner loop for /run-eval only
agent: orchestrator-agent
argument-hint: "${input:arguments}"
---
# /close-eval-gaps

## Objective

Walk `evals/product/results/<date>-fix-queue.json`: skip human-gated items, delegate `auto_fix: true` to owning agents, re-run those `case_path`s, log every hop. Inner loop for `/run-eval` only. After fixes that affect runtime, re-run `scripts/verify-stack-health.sh` before claiming closed.

## Orchestration

| Phase | Role | Agent |
|-------|------|-------|
| 1 Read queue | Primary | orchestrator-agent |
| 2 Classify | — | skip `waived` / `needs_human` (`auto_fix: false`) |
| 3 Fix | Owning agent | backend / frontend / api-agent / quality / documentation / eval-agent |
| 4 Re-eval | Subagent | eval-agent (those `case_path`s only) |
| 5 Log | Orchestrator | fix-queue status + fix-log + audits |

Max **3** attempts **per fix-queue item** — ceiling inside this command. Green after attempt 1 → `closed`; do not burn remaining attempts. Stay in `scope.yaml`. Item attempts do **not** grant nested command-level iteration budgets to owning agents.

## Execution Policy

Load `.github/templates/command-iteration-policy.md`.

Orchestrator owns `command_iteration: 1..3` for the **command**; per-item fix attempts are a sub-budget documented in the fix-log, not separate orchestrator iterations unless the whole command Validate fails and requires a full re-pass. Record command-level passes in the orchestrator audit **Command iteration ledger**.

## Runtime Inputs

### Required

- `evals/product/results/<date>-fix-queue.json`

## Enforce Rules

09, 10, 07

## Use Templates

`eval-fix-log-template.md`, `eval-results-template.md`, `audit-trail-template.md`

## Use Skills

`.github/skills/eval-suite/SKILL.md`

## Clarification Protocol

After resolve-before-ask, register Open DQ when `evals/product/results/<date>-fix-queue.json` is missing. Do not invent queue items. Human-gate items stay listed, not dropped. Do not STOP for a clarification round except human gates. Still refuse when the queue file is absent.

## Definition of Done

- [ ] Every `auto_fix: true` item is `closed` or `needs_human` (attempt 3)
- [ ] Queue and fix-log updated
- [ ] Per-agent `artifacts/audit/<date>-<agent>-eval-fix-<item>.md`
- [ ] Orchestrator audit written
- [ ] Human-gate items listed, not dropped

## Next command

```
✅ /close-eval-gaps complete.
**Next command:** resume parent /run-eval. If items are needs_human, wait, then re-run /close-eval-gaps.
```
