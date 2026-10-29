# Agent Audit — {{COMMAND}} — {{TASK}}

> Aligns with `docs/harness/progress.md`. No secrets, credentials, or PHI/PII.

| Field | Value |
|-------|-------|
| **Date** | {{YYYY-MM-DD}} |
| **Command / Agent** | {{/command or agent}} |
| **Final iteration** | {{n}} of 3 |
| **Validation** | {{summary}} |
| **Status** | {{complete \| needs_human \| blocked}} |

## Command iteration ledger

Required in every orchestrator audit. One row per command iteration executed (minimum 1).

| Command iteration | Changes | Validation result | Next action |
|---|---|---|---|
| 1 of 3 | {{what changed this pass}} | {{Pass \| Fail}} | {{Stop \| Refine \| Escalate and stop}} |
| 2 of 3 | {{…}} | {{…}} | {{…}} |
| 3 of 3 | {{…}} | {{…}} | {{Escalate and stop when Fail}} |

Early stop: when iteration 1 Validate/Observe passes, ledger has **one row** with Next action **Stop**.

## What
- Files created/modified

## Why
- User request / BR# / story / plan reference

## How
- Rules, templates, skills, subagents, commands run

## Validation
| Check | Result | Evidence |
|-------|--------|----------|
| Inputs complete | | |
| DoD checklist | | |
| Tests / evals | | |
| Scope allowlist | | |

## Behavior provenance
| behavior_id | statement | source | confidence |
|-------------|-----------|--------|------------|

## Open items
-

## Next command
`/{{next}}`

**Output path:** `artifacts/audit/{{date}}-{{command}}-{{task}}.md`
