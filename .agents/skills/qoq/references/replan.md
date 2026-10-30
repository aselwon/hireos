# `qoq replan` — an existing plan, reshaped against what's been learned

`qoq replan plans/<file>.md` re-runs [`plan.md`](plan.md)'s three phases over a
plan that already exists, so a decomposition written before anyone had tried it
can be brought forward.

It is `plan`'s phases, not a second copy of them. This file only says what's
different: what may be rewritten, what feeds the interview, and where the run
stops.

## Frozen and live

Split the file before anything else. This split is what makes replanning a
half-executed plan safe, and it decides every other question below.

**Frozen** — delivered milestones, `done` tickets, the `## Completed` blocks, the
`.completed.md` archive, and every commit hash. **Read-only input.** A `done`
ticket that gets re-decomposed loses the link between its criteria and the commit
that satisfied them, and at that point the history stops meaning anything. The
archive's own rule is that it is append-only: nothing in it is ever re-planned or
re-gated.

Frozen parts get a **mechanical backfill only**, and only where a field the
current template carries is simply absent:

- a missing **`Log`** reconstructed from `git log` — the commits are the
  transitions that still exist
- a missing **`Estimate`** from `scripts/estimate.mjs`, against the tags and tier
  the ticket already records

Nothing else. A backfill that changes a criterion, a `Files` list or a status is
a rewrite wearing a migration's clothes.

**Live** — `todo`, `in-progress` and `blocked` tickets, and undelivered
milestones. This is the only thing `replan` may rewrite, and it gets the full
reshape: Phase 1 over the live requirements, Phase 2's architect over what's
left, Phase 3's decomposition.

## When not to replan

Two stops, both cheaper than the reshape:

- **One milestone from done** → say so. Finishing is cheaper than reshaping, and
  a reshape at that point throws away a decomposition that has been working.
- **Nothing delivered _and_ the requirements changed substantially** → this isn't
  a replan. Archive the file and run `qoq plan` fresh; there's nothing to carry
  forward but a shape that was answering a different question.

## Refuse on uncommitted changes

If the plan file has uncommitted changes, **refuse and say why**: commit or stash
first. Not a warning — a stop.

`replan` overwrites the file **in place**, because the path has to stay stable:
`External` keys, the `.completed.md` archive and any resume all reference the plan
by name. Git is the history, so there's no `.v2` file. But overwriting uncommitted
work destroys the only copy of it, and the guard costs one `git status`.

## The grill's best input is what already went wrong

Phase 1 runs over the live part, and its dispatch carries three things beyond the
usual:

- **the old plan**, so the frontier opens on the gaps rather than on what's
  settled
- **the original `Requirements source`**, if it still resolves
- **what went wrong**: every `blocked` ticket, every **Escalation**, and every
  `scope-expansion` attribution

That last one is the point. Those are direct evidence that the old decomposition
was wrong — a ticket nothing could deliver, a tier that had to move, work nobody
knew was there — and nothing in this system reads them at plan time today. They
are already sitting in the plan file.

It's also why re-grilling costs almost nothing. `plan.md` already hands the grill
everything settled so its frontier opens on the gaps, and here "settled" is
enormous: the whole old plan, plus milestones that demonstrably work. A precise
spec ends in one round. The grill is self-limiting, which is why `replan` has no
skip mode.

## Report the tracker orphans at approval

Any **live** ticket carrying an `External` key loses it when it's re-decomposed,
and the Jira issue or Trello card it was is now dangling. List them at the
approval beat so the user can close them by hand.

**`replan` does not sync.** The export writes once and never syncs back — that's
the skill's position everywhere, and syncing is the entire problem it deliberately
refuses to own. Reporting the orphans is the whole of the obligation.

## Diagrams, when switched on

The same pre-approval `qoq-artist` dispatch as `plan`, under the same switch
([mermaid.md](mermaid.md)). It redraws charts of the live part only; charts of
frozen milestones stay as they were approved.

## Calibration is untouched

Do nothing to `.claude/qoq-estimator.json`. A recorded outcome means "this shape
of work at this tier went this way", which stays true however the plan is now
shaped. Stated here so nobody adds the work.
