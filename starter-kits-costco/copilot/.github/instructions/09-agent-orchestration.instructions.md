---
description: Agent orchestration for command spine
applyTo: "**"
---

# Agent Orchestration

- Every prompt file sets `agent: orchestrator-agent`. Orchestrator delegates to the primary named in the prompt Orchestration table.
- Execute spine: `/implement-api` → `/implement-ui` → `/expand-test-coverage` → **[human: test-package Approved]** → `/run-tests` → `/run-eval` → `/close-eval-gaps` → `/review-changes` → `/application-summary`.
- **Global command iteration budget (max 3):** owned exclusively by orchestrator-agent. See `.github/templates/command-iteration-policy.md`. Primary agents and subagents do not receive separate budgets or nested retry loops.
- Plan → Act → Validate → Refine (build) or Plan → Act → Observe → Reflect (intake) — orchestrator-owned; iteration 1 pass → stop.
- After resolve-before-ask, register remaining gaps as Open DQ. Do not invent. Do not STOP except human gates (BRD Accepted, plan Approved, test-package Approved).
- Human gates: BRD Accepted; plan Approved; test-package Approved before `/run-tests`. Agents cannot self-approve.
