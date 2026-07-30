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
