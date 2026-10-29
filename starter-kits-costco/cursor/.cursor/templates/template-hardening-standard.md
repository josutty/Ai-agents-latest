# Template hardening (Cursor kit)

- No placeholder `{TODO}` in shipped templates.
- Use `{{variable}}` only where a command explicitly renders the template.
- Kit commands reference `.cursor/templates/<name>.md` — keep paths consistent with command contracts.
- SAST packs, handoff logs, and issue-log templates are **not** shipped in this kit.
