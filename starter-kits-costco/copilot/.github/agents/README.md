# Agents

Primaries only (12 in kit). Specialists are **not** registered here.

| Kind | `user-invocable` | Spec location |
|------|------------------|---------------|
| Orchestrator | `true` | This folder |
| Other primaries | `false` | This folder |

Subagent contracts: `.github/subagents/{slug}.md` only.

```bash
node tools/copilot/sync-agent-allowlists.mjs --root . --write
```
