# `qoq refactor` — green base, then four assessments

`fix` is the tool findings. This is the judgement calls, and it runs **after** the
tools are quiet, one assessment at a time.

## Scope

```
/qoq refactor                                   # everything under qoq.config's srcPath
/qoq refactor src/modules/npm src/helpers       # those paths only
```

Positional, like `fix` — the same concept spelled the same way in both commands.

The default comes from `qoq.config.js`'s `srcPath`. Don't re-derive it and don't
fall back to the repo root — that drags in `dist/` and fixtures.

Given paths, it runs on **those only**. Four assessments over a large repo is a
lot of reading, and most refactoring intent is local: one module, one directory,
the thing you just touched. It's also what makes `bump`'s per-patch call
practical — it passes the patch's changed files, so each assessment reads a
handful of files instead of a project.

## The one external lens — checked before anything runs

Assessment 3 is `ponytail-review`, the only assessment this skill doesn't own.
Resolve it from your own available-skills list, under whatever name that list
gives it — a bare `ponytail-review` and a `ponytail:ponytail-review` do not
resolve interchangeably, so don't add or strip the prefix to make it look tidier.

Check it **before dispatching the green base.** Missing means a quarter of the
run is about to be silently downgraded, and one of the two answers is "let me
install it and start over" — so ask while a re-run is still free. Asking when
assessment 3 comes up, after a green base and two assessments and a re-green,
spends the user's time and then throws it away.

Installed → say nothing, proceed. Missing → ask once:

> `ponytail-review` isn't installed, so assessment 3 (what can we delete?) can't
> run. Assessments 1, 2 and 4 are unaffected.
>
> - **Install and re-run** _(recommended)_ — from
>   <https://github.com/DietrichGebert/ponytail>, as two separate prompts:
>   `/plugin marketplace add DietrichGebert/ponytail`, then
>   `/plugin install ponytail@ponytail`. Then `/qoq refactor <scope>` again.
> - **Proceed without it** — you get 3 of 4 assessments. Nothing else asks what
>   to delete: assessment 4 proposes structure, and runs unopposed without this.

That last clause is the one worth saying out loud. The four assessments are
deliberately in tension — 3 argues for less code and 4 argues for shape — and
dropping 3 doesn't just remove a pass, it removes the counterweight to the one
that follows it.

**Recommended is not a veto.** Proceed-without is a real option; take it at the
user's word, run the remaining assessments in full, and report the skipped one in
the final summary so it's on the record rather than only in a message they
scrolled past.

A re-run after installing needs nothing cleaned up first — the next run reads the
available-skills list afresh and finds it.

Under `--decisions auto` there is nobody to ask: skip the assessment, run the
rest, and return the gap as an advisory with the others.

## Green base first

Open by dispatching `qoq fix` over the same scope, and refuse to start until it
comes back clean. Refactoring on top of live findings is guesswork — you can't
tell what your change did from what was already broken, and the next `qoq fix`
rewrites your work anyway.

Not green → **stop, don't ask.** `fix` already asked its own "keep going?" and
already reported what it couldn't solve; asking again about the same wall is
noise. The user fixes it or lowers the bar, then re-runs.

The base is scoped to the same paths. A `refactor src/modules/npm` that stops on
a finding in a file it will never touch is punishing the user for asking a narrow
question.

## The four assessments

| #   | Assessment                         | Reads                                    |
| --- | ---------------------------------- | ---------------------------------------- |
| 1   | **JSCPD, honestly**                | the duplication report                   |
| 2   | **this project's own conventions** | how the surrounding code already does it |
| 3   | **ponytail**                       | the `ponytail-review` lens               |
| 4   | **design**                         | `qoq-designer` — smells, then patterns   |

**Sequentially, never in parallel.** They overlap by design — duplication is
often a missing pattern, and ponytail's answer to a pattern is often "delete it".
Run together they write conflicting patches into the same files. Each one reads
the tree the previous one left.

Run them in the order given: cheapest and most mechanical first.

**"Honest" JSCPD** is the whole point of the word: the report lies in both
directions. It hides real duplication under the configured threshold, and it
flags coincidental similarity that means nothing. Honest means judging each block
and saying out loud "this one isn't worth touching" — not editing code until the
number goes down.

**Assessment 2 is consistency, not catalogue.** It asks whether the code does
things the way the rest of _this_ codebase already does them: naming, module
shape, where errors are handled, how config is threaded through. Assessment 4
asks the different question of whether it's the right shape at all — code can be
consistently wrong, or textbook and unlike everything around it.

