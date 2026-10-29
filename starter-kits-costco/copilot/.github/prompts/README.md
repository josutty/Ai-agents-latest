# Prompt commands (12 shipped)

Every prompt sets **`agent: orchestrator-agent`** in frontmatter. The orchestrator delegates to the **Primary** in each file's Orchestration table and owns the global **`command_iteration: 1..3`** budget (`.github/templates/command-iteration-policy.md`).

| Prompt | Phase | Primary delegate |
|--------|-------|---------------|
| `generate-brd.prompt.md` | Intake | requirements-agent |
| `propose-architecture.prompt.md` | Architecture | planner-agent |
| `plan-sprint.prompt.md` | Plan | planner-agent |
| `generate-ui-design.prompt.md` | UI mockup | frontend-agent |
| `implement-api.prompt.md` | Backend | backend-agent |
| `implement-ui.prompt.md` | Frontend | frontend-agent |
| `expand-test-coverage.prompt.md` | Test design | quality-agent |
| `run-tests.prompt.md` | Test execution | quality-agent |
| `run-eval.prompt.md` | Product eval | quality-agent |
| `close-eval-gaps.prompt.md` | Eval fix loop | orchestrator-agent |
| `review-changes.prompt.md` | Review | code-review-agent |
| `application-summary.prompt.md` | Summary | documentation-agent |

Invoke as `/close-eval-gaps` from `/run-eval` when `fix-queue.json` has open `auto_fix: true` items.

Flow: [../../COPILOT-FLOW.md](../../COPILOT-FLOW.md)
