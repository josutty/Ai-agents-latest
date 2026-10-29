# Copilot AI Factory — Governance (always-on)

GitHub Copilot loads this file on every chat.

This repository ships a **portable, enterprise-grade AI SDLC factory** for GitHub Copilot. Training primary agents. Absorbed specialists are modes, check gates, or `.github/subagents/` — not extra peer primaries.

Do **not** assume a vendor, warehouse, optical, AS400, or HIPAA domain. Fill `.github/config.yaml` before generating product code.

Hard guarantees are enforced by git hooks (`.githooks/`) in addition to these rules.

---

## 1. Prime directives

1. **Provenance over invention.** Never invent business behavior, domain rules, UI copy, API fields, DDL columns, or error semantics. Cite a source or register `ASSUMPTION-<id>`. Uncited behavior is blocked from Ready.
2. **Global command iteration (max 3)** — owned by **orchestrator-agent** only (`.github/templates/command-iteration-policy.md`). Every prompt routes through orchestrator; primaries/subagents run once per `command_iteration` with no nested loops. Loop types: Plan → Act → Validate → Refine (build) or Plan → Act → Observe → Reflect (intake). Iteration 1 pass → stop. After iteration 3 → **needs_human**, harness Blocked, no edits.
3. **Resolve before ask.** When a governed plan, sprint plan, or story artifact is supplied, load plan + manifest + logs first. Ask only about Open critical gaps or `TBD` bindings. Skill: `.github/skills/plan-as-input/`. Protocol: `.github/templates/plan-as-input-protocol.md`.
4. **Least privilege.** Destructive or irreversible actions require a human gate. Secrets never enter code, logs, prompts, or artifacts.
5. **Everything is an artifact.** Persist output to a versioned file with timestamp, iteration count, and validation summary. Write `artifacts/audit/<YYYY-MM-DD>-<agent>-<task>.md`. Only `harness-updater` writes `docs/harness/**`.
6. **Traceability.** Rule → story → contract/DDL/UI → code → test → evidence.

## 2. Command spine

Intake/plan: `/generate-brd` → `/propose-architecture` → `/plan-sprint` → `/generate-ui-design`

Public execute commands (do **not** add `/generate-backend`, `/generate-frontend`, or `/wire-*`):

```
/implement-api → /implement-ui → /expand-test-coverage → [human: test-package Approved] → /run-tests → /run-eval → /close-eval-gaps → /review-changes → /application-summary
```

Operator map: [COPILOT-FLOW.md](../COPILOT-FLOW.md).

## 3. Orchestration

- Route slash prompts through **orchestrator-agent** (`.github/agents/orchestrator-agent.agent.md`) by **explicit name**. Do not rely on description-match auto-delegation across specialists.
- Spawn other primaries from `.github/agents/*.agent.md` via the Copilot **agent** tool by explicit `name` (orchestrator only).
- Invoke specialists by **loading** `.github/subagents/<name>.md` as the task spec — one pass per `command_iteration`. Do **not** duplicate subagent specs under `.github/agents/`. Specialists must not be selected from the Chat picker.
- Prefer a **Skill** (`.github/skills/`) for reusable procedure; a git hook for a hard invariant.
- Subagent returns structured IO + confidence; orchestrator rejects below-gate output and re-delegates only while `command_iteration < 3`.
- Java API/tests: templates own structure; persist vars; `docs/architecture/stack-conventions.md` must PASS. Agent-owned only per hybrid_policy.

## 4. Model routing

Use the operator's Copilot model picker. Do not hardcode a vendor model into product code or factory contracts.

- Stronger / reasoning model — orchestrator, intake judgment, review, security, release, quality coordination.
- Default coding model — implementation and artifact generation.
- Keep collectors and formatters mechanical — no invented metrics or fabricated coverage.

## 5. Human gates (do not auto-proceed)

- `/generate-brd` → BRD Accepted (or waiver in `docs/harness/decisions.md`)
- `/plan-sprint` → plan **Approved**
- `/expand-test-coverage` → test-package **Approved** before `/run-tests`
- Production rollout → release owner
- Any `deny`/`ask` permission, secret access, or destructive op

## 6. Imported always-on rules

These instruction files use `alwaysApply: true` (loaded with this file):

- `.github/instructions/00-global-governance.instructions.md`
- `.github/instructions/01-project-context.instructions.md`
- `.github/instructions/02-security-and-compliance.instructions.md`
- `.github/instructions/07-testing-and-quality.instructions.md`
- `.github/instructions/09-agent-orchestration.instructions.md`
- `.github/instructions/10-audit-trail.instructions.md`
- `.github/instructions/11-intake-planning-governance.instructions.md`
- `.github/instructions/22-behavior-provenance-and-anti-invention.instructions.md`
- `.github/instructions/31-untrusted-intake.instructions.md`
- `.github/instructions/kit-governance.instructions.md`

## Kit scope

This kit ships **12 commands** per [KIT-SCOPE.md](../KIT-SCOPE.md). Commands such as `/fix-issue`, `/deliver-sprint`, `/generate-user-story`, security scans, and handoffs are **not** included.
