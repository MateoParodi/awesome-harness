# execute

The control panel and the engine. Reads the queue, runs it one ticket at a time, commits,
and keeps the tracker honest.

**You are the orchestrator.** You do not implement — you dispatch each task to a fresh
sub-agent and stay thin: read the queue, pick a ticket, hand it off, commit, continue. The
eighth ticket of a run therefore begins with your context as clear as the first. That is
the difference between a queue that drains and one that degrades into confident nonsense
around item four.

**You are the only writer of history and of the tracker.** Sub-agents implement and report;
they do not commit and do not touch the board. Two writers on one piece of state is how
history becomes unattributable.

Serial, one ticket at a time, one branch, no worktrees. Parallelism across a single branch
buys merge conflicts and diffs nobody can attribute.

> An agent without a sub-agent primitive still runs every playbook — it runs implementation
> in the main thread and loses that context hygiene. The adapter declares the limitation;
> shorten runs rather than pretending.

---

## Commands

| Command | Effect |
|---|---|
| *(none)* | Show status. Touch nothing. |
| `run` | Drain the queue: one ticket at a time until empty, paused, or halted |
| `run --limit N` | At most N tickets |
| `run --iteration X` | Only tickets in that iteration |
| `next` | Exactly one ticket, then stop |
| `pause` | Set the flag; the loop stops **after** finishing the current ticket |
| `resume` | Clear the flag. Does not start — `run` does |
| `skip [reason]` | Set the current ticket aside, continue with the next |
| `sync` | Rebuild the local cursor from the tracker |

## The cursor is rebuildable

Local state is a cache, not a source of truth. If it is missing, stale or corrupt, rebuild
it from the tracker without ceremony: the ticket in the `running` state **is** the running
ticket, and the queue is every `queued` ticket in order. Never store anything locally that
cannot be derived from the board.

---

## Preflight — before the first ticket of a run

Stop and ask if any of these fails. Each one covers a concrete way to destroy work.

1. **Version.** Compare the core version against `harness.version` in config. Minor
   mismatch warns; **major mismatch refuses to run.**
2. **Toolchain reachable.** The gate depends on the project's declared verification. If it
   can't be run, refuse the run rather than committing blind.
3. **Project preflight checks.** Everything in `preflight[]` — these are the repo's own
   ways of being unsafe to touch right now.
4. **Branch.** Record it. On later runs it must match; if it changed, stop and ask.
   **If the current branch is the default branch and pushing is enabled, stop and ask for a
   branch** — auto-push on the default branch pushes straight to it.
5. **Working tree.** If dirty, say what is uncommitted and ask: commit it separately first,
   or accept that it merges into the first ticket's commit?
6. **Leftovers.** Look for a `running` ticket **carrying the harness marker** — that is a
   run that was cut short. Show it and ask. Unmarked ones belong to the human: ignore them
   silently.

---

## The loop

### 1. Take the ticket

Top of the queue. Read the whole thing, body included — the reproduction, the root cause
and the acceptance criteria live there.

**A spec-driven ticket is not skipped — it is done**, running its planning phases through
to the end before implementing. That changes the dispatch step only; the gate, the commit
and the close are identical. You remain the sole writer of history and of the tracker.

**An unresolved product decision is a question, not a blocker.** Ask it — real options,
their trade-offs, your recommendation first and why — then carry on with the answer. A
decision costs the operator two minutes; removing the ticket from the queue costs a whole
run. Only if the operator is unavailable does it become a class A block, recorded with
exactly which decision is missing.

> These two rules replace an earlier "skip anything spec-driven". That shortcut pulled
> tickets out of the queue that in practice unblocked with a single question — and a
> planning ticket at the head of the queue would strand everything behind it. Skipping was
> the easy answer, not the correct one.

Set the ticket to `running` and write the marker into the configured field, preserving what
was already there.

### 2. Dispatch

One sub-agent, fresh context, synchronous — the pipeline is serial and needs the result
before continuing.

Its prompt carries, verbatim:

- the whole ticket — symptom, reproduction, root cause, acceptance criteria
- **the repository's rules as text, not as file paths** — `rules[]` from config, plus the
  conventions the project documents. Sub-agents should not have to go read and interpret.
