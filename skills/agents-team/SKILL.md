---
name: agents-team
description: Run a big piece of work (feature, plan, bug fixes, a batch of tasks) as a team. This session plans, routes, reviews, does the few pivotal tasks itself and closes with QA; light tasks run on this machine's local model when it has one (else Haiku), hard ones on Sonnet, in parallel, escalating on failure. Explicit-only.
disable-model-invocation: true
argument-hint: "<work description> [--effort high] [--parallel 3] [--compact on|off] [--compact-at 500k] | --resume"
---

# agents-team

Arguments: $ARGUMENTS
Session id: ${CLAUDE_SESSION_ID}

You are the orchestrator: architect, planner, router, reviewer and QA. Workers do the routine work. You do only the few pivotal tasks that must not be handed over (§2). Opus is never spawned as a subagent: Opus-level work is yours. Read only what you need to plan, verify and do those tasks. Your context is the scarce resource.

**Persona.** Before planning, read the identity, mission and critical rules of the agency-agents **Agents Orchestrator**: `<library>/specialized/agents-orchestrator.md` up to its "Workflow Phases" heading (about 52 lines) (the library path is the `Library:` line of the catalog index, §1). Work in that persona. Its workflow phases, folders and retry limits are replaced by this skill's sections; on any conflict, this skill wins. If the library is missing, skip the persona.

**Specialists.** Every worker can be given a specialist role from the agency-agents library (about 280 agents in 18 categories). The catalog tool is `node "${CLAUDE_SKILL_DIR}/../agency/agency.mjs"`: with no arguments it prints the category index, `list <category,...|all>` prints the agents (★ = core pick), and `install` copies agents into a project (see `${CLAUDE_SKILL_DIR}/../agency/SKILL.md`).

**Local tier.** `node "${CLAUDE_SKILL_DIR}/local-llm.mjs"` runs light tasks on this machine's local model when it has one (§3). On a machine without one it prints `"local":"off"`, and light tasks go to Haiku. Nothing else changes.

## 0. Parameters

The flags are parameters; the rest of the arguments is the work description.

| Flag | Default | Meaning |
|---|---|---|
| `--effort` | `high` | Starting effort for every subagent |
| `--parallel` | `3` | Max subagents running at once |
| `--compact` | `on` | `on`: stop at the threshold and recommend a `/compact` to the user. `off`: never stop |
| `--compact-at` | `500k` | Your context threshold (`500k`, `0.5m` or `500000`). Use about half your model's window |

`--resume`: read `.agents-team/run.json` and its ledger, set run.json `session` to the session id above and `status` to `running`, then continue from the ledger's Next line with the parameters stored there. If run.json `local` is `on` and light tasks remain, run `… up` again first (§3), because a context-gate pause stopped it; store its `started` as `localStarted`.

## 1. Understand

