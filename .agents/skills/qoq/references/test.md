# `qoq test` — coverage for code that already exists

Unit and integration tests on Vitest or Jest. The record's `runner` field already
says which of the two this project is, and a project with neither never got past
discovery — so there's no detection phase here.

One caller: a person asking for coverage over code that already exists. That's
what keeps this command to a single success condition — green, gated, tidy.

A ticket's own assertions are not this command's work. `qoq-developer` raises
them to `test-conventions.md` itself, in the thread that wrote the
implementation — it can't dispatch a subagent anyway, and a ticket arrives
pre-sliced, which is the one thing this command's slicing exists to do.

Browser-driving suites are a different discipline whose conventions don't
transfer. If one ever needs a command, it's a different command.

## Scope is inferred, then stated

One piece in isolation is a unit test; a flow across pieces is an integration
test. Work it out from what was asked and **state it back** rather than asking —
"I'll write unit tests for `TokenService`, integration tests for the login flow"
is information the user can correct in one word, and asking first spends a turn
on something usually obvious.

## The baseline run

Run the full suite **before writing anything**. A run afterwards can only tell you
"something is red", not "_your_ file made it red" — unless you know what was red
to begin with. Without that, a project with three pre-existing failures either
blocks a command that did nothing wrong, or learns to shrug at real breakage.

Red base is a question, not a stop, and the two answers are genuinely different
jobs:

- **Skip** records the failing specs as the baseline. They're excluded from the
  post-write judgement and reported at the end, untouched.
- **Fix first** is work this command is qualified to do — they're test files, its
  own material. Rewrite them under the same three-rewrite budget, then re-check
  the base.

What it never does is quietly absorb them into the new work's result. Unlike
`refactor`, which stops dead on a red base, this command asks — the failing thing
here is test code, which is its own material.

## Slices, one at a time

Cut the scope into coherent units — a file, a component, a behaviour — and
dispatch `qoq-tester` once per slice, sequentially. Each slice ends with a full
suite run whose whole purpose is attribution; if two agents are writing while it
runs, a red result names neither of them. Sequential also means each slice starts
from the tree the previous one left green.

Every dispatch carries: the **record's path**, the **paths to
`references/test-conventions.md` and `references/code-conventions.md`** in this
skill (a subagent can't work out where
the skill lives), the **slice** stated as narrowly as you can state it, the
**baseline** of already-red specs, and **any specs already in place** for this
slice — a ticket's own hand-written assertions get rewritten to standard, not
duplicated by a second file asserting the same thing.

N slices is N full-suite runs. That cost is the design, not an oversight.

## Two checks per slice, one refactor at the end

The split follows from where the digest can exist ([cli.yaml](cli.yaml)): the
tester proves the specs _work_ — the project's own scripts, then the CLI's
`scoped` form over the specs it wrote, which takes paths but writes no reports —
and this thread proves they're _good_, which needs the digest only a `full` run
produces.

1. **The tester's own proof, before it hands back.** `test:one` on the specs it
   wrote — they have to run and pass — then the full suite against the baseline
   it was given, because a scoped run can't tell you a new spec broke someone
   else's through a shared setup file or a global mock. That's the one question
   scope forecloses, and it's the question the tester exists to answer about its
   own slice. Then `npx qoq staged` over those specs, which costs seconds and
   spares a gate round on a lint finding.

2. **`qoq fix` from here, scoped to the tester's `files`.** This is the gate.
   Dispatched after the tester returns `status: green`.

   It runs **last** rather than first, which inverts the obvious order for a
   reason: `fix` rewrites files — Prettier reformats, ESLint autofixes — so it
   has to be the thing that verifies its own rewrites, and it does, by re-running
   `test:one` on every file it touches and reverting any fix that goes red. A
   check placed before it would be validating a version about to change.

   `FAIL` → re-dispatch the tester with the digest. That round is one of its
   three.

   If `fix` changed anything, re-run the full suite before the next slice —
   `fix`'s own verification is scoped, so a reformat that trips a shared snapshot
   shows up nowhere else. It's the same second pass `bump` runs after a refactor
   touches a patch, for the same reason.

**`qoq refactor` runs once, after the last slice**, scoped to every file
written. Green and gated is not the same as good, and test files are where
near-duplicate arrange blocks and copy-pasted setup pile up fastest — nothing in
`fix` has an opinion about that. Once rather than per slice, because duplication
_between_ specs is most of what there is to find, and that isn't visible until
they all exist. Assessment 1 is what earns it a place here: JSCPD's honest read
matters more on tests than anywhere else, since two specs looking alike is
usually the point rather than a defect.

## A red result rewrites, it doesn't patch

A slice that comes back red gets **rewritten against what the run actually
reported**, not amended in place — the reasoning is in `agents/qoq-tester.md`,
which is where the rewriting happens. A gate `FAIL` lands in the same place, for
the same reason: whatever `fix` couldn't resolve is a property of the file, and
the file is cheap.

**Three rewrites, then the agent hands back and the caller asks.** Running out
isn't a report-and-stop; it's a question. Three attempts at one slice that all
end red usually means the slice was too wide to write in one go, and the smallest
useful thing to ask for is fewer cases or one behaviour at a time. The agent
can't ask, so it returns `status: handoff`; ask with its `blocker` quoted
verbatim. A narrowed slice resets the counter; a no ends the run with the blocker
reported and the handoff's `files` removed — nothing half-written left behind.

## Conventions

[test-conventions.md](test-conventions.md) is the house rulebook — coverage
philosophy, mocking, React Testing Library, MSW, and the lint rules that make a
spec clean by construction. The project's own file, named on the record's
`conventions` field, wins wherever the two conflict: it's human-written and knows
things this skill can't infer.
