# create-task

Turn a loose description of a bug or a task into an executable ticket, and enqueue it.

**This playbook never writes feature code, never commits, and never starts the work.** It
ends with a ticket in the tracker and one line saying where it landed in the queue. Whether
the work gets done is a separate decision, made later, by a human.

That split is the point. Capture is cheap and happens whenever a thought arrives, in any
session. Execution is expensive and happens when the operator decides.

If the input is empty, ask what to capture and stop. Do not guess.

---

## Step 1 — Reconnaissance, before asking anything

Mandatory, and it goes first. Asking without having looked produces questions built on
false premises, and the operator ends up correcting the question instead of answering it.

1. **Search memory** for prior work on the same subsystem. There may be a fix already
   written and uncommitted, or the same bug already diagnosed.
2. **Search the queue** for open tickets touching the same area. If one exists, note it —
   related tickets get worked together.
3. **Trace the symptom in the code.** Three or four targeted searches, not an audit. Look
   for the constant, the guard, or the runtime flag that would explain the behaviour.
4. **Distrust old notes.** Stored observations carry a date and may be stale. Verify against
   the source before repeating anything as fact.

Timebox this. The goal is to enter the interview with hypotheses, not to close the bug.

---

## Step 2 — The interview

**Facts first, hypotheses second.** If the report has no concrete reproduction, the first
question is the reproduction: what was done, in what order, what was expected, what
happened. Only then offer theories.

Offering options built on an assumed cause is the most expensive mistake this playbook can
make — the operator has to spend a turn dismantling the premise before they can answer.

### Ambiguous phrasing: complaint or request?

A title of the form **"can't do X"** has two opposite readings:

1. *it won't let me do X* → a limit exists, remove or raise it
2. *I want it to be impossible to do X* → no limit exists, add one

**Ask which one before investigating.** No amount of code reading disambiguates this,
because both readings are consistent with the same code — a search that finds no limit is
evidence for either.

The same trap hides in *"X is missing"* (broken, or never built?) and *"X doesn't behave as
expected"* (what was the expectation?). One question costs a turn; an inverted ticket costs
a full implementation.

### What to close

Ask only what cannot be deduced. Group independent questions into one round.

- **Reproduction** — required for defects unless the report already has one.
- **Expected behaviour** — when the "bug" may be the design working as intended. Ask
  directly: *this currently works this way on purpose; what did you expect?*
- **Direction of the fix** — only if reconnaissance found the root cause and more than one
  reasonable path exists. Present the paths with their costs, recommend one, and **if the
  operator picks another, record it and move on.** Do not relitigate.
- **Severity** — propose one with justification; the operator corrects. It determines queue
  order.
- **Iteration** — read `tracker.iteration` from config. Absent means the board has no
  iteration concept (a kanban, a release train): skip the question entirely, do not
  mention sprints at all. Present: resolve the current one through the tracker document,
  propose it, and let the operator confirm. The board's shape was decided at init —
  capture never re-analyzes it.
- **Change** — deduce it; confirm only on genuine ambiguity.

If reconnaissance surfaces information that would change an answer already given, say so in
one line and let the operator decide. Never silently override their choice.

---

## Step 3 — Classify the plan

**Default is direct. Spec-driven planning is the exception.** A three-line fix never sees a
spec.

Planning triggers only if the ticket meets at least one:

- changes a wire protocol or a shared schema (coupled deployment)
- needs a data migration, or touches money, credentials, or persistence
- spans three or more subsystems, or the affected files are unknown up front
- redesigns a flow rather than fixing one
- contains an unresolved product decision

State the choice and the reason in one line.

Orthogonal to the plan: if the change touches money, authentication, migrations, secrets or
network protocol, note that the closing review runs in its strictest mode. That does not
make it a planning ticket.

---

## Step 4 — Write the ticket

If a bare-title ticket already exists, **enrich it rather than duplicating**. Check whether
the body is empty before replacing it.

**The title must describe the real defect**, not the symptom it was reported under. If
reconnaissance changed the diagnosis, rename it and say so.

```markdown
## Symptom
What the user sees, in a sentence or two.

## Reproduction
1. Concrete numbered steps.

## Root cause          (or "Triage status" if none was found)
What was verified in the code, with file and line. What was ruled out and why — that
saves the next person repeating the search. If the root cause wasn't found, say so
explicitly and leave the hypotheses with their pointers.

## Open decision       (only when there is one)
The possible paths with their costs. Until this is resolved the ticket cannot run.

## Acceptance criteria
- [ ] Verifiable, not aspirational. Include the non-regressions that matter.

## Plan
direct | spec-driven — the reason, in one line.
```

**The icon is mandatory** — derived from the `change` field. A ticket without one is a
ticket badly filed, including when enriching an old one.

Fields: state `queued` (or `captured` if it should stay out of the queue), type, change,
severity, iteration (only when the board has one), and a one-line note carrying the most
useful lead and the trap to avoid. When `tracker.assignee` is set, assign the ticket to
that identity; when it is not, leave the ticket unassigned rather than guessing an owner.

**Never add properties to the tracker's schema.** If something seems to need a new column,
propose it and wait.

---

## Step 5 — Enqueue and close

Recompute the position: the queue is every `queued` ticket ordered by severity, then age.

Close with the ticket link, its position and how many are ahead of it, the chosen plan,
anything left unresolved, and the reminder that **nothing was started** — running the queue
is a separate command.
