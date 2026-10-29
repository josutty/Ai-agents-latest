# Command iteration policy (global)

**Owner:** orchestrator-agent only. Applies to every `.github/prompts/*.prompt.md` command.

The orchestrator owns **one global iteration budget per command invocation**. Nested agents do **not** receive separate budgets.

## Budget

- **Maximum:** 3 command iterations total (`command_iteration: 1`, `2`, `3`).
- **An iteration includes:** all primary-agent work, subagent calls, validation/observe, parent review, and resulting repairs for that pass.
- **Primary agents and subagents** execute **once per command iteration** and MUST NOT start independent retry loops.
- **Any repair after validation/observe failure** consumes the **next** command iteration.
- **Iteration 1 pass:** when Validate (build/quality) or Observe (intake) meets the command Definition of Done → **stop**. Do not start iteration 2.

## After iteration 3

If DoD is still unmet:

- No agent, parent, or caller may modify generated artifacts.
- Write the audit with status **needs_human**.
- Update harness as **Blocked** (via harness-updater).
- **STOP.** Read-only inspection is allowed; it must not lead to edits.

## Delegation contract

The orchestrator passes to every delegate:

```yaml
command_iteration: <1|2|3>
command_max_iterations: 3
primary_agent: <slug>   # from Orchestration table — not the Chat picker agent
```

Delegates return structured IO + confidence. The orchestrator decides whether to increment `command_iteration` — delegates must not self-increment.

## Loop types (orchestrator-owned)

| Phase style | Template |
|-------------|----------|
| Build / quality / codegen | `plan-act-validate-refine-loop.md` |
| Intake / research / mockup | `plan-act-observe-reflect-loop.md` |

Primary agents and subagents perform **one pass** per command iteration and return findings. They must not run nested three-iteration loops.

## Audit requirement (mandatory)

Every orchestrator audit MUST include the **Command iteration ledger** from `audit-trail-template.md`. Pre-commit rejects audits missing it.

## Exceptions

| Command | Notes |
|---------|--------|
| `/close-eval-gaps` | Command iteration still orchestrator-owned; **per fix-queue item** max 3 attempts is a sub-budget inside one command run (see eval-suite skill). Item attempts do not reset the command iteration counter. |
| `playwright-self-healer` | OODA inner loop (`ooda-self-heal-loop.md`) rewrites heal artifacts only — not a second command iteration budget. |
