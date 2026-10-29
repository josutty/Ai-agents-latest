# Subagents

**Canonical contracts live here only** — do not copy under `.github/agents/`.

Parents load `.github/subagents/{slug}.md` and execute one pass per `command_iteration`.

```bash
node tools/copilot/sync-agent-allowlists.mjs --root . --write
```

See master `.github/subagents/README.md` for expand / run-tests / run-eval groupings.
