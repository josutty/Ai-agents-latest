---
name: plan-sprint
description: Accepted BRD → sprint backlog tagged implement-api/ui
agent: orchestrator-agent
argument-hint: "${input:arguments}"
---
# /plan-sprint

## Objective
Accepted BRD → sprint backlog tagged implement-api/ui.

Cross-artifact gap analysis is an **internal step** of this command (former internal plan step). Do not advertise a public gap command.

## Runtime Inputs

### Required
- BRD path (Accepted or waiver)
- sprint ID
- goal
- duration

### Optional
- existing UX / OpenAPI / data paths (gap-identifier; do not invent if missing)

## Plan-as-input mode
When `governed_plan` or `sprint_governed_plan` is supplied, apply `.github/templates/plan-as-input-protocol.md` before Clarification Protocol.

## Use Agents
orchestrator-agent → planner-agent (mode sprint)

## Delegate to Subagents
gap-identifier, sprint-planner, requirement-traceability-mapper, open-questions-cataloger

## Enforce Rules
09, 10, 11, 13, 22

## Use Templates
sprint-plan-template.md, requirement-traceability-template.md

## Required Output
- artifacts/sprints/<id>-gap-report.md
- artifacts/sprints/<id>-plan.md

## Command-Specific Hardening
Refuse unless BRD status is **Accepted** or an explicit waiver exists in `docs/harness/decisions.md`. A BRD that remains **Draft — Pending Domain Review** cannot start `/plan-sprint`. Output status is **Proposed — Pending Approval** — agents cannot self-approve.

## Execution Policy

Load `.github/templates/command-iteration-policy.md` and `plan-act-validate-refine-loop.md`.

**Primary delegate:** planner-agent (once per `command_iteration`).

Orchestrator owns `command_iteration: 1..3` for this entire command. No nested retry loops. Iteration 1 Validate pass → stop. After iteration 3 → **needs_human**, harness Blocked, no edits. Record every pass in the orchestrator audit **Command iteration ledger**.

## Clarification Protocol
After resolve-before-ask, register remaining gaps as Open DQ with owner. Do not invent. Do not STOP for a clarification round except human gates (BRD Accepted, plan Approved). Still refuse when Required BRD path is absent or BRD is Draft without waiver.

## Artifact Persistence
Canonical paths above plus `artifacts/audit/<date>-<command>-<task>.md`. Metadata: timestamp, iteration, validation summary.

## Definition of Done
- [ ] Every SP maps to FR/BR
- [ ] Critical gaps owned or none
- [ ] Proposed — Pending Approval
- [ ] `artifacts/audit/<date>-plan-sprint-<task>.md` written
- [ ] Harness updated (phase-changing)

## Next command

> ✅ command complete.
> **Next command:** `/implement-api` (command spine) or /implement-api after Approval
