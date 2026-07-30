# Adapter — Claude Code

Generates one skill per playbook under `.claude/skills/`, each a thin pointer to the global
core.

**Generated, never committed.** These files are derivable from `.harness/config.yml`, and
one person's choice of agent should not land in everyone else's tree. The installer adds
them to the repository's local-only ignore file.

## What it writes

```
.claude/skills/create-task/SKILL.md
.claude/skills/start-task/SKILL.md
.claude/skills/pipeline/SKILL.md
.claude/skills/review-and-fix/SKILL.md
.claude/skills/ship/SKILL.md
.claude/agents/reviewer.md
.claude/agents/critical-reviewer.md
.claude/agents/fixer.md
```

The three agents are pointers too, but their **frontmatter is generated rather than
fixed** — `tools` and `model` come from the project config. Reviewers get read-only tool
lists so they are read-only *by construction* rather than by instruction; the fixer gets
whatever the project's verify chain needs to compile and test. If that chain runs through
an integration and its tools are missing, the fixer cannot validate its own edits, and the
installer says so.

Each file is frontmatter plus a short body that points at three things: the playbook in the
global core, the project config, and the operator profile. The playbook text itself is never
copied — a copy is a fork that silently stops receiving fixes.

## Template

```markdown
---
name: <playbook>
description: <one line, with the trigger phrases the operator will actually type>
---

# <playbook>

Follow the playbook at `~/.harness/core/<playbook>.md`.

Read first, in this order:
1. `~/.harness/profile/me.md` — who you are working for
2. `.harness/config.yml` — this project's tracker, gate, rules
3. `~/.harness/trackers/<kind>.md` — how to speak this tracker

Before starting, compare `harness.version` in the config against the core version.
Minor mismatch: warn and continue. Major mismatch: stop.
```

## Capabilities this agent has

Declared so the playbooks can rely on them:

- **sub-agents** — yes. The pipeline playbook dispatches implementation to a fresh context,
  which is what keeps a long run coherent.
- **parallel sub-agents** — yes. The review-and-fix playbook can review several areas at once.
- **MCP servers** — yes, per project.
- **skills are discoverable by trigger phrase** — the operator can type a slash command or
  describe the intent.

Because sub-agents exist, no playbook needs to degrade here. Every other adapter should
state what it lacks.
