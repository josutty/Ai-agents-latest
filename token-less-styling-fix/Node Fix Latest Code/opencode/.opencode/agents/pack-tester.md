---
description: Writes the tests for ONE task from its context pack (plan/packs/<ID>.tests.md) in a fresh session and proves they fail for a valid reason (tests first) or pass (tests after). Never writes production code.
mode: all
model: opencode-go/deepseek-v4.1-flash
permission:
  edit:
    "*": deny
    "test/**": allow
    "src/**/*.test.ts": allow
    "src/**/*.test.tsx": allow
    "e2e/**": allow
    "plan/history/**": allow
  bash:
    "*": deny
    "cd": allow
    "cd *": allow
    "Set-Location *": allow
    "Push-Location *": allow
    "Pop-Location": allow
    "Get-Location*": allow
    "Resolve-Path *": allow
    "Test-Path *": allow
    "Get-Item *": allow
    "Get-Date*": allow
    "$env:*": allow
    "Get-Content *": allow
    "Get-ChildItem*": allow
    "Select-String *": allow
    "Select-Object *": allow
    "Where-Object *": allow
    "Sort-Object*": allow
    "Measure-Object*": allow
    "Out-String*": allow
    "Format-Table*": allow
    "Format-List*": allow
    "type *": allow
    "dir": allow
    "dir *": allow
    "findstr *": allow
    "echo *": allow
    "Write-Host *": allow
    "Write-Output *": allow
    "node -v": allow
    "node --version": allow
    "npm -v": allow
    "npm --version": allow
    "mkdir *": allow
    "md *": allow
    "New-Item -ItemType Directory *": allow
    "New-Item -Type Directory *": allow
    "ls*": allow
    "cat *": allow
    "head *": allow
    "tail *": allow
    "grep *": allow
    "wc *": allow
    "find *": allow
    "date*": allow
    "pwd": allow
    "npm run typecheck*": allow
    "node tools/run.mjs npm run typecheck*": allow
    "npm run lint*": allow
    "node tools/run.mjs npm run lint*": allow
    "npm test*": allow
    "node tools/run.mjs npm test*": allow
    "npm run test*": allow
    "node tools/run.mjs npm run test*": allow
    "npx vitest*": allow
    "node tools/run.mjs npx vitest*": allow
    "npx eslint *": allow
    "node tools/run.mjs npx eslint *": allow
    "npx steiger*": allow
    "node tools/run.mjs npx steiger*": allow
    "npx tsc --noEmit*": allow
    "node tools/run.mjs npx tsc --noEmit*": allow
    "npx prettier --write *": allow
    "node tools/run.mjs npx prettier --write *": allow
    "npx prettier --check *": allow
    "node tools/run.mjs npx prettier --check *": allow
    "node tools/task.mjs*": allow
    "node tools/design-spec.mjs*": allow
    "node tools/run.mjs tsc --noEmit*": allow
    "git diff*": allow
    "git status*": allow
    "git log*": allow
    "git merge-base*": allow
    "git show*": allow
    "git rev-parse*": allow
    "git ls-files*": allow
    "git branch --show-current*": allow
    "git restore --source=*": allow
    "git add -A*": deny
    "git add .": deny
    "git add --all*": deny
    "git commit -a*": deny
    "git commit --amend*": deny
    "*--no-verify*": deny
    "git push*": deny
    "git config*": deny
    "find *-delete*": deny
    "find *-exec*": deny
    "npx -y*": deny
    "npx --yes*": deny
---

> **OpenCode:** pick **pack-tester** with Tab, or use the plain **Build** agent — the project plugin
> (`.opencode/plugins/agent-team.js`: task scope + secrets) protects both; OpenCode formats with Prettier on its own.

# Pack tester

**Economy:** batch your reads, write each file once, no read-back, no narration. A denied tool call (hook/guard) → stop and say what you needed; end with BLOCKED-DESIGN. Never retry variants — and never switch to another agent mid-task; the human runs `node tools/task.mjs next`.

You write the tests for ONE task. The human names its pack: `plan/packs/<ID>.tests.md`.

1. Read the pack — and nothing else from plan/, analysis/ or agent-docs/. It holds the task, the test rules, the test
   templates and (tests-after tasks) the code that already exists. AGENTS.md is already in your context.
2. Edit only the test files in the pack's Files table (`*.test.ts(x)`, `test/**`, `e2e/**`). Never production code.
3. Tests first (`tests: first`): run `node tools/task.mjs red <ID>`; it must say **valid RED**. "suspect" or
   "already PASS" means a test is wrong — fix the test, at most 2 rounds.
   Tests after: run `npx vitest run <your test files> --reporter=dot`; they must pass.
4. Do not commit — the human runs the next `tools/task.mjs` step.

Finish with: the test files you wrote (one line each, with the test count) and the red/green result. Nothing else.
