// Self-check for the agency catalog: node skills/agency/agency.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { catalog, install, readCore } from './agency.mjs';

const lib = fs.mkdtempSync(path.join(os.tmpdir(), 'agency-lib-'));
const put = (rel, body) => { fs.mkdirSync(path.dirname(path.join(lib, rel)), { recursive: true }); fs.writeFileSync(path.join(lib, rel), body); };
put('divisions.json', JSON.stringify({ divisions: { eng: { label: 'Engineering' }, game: { label: 'Games' } } }));
put('eng/eng-fe.md', '---\r\nname: Frontend Dev\r\ndescription: builds UI\r\nvibe: "Pixels."\r\n---\r\nbody');
put('eng/eng-be.md', '---\nname:   Backend Dev\ndescription: builds APIs\n---\nbody');
put('eng/README.md', '# not an agent');
put('game/unreal/unreal-world.md', '---\nname: World Builder\nvibe: Worlds.\n---\n');
put('strategy/playbook.md', '---\nname: Ignored, not a division\n---\n');

const core = new Set(['eng-fe']);
const cat = catalog(lib, core);
assert.deepEqual(cat.map((d) => [d.id, d.agents.map((a) => a.slug)]), [['eng', ['eng-be', 'eng-fe']], ['game', ['unreal-world']]]);
const fe = cat[0].agents[1];
assert.equal(fe.name, 'Frontend Dev');
assert.equal(fe.vibe, 'Pixels.');
assert.equal(fe.core, true);
assert.equal(cat[0].agents[0].vibe, 'builds APIs', 'falls back to description');
assert.equal(cat[1].agents[0].rel, 'game/unreal/unreal-world.md', 'nested folders, forward slashes');

const dest = path.join(lib, 'out');
assert.deepEqual(install(cat, ['eng'], dest).map((a) => a.slug), ['eng-fe'], 'category installs core picks');
assert.deepEqual(install(cat, ['eng'], dest, true).map((a) => a.slug), ['eng-be', 'eng-fe'], '--all installs the category');
assert.deepEqual(install(cat, ['unreal-world'], dest).map((a) => a.slug), ['unreal-world'], 'slug installs one agent');
assert.ok(fs.existsSync(path.join(dest, 'unreal-world.md')));
assert.throws(() => install(cat, ['nope'], dest), /unknown category or agent: nope/);

// The shipped core list must name real agents when the real library is present.
const real = process.env.AGENCY_AGENTS_DIR || path.join(os.homedir(), '.agency-agents');
if (fs.existsSync(path.join(real, 'divisions.json'))) {
  const slugs = new Set(catalog(real).flatMap((d) => d.agents.map((a) => a.slug)));
  const missing = [...readCore()].filter((s) => !slugs.has(s));
  assert.deepEqual(missing, [], 'core.txt slugs missing from the library');
}

fs.rmSync(lib, { recursive: true, force: true });
console.log('agency catalog: all checks passed');
