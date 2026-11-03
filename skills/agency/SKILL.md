---
name: agency
description: Choose which agency-agents specialist categories this project uses. Installs their core agents into .claude/agents and records the choice that agents-team plans with. Explicit-only.
disable-model-invocation: true
argument-hint: "[category,...] [--all]"
---

# agency

Arguments: $ARGUMENTS

The [agency-agents](https://github.com/msitarzewski/agency-agents) library holds about 280 specialist agents in 18 categories (the repo's divisions). It is a git clone at `~/.agency-agents` (or `$AGENCY_AGENTS_DIR`); `git -C ~/.agency-agents pull` updates it. It is not installed globally on purpose: every installed agent's description costs context in every session. Each project installs only the categories it needs.

Catalog tool, `node "${CLAUDE_SKILL_DIR}/agency.mjs"`:
- no arguments: the category index
- `list <category,...|all>`: one line per agent with its path, name and one-line pitch; ★ marks a core pick (`core.txt`)
- `install <category|slug,...> <dir> [--all]`: a category copies its ★ agents (all of them with `--all`); a slug copies that one agent

## Steps

1. Run the index. If it says the library is missing, show the clone command it prints and stop.
2. Read `.claude/agency.json` if it exists (`{"categories": [...], "all": false, "extra": [...]}`) and show the current choice.
3. If the arguments name no categories, suggest the ones this project needs, based on its CLAUDE.md, stack and purpose. Then ask the user in plain text which categories to use, with the index in front of them, because 18 categories don't fit a multiple-choice prompt. Wait for the answer.
4. Install into `.claude/agents` with `install <categories> .claude/agents`, adding `--all` when the user asked for whole categories. Add any single agents the user named as slugs and list them under `extra`. Write `.claude/agency.json`.
5. Report what got installed and the categories recorded. Native agents load in a new session; an agents-team run uses the record right away. These files live in the project, so committing them shares the setup and leaving them out keeps it local.

Removing a category: delete its agents from `.claude/agents` and update `.claude/agency.json`.
