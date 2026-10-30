# Trackers — raising a plan in one, and running a milestone out of one

Read this only when a `--tool` or a `--source` isn't `local`. It covers the two
beats that cross the line between a plan file and Jira, Linear or Trello:

- **out** — `qoq plan --tool`, projecting an approved plan into a tracker so the
  people who live in one can see the work.
- **in** — `qoq execute --source`, reading a milestone and its tickets back out
  into a plan file, so a run can start from work that was raised there.

**The plan file is the source of truth in both directions.** `qoq execute` runs
off `./plans/*.md` and nothing else — the import beat's only job is to produce
one, and everything after it is the ordinary loop. Nothing here is a sync: qoq
moves a ticket through `todo → done` in minutes, so a tracker qoq wrote once and
never revisited is confidently stale within the hour. Export raises items,
import copies them, and neither claims to own their state. The one exception is
the live status write-back a run does while it is actually running, below.

## One shape, three trackers

Every tracker has the same three levels under different names, which is what
makes a single template exportable to all of them. Map the plan onto them and
nothing else:

| Plan                    | Jira                       | Linear                    | Trello                         |
| ----------------------- | -------------------------- | ------------------------- | ------------------------------ |
| the plan                | epic's parent project      | project                   | board                          |
| Milestone               | Epic                       | Milestone in that project | List                           |
| Ticket                  | Story under that epic      | Issue in that project     | Card in that list              |
| Ticket title            | summary                    | title                     | card name                      |
| **Context** + **Files** | description                | description               | card description               |
| **Acceptance criteria** | description checklist      | description checklist     | a checklist named `Acceptance` |
| **Definition of done**  | description checklist      | description checklist     | a checklist named `Done`       |
| **Size** XS/S/M         | story points 1/2/3         | estimate 1/2/3            | label `size:S`                 |
| **Agent tier**          | label `qoq:sonnet`         | label `qoq:sonnet`        | label `qoq:sonnet`             |
| **Depends on**          | `is blocked by` issue link | `blocked by` relation     | named in the description       |
| **Status**              | label, not workflow state  | label, not workflow state | label, not list position       |

Two rows in that table are deliberate refusals rather than gaps.

**Status is a label everywhere**, never the tracker's own workflow column or
state. Trello is the clearest case: its lists carry milestones here, so a card's
status can't also be its list. But the reason holds for all three — the workflow
column is the team's, and a state qoq sets on their behalf reads as live to
every human looking at it. It stays a label even during the write-back below,
where the value genuinely is live.

**Trello has no relation type**, so `Depends on` goes in the description as
plain text naming the other ticket. Attaching the blocking card as a Trello
attachment looks tidier and means nothing: it carries no ordering, so a reader
can't tell which way the dependency points.

## Out: `qoq plan --tool` — raising an approved plan

### Order matters: containers, tickets, then links

Raise things in dependency order, because each level needs the one above it to
have an id already:

1. **The container** — project/board — if it doesn't exist. Never create one
   without being told to; see the `where` stop below.
2. **Every milestone**, in plan order.
3. **Every ticket**, milestone by milestone.
4. **Every `Depends on` link**, last, once both ends exist.

### Write the ids back into the plan, then commit

Each item the tracker returns gets its key or URL written into that milestone's
or ticket's **External** field before you move to the next one, and the plan file
is committed when the export finishes.

This is the only thing that makes the export idempotent. Without it, a re-run —
after a crash, or on a plan someone exported yesterday — has no way to tell an
already-raised ticket from a new one and duplicates the lot. Forty stray issues
in a shared project is a mess somebody has to clean up by hand.

So: **a ticket with a non-empty `External` is skipped**, always. Not re-checked,
not updated. If the user wants it re-raised, they clear the field.

## In: `qoq execute --source` — running a milestone out of a tracker

`--source local` is the default and is today's behaviour whole: a plan path, or
the one approved plan under `./plans/`. The three tracker values change only
what happens _before_ the loop starts. They materialise a plan file and hand
over to it, so nothing downstream ever knows where the tickets came from —
resume, the usage gate, the estimate loopback, the milestone gate and the
archive all work unchanged, because there is still exactly one execution path.

### Ask for the milestone — not a ticket, not a board

One question, naming the container level: an **epic** in Jira, a **milestone**
in Linear, a **list** in Trello. Its tickets are what the run delivers, in
dependency order, exactly as a plan's milestone would be. Offer what the
read-only tools can already see rather than an empty prompt, the way the `where`
stop below does.

