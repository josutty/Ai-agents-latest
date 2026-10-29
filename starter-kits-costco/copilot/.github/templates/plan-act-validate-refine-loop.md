# Plan → Act → Validate → Refine

Use for **build, quality, codegen**. Max **3** command iterations. Max 3 is a **ceiling**, not a quota.

**When invoked under an orchestrated command, this loop is owned exclusively by the orchestrator.** Primary agents and subagents perform one pass per `command_iteration` and return findings. They must not run their own nested three-iteration loops.

## Plan
Load command contract, rules, skills, templates, `config.yaml`, `scope.yaml`. Register Open DQ if required inputs are missing after resolve-before-ask. Still refuse when a human gate is unmet or a Required input is absent. Select subagents. Set acceptance threshold.

## Act
Produce enterprise-grade code/docs/tests. No workarounds. Stay inside `scope.yaml` write allowlist.

## Validate
Run named validators (tests, linters, coverage, eval cases). Score against command Definition of Done. **Never skip Validate.** Absence of a validator run is not a pass.

## Refine
**Only from findings — and only when the orchestrator starts the next command iteration.** Patch in place from Validate failures.
If Validate is clean, do not Refine.

## Exit (orchestrator decides)
- Iteration 1 Validate meets the command Definition of Done → **stop the command**. Do not start iteration 2 or 3.
- Findings remain → orchestrator increments `command_iteration`, then Act again (max 3 total).
- Still unmet after iteration 3 → escalate with audit gaps and owners; **needs_human**; no further edits.

Record each pass in the orchestrator audit **Command iteration ledger** (use `1 of 3` when the first Validate passed).

## Completion
Orchestrator tells the user **Next command** from the command file.
