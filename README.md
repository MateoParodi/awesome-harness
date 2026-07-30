# Awesome Harness

**One playbook for turning a thought into a shipped commit. Any repo, any stack, any agent.**

A set of playbooks that give a coding agent a repeatable way to capture work, decide when
it is genuinely finished, and open the pull request — without hardcoding your tracker, your
toolchain, or your agent into the instructions.

> **Status: v0.2 — early implementation.** The playbooks and one tracker backend have run
> against real work. The installer, both adapters, a config validator and a smoke test
> exist and run in CI. Young enough that you should read what it writes before trusting it.

---

## The idea

Most agent setups rot for the same reason: the playbook and the project end up in the same
file. Someone adds an instruction to fix a misbehaviour, then another, and six months later
the instructions have absorbed a tracker's database IDs, a compiler's exact invocation, and
one codebase's private exceptions. The result works beautifully in exactly one repository.

The fix isn't more instruction. It's a boundary.

```
┌───────────────────────────────────────────────────────────────┐
│  AGENT ADAPTER                      generated, never committed│
└───────────────────────────────────────────────────────────────┘
                               │
╔═══════════════════════════════════════════════════════════════╗
║  CORE PLAYBOOKS                                               ║
║  create-task · start-task · pipeline · review-and-fix · ship  ║
╚═══════════════════════════════════════════════════════════════╝
                               │
┌───────────────────────────────────────────────────────────────┐
│  PROJECT CONFIG                        the only committed file│
└───────────────────────────────────────────────────────────────┘
```

The core never names a tool, an identifier, or a language. Everything specific to a
repository enters from below; everything specific to an agent enters from above. Swap
either side without touching the middle.

A playbook that says *run the project's declared compile check and require zero errors* is
portable. One that names a specific compiler command is a document about that toolchain
wearing a general-purpose costume.

---

## The five playbooks

| Playbook | Does | Never does |
|---|---|---|
| **`/create-task`** | Reconnaissance in the code, a short interview, then a ticket with a reproduction, a verified root cause, and an acceptance criterion. Enqueues it. | Writes code. Commits. Starts the work. |
| **`/start-task`** | Spec-driven planning for the rare ticket that earns it. Stops at the planning boundary. | Implements. A three-line fix never sees a spec. |
| **`/pipeline`** | Takes the top ticket, dispatches it to a fresh sub-agent, gates it, commits, updates the tracker, continues. | Deploys. Changes branch. Reverts on failure. |
| **`/review-and-fix`** | Independent blind review, triage, fix, run the project's real checks, fresh blind re-review. | Trusts its own opinion when an executable check exists. |
| **`/ship`** | Pushes the branch and opens the run's pull request as a draft, body built from the tickets. | Merges. Force-pushes. Pushes to the default branch. |

The names are the commands. Nothing in them is tied to a particular project — they are just
the clearest description of what each one does, which is worth more than a tidier
abstraction nobody's fingers remember.

The central split: **capture is cheap and constant, execution is expensive and
deliberate.** Writing work down happens whenever a thought arrives and starts nothing.
Doing the work happens when you decide, and drains a queue.

---

## Install

```bash
git clone https://github.com/MateoParodi/awesome-harness.git ~/.harness
cd /path/to/your/project
node ~/.harness/bin/init.mjs
```

One clone per machine. Updating everything is `git pull` in `~/.harness`.

### What lands in your project

```
your-repo/
├─ .harness/
│  ├─ config.yml      ← COMMITTED. the only one.
│  └─ state.json      ← excluded (machine-local cursor)
├─ <adapter files>    ← excluded (generated pointers)
└─ .git/info/exclude  ← local-only ignore, never travels
```

**Only `config.yml` is committed.** It is project truth — the verification chain, the state
mapping, the repository's hard rules — and it belongs in review like any other project
config. It is safe to commit because it holds `${ENV_VAR}` references, never literal
identifiers or tokens.

