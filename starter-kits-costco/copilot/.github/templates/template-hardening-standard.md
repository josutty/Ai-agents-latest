# Template hardening (Copilot kit)

- No placeholder `{TODO}` in shipped templates.
- Use `{{variable}}` only where a prompt explicitly renders the template.
- Kit prompts reference `.github/templates/<name>.md` — keep paths consistent with prompt contracts.
- SAST packs, handoff logs, and issue-log templates are **not** shipped in this kit.
