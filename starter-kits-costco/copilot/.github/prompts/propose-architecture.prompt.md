---
name: propose-architecture
description: Structured Q&A → architecture proposal + Proposed ADRs (documentation-agent mode architecture)
agent: orchestrator-agent
argument-hint: "${input:arguments}"
---
# /propose-architecture

## Objective
Structured Q&A on requirements, cloud, and tech stack → detailed **architecture proposal** + **Proposed** ADRs. **documentation-agent** mode `architecture`. Optional satellite — **not** in the locked execute spine; does **not** block `/plan-sprint` or `/implement-*`.

## When to use
- Greenfield before `/plan-sprint` or `/generate-brd`
- Major stack, cloud, or topology change
- Optional input before (not in this kit)
- When BFF, microservices, micro-frontend, or client/server boundaries need explicit documentation for downstream agents

## Runtime Inputs

### Required
- None (standalone). With zero inputs, run the full questionnaire from `architecture-questionnaire-template.md`.

### Optional
- `brd_path` (Draft or Accepted BRD)
- `@story_artifact` (techno-functional pack)
- Prior ADRs under `docs/architecture/`
- `cloud_target` (azure / aws / gcp / on-prem / hybrid)
- `stack_preference` (e.g. java+next, python+next)
- Compliance tags (e.g. SOC2, PCI — cite; do not assume HIPAA)
- Existing repo layout or `.github/config.yaml` when present

## Plan-as-input mode
When `governed_plan`, `sprint_governed_plan`, or `@story_artifact` is supplied, load `.github/skills/plan-as-input/SKILL.md` and apply `.github/templates/plan-as-input-protocol.md` before Phase 1 Q&A. Cite resolved bindings; do not re-ask.

## Use Agents
orchestrator-agent → documentation-agent (mode `architecture`)

## Delegate to Subagents
open-questions-cataloger → nfr-checklist-builder → architecture-proposal-writer

## Enforce Rules
00, 08, 09, 10, 22

## Use Templates
`command-iteration-policy.md`, `architecture-questionnaire-template.md`, `architecture-proposal-template.md`, `adr-template.md`, `audit-trail-template.md`, `plan-act-observe-reflect-loop.md`

## Use Skills
`.github/skills/architecture-proposal/SKILL.md`

## Required Output
- `docs/architecture/<YYYY-MM-DD>-architecture-proposal.md` (status **Proposed — Pending Architecture Review**)
- `docs/architecture/adr-<NNN>-<slug>.md` (one per major decision; status **Proposed** only)
- `artifacts/architecture/<YYYY-MM-DD>-questionnaire-log.md`
- `artifacts/diagrams/<YYYY-MM-DD>-logical-topology.mmd` (when topology is described)
- `artifacts/audit/<YYYY-MM-DD>-propose-architecture-<task>.md`

## Command-Specific Hardening
- **Q&A allowed:** STOP and ask the operator when cloud, scale, compliance, or stack constraints are unknown. This command is questionnaire-first when inputs are thin.
- Must NOT emit DDL, OpenAPI operation fields, or product source code.
- Must NOT mark ADRs or the proposal **Accepted** — human architecture review only.
- Must NOT append to `docs/harness/decisions.md` or call harness-updater (not phase-changing).
- Uncited topology or NFR choices → `ASSUMPTION-<id>` or Open DQ with owner (rule 22).
- Recommend future `config.yaml` binding shapes as proposals only; label assumptions when the repo is silent.
- Orchestrator and other commands **must not** refuse implement or plan gates when architecture is still Proposed.

## Execution Policy

Load `.github/templates/command-iteration-policy.md` and `plan-act-observe-reflect-loop.md`.

**Primary delegate:** documentation-agent mode `architecture` (once per `command_iteration`).

Orchestrator owns `command_iteration: 1..3` for this entire command. No nested retry loops. Iteration 1 Observe pass → stop. After iteration 3 → **needs_human**, no edits. Record every pass in the orchestrator audit **Command iteration ledger**.

### Phases
1. **Discover** — Load optional BRD/story/config/ADRs; run questionnaire for gaps.
2. **Catalog** — `open-questions-cataloger` + `nfr-checklist-builder` (cite or gap only).
3. **Propose** — `architecture-proposal-writer` fills proposal + ADRs + Mermaid topology.
4. **Validate** — Every major decision has an ADR or explicit DQ; no Accepted status; provenance on drivers.

## Clarification Protocol
Unlike execute-spine commands, structured ask rounds are **required** when cloud_target, scale, compliance scope, or stack preference are missing after input scan. Register remaining gaps as Open DQ. Do not invent requirements or NFRs.

## Artifact Persistence
Canonical paths above. Metadata: timestamp, iteration, validation summary, source locators. No secrets in questionnaire log.

## Definition of Done
- [ ] Questionnaire log written (questions + operator answers)
- [ ] Proposal complete per `architecture-proposal-template.md` with status Proposed
- [ ] ≥1 ADR per major decision (topology, BFF, auth, data, deployment, UI composition as applicable)
- [ ] All ADRs status **Proposed**; ADR index in proposal links each file
- [ ] Logical topology diagram when services/contexts are described
- [ ] Open gaps table with owners; assumptions registered
- [ ] `artifacts/audit/<date>-propose-architecture-<task>.md` written

## Next command

> ✅ `/propose-architecture` complete.
> **Next command:** `/generate-brd` or `/plan-sprint` (human chooses). Human may set ADRs to **Accepted** before planning; not required for implement spine.