Everything else is excluded through the repository's **local-only ignore file**, not the
shared `.gitignore`. Personal tooling should not appear in a shared ignore list, and the
local mechanism lets you install into a repository whose ignore rules aren't yours to edit.

Cloning that repository elsewhere gives you the config and nothing else — which is enough.
Re-running init rebuilds every adapter from it. Config being committed is precisely what
allows the adapters not to be.

### Version pinning

One shared core means an update changes behaviour everywhere at once. So the committed
config declares `harness.version`, and every playbook checks it before starting.

While the core is **0.x**, a **minor** mismatch refuses to run — 0.x minors are breaking
by semver convention, and the 0.1 → 0.2 playbook rename is exactly the kind of change the
check exists to catch. A patch mismatch warns. From 1.0.0 the usual rule applies: major
refuses, minor warns. Without this check, a single global copy is a footgun.

After pulling a core update that refuses, re-run `node ~/.harness/bin/init.mjs` in the
project to regenerate the adapters, then bump `harness.version` in the config.

---

## Layout

```
~/.harness/
├─ profile/     L0 — the operator: who the agent works for. One per human.
├─ core/        L1 — the playbooks. No tool names live anywhere in here.
├─ agents/      L1 — reviewer, critical reviewer, fixer. Behaviour only.
├─ schema/      L2 — JSON Schema validating every project config.
├─ presets/          stack defaults the installer starts from.
├─ trackers/         one document per backend: how to speak it.
├─ adapters/    L3 — templates, one per agent.
├─ bin/              the installer.
└─ docs/             the full specification, as a page.
```

Four layers, orthogonal by design — change one without touching the others, or the seam
has failed:

- **L0 the operator** — travels with the person, not the repo. Loaded everywhere so
  behaviour is identical across projects.
- **L1 the method** — how work is captured, when it counts as finished, what happens when
  it isn't.
- **L2 the project** — every project-specific noun, in one validated file.
- **L3 the wiring** — thin, generated, disposable.

Agents straddle the seam deliberately: their **behaviour** is L1 and identical everywhere,
while their **tool list and model** are generated from the project config. What an agent
may touch depends on the repository it is standing in — a fixer that cannot run this
project's compiler is a fixer that reports work it never checked.

---

## Invariants

Five rules the whole thing rests on.

1. **The tracker is truth; local state is a cursor.** Delete the cursor and it rebuilds
   from the board — the running ticket *is* the one in the running state. No state exists
   only on one disk.
2. **The gate is delegated, never invented.** Verification is whatever the project
   declares. The harness reads a pass or a fail; it never decides for itself that code is
   fine. Where an executable check exists, an opinion doesn't count.
3. **A stuck task steps aside; a broken environment stops everything.** A task that can't
   be finished has its work moved to a *named, recorded* stash and the queue carries on —
   one bad ticket shouldn't freeze the other nine. A broken environment halts the run,
   because without a working gate nothing after it can be verified. Never discard work.
4. **Planning is the exception.** Spec-driven planning triggers only for protocol changes,
   migrations, anything touching money or persistence, work spanning several subsystems,
   or an unresolved product decision. A three-line fix that gets a design document teaches
   everyone to skip design documents.
5. **One writer for history and for the tracker.** The orchestrator commits and updates the
   board; sub-agents implement and report. Two writers on one piece of state is how history
   becomes unattributable and a board starts to lie.

---

## Full specification

`docs/index.html` — the complete design: the seam, the four layers, the state machine, the
change taxonomy, the config schema, and field notes on two defects that only appeared once
it ran.

**What is canonical:** `core/`, `agents/` and `schema/` are normative — playbooks and
agents follow them, and `harness.json` names them. `docs/index.html` is the narrative
explanation; this README is the pitch. Where they disagree, the normative layer wins, and
`bin/lint-names.mjs` (run in CI) keeps the names from drifting apart.

## Contributing

The design is the artefact right now. Corrections to `docs/index.html` and `core/` are
worth more than code until the installer lands.

## License

MIT — see [LICENSE](LICENSE).
