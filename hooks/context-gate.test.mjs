// Self-check for the context gate: node hooks/context-gate.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { contextTokens, gate } from './context-gate.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agents-team-gate-'));
fs.mkdirSync(path.join(dir, '.agents-team'));
const transcript = path.join(dir, 't.jsonl');
const turn = (input, extra = {}) => JSON.stringify({ type: 'assistant', ...extra,
  message: { usage: { input_tokens: input, cache_creation_input_tokens: 1000, cache_read_input_tokens: 0, output_tokens: 500 } } });
const writeRun = (run) => fs.writeFileSync(path.join(dir, '.agents-team', 'run.json'), JSON.stringify(run));
const call = (extra = {}) => gate({ session_id: 's1', transcript_path: transcript, ...extra }, dir);

// last main-thread turn wins; sidechain turns and junk lines are ignored
fs.writeFileSync(transcript, [turn(10000), turn(600000), turn(1, { isSidechain: true }), 'not json', ''].join('\n'));
assert.equal(contextTokens(fs.readFileSync(transcript, 'utf8')), 601500);

assert.equal(call(), null, 'no run.json -> silent');
writeRun({ status: 'running', session: 's1', compact: true, threshold: 500000 });
assert.equal(call().hookSpecificOutput.permissionDecision, 'deny', 'past threshold -> deny');
assert.match(call().hookSpecificOutput.permissionDecisionReason, /~602k, past the run's 500k/);
assert.equal(call({ agent_id: 'a1' }), null, 'subagent call -> silent');
assert.equal(call({ session_id: 's2' }), null, 'other session -> silent');
writeRun({ status: 'running', session: 's1', compact: true, threshold: 700000 });
assert.equal(call(), null, 'under threshold -> silent');
writeRun({ status: 'running', session: 's1', compact: false, threshold: 500000 });
assert.equal(call(), null, 'compact off -> silent');
writeRun({ status: 'paused', session: 's1', compact: true, threshold: 500000 });
assert.equal(call(), null, 'paused run -> silent');

fs.rmSync(dir, { recursive: true });
console.log('context-gate: all checks passed');
