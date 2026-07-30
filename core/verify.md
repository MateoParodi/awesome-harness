# verify

Review the current changes independently, fix what is real, run the project's own checks,
then review again with fresh eyes. Returns a single verdict the execute playbook reads.

**You orchestrate; you do not review your own work.** Review goes to fresh, read-only
reviewers and fixing goes to a separate agent. Reviewer independence is the entire value:
never hand a reviewer your opinion or a previous reviewer's reasoning.

An agent without a sub-agent primitive runs the review inline. Say so in the report — an
inline review is weaker evidence, and the operator should know which they got.

---

## Phase 1 — Scope

Establish what changed: the working-tree diff when the tree is dirty, otherwise the branch
against its merge base with the default branch.

Collect changed **source** files. Mention generated files, lockfiles and binary assets by
count only; review them only when a source finding depends on one.

**Never print secrets.** Do not read credential files; redact anything sensitive that
appears in a diff.

Choose the review mode. The strict mode is required when the diff touches authentication,
money or persistence, migrations, secrets, network protocol or wire schema, destructive
operations, concurrency, or a stated production incident. Otherwise standard. Say which and
why in one line.

Print the scope before delegating: file count, comparison point, mode.

---

## Phase 2 — Independent review

Launch a reviewer with a fresh context. Give it the changed files, the diff, the project's
authoritative guidance, and the surrounding files it needs to judge the change. It must not
edit anything.

Require two separate buckets:

- **Correctness** — can block. Each finding needs a concrete failure scenario: inputs or
  state, and the wrong result.
- **Quality** — advisory, never blocks. Craft, duplication, naming, documentation.

For a large diff, review coherent areas in parallel, then combine and deduplicate within
each bucket — same file, same line, same root cause is one finding.

---

## Phase 3 — Triage

Decide before editing anything.

**Correctness:**

- **Accept** — high severity at reasonable confidence, clear regressions with a reproducible
  scenario, missing tests protecting meaningfully changed behaviour.
- **Investigate first** — medium confidence, performance claims, concurrency claims,
  platform-specific behaviour, security findings with no demonstrated path. Read the code
  yourself, then accept or reject.
- **Reject** — low-confidence speculation, duplicates, unrelated pre-existing issues, fixes
  whose cost dwarfs their impact.

**Quality:** accept only what is small, safe and in scope. Defer structural refactors as
proposals in the report. Reject nits that contradict the project's documented rules.

Print one triage table before editing. Proceed without pausing **unless** a fix would
introduce a breaking public change, a destructive migration, or needs an unresolved product
decision — then stop and ask.

---

## Phase 4 — Fix

Hand accepted findings to the fixer. Independent findings in different files may batch;
**never run two fixers on the same file in parallel.**

Afterwards read the full diff yourself, to catch out-of-scope changes before validating.

---

## Phase 5 — Deterministic validation

**The final authority.** Run the checks declared in `verify[]`, in order, narrowest scope
first. Discover nothing, assume nothing: if it is not declared, it does not run.

Respect the project's prohibitions — many repositories forbid a full build, or any write to
production data.

If validation fails, decide whether these changes caused it or it was already broken. Hand
the concrete failure back to the fixer, fix the root cause, re-run the same focused check.

**Never declare success on an agent's opinion when an executable check exists.** Label each
check: passed, failed, could-not-run, pre-existing failure, or skipped with a reason.

---

## Phase 6 — Fresh re-review

A **brand-new** reviewer, same mode, reviewing the complete final diff. Do not reuse the
earlier reviewer or its reasoning. Focus on remaining findings, regressions introduced by
the fixes, incomplete fixes, weak tests, newly exposed edge cases.

Actionable correctness findings → another cycle. **Cap the total; stop as soon as
correctness comes back clean.** Never loop on quality: apply the safe ones once, carry the
rest into the report as proposals.

---

## Phase 7 — Report

State the mode and scope; correctness and quality counts (found, fixed, rejected,
deferred); files changed with a line each; quality proposals not applied; every validation
check with its labelled result; remaining risks.

End with a single verdict — **pass**, **pass with warnings**, or **blocked** — because that
line is the gate the execute playbook reads.
