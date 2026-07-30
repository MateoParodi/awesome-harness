# plan

Spec-driven planning for the rare ticket that earns it. Produces a design and a task
breakdown, then **stops at the planning boundary** — it writes no feature code, commits
nothing, and deploys nothing.

## When this runs, and when it must not

**Default is direct. This playbook is the exception.** A three-line fix never sees a spec.

Triggers only if the ticket meets at least one:

- changes a wire protocol or a shared schema (coupled deployment)
- needs a data migration, or touches money, credentials, or persistence
- spans three or more subsystems, or the affected files are unknown up front
- redesigns a flow rather than fixing one
- contains an unresolved product decision

A three-line fix that gets a design document teaches everyone to skip design documents.
Over-applying this playbook destroys it.

**The execute playbook never runs these tickets automatically.** A planning ticket contains
a product decision by definition, and that does not automate. The queue skips them, reports
them, and a human starts them deliberately.

## Phases

Each phase reads the previous ones and writes one artefact. Run them in order; delegate
each to its own context and keep the orchestrating thread thin.

| Phase | Reads | Produces |
|---|---|---|
| explore | the ticket | what exists today, what constrains the change, which approaches are viable |
| propose | exploration | the chosen approach, with the alternatives and why they lost |
| specify | proposal | requirements and scenarios — behaviour, not implementation |
| design | proposal | architecture, boundaries, data flow, failure handling |
| break down | spec + design | an ordered task list, each independently verifiable |

Artefacts persist wherever the project keeps them — a documents directory, a memory system,
the ticket body. Config declares which; the playbook does not care.

## Rules

**Concepts before code.** Explore until the problem is understood; a design produced before
the constraints are known is fiction.

**Always compare approaches.** Two or three, with their trade-offs, and one recommendation.
A proposal with a single option is a decision already made in private.

**Design for isolation.** Each unit should have one clear purpose, a defined interface, and
be testable alone. If you cannot say what a unit does without describing its internals, the
boundary is wrong.

**Improve what you touch, nothing else.** Where existing code genuinely obstructs the work,
include the targeted fix. Do not propose unrelated refactoring.

**Stop at the boundary.** The output is a task list a human hands to the pipeline playbook.
Crossing into implementation here loses the review point that justified planning in the
first place.

## Output

A task list where each entry is independently verifiable, ordered by dependency, with the
risky ones named as such — plus every decision the operator still has to make. If any
remain open, say so plainly: an unresolved decision keeps the ticket out of the queue.
