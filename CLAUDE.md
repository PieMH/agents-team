# CLAUDE.md

Guidance for Claude Code, and for people, working on this repo. The README explains what the plugin does for its users. This file covers how to change it without breaking it.

## What this repo is

A Claude Code plugin that is also its own one-plugin marketplace (`.claude-plugin/marketplace.json`, `"source": "./"`). It has no build step and no npm dependencies: Markdown prompts plus three small Node scripts, each with a self-check.

| Path | What it is | Read by |
|---|---|---|
| `skills/agents-team/SKILL.md` | The orchestrator workflow, loaded into the user's session by `/agents-team` | the orchestrating model |
| `skills/agents-team/local-llm.mjs` | The local tier: start/stop the machine's local LLM server and run one headless worker on it | the orchestrator, via Bash |
| `agents/worker.md` | The worker contract (`agents-team:worker`), also the system-prompt addition for local workers | each worker |
| `skills/agency/` | `/agents-team:agency`, plus the catalog tool over the agency-agents library | the orchestrator and the user |
| `hooks/` | The `PreToolUse` context gate on `Agent\|Task` | Claude Code, on every spawn |
| `.claude-plugin/plugin.json` | Name, version, metadata | Claude Code |

## Invariants: don't break these

- **Explicit-only.** Both skills keep `disable-model-invocation: true`. A team run spends a lot of usage, so it starts only when the user types the command.
- **The orchestrator does only the pivotal work.** It plans, routes, verifies, runs the final QA, and does the few `inline` tasks itself; routine work goes to workers. SKILL.md limits its reading to what those need, because its context is the scarce resource. Every line in SKILL.md is paid for on every run: tighten before you add.
- **Opus is never spawned.** The tiers are `light` (the local model when the machine has one, else Haiku), `sonnet`, and `inline` (the orchestrator). The escalation ladder is local → haiku → sonnet → inline → the user.
- **The local tier is machine-aware and safe by default.** It exists only where `~/.agents-team/local.json` exists; everywhere else the run behaves as if it had no local tier. The orchestrator stops only a server its own run started. A local worker always runs `claude --bare` with its own `CLAUDE_CONFIG_DIR` and a dummy key, so no Anthropic login or token reaches the local server.
- **Every retry is a fresh agent.** Escalation always spawns a new agent; never `SendMessage` a failed worker. Never pass `name` to the Agent tool: that creates a teammate in the main checkout instead of a subagent.
- **Never merge or push for the user.** The run branch stays a straight line of commits: rebase the task branch onto it, then `merge --ff-only`, never a merge commit.
- **Workers can't ask the user anything.** They report blockers under `NEEDS`. The report format in `worker.md` stays fixed, because the orchestrator parses it.
- **QA changes nothing.** The orchestrator's final QA only reviews and runs checks; each finding becomes a new task.
- **The hook stays silent by default.** It prints only when all of these hold: `.agents-team/run.json` says a run is `running` with compact on, in this session; the call comes from the main thread, not a subagent; it is an Agent call or a `local-llm.mjs work` launch; and the context is past the threshold. On any read or parse error it stays silent. Its Bash entry carries an `if` filter so Node starts only for local worker launches, not for every Bash call. A noisy or wrong hook gets in the way of every call it matches, in every session of every user.
- **Zero dependencies.** Node 18+ built-ins only. Scripts must run on Windows, macOS and Linux: use `path` APIs, print forward slashes, and parse `\r\n` as well as `\n` (as `agency.mjs` does).
- **The agency library is read, never installed globally.** Only `/agents-team:agency` copies agents, and only into a project's `.claude/agents/`.

## Testing

```bash
node hooks/context-gate.test.mjs             # context gate: token count plus every silent/deny case
node skills/agency/agency.test.mjs           # catalog parsing and install; also checks core.txt against ~/.agency-agents when present
node skills/agents-team/local-llm.test.mjs   # local tier: config, start decision, a real start/stop cycle against a fake server
```

All three are plain `node:assert` scripts: add a case for any logic change. `local-llm.mjs work` needs a real local server and the `claude` binary, so it has no unit test: try it on a throwaway repo. Prompt changes (SKILL.md, `agents/`) have no unit tests. Try them on a throwaway repo with a small multi-task request, then read the ledger it writes.

To try changes, install from the working copy:

```bash
claude plugin marketplace add /path/to/agents-team
claude plugin install agents-team@agents-team
```

A local-path marketplace loads straight from the folder, so edits apply after `/reload-plugins`.

## Releasing

1. Bump `version` in `.claude-plugin/plugin.json` (semver: a flag or behaviour change is at least a minor bump).
2. Keep the flag table identical in README.md and SKILL.md §0, and update the README when defaults or requirements change.
3. SKILL.md §2 names the current model lineup (Haiku 5.5, Sonnet 5.5, with the orchestrator on Opus): update it when the lineup changes.
4. Users update with `claude plugin marketplace update agents-team && claude plugin update agents-team@agents-team`.

## Style

- Prompts are short, imperative and concrete. Name the exact command or file, and leave out motivational filler.
- Commits get a short imperative subject and no AI attribution trailers.
- `core.txt` holds the maintainer's core picks. Change it on purpose only, and keep its slugs valid (the agency test checks them).