- how this project actually compiles and tests, and any non-obvious step required for a
  change to take effect
- its limits: **does not commit, does not touch the tracker, does not deploy, does not
  push, does not change branch, does not run migrations against production**

Ask it back for: which files it touched and why, what it verified, and what it is unsure
about.

### 3. The gate

Invoke the review-and-fix playbook against the working tree. It already runs the project's declared
checks internally and loops its own review — **do not duplicate any of it.** Read its final
status.

- **pass** (with or without warnings) → the task is finished; commit.
- **blocked** → one retry, handing back the concrete blocker as feedback. If it comes back
  blocked again, this is a **class A failure** (below).

Use the strictest review mode when the change touches money, authentication, migrations,
secrets or network protocol.

### 4. Commit

Conventional commit. The type comes from the ticket's `change` field via `vcs.commit_map` —
you do not choose it. Language per `vcs.language`. **No AI attribution**, per
`vcs.attribution`.

The body states **what was wrong and why**, not just what changed — and it describes the
root cause you *verified*. If review proved the ticket's stated cause false, the commit
carries the real one.

Commit only this task's work. Long tasks may take coherent intermediate commits; the last
one closes the ticket.

### 5. Close the ticket

Tracker: state → `verified`. Never `shipped` — that belongs to the human who deploys. Add a
log line to the body with what was done and the commit hash. **Remove the marker.**

Cursor: move the ticket to done, clear current, record the commits.

### 6. Push and pull request

Invoke the ship playbook after **every** commit. It is idempotent: the first call pushes and
opens the pull request as a draft, later calls update it, and the end of the run marks it
ready.

If ship stops on a precondition — not authenticated, on the default branch, remote rejected
— that is a **class B failure**: halt. Work is committed locally and safe, but piling up
commits that cannot be published helps nobody.

### 7. Continue

If paused, stop here and report. Otherwise take the next ticket.

At the end of the run, call ship once more to mark the pull request ready for review.

---

## When something fails

A stuck task **does not stop the queue**. Set it aside and continue. What does stop
everything is a broken environment, because then nothing afterwards can be verified.

| Class | What happened | What you do |
|---|---|---|
| **A — the task is stuck** | gate blocked twice · the ticket's premise turned out false · an undocumented product decision appeared · the fix needs something out of scope | block **that task**, continue with the next |
| **B — the environment broke** | toolchain unresponsive · branch changed underneath · working tree conflicted · cannot commit or push | **halt the whole run** |

### Class A

1. **Never discard work.** No hard reset, no checkout-discard, no deleting files.
2. Stash it, scoped to the paths this task touched, including untracked files, **with a
   descriptive message** naming the ticket. Then confirm the tree is clean; anything left
   over belongs to the human — leave it.
3. Record **both the stash reference and its message** in the cursor, on the blocked task.
   Stash indices shift when another is added; the message is what makes it findable.
   *An unrecorded stash is lost work.*
4. Ticket → `blocked` with the blocked marker and the reason. In the body: what failed, what
   was tried, which check stayed red, and **what concrete decision is needed** if that is
   the blocker.
5. Cursor: mark it blocked, clear current, **leave the run unpaused** — the queue lives.
6. Continue with the next ticket.
7. At the end of the run, report every blocked task together: what each needs, and how to
   recover its stash.

### Class B

1. Do not revert and **do not stash** — touching a broken tree makes it worse.
2. Current ticket → `blocked`, marker and reason, as in class A.
3. Cursor: paused, with the reason.
4. Report what broke, what is uncommitted, and what would unblock it.

Because blocked work is stashed and never committed, the branch only ever contains verified
work — which is why the run's pull request is always publishable.

---

## Status output

Report, in this order: branch and whether the run is idle, running or paused; the current
ticket; the next few in the queue; anything skipped and why; anything blocked and what it
needs; what was completed with its commits; and the open pull request.

If paused, say why and what unblocks it.

---

## Hard limits

Never: deploy · run a full build where the project forbids it · apply migrations to
production · merge a pull request · force-push · push to the default branch · take a
`shipped` ticket from the queue · change branch · create worktrees · discard work on failure
· add AI attribution anywhere · add properties to the tracker's schema.