**Every assessment's findings pass through
[code-conventions.md](code-conventions.md) before you apply them** — `ponytail`'s
included, whose whole job is deletion. Names are part of assessment 2's
consistency question, and a name that needs a comment is a name to change. A
finding that removes or rewrites a pre-existing comment needs a reason that file
accepts, or the comment stays; each removal is reported verbatim with its reason,
and it goes into the commit body if the run is committed.

**A missing lens is a reported gap**, not a reason to improvise a substitute
pass.

## Assessment 4 — `qoq-designer`, and the file it hands back

Dispatch `qoq-designer` over the same scope. It works out which stack the scope
is actually written in, reads `assets/patterns/index.md` — the smell→pattern
routing table — plus the per-stack table that scope needs (`react/index.md`
today), hunts smells in the code, and returns the stack it detected followed by
each smell with the pattern that resolves it and **the asset file holding that
pattern's write-up**. It never opens that file, and it never edits.

The stack comes from the scope's files, not from `package.json`: a scope of
server modules in a React project is not a React scope. Take the line it opens
with at face value unless the paths in front of you say otherwise — it's the
cheapest place to catch a scan read against the wrong table.

**Then you read the file it named**, and only that one. This split is the whole
design:

- The write-ups are long, stack-specific, and there are twenty-one of them
  across the base catalogue and React's. Loading the catalogue to find out that
  nothing in the scope needs a pattern is the cost this avoids.
- Pattern documentation argues for its pattern. An agent that reads Observer's
  write-up before scanning finds Observer. Smell first, catalogue second, is the
  order that finds real problems instead of confirming ones you went looking for.
- The refactoring itself needs the depth — the stack-idiomatic shape, the worked
  before/after, and the "when it's the wrong call" section — and it needs it in
  the thread that talks to the user and applies the change. That's you.

Each write-up leads with the **cheaper thing the language or framework already
offers**: a function parameter, a discriminated union, a `Record` of handlers, a
module — or, for most of the React rows, passing `children` instead of the data a
subtree needs. Take that answer when it holds. A pattern that buys nothing over
a union type is ceremony proposed to a codebase that just finished assessment 3,
and the user will be right to decline it.

Present findings with the code in front of them, per the approval rules below —
the pattern's name is not the argument, the cost it removes is.

Never substitute a general-purpose design-pattern reviewer for it. They teach the
Java-shaped GoF forms, and a TypeScript codebase reaching for `AbstractFactory`
where a discriminated union does the job is worse than no assessment at all.

## After each: approve, apply, re-green

1. **No findings → next assessment.** Nothing to say, nothing to ask.
2. **Findings → ask, always.** `fix` applies tool findings without asking because
   a lint rule isn't a matter of taste. These are: every one changes shape, not
   correctness, and that call belongs to the user. Approval is **per assessment**,
   never once up front for all four — the user who wants deduplication doesn't
   thereby want a pattern swap.
3. **Declined → next assessment, unchanged.** A no is an answer, not a retry.
4. **Approved → apply, then dispatch `qoq fix` again.** Reshaping code produces
   new formatting and lint findings, and the next assessment deserves the same
   green base the first one got. Cheap in practice: the checker's mtime scan
   short-circuits when nothing changed, so a re-green after an assessment that
   applied nothing costs a stat sweep.

Report everything at the end, per assessment — including the ones that found
nothing and the ones the user declined.

## `--decisions auto`

Two callers can't stop to answer four questions: `execute`'s milestone gate,
which runs with nobody watching, and `bump`, which would otherwise ask per patch
on top of its own sign-off. So the interactive behaviour above stays the default
and there's one flag.

|                                                                   | interactive _(default)_   | `--decisions auto`                            |
| ----------------------------------------------------------------- | ------------------------- | --------------------------------------------- |
| mechanical finding — formatting-shaped, one obvious rewrite       | asked about with the rest | **applied**                                   |
| judgement finding — a different shape, a pattern swap, a deletion | asked about               | **returned as an advisory, nothing changed**  |
| removing or rewriting a comment that predates the run             | asked about               | **returned as an advisory, nothing changed**  |
| what the caller gets                                              | what it applied           | what it applied, plus every advisory verbatim |

The split is the same line `fix` and `refactor` already draw between them: a
finding with exactly one sensible resolution isn't a matter of taste; a finding
that changes shape is. `auto` doesn't lower the bar, it declines to guess.

**Advisories belong to whoever asked.** The milestone gate records them in the
milestone's `## Completed` summary; `bump` carries them into its per-package
report. An advisory that evaporates because nobody wrote it down is the failure
mode this flag is worth guarding against.