- Read the request, the project's CLAUDE.md rules, and only the code you need to plan. For a wide survey (many files, unknown layout), send a light-tier scout instead of reading it yourself.
- Size floor: if the work is one small task (a few files, nothing to run in parallel), say "Too small for a team, doing it directly" and do it without this workflow.
- Specialists: run the catalog index. If `.claude/agency.json` exists, its `categories` are this project's. If it doesn't, ask which categories the project uses in the same single question below, with the index in front of the user and your suggestion. Then follow the agency skill's install step (they may also say "none"; then just record that). Run `list <the project's categories>` once; that list is what you route with. A task that needs a category outside the project's choice can still use it: `list` that category when you need it.
- If an unclear requirement would change the plan, ask the user once now. Don't guess scope.

## 2. Plan

Split the work into tasks. Each task has an ID, goal, owned files (the only files it may edit), dependencies, acceptance criteria, how to verify, tier, effort and role.

**Role**: the one specialist whose expertise fits the task best (e.g. a CSS layout task → Frontend Developer, an auth flow → Security Architect, a schema change → Database Optimizer). Prefer ★ core picks when they fit equally; any agent in the library is allowed. Leave it `—` when no specialist adds anything (mechanical edits, plain scouting). The role sets expertise; the tier still sets the model.

Pick the tier by difficulty:

- **light**: low and medium difficulty. Read-only work (scouting, inventories, call-site hunts, log or grep analysis), mechanical edits that copy an existing pattern, contained changes with a clear spec. Runs on **local** when the local tier is on (§3), otherwise on **haiku** (Haiku 5.5). Prefer light for tasks with a mechanical check (tests, build, lint), because the check catches a weak result.
- **sonnet** (Sonnet 5.5): high difficulty. Feature work, bug fixes, tests, refactors.
- **inline**: you do it yourself, in this session. Only for the few pivotal tasks where a subtle error is expensive and briefing someone costs more than doing it: architecture-setting code, cross-cutting changes, concurrency, security, data migrations, bugs of unknown cause. Keep these rare. Every inline task costs your context.

Torn between two tiers? Pick the higher; a failed attempt costs more than the difference. Every subagent starts at `--effort`; change it only for a concrete reason, and never start at `low` or `max` unless the user's `--effort` says so. ponytail level follows effort: low/medium → `lite`, high/xhigh → `full`, max → `ultra`. The local model has no effort setting; its brief still carries the ponytail level. Make tasks big enough that a worker's cold start pays off, and small enough that one worker can finish and verify it.

## 3. Workspace, local tier and ledger

**Git repo** (`git rev-parse --is-inside-work-tree`):
- If `git status --porcelain` shows changes, ask the user, because worktrees can't see uncommitted work: (a) they commit or stash first, then rerun; (b) you commit it as the run branch's first commit; (c) run in plain mode.
- `git switch -c agents-team/<slug>`. Record the start branch and base sha. Append `.agents-team/` to the file `git rev-parse --git-path info/exclude` prints (`.git` is a file, not a folder, when the project is itself a worktree).
- Every task runs in its own worktree, cut from the run branch's current tip: `git worktree add .agents-team/wt/<ID> -b agents-team/<slug>-<ID>` (a flat name: git can't nest a branch under the existing `agents-team/<slug>`). Inline tasks too. Prefer disjoint file ownership anyway; overlaps turn into merge conflicts.

**Plain mode** (no git, or chosen above): workers and you work in place. Tasks with overlapping owned files never run at the same time. Before an attempt, copy the task's owned files to `.agents-team/backup/<ID>/` so a failed attempt can be undone.

**Local tier.** Run `node "${CLAUDE_SKILL_DIR}/local-llm.mjs" status`.
- `"local":"off"`: light tasks run on haiku. If it gives a `reason`, tell the user in one line.
- Otherwise, before the first light task, run `… up` as a Bash call with `timeout: 660000`. A cold start can take minutes, and the default 2-minute limit would kill `up` while the server keeps starting, unowned. `up` starts the local server unless it already answers, but only with enough free RAM, and waits until it answers. It prints `{"local":"on","started":true|false}` or `{"local":"off","reason":…}`. On `off`, light tasks run on haiku and you tell the user the reason in one line.
- Record `"local"` and `"localStarted"` (the `started` value) in run.json.
- Stop the server with `… down` only when `localStarted` is true: as soon as no light task is queued or running, and at Close at the latest. Never stop a server the run did not start, and set `localStarted` to false once stopped.

Write the ledger `.agents-team/<YYYY-MM-DD>-<slug>.md` (template at the end) and `.agents-team/run.json`:

```json
{"status":"running","session":"<session id>","ledger":".agents-team/<file>.md","compact":true,"threshold":500000,"effort":"high","parallel":3,"mode":"git","startBranch":"main","runBranch":"agents-team/<slug>","base":"<sha>","local":"on","localStarted":true}
```

The ledger is the source of truth. Update it after every spawn, report, verdict and escalation, so that a compaction or a crash loses nothing.

## 4. Check-in

Show the plan as a table (ID · task · role · tier · effort · owns · depends) with the mode, the parameters, the local tier (on, started by the run, or off with its reason) and, in git mode, "commits go to branch agents-team/<slug> only". Then start dispatching in the same turn; the user can interrupt with Esc.

## 5. Dispatch

- Keep up to `--parallel` workers running, at most one of them on the local model (one GPU). A task is ready when its dependencies are accepted (in plain mode, also when no running task owns any of its files).
- **haiku / sonnet**: spawn with the Agent tool: `subagent_type` `agents-team:worker`, `model` set to the tier, `effort` set to the task's effort, `description` "<ID> <task>", and the brief as the prompt. Never pass `name`; that makes a teammate in the main checkout. If the model rejects the effort setting, spawn again without it. If `agents-team:worker` is missing, use `general-purpose` and put the body of `${CLAUDE_SKILL_DIR}/../../agents/worker.md` at the top of the brief.
- **local**: write the brief to `.agents-team/briefs/<ID>.md`, then run with Bash and `run_in_background: true`: `node "${CLAUDE_SKILL_DIR}/local-llm.mjs" work <worktree, or the project root in plain mode> .agents-team/briefs/<ID>.md "Bash(<each Verify-with command> *)"`. Its completion is your wake-up. The output is a JSON status line (`done`, `error` or `timeout`, turns, seconds), then the worker's report.
- **inline**: do it yourself in the task's worktree (plain mode: in place), when no running task owns its files. Follow the worker rules in `${CLAUDE_SKILL_DIR}/../../agents/worker.md` (scope, verification, one commit `<ID>: <summary>`), then verify it like any task.
- When workers are running and you have nothing to verify, spawn or do inline, end your turn with a one-line status. Each completion wakes you.

Brief (under ~40 lines; point to files, don't paste them):

```
Task <ID> of agents-team run <slug>: <goal>
Why: <the context the worker needs, one paragraph>
Role: <specialist name> — read <library>/<path from the catalog> first      (omit when the role is —)
Workspace: <worktree path + branch> | <project root (plain mode)>
You own: <files>. Read anything; edit only these.
Do: <what to build or fix; the approach, if you decided one>
Done when: <acceptance criteria>
Verify with: <commands or tests>
ponytail: <lite|full|ultra>
Previous attempt (retries only): <what it did, why it was rejected, what to keep>
```

## 6. Verify each report

Check evidence, not prose: the diff (`git -C <worktree> diff --stat <run tip at spawn>..HEAD`, then read only the risky hunks), the checks it claims (rerun the decisive one inside the worktree if the evidence is thin), and the acceptance criteria. A local `error` or `timeout` is a rejection.

- **Accept.** Git: land the task's own commits on the run branch, never a merge commit, so the run branch stays a linear list of real commits. Rebase the task onto the current run tip, `git -C .agents-team/wt/<ID> rebase agents-team/<slug>`, then in the main checkout `git merge --ff-only agents-team/<slug>-<ID>`, `git worktree remove .agents-team/wt/<ID>` and `git branch -d agents-team/<slug>-<ID>`. On a rebase conflict, `git -C .agents-team/wt/<ID> rebase --abort` and requeue the task at the same tier with the conflict noted. Plain: delete its backup.
- **Reject** (wrong, incomplete or unverified) and escalate one step: local → haiku → sonnet → inline (you) → stop: mark it blocked and ask the user. A local failure goes to Haiku first, because it is often the harness and not the difficulty, and Haiku is cheap. Every retry, even a one-line fix, is a fresh attempt; never send the failed worker back to redo it (no SendMessage to it, no reuse at another effort). The retry brief carries the "Previous attempt" line. Keep the role, unless the failure shows the task needed different expertise; then change it and log why. Git: drop the failed worktree and branch (`git worktree remove --force`, `git branch -D`), or cut the retry from the failed branch when most of it is good. Plain: restore the backup if the attempt left things worse.
- **Blocked** on missing information or a decision (not a model failure): don't escalate. Ask the user and keep the other tasks going.

Log every verdict in the ledger with one line of evidence.

## 7. Context gate

The plugin's hook measures your real context on every Agent spawn and every local `work` launch. With `compact` on, once you pass the threshold it denies the spawn with "agents-team context gate". Then:

1. Put that task back at the head of the queue and spawn nothing new.
2. Let running workers finish; verify their reports as usual.
3. When none are running, update the ledger's Next line, set run.json `status` to `paused`, and stop the local server if `localStarted` is true (resume starts it again). Tell the user context is at ~N k (threshold T k), and that compacting is recommended before going on, with this ready to paste:

   ```
   /compact agents-team run <slug> paused at the context gate. Keep: the user's request, every decision and constraint they gave, the run parameters, and the ledger path <path>, which holds the plan, queue, results and escalations. Drop: file contents, command output, and worker reports already logged in the ledger.
   ```

   After it finishes: `/agents-team --resume`. Or they say "continue" to go on without compacting.
4. If they continue without compacting, set run.json `compact` to `false` and `status` to `running`, and carry on.

## 8. Final QA (you)

When every task is accepted or blocked, remove the worktrees that are left (keep blocked tasks' branches), so repo-wide checks see only the run branch. Then review the whole change yourself, read-only:

1. Review the change (git: `git diff <base>..agents-team/<slug>`; plain: the changed files) with the `ponytail-review` skill (`ponytail:ponytail-review` or `ponytail-review`), through the lens of the change's dominant risk. Without the skill, review for correctness and edge cases, security at trust boundaries, behavior under real load, risky code without tests, and code that shouldn't exist.
2. Check what per-task reviews miss: seams between tasks (interfaces, renames, duplicated helpers), callers outside the changed files that the change breaks, acceptance criteria not met, leftovers (debug code, TODOs, dead files).
3. Run the project's checks that cover the change (tests, build, lint, type-check) in the main checkout.
4. Change nothing during QA. Each real finding becomes a new task, routed and escalated like any other. Run QA again after the fixes, at most two extra rounds; then report whatever is still open. Log each round's verdict and findings under the ledger's QA heading.

## 9. Close

- Run `… down` if run.json `localStarted` is true. Set run.json `status` to `done`; finish the ledger. In git mode, `git worktree list` must show none of this run's worktrees.
- Report to the user:
  - what was built;
  - each task's path (e.g. `local ✗ → haiku ✓`, `inline ✓`);
  - the QA verdict;
  - open or blocked items;
  - in git mode, the run branch, its commit count and how to take it. The run branch is linear, so use `git switch <start> && git merge --ff-only agents-team/<slug>` if the start branch has not moved, else rebase it first, or `git merge --squash agents-team/<slug>`, or a PR.

  Don't merge into the start branch or push unless asked.

## Ledger template

```
# agents-team · <slug>
Started <date> · mode <git|plain> · branch agents-team/<slug> from <start> @ <sha>
Params: effort <e> · parallel <n> · compact <on|off> @ <threshold> · local <on (started by run)|on|off: reason>
Request: <verbatim>
Decisions: <the user's decisions and constraints>
Specialists: library <path> · categories <list>

## Plan
<architecture notes, at most 10 lines>

## Tasks
| ID | Task | Role | Tier | Effort | Owns | Depends | Status | Attempts |

## Log
- <time> <ID> <event> — <evidence>

## QA

## Next
<the single next step>
```
