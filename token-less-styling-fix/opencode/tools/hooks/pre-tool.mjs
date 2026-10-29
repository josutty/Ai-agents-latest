#!/usr/bin/env node
// PreToolUse hook — task scope + secret files. Claude Code (.claude/settings.json) and Copilot (agent frontmatter).
// Silent (exit 0, no output) when the call is fine, so the tool's normal approval flow applies.
import { checkEditPath, isDirTool, isReadTool, isSecretPath, isWriteTool, pathsFromToolInput, readStdinJson, toolArgsOf, toRel } from './scope-lib.mjs';

const input = readStdinJson();
if (!input) process.exit(0);
const toolName = String(input.tool_name ?? input.toolName ?? '');
const toolInput = toolArgsOf(input);
const root = input.cwd ?? process.cwd();

const deny = (reason) => {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } }));
  process.exit(0);
};

if (typeof toolInput.command === 'string') process.exit(0); // shell commands: agent-guard + permissions; `task.mjs scope` catches the rest
const paths = pathsFromToolInput(toolInput).map((p) => toRel(p, root));
if (isReadTool(toolName) || isWriteTool(toolName)) {
  for (const p of paths) if (isSecretPath(p)) deny(`"${p}" may hold secrets — agents never read or write it. Use .env.example.`);
}
if (isWriteTool(toolName) && !isDirTool(toolName)) {
  for (const p of paths) { const r = checkEditPath(p, root); if (!r.ok) deny(`task-scope: ${r.reason}`); }
}
process.exit(0);
