#!/usr/bin/env node
// The local tier of agents-team: a local LLM server that speaks Anthropic's /v1/messages (Strata, llama-server, ...).
// A machine has the tier only when ~/.agents-team/local.json exists (or $AGENTS_TEAM_LOCAL names one). Everywhere else
// `status` and `up` print "local": "off" and the orchestrator sends light tasks to Haiku.
//   node local-llm.mjs status                    configured? answering? enough free RAM to start it?
//   node local-llm.mjs up                        start the server unless it already answers, then wait until it does
//   node local-llm.mjs down                      stop it (the orchestrator calls this only for a server its run started)
//   node local-llm.mjs work <dir> <brief> [rule ...]
//                                                one headless Claude Code worker on the local model, working in <dir>;
//                                                each rule is one more --allowedTools entry, e.g. "Bash(npm test *)"
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const home = path.join(os.homedir(), '.agents-team');
export const configPath = () => process.env.AGENTS_TEAM_LOCAL || path.join(home, 'local.json');

// url, start and stop are required (start and stop are shell commands). Missing or unreadable means no local tier.
export function readConfig(file = configPath()) {
  let c;
  try { c = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')); } catch { return null; }
  if (typeof c?.url !== 'string' || typeof c.start !== 'string' || typeof c.stop !== 'string') return null;
  return { model: 'local', minFreeGB: 0, startTimeoutSec: 600, workTimeoutMin: 45, contextTokens: 65536,
    ...c, url: c.url.replace(/\/+$/, '') };
}

export async function answers(url) {
  try { return (await fetch(`${url}/health`, { signal: AbortSignal.timeout(3000) })).ok; } catch { return false; }
}

const freeGB = () => os.freemem() / 2 ** 30;

// What `up` does. Kept pure so the self-check covers every branch.
export function decide(cfg, serving, free) {
  if (!cfg) return { local: 'off', reason: `no local model on this machine (no ${configPath()})` };
  if (serving) return { local: 'on', start: false };
  if (free < cfg.minFreeGB) {
    return { local: 'off', reason: `${Math.floor(free)} GB RAM free, the local model needs ${cfg.minFreeGB} GB (close some apps to use it)` };
  }
  return { local: 'on', start: true };
}

export async function status(cfg) {
  const serving = !!cfg && await answers(cfg.url);
  const { local, reason } = decide(cfg, serving, freeGB());
  return { local, serving, ...(reason && { reason }) };
}

export async function up(cfg) {
  const d = decide(cfg, !!cfg && await answers(cfg.url), freeGB());
  if (d.local === 'off') return { local: 'off', reason: d.reason };
  if (!d.start) return { local: 'on', started: false };
  fs.mkdirSync(home, { recursive: true });
  const logFile = path.join(home, 'local-server.log');
  const log = fs.openSync(logFile, 'w');
  // detached: a launcher that returns once serving (Strata) and a server that stays in the foreground (llama-server) both work
  const child = spawn(cfg.start, { shell: true, detached: true, stdio: ['ignore', log, log], windowsHide: true });
  let failed = false;
  child.on('exit', (code) => { failed = code !== 0; });
  child.on('error', () => { failed = true; });
  child.unref();
  fs.closeSync(log);
  for (const until = Date.now() + cfg.startTimeoutSec * 1000; Date.now() < until && !failed;) {
    if (await answers(cfg.url)) return { local: 'on', started: true };
    await new Promise((r) => setTimeout(r, 2000));
  }
  spawnSync(cfg.stop, { shell: true, stdio: 'ignore', windowsHide: true, timeout: 120000 }); // leave nothing half-started
  return { local: 'off', reason: `the local model did not start; see ${logFile}` };
}

export function down(cfg) {
  if (!cfg) return { local: 'off' };
  const r = spawnSync(cfg.stop, { shell: true, encoding: 'utf8', windowsHide: true, timeout: 120000 });
  return { local: 'stopped', ok: r.status === 0 };
}

// --bare never loads CLAUDE.md (not even with --add-dir), so the worker contract carries the project's own copy.
// shortcut: the root CLAUDE.md only, not nested or user-level ones; add them if a project relies on those.
export function workerPrompt(dir) {
  const claudeMd = path.join(dir, 'CLAUDE.md');
  return fs.readFileSync(path.join(here, '..', '..', 'agents', 'worker.md'), 'utf8')
    + (fs.existsSync(claudeMd) ? `\n\n# This project's CLAUDE.md\n\n${fs.readFileSync(claudeMd, 'utf8')}` : '');
}

export function work(cfg, dir, brief, rules = []) {
  if (!cfg) return { status: 'blocked', reason: 'no local model on this machine' };
  const sys = `${brief}.system.md`;
  fs.writeFileSync(sys, workerPrompt(dir));
  const env = {
    ...process.env,
    CLAUDE_CONFIG_DIR: path.join(home, 'claude-local'), // its own empty profile, never the user's login
    ANTHROPIC_BASE_URL: cfg.url,
    ANTHROPIC_API_KEY: cfg.apiKey || 'local', // --bare reads only this key; the local server is the only one that sees it
    ANTHROPIC_MODEL: cfg.model,
    ANTHROPIC_DEFAULT_HAIKU_MODEL: cfg.model,
    ANTHROPIC_DEFAULT_SONNET_MODEL: cfg.model,
    ANTHROPIC_DEFAULT_OPUS_MODEL: cfg.model,
    CLAUDE_CODE_MAX_CONTEXT_TOKENS: String(cfg.contextTokens),
    CLAUDE_CODE_MAX_OUTPUT_TOKENS: '8192',
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    API_TIMEOUT_MS: '1800000',
  };
  delete env.ANTHROPIC_AUTH_TOKEN; // no cloud credential goes to the local server
  delete env.CLAUDE_CODE_OAUTH_TOKEN;
  const lib = process.env.AGENCY_AGENTS_DIR || path.join(os.homedir(), '.agency-agents');
  const args = ['--bare', '-p', '--output-format', 'json', '--permission-mode', 'acceptEdits',
    '--no-session-persistence', '--tools', 'Read,Edit,Write,Bash,Glob,Grep', '--append-system-prompt-file', sys,
    ...(fs.existsSync(lib) ? ['--add-dir', lib] : []), // so a brief's Role: file can be read
    // only the git a worker needs: no push, reset, checkout or clean without asking (and -p can't ask)
    '--allowedTools', 'Bash(git status*)', 'Bash(git diff*)', 'Bash(git log*)', 'Bash(git show*)',
    'Bash(git add *)', 'Bash(git commit *)', 'Bash(git rev-parse*)', ...rules];
  const t0 = Date.now();
  // shortcut: spawns the native claude binary without a shell; npm's claude.cmd on Windows would need one. Add it if a local-tier machine uses the npm install.
  const r = spawnSync('claude', args, { cwd: dir, env, input: fs.readFileSync(brief, 'utf8'), encoding: 'utf8',
    timeout: cfg.workTimeoutMin * 60000, maxBuffer: 64 << 20, windowsHide: true });
  const json = `${brief}.result.json`;
  fs.writeFileSync(json, r.stdout || '');
  let j = {};
  try { j = JSON.parse(r.stdout); } catch { /* reported below as an error with stderr */ }
  const st = r.error?.code === 'ETIMEDOUT' ? 'timeout' : r.error || r.status || j.is_error || !j.result ? 'error' : 'done';
  return { status: st, turns: j.num_turns, seconds: Math.round((Date.now() - t0) / 1000), json,
    result: j.result || `${r.error?.message || ''}\n${(r.stderr || '').slice(-2000)}`.trim() };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, ...rest] = process.argv.slice(2);
  const cfg = readConfig();
  const out = cmd === 'status' ? await status(cfg) : cmd === 'up' ? await up(cfg) : cmd === 'down' ? down(cfg)
    : cmd === 'work' && rest.length >= 2 ? work(cfg, rest[0], rest[1], rest.slice(2)) : null;
  if (!out) {
    console.error('usage: local-llm.mjs status | up | down | work <dir> <brief> [rule ...]');
    process.exit(1);
  }
  const { result, ...summary } = out;
  console.log(JSON.stringify(summary));
  if (result) console.log(`\n${result}`); // the worker's own report, as written
}
