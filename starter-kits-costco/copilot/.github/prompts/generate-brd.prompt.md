---
name: generate-brd
description: Generate a structured BRD from meeting transcript(s) and supporting documents
agent: orchestrator-agent
argument-hint: "${input:arguments}"
---
# /generate-brd

## Objective
Generate a structured BRD from meeting transcript(s) and supporting documents. Does **not** write user stories.

## Orchestration
| Role | Agent / Subagent |
|------|------------------|
| Orchestrator | orchestrator-agent |
| Primary | requirements-agent |
| Subagents | transcript-analyzer → supporting-doc-synthesizer → open-questions-cataloger → brd-writer |

## Runtime Inputs

### Required
- Path to transcript(s)

### Optional
- Supporting documents (or confirm transcript-only)
- Module name / bounded context
- Updating existing BRD vs new draft

## Enforce Rules
- `.github/instructions/11-intake-planning-governance.instructions.md`
- `.github/instructions/10-audit-trail.instructions.md`
- `.github/instructions/09-agent-orchestration.instructions.md`
- `.github/instructions/22-behavior-provenance-and-anti-invention.instructions.md`
- `.github/instructions/31-untrusted-intake.instructions.md`

## Intake safety gate
Raw transcripts and supporting docs only — not factory BRD/plan outputs. Load `.github/skills/intake-safety/SKILL.md`. Run `python3 scripts/intake-safety-scan.py` on those paths **before** spawning requirements-agent. Exit 2 → STOP. Exit 1 → STOP until redaction or `docs/harness/decisions.md` waiver. Exit 0 → continue.

## Use Templates
`command-iteration-policy.md`, `transcript-intake-notes-template.md`, `brd-template.md`, `discussion-coverage-matrix-template.md`, `audit-trail-template.md`, `plan-act-observe-reflect-loop.md`

## Use Skills
`.github/skills/intake-safety/SKILL.md`, `.github/skills/brd-authoring/SKILL.md`

## Clarification Protocol
After resolve-before-ask, register Open DQ if missing:
1. Transcript path(s)
2. Supporting documents or transcript-only confirmation
3. Module / bounded context
4. New draft vs update of an existing BRD

Do not invent FR/BR from silence. Conflicts become DQ-xxx, not resolved requirements. Do not STOP for a clarification round except human gates. Still refuse when Required transcript path is absent. Output remains **Draft — Pending Domain Review** — never self-approve; `/plan-sprint` cannot start until Accepted or waiver.

## Execution Policy

Load `.github/templates/command-iteration-policy.md` and `plan-act-observe-reflect-loop.md`.

**Primary delegate:** requirements-agent (once per `command_iteration`).

Orchestrator owns `command_iteration: 1..3` for this entire command. No nested retry loops in primaries or subagents. Iteration 1 Observe pass → stop. After iteration 3 → **needs_human**, harness Blocked, no edits. Record every pass in the orchestrator audit **Command iteration ledger**.

## Definition of Done
- [ ] Intake-safety scan exit 0, or exit 1 with recorded human redaction/waiver
- [ ] Intake notes with source traceability
- [ ] Draft BRD sections 1–16 (N/A needs a reason)
- [ ] §13 discussion coverage matrix complete
- [ ] §14 open questions with owners and Blocking flags
- [ ] Status: **Draft — Pending Domain Review**
- [ ] `artifacts/audit/<date>-generate-brd-<task>.md` written
- [ ] Harness updated (phase-changing)
- [ ] Stop before `/plan-sprint`

## Outputs
- `artifacts/intake/<date>-intake-notes.md`
- `artifacts/brd/<module>-BRD-draft.md`
- `artifacts/audit/<date>-generate-brd-<task>.md`

## Next command

> ✅ `/generate-brd` complete.
> **Next command:** `/plan-sprint` — **after** domain review. Do not run it while status is Draft.

| Condition | Next command |
|-----------|--------------|
| BRD needs domain review (default) | Wait — review the draft, then `/plan-sprint` |
| BRD already Accepted | `/plan-sprint` |
