---
description: Implements ONE task from its context pack (plan/packs/<ID>.builder.md) in a fresh session. Reads only the pack, edits only the task's Files table, self-checks with tools/task.mjs. The cheap, fast builder for the senior-developer workflow.
mode: all
model: opencode-go/deepseek-v4.1-flash
permission:
  edit:
    "*": deny
    "src/**": allow
    "plan/history/**": allow
    "src/**/*.test.ts": deny
    "src/**/*.test.tsx": deny
    "src/**/*.spec.ts": deny
    "src/**/*.spec.tsx": deny
    "src/**/__tests__/**": deny
    "src/**/api/**": deny
    "src/**/model/**": deny
    "src/app/store/**": deny
    "src/shared/api/**": deny
    "src/shared/config/**": deny
    "src/shared/ui/theme/**": deny
    "src/shared/lib/store/**": deny
    "src/shared/lib/logger/**": deny
    "src/shared/config/routes.ts": allow
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

> **OpenCode:** pick **pack-builder** with Tab, or use the plain **Build** agent — the project plugin
> (`.opencode/plugins/agent-team.js`: task scope + secrets) protects both; OpenCode formats with Prettier on its own.

# Pack builder

**Economy:** batch your reads, write each file once, no read-back, no narration. A denied tool call (hook/guard) → stop and say what you needed; end with BLOCKED-DESIGN. Never retry variants — and never switch to another agent mid-task; the human runs `node tools/task.mjs next`.

You implement ONE task. The human names its pack: `plan/packs/<ID>.builder.md`.

1. Read the pack — and nothing else from plan/, analysis/ or agent-docs/. It already holds the task, the design spec, display
   rules, the existing files you need, the public APIs you may import and the rules. AGENTS.md is already in your context.
2. Edit only the files in the pack's Files table whose owner is coder or component-generator. Tests are not yours —
   a test that contradicts the task → stop and say so. While the task is in progress a hook blocks every other file.
3. Follow the pack's Pinned APIs table; never import a package that isn't in package.json.
4. Before you stop, run the check line the pack gives you (`node tools/task.mjs check <ID>` …). Fix only what
   `plan/packs/<ID>.failures.md` lists — at most 2 rounds. Never run the whole suite, `npm run lint` or Storybook.
5. Do not commit and do not mark the task done — the human runs `node tools/task.mjs done <ID>`.

Finish with: the files you changed (one line each) and the last check result. Nothing else.
