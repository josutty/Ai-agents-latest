// OpenCode plugin for the agent team — the same checks Claude Code and Copilot get from tools/hooks/:
//   • task scope: while a TASK is in progress, src/ test/ e2e/ files outside its Files table can't be edited
//   • secrets: .env, .env.local, .env.*.local, .env.production, *.pem, *.key are never read or written
// It applies to EVERY agent, including the plain Build agent, so manual sessions are protected too.
// Formatting: OpenCode runs Prettier itself after each edit when the project has Prettier — no plugin needed.
// If your OpenCode version only loads `.opencode/plugin/` (singular), rename this folder.
import { checkEditPath, isDirTool, isReadTool, isSecretPath, isWriteTool, pathsFromToolInput, toRel } from '../../tools/hooks/scope-lib.mjs';

export const AgentTeam = async ({ directory, worktree }) => {
  const root = worktree || directory;
  return {
    'tool.execute.before': async (input, output) => {
      const tool = String(input?.tool ?? '');
      const args = output?.args ?? {};
      if (tool === 'bash') return; // shell: per-agent permissions + `node tools/task.mjs scope` at done
      const paths = pathsFromToolInput(args).map((p) => toRel(p, root));
      if (isReadTool(tool) || isWriteTool(tool)) {
        for (const p of paths) if (isSecretPath(p)) throw new Error(`"${p}" may hold secrets — agents never read or write it. Use .env.example.`);
      }
      if (isWriteTool(tool) && !isDirTool(tool)) {
        for (const p of paths) { const r = checkEditPath(p, root); if (!r.ok) throw new Error(`task-scope: ${r.reason}`); }
      }
    },
  };
};
