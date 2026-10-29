---
name: run-eval
description: Sole factory eval entry; completeness ledger and fix-queue
agent: orchestrator-agent
argument-hint: "${input:arguments}"
---
# /run-eval

## Invocation

`/run-eval` — sole factory eval entry. Default mode is `incremental`.

Optional: `/run-eval --mode=full-sweep` — entire rule-coverage (L1-10) + pipeline gates (L4-*) + judge calibration (LX-*) + agent-result families.

## Objective

Evaluate coding, testing, and agent-output gaps against `evals.rule_source`. Emits completeness ledger and fix-queue. When `auto_fix: true` items are open, orchestrator **delegates to owning agents via the `agent` tool** (see `.github/skills/eval-suite/SKILL.md`) — do not re-invoke a slash prompt.

## Use Agents

- orchestrator-agent
- quality-agent

## Delegate to Subagents

- eval-agent (`mode: incremental` default, or `full-sweep`)
- audit-trail-writer

## Enforce Rules

00, 07, 09, 10, 22

## Use Templates

`eval-results-template.md`, `audit-trail-template.md`, `plan-act-validate-refine-loop.md`

## Use Skills

`.github/skills/eval-suite/SKILL.md`, `.github/skills/br-coverage/SKILL.md`

## Runtime Inputs

### Required

- `evals.rule_source` in config points at Accepted BRD or story pack
- `/run-tests` results exist for the slice (`artifacts/test-results-*.md`) unless `--mode=full-sweep` with documented waiver

## Command-Specific Hardening

Incremental still includes always-on safety families (L1-04, L1-05, L1-08, L1-09, L4-03). Refuse complete without `evals/product/results/<date>-completeness-ledger.md`. Silence (no case) is not a pass. Do not disable JaCoCo or edit `pom.xml` coverage floors. Cannot waive P0/P1.

Eval-agent must also score **agent results**: TCG completeness evidence, coverage-gate honesty, `/run-tests` vs matrix, Playwright AC citations, intake-scan evidence (when untrusted inputs were used), defect-analysis completeness, coding gaps visible in the slice.

Before completing, orchestrator walks the fix-queue: delegate each `auto_fix: true` item to its owning agent via **`agent` tool** (same procedure as `close-eval-gaps.prompt.md`), then re-run affected eval cases.

## Execution Policy

Load `.github/templates/command-iteration-policy.md` and `plan-act-validate-refine-loop.md`.

**Primary delegate:** quality-agent → eval-agent (once per `command_iteration`). `/close-eval-gaps` uses a **per fix-queue item** attempt budget inside this command — it does not reset `command_iteration`.

Orchestrator owns `command_iteration: 1..3` for this entire command. No nested retry loops. Iteration 1 Validate pass → stop. After iteration 3 → **needs_human**, harness Blocked, no edits. Record every pass in the orchestrator audit **Command iteration ledger**.

## Execution flow

1. Plan: extract in-scope rule IDs; union always-on safety families; list agent-result checks.
2. Act: eval-agent creates/runs cases; writes ledger + fix-queue.
3. Validate: ledger complete; no family green with zero cases; P0/P1 not silently skipped.
4. Refine: orchestrator delegates fix-queue items to owning agents (`agent` tool); eval-agent re-runs those paths only.

## Decision logic

- If rule_source missing → register Open DQ; refuse the run.
- If `/run-tests` results missing in incremental mode → refuse or record Open DQ; do not invent pass.
- If requirements unclear → **ask user**; do not invent.

## Clarification Protocol

After resolve-before-ask, register Open DQ when `evals.rule_source` or incremental test-results are missing. Do not invent rules to fill the ledger. Do not STOP for a numbered clarification round except human-gated queue items. Still refuse when rule_source is absent.

## Artifact persistence

- `evals/product/results/<date>-incremental.md` + `.json` (or `full-sweep`)
- `evals/product/results/<date>-completeness-ledger.md`
- `evals/product/results/<date>-fix-queue.json`
- `evals/product/results/<date>-fix-log.md`
- `artifacts/audit/<date>-run-eval-<task>.md`

## Definition of Done

- [ ] Completeness ledger present; every in-scope rule and always-on family has a row
- [ ] Agent-result rows present (TCG, coverage gate, run-tests vs matrix, Playwright citations, intake scan when applicable, defect analysis, coding gaps)
- [ ] Always-on safety families present
- [ ] `auto_fix` queue empty or `needs_human` (after `/close-eval-gaps`)
- [ ] No family marked green because it had zero cases
- [ ] Audit written; harness updated (phase-changing)

## Next command

**Next command:** `/review-changes` (when ledger is complete and auto_fix is closed or needs_human)

If `needs_human` remains on the queue: wait, then re-run `/close-eval-gaps` / `/run-eval`.

```
✅ /run-eval complete.
**Next command:** /review-changes
```
