# Tracker — Notion

How to speak Notion. Loaded when `tracker.kind: notion`.

## Requires

An MCP server for Notion, connected to the workspace holding the board. Minimum
capabilities: query a data source, fetch a page, update a page's properties and content.

**One connection reaches one workspace.** That is why the tracker is per-project config and
not a global setting: a personal workspace and a work workspace coexist without either
knowing the other exists.

## Identifiers

`tracker.board` is a `${ENV_VAR}` reference resolving to a **data source** identifier, not a
database identifier. A database may hold several data sources; fetch the database first and
read the data source from it.

Never write a literal identifier into the committed config.

## Field mapping

Notion databases name their own properties, so nothing here is assumed:

- the **title** property may not be called "title" — read the schema and use its real name
- `tracker.states` maps harness states onto the literal option values of the status property
- `tracker.marker_field` must name a **text** property; the marker is written at its start,
  preserving whatever was already there

## Iteration

`tracker.iteration.from` names the property carrying the sprint or cycle. Two shapes cover
almost every board:

- **A relation to a sprint database** (Notion's built-in sprints work this way): query the
  sprint data source and pick the entry matching `iteration.current` — with built-in
  sprints that is the page whose "Sprint status" select is `Current`.
- **A date-ranged property**: current is the entry whose range contains today.

Resolve at write time and never cache the answer across days — a sprint boundary silently
invalidates yesterday's result. If nothing matches the predicate, say so and leave the
property empty rather than picking the nearest candidate.

When config has no `tracker.iteration` key, the board is a kanban: write no iteration
property and never ask about sprints.

## Assignee

`tracker.assignee` is a `${ENV_VAR}` reference resolving to a **Notion person identifier**,
for the same reason as the board: identity is per-operator, and this file is committed. Set
the people property named by the schema — it may not be called "Assignee". Read the
property back after writing rather than trusting the response: a person outside the
connection's reach can fail to stick.

## Querying the queue

Query the data source filtering on the mapped `queued` value. Notion cannot order by the
rank of a select option, so **fetch and sort in memory** using `tracker.severity_order`,
breaking ties by creation time, oldest first.

Never try to read a board's manual card order: it is not exposed by the API.

## Rate limits

Query capability is metered on some plans. Honour `tracker.cache_ttl` — a status check
should reuse a recent read rather than spend quota. Writes are not cached.

## Reading a ticket

Fetch the page, not just its row. The reproduction, root cause and acceptance criteria live
in the page **body**, and a run that only reads properties will miss all of it.

## Writing

- **Properties** — update only what changed. Omitted properties are left alone.
- **Body** — append a log line; do not replace a body that has content. Replace only when
  the page is genuinely empty.
- **Icon** — set it from the ticket's change category. A ticket without one is badly filed.

## Gotchas

**Nested JSON columns need an explicit text cast when queried.** A JSON property read
through a plain query can arrive empty, and downstream code then falls back to defaults
that look plausible and are wrong. Cast to text and parse it yourself.

**Schema changes are the operator's call.** Never add a property to satisfy a playbook.
Propose it and wait — the harness is a guest on this board.

**Adding a column does not disturb existing templates or views**, but verify after any
schema change rather than trusting the write's response, which may render transient state.
