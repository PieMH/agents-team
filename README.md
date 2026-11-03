# agents-team

Run big pieces of work in Claude Code as a team. Your session becomes the orchestrator. It plans the work, splits it into scoped tasks, hands each task to a Haiku, Sonnet or Opus subagent and checks every result. Failed tasks go to a stronger model. An Opus QA agent reviews the whole change before you see it.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE) ![Claude Code plugin](https://img.shields.io/badge/Claude%20Code-plugin-d97757) ![Node 18+](https://img.shields.io/badge/node-18%2B-339933)

```
/agents-team add CSV export to the reports page, with tests --parallel 3
```

## Why

On a large task, one long session fills its context with file contents and command output, and every step runs on the same expensive model. agents-team keeps the orchestrator's context small, because the code reading and editing happen inside the subagents, and most of the work runs on cheaper models. The orchestrator only plans, routes and verifies.

- Mechanical edits go to Haiku, feature work to Sonnet, and pivotal or risky tasks to Opus.
- A rejected task goes to a fresh, stronger agent, never back to the one that failed.
- The orchestrator reads each task's diff and the checks it claims. A read-only Opus QA pass then reviews the whole change, including the seams between tasks.
- Work happens on a run branch, with one git worktree per task. Nothing is merged into your branch or pushed unless you ask.
- A ledger in the project records the plan, the queue, every verdict and the next step, so a crash or a `/compact` loses nothing. `/agents-team --resume` picks up where the run stopped.
- Subagents are spawned with Claude Code's own Agent tool, inside your interactive session. It needs no API key and never runs `claude -p`.

## Install

```bash
claude plugin marketplace add PieMH/agents-team
claude plugin install agents-team@agents-team
```

Or, inside a session: `/plugin marketplace add PieMH/agents-team`, then `/plugin install agents-team@agents-team`. Start a new session or run `/reload-plugins`.

**Requirements:** a recent Claude Code with plugin support, Node.js 18+ for the context-gate hook, and git (optional; without it, tasks run in place).

Optional companions, used automatically when present:

| Companion | What it adds |
|---|---|
| [agency-agents](https://github.com/msitarzewski/agency-agents) | About 280 specialist roles. Each task gets one (Frontend Developer, Security Architect, Database Optimizer…), and the orchestrator works in the library's *Agents Orchestrator* persona |
| [ponytail](https://github.com/DietrichGebert/ponytail) | Workers write the smallest complete change at a ponytail level matched to their effort, and QA reviews with `ponytail-review` |
| [rtk](https://github.com/rtk-ai/rtk) | Compact shell output for every agent, through rtk's own hook |

## Use

```
/agents-team <work description> [--effort high] [--parallel 3] [--compact on|off] [--compact-at 500k]
/agents-team --resume
```

A run starts only when you type the command. If another command already uses `/agents-team`, type the full name, `/agents-team:agents-team`.

| Flag | Default | Meaning |
|---|---|---|
| `--effort` | `high` | Starting effort for every subagent |
| `--parallel` | `3` | Maximum number of subagents running at once |
| `--compact` | `on` | At the context threshold, pause and hand you a `/compact` line (never automatic) |
| `--compact-at` | `500k` | Orchestrator context threshold, about half your model's window |

```
/agents-team implement the settings page from docs/spec.md: form, validation, API route, tests
/agents-team fix the five bugs listed in ISSUES.md --parallel 5
/agents-team move the date helpers from moment to date-fns across src/ --effort xhigh
```

If the work fits in one small task, the orchestrator says it's too small for a team and does it directly.

## How a run works

1. **Understand.** The orchestrator reads the request, the project's `CLAUDE.md`, and only the code it needs to plan. For a wide survey it sends a Haiku scout instead of reading everything itself. If an unclear requirement would change the plan, it asks you once, up front.
2. **Plan.** It splits the work into tasks. Each task has owned files (the only files it may edit), dependencies, acceptance criteria, a way to verify it, a model tier and a specialist role. You see the plan as a table, and dispatch starts in the same turn. Press Esc to stop it.
3. **Dispatch.** Up to `--parallel` workers run at once. A new one starts as soon as one finishes.
4. **Verify.** Workers report in a fixed, short format with evidence. The orchestrator reads the diff and reruns the decisive check when the evidence is thin, then accepts or rejects the task.
5. **Escalate.** A new agent, one step up the ladder, retries a rejected task:

   ```
   haiku → sonnet → opus → opus at +2 effort (usually max) → you decide
   ```

6. **QA.** An Opus agent reviews the whole change read-only, runs the project's checks and ranks its findings. Each real finding becomes a new task, with at most two extra QA rounds.
7. **Close.** You get a summary of what was built, each task's path (`haiku ✗ → sonnet ✓`), the QA verdict, any open items, and the run branch to merge, squash or open as a PR.

### Model tiers

| Tier | Gets |
|---|---|
| **Haiku** | Low to medium-low difficulty: scouting, inventories, call-site hunts, mechanical edits that copy an existing pattern, small changes with a clear spec |
| **Sonnet** | Medium-high to high difficulty: features, bug fixes, tests, refactors |
| **Opus** | Very complex or pivotal work: architecture-setting code, cross-cutting changes, concurrency, security, data migrations, bugs of unknown cause |

When a task sits between two tiers, the orchestrator picks the higher one, because a failed attempt costs more than the difference.

### Git mode and plain mode

- In a git repo, the run gets its own branch, `agents-team/<slug>`, and each task gets its own worktree and branch. Accepted work is rebased onto the run branch and fast-forwarded in, so the run branch is a straight line of real commits with no merge commits. If the checkout has uncommitted changes, the orchestrator asks first: you commit or stash them, it commits them as the run's first commit, or the run uses plain mode.
- Without git (plain mode), workers edit in place. Tasks that share files never run at the same time, and owned files are backed up before every attempt.

### Ledger and resume

Everything lives in `.agents-team/` in your project: `run.json` holds the run state, and a Markdown ledger holds the plan, the queue, results, escalations and the next step. In a git repo the folder goes into `.git/info/exclude`. `/agents-team --resume` continues from the ledger's next step.

### Context gate

Each time the orchestrator spawns an agent, the plugin's `PreToolUse` hook reads the orchestrator's real context size from the session transcript. Past `--compact-at`, it holds new spawns while the running agents finish. The orchestrator then hands you a ready-made `/compact …` line and `/agents-team --resume`. Compacting is only a recommendation: say "continue" to go on without it. Outside an active run in the current session, the hook does nothing.

### Specialists

With [agency-agents](https://github.com/msitarzewski/agency-agents) cloned at `~/.agency-agents` (or `$AGENCY_AGENTS_DIR`), every task gets a specialist role. The worker reads that role's file and brings its expertise to the task, while the worker contract still governs scope and reporting.

```bash
git clone https://github.com/msitarzewski/agency-agents ~/.agency-agents   # update: git -C ~/.agency-agents pull
```

The library is never installed globally, because every installed agent's description costs context in every session. The orchestrator reads a compact catalog instead. To set up a project:

```
/agents-team:agency [category,...] [--all]
```

This records the project's categories in `.claude/agency.json` and installs their core agents (★, listed in `skills/agency/core.txt`) into `.claude/agents/`, where you can also use them directly.

## Layout

| Path | Role |
|---|---|
| `skills/agents-team/SKILL.md` | The orchestrator workflow |
| `skills/agency/SKILL.md` | Per-project specialist categories (`/agents-team:agency`) |
| `skills/agency/agency.mjs` | Catalog tool: index, `list`, `install` |
| `skills/agency/core.txt` | Core picks (★), copied by a category install |
| `agents/worker.md` | Worker contract: scope, workspace, verification, report format |
| `agents/qa.md` | Final QA: read-only review, ranked findings |
| `hooks/context-gate.mjs` | The context-gate hook |
| `.claude-plugin/` | Plugin manifest and marketplace entry |

## Development

```bash
git clone https://github.com/PieMH/agents-team
claude plugin marketplace add ./agents-team        # a local-path marketplace loads straight from the folder
claude plugin install agents-team@agents-team
node agents-team/hooks/context-gate.test.mjs       # self-checks: plain Node, no dependencies
node agents-team/skills/agency/agency.test.mjs
```

Edits to a local-path install apply after `/reload-plugins`. Contributor notes are in [CLAUDE.md](CLAUDE.md).

## License

[MIT](LICENSE). The specialist roles come from [agency-agents](https://github.com/msitarzewski/agency-agents) (MIT), which you clone separately. ponytail and rtk are separate projects with their own licenses.
