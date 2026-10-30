# `qoq mermaid` — the shape, at a glance

`qoq-artist` turns structure prose handles badly into a Mermaid chart, validated
to parse before it lands. Its rules for _whether_ and _what_ to draw live in
`agents/qoq-artist.md`. This file is the main thread's side: the standalone
command, the three call sites, and the switch that turns the pipeline ones on.

## Standalone — `/qoq mermaid <description>`

```
/qoq mermaid login with retry and lockout                    # print it
/qoq mermaid login with retry and lockout --to docs/auth.md  # create, or append
/qoq mermaid login with retry and lockout --to docs/auth.md#lockout
```

Ungated: typing it is the opt-in.

1. **Resolve the target.** No `--to` → `print`. `--to <path>` → the file,
   created if absent. `--to <path>#<slug>` → the end of that heading's section,
   by GitHub's anchor slug. A slug the file doesn't have is a one-line stop that
   lists the slugs it does have — never a guess, never a new heading.
2. **Dispatch `qoq-artist`** with `mode: standalone`, the description verbatim,
   the target, and this skill's absolute path.
3. **`status: question`** → ask, re-dispatch with the answer verbatim.
4. **A file was written** → `npx qoq prettier --fix`, the `format` form in
   [cli.yaml](cli.yaml).
5. **Show the result and stop.** `printed` goes on screen as is. Otherwise one
   line per `diagrams` entry — where, type, why, `unvalidated` if it is, what was
   `collapsed` — and any `declined` pushback. Nothing is committed.

A rerun with the same `--to path#slug` replaces that section's chart, whatever
its id. Without a slug, it matches only a chart with the same id — the
description's kebab — so a different description appends a second one.

## Pipeline — off unless switched on

**Experimental, so opt-in:** the plan, replan and execute call sites run only
when the run was given `--diagrams`, or the project's `qoq.config.*` sets
`future: { unstable_skill_diagrams: true }` — one Grep for
`unstable_skill_diagrams\s*:\s*true`, read as source text and never evaluated.
Decide it once at the start of the run and say which in its opening line.

### `plan` and `replan` — before approval

After the self-review gate, before the plan is shown for approval:

1. **Dispatch `qoq-artist`** with `mode: plan`, the drafted plan file's path, and
   this skill's absolute path. In `replan`, charts about frozen milestones are
   left as they stand; the artist redraws the live part.
2. **`status: question`** → ask now — approval is interactive anyway — and
   re-dispatch.
3. **At approval**, say what it drew and what it declined, one line each, and
   any chart marked `unvalidated`. Declines are never written into the plan.
4. **A veto.** "Drop it" → delete the block and its marker yourself, no
   re-dispatch; an emptied `## Diagrams` goes too. "It's wrong" → re-dispatch
   with the correction verbatim and the chart's id.

The plan's charts record the shape that was _approved_. Nothing redraws them
during `execute` — the docs charts record what was delivered, and the gap
between the two is information. Only `replan` redraws them.

### `execute` — after the scribe

In the milestone gate, after `qoq-scribe` ([document.md](document.md)) and before
prettier, when **both** docs and diagrams are on. The scribe's report is the
artist's input, so diagrams without docs is inactive; say
`diagrams: on, inactive — needs --docs` in the opening line and carry on.

1. **Dispatch `qoq-artist`** with `mode: docs`, the scribe's
   `diagram_candidates` verbatim, its `files_written` and `files_changed`, and
   this skill's absolute path. Dispatch it even when `diagram_candidates` is
   empty but those files hold `qoq-artist` blocks — they may need updating.
2. **`status: question`** → don't ask now: `diagrams skipped: <question>` goes
   into the milestone's **Docs advisories**, and the question to the user at the
   end of the run.
3. The artist's `files_changed` joins the scribe's lists in the same
   `docs(m<N>)` commit.
4. **Docs advisories** gain one line per `unvalidated` chart and per
   `stale_hand_drawn` entry. Declines aren't advisories — the scribe nominated,
   the artist judged, and nothing is left for the user.

### `/qoq document` — offered, never run

Path mode doesn't dispatch the artist. When the scribe returned
`diagram_candidates`, the run ends on an offer — "draw these N?". On a yes,
dispatch the artist here in `mode: docs` exactly as `execute` does, then
`npx qoq prettier --fix`, and leave everything uncommitted.
