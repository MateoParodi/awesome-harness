# ship

Push the working branch and open the run's pull request. Closes the cycle:
`create-task → start-task → pipeline → review-and-fix → ship`.

**One pull request per run, not per ticket.** A run works every ticket on the same branch,
so a pull request per ticket is not available — they would all be the same branch. This
playbook is therefore **idempotent**: the first call creates, later calls update, the last
call marks ready.

A project that genuinely wants one pull request per ticket needs a branch per ticket. That
is a different branch policy, set in config — not a different playbook.

## Authorisation

Everything before this point is local and reversible. Pushing is outward-facing: it reaches
teammates, triggers pipelines, and cannot be quietly undone.

So pushing requires explicit standing authorisation recorded in `vcs.push`. When it is not
granted, this playbook does not run and the harness stops at verified and committed. When
it is granted, it authorises **pushing the working branch and nothing else** — never
merging, never force-pushing, never the default branch.

## When it runs

| Moment | Action |
|---|---|
| First commit of the run | Push the branch, **create the pull request as a draft** |
| Each later commit | Push, **update** title and body of the existing one |
| End of the run | **Mark it ready for review** |
| Invoked directly | The same, over whatever is committed on the branch |

Draft from the first commit is deliberate: continuous integration starts early and work is
never stranded if a run dies, without waking reviewers on a branch that is still growing.

---

## Preconditions — stop if any fails

1. **Forge authentication present.** Without it there is no pull request.
2. **Not on the default branch.** With automatic push, running there pushes straight to it.
   Stop and ask for a branch.
3. **There is at least one local commit not on the remote.** If nothing is new, say so and
   exit — this playbook is called after every commit and must be cheap when idle.
4. **Nothing uncommitted belongs to you.** What is left in the tree is the human's, or a
   stash from a blocked task. **Do not push it.**

---

## Steps

### 1. Create or update

Query the forge for an open pull request whose head is the current branch. If none exists,
create. If one exists, update it — **never open a second pull request for one branch.**

### 2. Push

Push the branch, setting upstream on first push.

**If the remote rejects for divergence, do not force.** Stop and report. A rejection means
someone else — or you on another machine — wrote that branch, and overwriting it destroys
their work.

### 3. Title

Derived from the tickets in the run, in the project's commit convention.

- **One ticket** → that ticket's commit title, unchanged.
- **Several sharing a theme** → the dominant type plus the theme, without inventing unity
  that isn't there.
- **Several unrelated** → describe the actual scope and say how many. Do not dress it up.

An honest title beats a tidy one. The detail lives in the body.

### 4. Body

One section per ticket, in the order worked.

```markdown
## Tickets

### <ticket title>
<link to the ticket>

**Root cause** — the one that was VERIFIED, not the one the ticket claimed. If review
proved the ticket wrong, this says the real cause and notes the correction.

**Change** — what was touched and why, in two or three lines.

**Acceptance criteria**
- [x] verified
- [ ] needs manual testing

---

## Verification

| Check | Result |
|---|---|
| <each declared check> | <its result> |
| Review | <mode>, <n> cycles, no open findings |

## Not in this pull request

- **<blocked ticket>** — <reason>. Work in <stash reference> (<stash message>).
```

Rules for the body:

- **The ticket link is the only tracker reference.** Do not create issues on the forge and
  do not mirror anything: one tracker is the source of truth, and two always diverge. When
  the tracker *is* the forge, `vcs.pr.link` says to use a closing keyword instead.
- **"Not in this pull request" is not optional** when tasks were blocked. A reviewer must
  know what was attempted and left out, and where that work is. An unmentioned stash is
  lost work.
- Leave acceptance criteria unticked when they need manual testing. **Never mark verified
  what did not actually run.**
- **No AI attribution** in the title or the body, per `vcs.attribution`. A clean history
  undermined by a pull request footer is not a clean history.

### 5. Close the loop

- **Tracker**, for every ticket included: state → `in-review`, note carrying the pull
  request reference, and a log line in the body with the link. **Blocked tickets are not
  moved** — they stay blocked with their marker.
- **Cursor**: record the pull request reference at run level. There is only one.

This makes `in-review` the harness's terminal state. `shipped` remains exclusively the
human's, on merge and deploy.

---

## Hard limits

Never: merge a pull request, by any mechanism · force-push, with or without lease · push to
the default branch · open a second pull request for a branch that already has one · push
work this run did not commit · put AI attribution in a title, body or commit · request
reviewers or assign anyone — that is the operator's call.
