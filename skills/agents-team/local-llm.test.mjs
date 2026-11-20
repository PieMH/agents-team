// Self-check for the local tier: node skills/agents-team/local-llm.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { answers, decide, down, readConfig, status, up } from './local-llm.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agents-team-local-'));
const file = (name, body) => { const f = path.join(dir, name); fs.writeFileSync(f, body); return f; };

// config: required fields, BOM, defaults, trailing slash
assert.equal(readConfig(path.join(dir, 'missing.json')), null, 'no file -> no tier');
assert.equal(readConfig(file('bad.json', '{"url":"http://x","start":"a"}')), null, 'no stop -> no tier');
const cfg0 = readConfig(file('ok.json', '﻿{"url":"http://127.0.0.1:1/","start":"a","stop":"b","minFreeGB":60}'));
assert.equal(cfg0.url, 'http://127.0.0.1:1');
assert.equal(cfg0.model, 'local');
assert.equal(cfg0.minFreeGB, 60);

// every branch of the start decision
assert.equal(decide(null, false, 99).local, 'off');
assert.deepEqual(decide(cfg0, true, 1), { local: 'on', start: false }, 'already serving: use it, even with little RAM');
assert.match(decide(cfg0, false, 59.7).reason, /59 GB RAM free, the local model needs 60 GB/);
assert.deepEqual(decide(cfg0, false, 61), { local: 'on', start: true });

// a real start/stop cycle against a tiny server that answers /health
const port = await new Promise((r) => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => r(p)); }); });
const pidFile = path.join(dir, 'pid');
const server = file('server.mjs', `import fs from 'node:fs'; import http from 'node:http';
http.createServer((q, s) => { s.statusCode = q.url === '/health' ? 200 : 404; s.end(); })
  .listen(${port}, () => fs.writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)));`);
const stop = file('stop.mjs', `import fs from 'node:fs'; try { process.kill(Number(fs.readFileSync(${JSON.stringify(pidFile)}, 'utf8'))); } catch {}`);
const cfg = { ...cfg0, minFreeGB: 0, startTimeoutSec: 20, url: `http://127.0.0.1:${port}`,
  start: `node "${server}"`, stop: `node "${stop}"` };

assert.equal(await answers(cfg.url), false, 'nothing listening yet');
assert.deepEqual(await status(cfg), { local: 'on', serving: false });
assert.deepEqual(await up(cfg), { local: 'on', started: true }, 'up starts the server and waits for it');
assert.deepEqual(await up(cfg), { local: 'on', started: false }, 'a second up reuses it and does not own it');
assert.equal(down(cfg).ok, true);
for (let i = 0; i < 20 && await answers(cfg.url); i++) await new Promise((r) => setTimeout(r, 250));
assert.equal(await answers(cfg.url), false, 'down stopped it');
assert.match((await up({ ...cfg, start: 'node -e "process.exit(3)"' })).reason, /did not start/, 'a failing launcher -> off');

fs.rmSync(dir, { recursive: true, force: true });
console.log('local tier: all checks passed');
