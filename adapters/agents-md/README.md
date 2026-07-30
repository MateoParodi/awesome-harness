# Adapter — AGENTS.md

For agents that read a single `AGENTS.md` manifest at the repository root: Codex, Copilot
CLI, and a growing number of others.

**Generated, never committed** — same reason as every adapter.

## The tracked-file rule

`AGENTS.md` is frequently a **team convention already in version control**. Writing into it
would commit an adapter, contradicting the install policy, and would put one person's
tooling into everyone's diff.

So:

- **`AGENTS.md` absent** → create it, add it to the local-only ignore.
- **`AGENTS.md` present but untracked** → append a delimited harness block. It is already
  ignored.
- **`AGENTS.md` present and tracked** → **stop and ask.** Do not edit it. The likely answer
  is a separate untracked file that the operator references from their own copy, but that is
  their call, not the installer's.

The general rule, which applies to every adapter ever written for this harness: **never edit
a tracked file the harness does not own.**

## The block

Delimited so it can be replaced idempotently on re-init without disturbing anything around
it:

```markdown
<!-- awesome-harness:start -->
## Harness

This project uses Awesome Harness. Playbooks live in `~/.harness/core/`:
create-task · start-task · pipeline · review-and-fix · ship

Read before acting: `~/.harness/profile/me.md`, then `.harness/config.yml`,
then `~/.harness/trackers/<kind>.md`, then `~/.harness/core/state-machine.md`
for states, ownership markers and the change taxonomy.

Check `harness.version` against the core before starting a run. While the core
is 0.x a minor mismatch stops the run (0.x minors are breaking); a patch
mismatch warns.

Capability note: this agent has no sub-agent primitive. The pipeline playbook runs
implementation in the main thread — keep runs short and report that context was not
isolated.
<!-- awesome-harness:end -->
```

## Capabilities this agent lacks

Stated plainly, because a playbook that assumes wrongly is worse than one that adapts:

- **no sub-agents** — the pipeline playbook loses its context hygiene. Implementation happens
  in the same thread that orchestrates, so quality degrades over a long run. Prefer
  `next` over `run`, or `run --limit 2`.
- **no parallel review** — the review-and-fix playbook reviews serially, and an inline review is
  weaker evidence than an independent one. It must say so in its report.
- **no independent reviewer context** — the same thread that wrote the code reviews it. The
  deterministic checks in `verify[]` therefore carry proportionally more weight here: they
  are the only genuinely independent signal.
