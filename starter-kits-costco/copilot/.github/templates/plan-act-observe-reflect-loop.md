# Plan → Act → Observe → Reflect

Use for **intake, reverse engineering, research**. Max **3** command iterations. Max 3 is a **ceiling**, not a quota.

**When invoked under an orchestrated command, this loop is owned exclusively by the orchestrator.** Primary agents and subagents perform one pass per `command_iteration` and return findings. They must not run their own nested three-iteration loops.

## Plan
Load sources and command contract. Register Open DQ if sources or scope are missing after resolve-before-ask. Still refuse when a Required input is absent. Do not invent.

## Act
Extract facts with citations (path, locator, quote or paraphrase tagged `[CITED]`). Register `[INFERRED]` only with a DQ-id.

## Observe
Compare extract against all sources. Flag conflicts. Build discussion coverage / provenance tables. Note silences as gaps, not features. **Never skip Observe.**

## Reflect
**Only from findings — and only when the orchestrator starts the next command iteration.** Revise the artifact when Observe found gaps, conflicts, or uncited claims: drop uncited claims, add open questions, lower confidence where sources disagree.
If Observe is already clean (every behavior has provenance or an open question), do not Reflect.

## Exit (orchestrator decides)
- Iteration 1 Observe meets the exit criteria below → **stop the command**. Do not start iteration 2 or 3.
- Findings remain → orchestrator increments `command_iteration`, then Act again (max 3 total).
- Still unmet after iteration 3 → escalate unresolved Blocking DQs; **needs_human**; no further edits.

Every behavior has provenance **or** an open question. Never self-approve a BRD or rule catalog.

Record each pass in the orchestrator audit **Command iteration ledger** (use `1 of 3` when the first Observe passed).

## Completion
Orchestrator writes audit. Harness updated on phase change. Tell the user **Next command**.
