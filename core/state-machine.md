# State machine

Seven states. The project config maps each one to a real value in the real tracker, so
adopting the harness never requires renaming a column or restructuring a board.

```
captured → queued → running → verified → in-review → shipped
                       └──────────────→ blocked
```

| State | Meaning | Who may write it |
|---|---|---|
| `captured` | Written down, not triaged. Outside the queue. | human |
| `queued` | In the queue, ready to run. Ordered by severity, then age. | both |
| `running` | Being worked. Exactly one at a time per branch. | both |
| `verified` | Compiles, tests pass, reviewed, committed — **not** pushed. | harness |
| `in-review` | Included in the run's open pull request. | harness |
| `blocked` | Stuck and set aside. Work stashed, queue continues. | harness |
| `shipped` | Merged and released to users. | **human only** |

## The harness never says "done"

Its terminal state is `in-review`, with a pull request open and every included ticket
linked to it. Whether something is genuinely finished is a judgement about users, and that
stays with the person who merges and deploys.

## Ordering

Severity descending, then oldest first. The severity vocabulary is per-tracker and declared
in config; the harness only needs a total order over it.

Do not attempt to read a board's manual card order. Most tracker APIs do not expose it —
this is a hard limitation, not a preference.

## The board is shared

**The harness does not own any state.** Humans write the same values, meaning different
things: a ticket parked in `running` as personal work-in-progress, a `blocked` column used
as frozen backlog.

Ownership is disambiguated by a **marker** written at the start of a text field declared in
config (`tracker.marker_field`):

| Marker | Meaning |
|---|---|
| `⏳ harness` | the harness is running this task now |
| `⛔ harness BLOCKED: <reason>` | the harness stopped here |
| *(no marker)* | **belongs to the human — ignore it in silence** |

An unmarked entry in a harness state is not queued, not reported as stale, and not asked
about. When a task closes, the marker is removed.

A marker in an existing text field was chosen over a dedicated column so adoption requires
no schema change, and so the board stays readable to someone who has never heard of the
harness.

## Iteration

There is no sprint object. Config points one key at whatever the project already treats as
its current iteration — a cycle, a sprint, a milestone, a version in development. The
playbooks only ever ask for *the current iteration* and let the tracker layer resolve it.

A team running two-week cycles and a solo project shipping versions both satisfy the same
contract.

## Change taxonomy

Every ticket declares the nature of its change. This is not metadata for filtering — the
commit type derives from it, which is what stops a ticket being a wish and makes it an
instruction.

| Change | Commit | When |
|---|---|---|
| `add` | `feat` | Something that did not exist before |
| `change` | `feat` | It existed and now behaves differently |
| `remove` | `feat` | Something is taken out |
| `fix` | `fix` | It goes back to doing what it already promised |
| `refactor` | `refactor` | Same behaviour, better code |
| `tooling` | `chore` | Build, deploy, scripts, documentation |

This is the portable core. `vcs.commit_map` may extend it, and a domain usually needs one
or two entries of its own — a category that would otherwise be mislabelled every time.

Two constraints on any extension:

1. **Small enough that the right answer is obvious.** A twelve-option picker guarantees a
   wrong pick, and a wrong pick here silently corrupts commit history.
2. **Every entry maps to exactly one commit type**, or the field stops being able to decide
   anything.

The same field drives the ticket's icon, which makes a board legible at a glance without
reading a single title.
