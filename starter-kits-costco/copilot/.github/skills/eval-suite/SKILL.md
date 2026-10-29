---
name: eval-suite
description: Run product evals, emit completeness ledger and fix-queue. Route auto_fix items to owning primaries via agent tool; eval re-runs load eval-agent subagent spec inline.
user-invocable: false
---

# Eval Suite

## Read first

- `evals/product/README.md`, `evals/product/STATUS.md`
- `evals/product/templates/completeness-ledger.md`
- `.github/config.yaml` → `evals:` block

## Completeness

1. Extract every `rule_id` from `evals.rule_source`.
2. Always-on families: L1-04, L1-05, L1-08, L1-09, L4-03 + agent-result checks (coverage honesty, Playwright citations, defect analysis, stack verify when E2E ran).
3. Write `evals/product/results/<date>-completeness-ledger.md` — every row explicit; silence = FAIL.
4. Confidence **high** only when no in-scope P0/P1 row is NEW/MISSING/red.

## Run

Use `evals.test_commands` from config only. Ensure stack is up before E2E-related cases:

```bash
bash scripts/verify-stack-health.sh
```

## Fix queue → owning primaries (agent tool)

| owning_agent | Typical failures |
|--------------|------------------|
| backend-agent | Java logic, API errors, migration, JaCoCo gaps |
| frontend-agent | UI wiring, components, Vitest/Playwright UI |
| api-agent | OpenAPI↔DTO drift, contract verify |
| quality-agent | Coverage gate, test package, eval coordination |
| test-agent | Case design, matrix, script gaps |
| documentation-agent | Summary/traceability artifacts |

For each `auto_fix: true` item in `fix-queue.json`:

1. Orchestrator delegates to **owning primary** via `agent` tool with case path + finding.
2. Primary fixes product code/tests (not eval graders).
3. quality-agent loads `.github/subagents/eval-agent.md` and re-runs that `case_path` only.
4. Max 3 attempts → `needs_human`.

P0/P1 security: `auto_fix: false` — human gate.

## Human outcome

When `/run-eval` completes with fix-queue walked (no open `auto_fix: true` items):

- Stack verified healthy
- Test results artifact shows pass (or documented waivers)
- Completeness ledger attached for `/review-changes`

## Subagent

`.github/subagents/eval-agent.md`
