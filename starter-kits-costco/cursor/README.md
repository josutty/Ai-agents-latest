# Cursor starter kit

Self-contained **12-command** factory (11 public + `/close-eval-gaps`). Default stack: Java 21 / Spring Boot 3 + Next.js.

## Install (manual copy)

From participant repo root:

```bash
ASSETS="$(cd "$(dirname "$0")" && pwd)"

cp -R "$ASSETS/.cursor" ./
cp "$ASSETS/.cursorrules" ./
cp "$ASSETS/KIT-SCOPE.md" ./
cp "$ASSETS/CONFIG-CHECKLIST.md" ./
cp -R "$ASSETS/.githooks" ./
cp -R "$ASSETS/tools" ./
cp -R "$ASSETS/scripts" ./
cp "$ASSETS/requirements.txt" ./
chmod +x scripts/*.sh
cp -R "$ASSETS/evals" ./
cp -R "$ASSETS/docs/harness" docs/harness/
cp -R "$ASSETS/docs/architecture" docs/architecture/
cp "$ASSETS/docs/harness/progress.blank.md" docs/harness/progress.md

git config core.hooksPath .githooks
```

Merge `config.yaml.example` → `.cursor/config.yaml` (include `local_stack` + `evals.test_commands`). See [CONFIG-CHECKLIST.md](CONFIG-CHECKLIST.md).

## Python tooling

**Python 3.9+** is required for kit scripts under `scripts/` and `tools/design/`.

| Script | Dependencies | Used by |
|--------|--------------|---------|
| `scripts/intake-safety-scan.py` | stdlib only | `/generate-brd`, untrusted `/expand-test-coverage` intake |
| `tools/design/capture-reference.py` | Playwright (optional) | `/generate-ui-design` URL capture — fallback: supply `screenshot_path` |

After copying the kit:

```bash
python3 -m venv .venv          # optional but recommended
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
playwright install chromium    # skip if you will not use URL capture
```

Verify:

```bash
python3 scripts/intake-safety-scan.py docs/harness   # exit 0 = clean
python3 tools/design/capture-reference.py --help
```

## Skills (14)

Each `.cursor/skills/<name>/SKILL.md` is referenced by commands. Pipeline-critical:

| Skill | Role |
|-------|------|
| `quality` | Starts stack before E2E; coordinates expand / run-tests / run-eval |
| `playwright-e2e` | Live UI journeys (stack must be healthy) |
| `eval-suite` | Completeness ledger + fix-queue → `/close-eval-gaps` |
| `api`, `br-coverage`, `jacoco-coverage` | Contract sync, coverage gates, JaCoCo |

## Commands included (12)

1. `/generate-brd` 2. `/propose-architecture` 3. `/plan-sprint` 4. `/generate-ui-design`
5. `/implement-api` 6. `/implement-ui` 7. `/expand-test-coverage` 8. `/run-tests`
9. `/run-eval` 10. **`/close-eval-gaps`** (eval fix loop — owning agents fix queue items)
11. `/review-changes` 12. `/application-summary`

Command files: `.cursor/commands/` (see [commands README](.cursor/commands/README.md)).

Flow: [CURSOR-FLOW.md](CURSOR-FLOW.md). Scope: [KIT-SCOPE.md](KIT-SCOPE.md).

## Lab flow

1. Fill config (incl. `evals.rule_source`, `evals.test_commands`)
2. `/generate-brd` → **BRD Accepted**
3. `/propose-architecture` → copy config bindings from proposal
4. `/plan-sprint` → **Approved**
5. `/generate-ui-design` (reference URL + SP screen) ∥ `/implement-api`
6. `/implement-ui` with `mockup_path` from step 5
7. `/expand-test-coverage` → test-package **Approved**
8. `bash scripts/run-local-stack.sh` && `bash scripts/verify-stack-health.sh` (or let `/run-tests` Phase 0b do it)
9. `/run-tests` → `/run-eval` → `/close-eval-gaps` (owning agents fix queue items) → `/review-changes` → `/application-summary`

**Outcome:** Human receives a **running, validated application** — stack healthy, tests green, eval ledger without open P0/P1 auto-fix items.

## Kit contents

| Included | Notes |
|----------|--------|
| 20 rules, scope, hooks, harness, evals/product | Always-on governance in `.cursor/rules/` |
| Audit trail, human gates, provenance | See [KIT-SCOPE.md](KIT-SCOPE.md) |
| `/generate-ui-design`, `/propose-architecture` | UI mockup + tech-stack Q&A |
| Agent-owned Java / Next.js | No J2 template render pipeline |
