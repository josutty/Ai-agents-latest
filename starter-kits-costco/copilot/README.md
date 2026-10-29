# GitHub Copilot starter kit

Self-contained **12-command** factory (11 public + `/close-eval-gaps`). Default stack: Java 21 / Spring Boot 3 + Next.js.

## Install (manual copy)

```bash
ASSETS="$(cd "$(dirname "$0")" && pwd)"

cp "$ASSETS/KIT-SCOPE.md" ./
cp "$ASSETS/CONFIG-CHECKLIST.md" ./
cp -R "$ASSETS/.github/agents" .github/
cp -R "$ASSETS/.github/prompts" .github/
cp -R "$ASSETS/.github/instructions" .github/
cp -R "$ASSETS/.github/skills" .github/
cp -R "$ASSETS/.github/subagents" .github/
cp -R "$ASSETS/.github/templates" .github/
cp -R "$ASSETS/.github/hooks" .github/
cp "$ASSETS/.github/config.yaml.example" .github/
cp "$ASSETS/.github/scope.yaml" .github/
cp "$ASSETS/.github/copilot-instructions.md" .github/copilot-instructions.md
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

Merge `.github/config.yaml.example` → `.github/config.yaml`. See [CONFIG-CHECKLIST.md](CONFIG-CHECKLIST.md).

**Note:** Copilot has no IDE runtime hooks. Artifact checks run via `.githooks/pre-commit` → `tools/check-artifacts.mjs` → `.github/hooks/verify-artifacts.mjs`. Governance rules: `.github/instructions/*.instructions.md`.

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

## Commands (12)

12 prompt files in `.github/prompts/` — 11 public spine + **`close-eval-gaps.prompt.md`**. Flow: [COPILOT-FLOW.md](COPILOT-FLOW.md). Scope: [KIT-SCOPE.md](KIT-SCOPE.md).

| # | Prompt file |
|---|-------------|
| 1–9 | `generate-brd` … `run-eval` |
| 10 | `close-eval-gaps.prompt.md` — eval fix loop (owning agents) |
| 11–12 | `review-changes`, `application-summary` |

## Skills (14)

Installed to `.github/skills/<name>/SKILL.md`. Pipeline-critical: `quality` (stack before E2E), `playwright-e2e`, `eval-suite` (fix-queue → owning agents), `api`, `br-coverage`, `jacoco-coverage`.

After `/implement-api` + `/implement-ui`: `bash scripts/run-local-stack.sh` then `bash scripts/verify-stack-health.sh` before Playwright. `/close-eval-gaps` routes failures to backend / frontend / api agents until green.

**Outcome:** Human receives a **running, validated application**.
