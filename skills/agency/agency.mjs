#!/usr/bin/env node
// Catalog of the agency-agents specialist library (https://github.com/msitarzewski/agency-agents).
//   node agency.mjs                          category index
//   node agency.mjs list <cat,...|all>       one line per agent (★ = core pick from core.txt)
//   node agency.mjs install <cat|slug,...> <dir> [--all]
//                                            copy agents into <dir>: a category gives its core picks
//                                            (every agent with --all), a slug gives that agent
// The library is a git clone at $AGENCY_AGENTS_DIR or ~/.agency-agents; `git pull` updates it.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const libDir = () => process.env.AGENCY_AGENTS_DIR || path.join(os.homedir(), '.agency-agents');

export const readCore = (file = path.join(here, 'core.txt')) => new Set(
  fs.readFileSync(file, 'utf8').split(/\r?\n/).map((l) => l.replace(/#.*/, '').trim()).filter(Boolean));

// Frontmatter scalars only; files without a `name` are playbooks, not agents.
const front = (file) => {
  const m = fs.readFileSync(file, 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const f = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (kv) f[kv[1]] = kv[2].trim().replace(/^(["'])(.*)\1$/, '$2');
  }
  return f.name ? f : null;
};

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
  d.isDirectory() ? walk(path.join(dir, d.name)) : d.name.endsWith('.md') ? [path.join(dir, d.name)] : []);

export function catalog(lib = libDir(), core = readCore()) {
  const { divisions } = JSON.parse(fs.readFileSync(path.join(lib, 'divisions.json'), 'utf8'));
  return Object.entries(divisions).map(([id, { label }]) => ({
    id, label,
    agents: walk(path.join(lib, id)).sort().flatMap((file) => {
      const f = front(file);
      const slug = path.basename(file, '.md');
      return f ? [{ slug, file, rel: path.relative(lib, file).replaceAll('\\', '/'),
        name: f.name, vibe: f.vibe || f.description || '', core: core.has(slug) }] : [];
    }),
  }));
}

export function install(cat, tokens, dest, all = false) {
  const picked = tokens.flatMap((t) => {
    const div = cat.find((d) => d.id === t);
    if (div) return div.agents.filter((a) => all || a.core);
    const agent = cat.flatMap((d) => d.agents).find((a) => a.slug === t);
    if (!agent) throw new Error(`unknown category or agent: ${t}`);
    return [agent];
  });
  fs.mkdirSync(dest, { recursive: true });
  for (const a of picked) fs.copyFileSync(a.file, path.join(dest, `${a.slug}.md`));
  return picked;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, arg, dest] = process.argv.slice(2).filter((a) => a !== '--all');
  const lib = libDir();
  if (!fs.existsSync(path.join(lib, 'divisions.json'))) {
    console.error(`agency-agents library not found at ${lib}\n` +
      `git clone https://github.com/msitarzewski/agency-agents "${lib}"`);
    process.exit(1);
  }
  const cat = catalog(lib);
  const ids = (arg || '').split(',').filter(Boolean);
  if (!cmd) {
    console.log(`Library: ${lib.replaceAll('\\', '/')}  (★ = core pick)`);
    for (const d of cat) console.log(`${d.id.padEnd(19)} ${String(d.agents.length).padStart(3)} agents, ${d.agents.filter((a) => a.core).length} ★  ${d.label}`);
  } else if (cmd === 'list') {
    console.log(`Library: ${lib.replaceAll('\\', '/')}`);
    for (const d of cat.filter((d) => ids.includes('all') || ids.includes(d.id))) {
      console.log(`\n## ${d.label}`);
      for (const a of d.agents) console.log(`${a.core ? '★' : ' '} ${a.rel} · ${a.name} — ${a.vibe}`);
    }
  } else if (cmd === 'install' && dest) {
    const done = install(cat, ids, dest, process.argv.includes('--all'));
    console.log(`installed ${done.length} agents into ${dest}: ${done.map((a) => a.slug).join(', ')}`);
  } else {
    console.error('usage: agency.mjs [list <cat,...|all> | install <cat|slug,...> <dir> [--all]]');
    process.exit(1);
  }
}
