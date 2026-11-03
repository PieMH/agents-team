// PreToolUse(Agent) hook for agents-team runs. Once the orchestrator's context passes the run's
// threshold, new subagent spawns are denied so the user can compact between agents (SKILL.md §7).
// Silent unless .agents-team/run.json says a run is active in this session with compact on.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Context size = the last main-thread assistant turn's full input plus its output.
export function contextTokens(transcript) {
  const lines = transcript.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!lines[i].includes('"usage"')) continue;
    let o;
    try { o = JSON.parse(lines[i]); } catch { continue; }
    const u = o.type === 'assistant' && !o.isSidechain && o.message?.usage;
    if (u) {
      return (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0)
        + (u.cache_read_input_tokens || 0) + (u.output_tokens || 0);
    }
  }
  return 0;
}

export function gate(input, projectDir) {
  if (input.agent_id) return null; // a call made inside a subagent
  let run;
  try { run = JSON.parse(fs.readFileSync(path.join(projectDir, '.agents-team', 'run.json'), 'utf8')); } catch { return null; }
  if (run.status !== 'running' || run.compact === false) return null;
  if (run.session && input.session_id && run.session !== input.session_id) return null;
  let tokens;
  try { tokens = contextTokens(fs.readFileSync(input.transcript_path, 'utf8')); } catch { return null; }
  const threshold = Number(run.threshold) || 500000;
  if (tokens < threshold) return null;
  const k = (n) => `${Math.round(n / 1000)}k`;
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `agents-team context gate: orchestrator context is ~${k(tokens)}, past the run's ${k(threshold)} threshold. `
        + 'Do not spawn: put this task back at the head of the queue in the ledger, let running agents finish, '
        + 'then follow agents-team §7 (give the user the /compact command). If the user declines, set "compact": false in .agents-team/run.json.',
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let raw = '';
  process.stdin.on('data', (c) => (raw += c)).on('end', () => {
    let input;
    try { input = JSON.parse(raw.replace(/^﻿/, '') || '{}'); } catch { return; }
    const out = gate(input, process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd());
    if (out) console.log(JSON.stringify(out));
  });
}
