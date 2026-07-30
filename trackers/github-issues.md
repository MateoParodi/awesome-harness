# Tracker — GitHub Issues

How to speak GitHub Issues. Loaded when `tracker.kind: github-issues`.

The one case where the tracker and the forge are the same system, which changes two things:
pull requests reference tickets by number rather than URL, and closing keywords can move a
ticket automatically.

## Requires

An authenticated GitHub CLI or API token with `repo` scope. `tracker.board` resolves to
`owner/repo`.

## Field mapping

Issues have no status field, so **harness states map to labels**:

```
states:
  queued:    "status:todo"
  running:   "status:in-progress"
  verified:  "status:verified"
  blocked:   "status:blocked"
```

Moving state means removing the old label and adding the new one — never leave two status
labels on one issue. Create the labels at init if they are missing.

`tracker.severity_order` maps to labels too. `tracker.iteration` maps to a **milestone**;
"current" is the open milestone with the nearest due date.

`tracker.marker_field` has no natural home: issues have no free-text property beside the
body. Use a **marker line at the top of the issue body**, delimited so it can be replaced
cleanly without disturbing the rest.

## Set `vcs.pr.link: issue-ref`

Because the tracker is the forge, a pull request should carry `Closes #N` rather than a
URL. That is the one configuration this backend genuinely requires.

Consequence worth knowing: **merging the pull request will close the issue automatically**,
which moves it to shipped without the harness doing anything. That is correct — shipped is
the human's state, and merging is a human action.

## Gotchas

**Pull requests are issues.** The issues API returns them too. Always filter them out when
reading the queue, or the harness will try to work its own pull request as a ticket.

**Label writes race.** Two rapid state transitions can interleave. Read labels back after
writing when a transition matters.

**Do not create an issue to satisfy another tracker.** If the project's real tracker is
elsewhere, this backend is not in use — mirroring produces two sources of truth that
diverge within a week.