A bare ticket would give a run with no milestone gate — the only scope where
cross-ticket findings are visible at all. A board would import work nobody
agreed to start.

### Read it, then write `./plans/<milestone-slug>.md`

Read the mapping table above backwards, into the plan template
([../assets/plan-template.md](../assets/plan-template.md)). Every item's key or
URL goes into its **External** field as you write it — that's what lets a
re-import skip what's already here, and it's the address the write-back needs.

Two fields exist in no tracker and are filled here rather than guessed:

- **Commands** — from the discovery record, which this run already has.
- **Estimate** — `scripts/estimate.mjs` over the ticket's tags and stack, the
  same call `qoq plan` makes. Without it the outcome filed at the end of the
  ticket has no bucket to land in, and the loopback silently teaches nothing.

Write `Plan status: approved`: a milestone somebody raised in a tracker and then
pointed this command at has been signed off, in the place their team signs
things off. Then load the file from disk and run it like any other plan.

**A plan file already carrying this milestone's `External` is resumed, not
re-imported.** That's the second invocation, and it's the common one — a run
that died, or a milestone half-delivered yesterday. Re-importing would overwrite
every `done`, every commit hash and every assertion the user was asked for. Add
tickets the tracker has gained since; touch nothing that's already there.

### Acceptance criteria that aren't assertions stop the run

Tracker tickets usually read "add rate limiting to the auth routes" — a title,
not something a spec can assert before the code exists. The developer opens
every ticket by transcribing criteria into failing assertions, so prose leaves
that beat with nothing to transcribe and the agent invents the assertion it was
supposed to be handed.

Bring them back to the user quoted, every ticket's in one question, before
anything dispatches — and write the answers into the plan file, so a resume
tomorrow doesn't re-ask. Don't infer them: an invented criterion is
indistinguishable from a real one on the page, and the ticket then passes its
own made-up bar.

### Status goes back while the run is running

Each time a ticket reaches `done` or `blocked`, set its status label in the
tracker and add the commit hash as a comment.

This is the one place qoq writes state back, and the staleness argument that
forbids it everywhere else is what permits it here: an export sets a status once
and walks away, so it is wrong within the hour; a run knows the transition at
the moment it happens. A tracker that rejects the write is a line in the report,
not a stop — the plan file already carries the status, and delivery doesn't wait
on a projection.

## Finding the tools

Look in **your own available-tools list** for the MCP tools that read and write
the target tracker, at the moment you need them — the same rule the skill applies
to `ponytail-review` and `grilling`, and for the same reason: a cached answer goes
stale silently the moment somebody connects a server.

Names differ per server — several Jira MCPs exist and none of them agree on
their tool names — so match on what the tool does, not on a name this file
guessed. **Never substitute anything for a missing MCP tool**: not `curl`, not a
REST call against an API token found in the environment, not a CLI. Those are
credentialed writes into a team's tracker from a path nobody reviewed, and the
stop below is the correct outcome, not a fallback to route around.

## When you don't know how to reach the tracker, or where

Two different unknowns. Both stop the beat — export or import — and neither is
guessed at.

**How — no MCP tool for that tracker.** Setting one up is a client-level config
change this command can't make and shouldn't try to. Say so plainly, and say
that the plan is fine:

> The plan is approved and saved at `./plans/<file>.md`. I can't raise the
> tickets in Jira: no Jira MCP tool is available in this session, and connecting
> one is outside what this command does. Nothing is lost — the plan file is
> complete and `qoq execute` runs from it as-is. Once a Jira MCP server is
> connected, re-run the export; the field mapping is in
> `skills/qoq/references/export.md` if you'd rather raise them by hand.

On the import side there's no equivalent consolation — with no way to read the
tracker there is nothing to run. Say that, and offer `qoq plan` over the same
requirements, or `--source local` if a plan file already exists.

**Where — the tracker is reachable but the destination isn't.** No project key,
no team, no board id. Ask; never pick, and never create a container to have
somewhere to put things. Read-only MCP tools usually exist alongside the write
ones, so offer the list rather than an empty prompt:

> Which Trello board should these go on? I can see: `Platform`, `Q3 Roadmap`,
> `Personal`. Or give me a board id and I'll use that.

A plan raised into the wrong project is worse than a plan not raised. The items
are real, they notify real people, and somebody has to find and delete every one
of them.

**Partial failure is reported, not retried into a mess.** If the tracker rejects
an item halfway through, stop, write back the **External** ids for everything
that did land, commit, and report what got raised and what didn't. The next run
picks up exactly where this one stopped, because the ids are in the file.
