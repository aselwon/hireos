# `qoq bump` — analyse, choose, then produce patches

Update npm dependencies without losing the ability to say which one broke
something. Everything here follows from that: one patch at a time, full
validation after each, and a split ladder instead of an abandoned group.

## A clean tree is a precondition, not a preference

Dirty tree → stop and say so. The whole design rests on `git` being able to tell
a bump's damage from the user's own uncommitted work, and it can't do that on a
dirty tree. This isn't a warning to proceed past.

## The plan is an impact analysis, not a patch set

The planning phase **writes nothing** — not the tree, not a patch file. It works
out what's outdated with `npx qoq npm --json` (an explicit tool name skips the
check's throttle; the result is `npm-report.json` in the record's report directory), groups minor and
patch bumps, and plans **at most one major step per package**. Majors (and any
package queued from a previous round's failure) get a `qoq-bumper` dispatch,
which is the analysis itself and has to happen before the choice.

Read the report, not just the version gap: `majorBump` separates the majors,
`latestInMajor` is the minor/patch target (above `current`, it's a bump even
when an exact pin leaves `wanted` equal to `current`, and it joins the
minor/patch group even when the package also has a major pending, which is
planned separately), `deprecated` and `stale`
packages are worth raising even when no bump is pending, and `blocked` means
the newest release needs a newer Node than this one — not a bump to attempt.
`packages` also lists the ok ones; skip anything flagged `ok`. Each package's
`repository` URL goes into its `qoq-bumper` dispatch.

**The vulnerability scan is experimental and off by default.** It's on only
when the run was invoked with `--scan`, or when the project's `qoq.config.*` sets
`future: { unstable_skill_bump_with_scan: true }`. To check the config, Grep its
source text for `unstable_skill_bump_with_scan\s*:\s*true`; never evaluate it.
Off → plan from `npm-report.json` alone: no scan, no transitive fixes, no
override suggested or tested, no final re-scan. Say so in one plan line, `vulnerability
scan off — run with --scan or set future.unstable_skill_bump_with_scan`, so the
plan is never read as clean. Everything below that names the scan applies only
when it's on.

With it on, `npx qoq scan --json` writes `scan-report.json` to the same
directory: known vulnerabilities in the lockfile, from OSV. Exit `1` only means a
finding reached `scan.failOn`, so read the report, not the exit code. A package
that's vulnerable joins the plan even when `npm-report.json` flags it `ok`. One
entry per package, whichever report raised it.

- **`skipped` or `inconclusive`** (offline, a timeout, no `package-lock.json`
  under pnpm/yarn): one line in the plan, `vulnerability scan didn't run:
<reason>`, then carry on with the outdated set. Never present it as clean.
- **Every finding**, whatever `failOn` says, highest severity first, with its
  `id` and `url`. `dev: true` is labelled `dev`.
- **`fixVersion` is the floor** for that package's target.
- **No `fixVersion`**: listed as `no fix published` with its link. Nothing is
  planned for it.
- **Transitive** (`via` has a `parent`): see below. It's planned as a bump of
  `via.direct` or an override. Never add the vulnerable package to
  `package.json` as a direct dependency.

Then present, per package: current → target, minor/patch or major, and for majors
what `qoq-bumper` found — the breaking changes that actually land here, with the
files they land in. Vulnerabilities go first, each with the finding that put it
there. That's the material for a decision.

The user **picks and excludes**. Only then are patches written, for the chosen
set. Writing every patch up front materialises diffs for bumps that are about to
be rejected, and frames the question as yes/no on a finished artifact when the
real question is _which of these_. An empty selection is a valid answer and ends
the run.

## A transitive vulnerability: the parent first, an override last _(scan on)_

`via` names each way the vulnerable package is installed: `manifest` declares
`direct`, and `parent` requires the vulnerable package. What's newer comes from
`npm-report.json`; never re-query it. `npm view` is only for what the report
can't hold: the range a given release declares. Try, in order:

1. **Bump `via.direct`**, in the `manifest` that declares it. A major goes to
   `qoq-bumper` like any other.
   - `direct` is `parent`: the target is the report's `latestInMajor`, the
     same one the minor/patch group uses.
     `npm view <direct>@<latestInMajor> dependencies.<package>` gives the range
     it declares. It admits `fixVersion` or above → plan it. It doesn't, or
     `latestInMajor` is `current` → `latest` from the report, if it's newer.
   - They differ: `via` doesn't record the packages between them, so nothing
     proves it. Plan the report's `latestInMajor` if it's above `current`,
     else `latest`, and say it's unproven. A finding still there at the final
     re-scan goes to step 2 next round.
2. **Otherwise suggest an override**, and say why step 1 didn't work (no
   release of `direct` pulls in a fixed copy, or a previous round's bump didn't
   clear it). The version
   is `fixVersion`, the lowest fixed one. Scope it to the parent:
   `"overrides": { "<parent>": { "<package>": "<fixVersion>" } }`. Global only
   when several parents pull in the vulnerable copy, and the suggestion names
   them. Check it against the range `parent` declares for the package, which is
   already in `parent`'s `package-lock.json` entry. If `fixVersion` falls outside that
   range, offer it as a separate choice that says it breaks `parent`'s declared
   range.
3. **Otherwise** it's `no fix available` with the reason.

Overrides go in the root `package.json` only; npm ignores them in a workspace's.
An override is pinned without the parent's author ever having tested it, which
is why it's last and why it's always the user's pick, never implied by picking
the package.

## A patch is `package.json`; the lockfile comes only from a reinstall

A patch changes version ranges in `package.json` and nothing else. The lockfile
is **never** written by hand — not in the patch, not with an edit to fix up a
version, a `resolved` URL or an `integrity` hash, not to clear a conflict.
Applying a patch means `package.json`, then the project's own install
(`npm install`, or the matching `pnpm`/`yarn` command), which regenerates it.

A hand-edited lockfile describes a tree the package manager never resolved:
peer ranges unchecked, transitive pins and hashes guessed. Validation then
passes against `node_modules` that a fresh `npm ci` won't reproduce.

An install that fails or warns about an unresolvable peer is a **failed patch**
— it goes down the split ladder like a failing test. Reverting restores
`package.json` and the lockfile from git (the last-green state), then reinstalls
so `node_modules` matches. Deleting the lockfile to regenerate it from scratch
re-resolves every transitive dependency at once and is a change the user never
approved — stop and ask instead.

## Validation is all three, after every patch

```
qoq fix           →  green
test (full suite) →  green
build             →  green
```

`test` and `build` come straight off the record; `qoq fix` is the command, loop
and all. In that order, cheapest signal first, so a formatting-level break
doesn't cost a full suite run.

**Green means no worse than the baseline.** Before the first patch, run the
check once (`qoq-checker`, nothing fixed) and keep its findings as the
baseline: tool, rule, file. After each patch, `qoq fix` runs as always, but its
loop acts only on findings the baseline doesn't have, and it passes when none
are left. A baseline finding is never fixed here: it isn't the patch's, and
fixing it mixes unrelated edits into the patch. List the baseline once, in the
final report. `test` and `build` get no baseline: either one red before the
first patch → stop and say so, the same as a dirty tree.

No per-patch reasoning about which checks are safe to skip for this kind of
dependency. A dependency bump can break anything — the command exists because you
can't predict what — and a narrowed check that passes tells you nothing about
attribution, it just surfaces the breakage three patches later against a tree
where four things changed.

## Then `refactor`, after the patch lands

Validation says a patch didn't break anything. It doesn't say the migration code
is any good — and migration code is exactly where the rushed adapter and the
copy-pasted shim show up. So each patch that validates green gets one:

```
qoq refactor --decisions auto <this patch's changed files>
```

**After apply-and-validate, not before.** The assessments then read real files in
a real tree, against the version actually installed. Judging an unapplied diff
means patch _N_ assessed without patch _N−1_ in place, findings written against
code that hasn't landed, and a rewritten patch that has to be re-validated
anyway.

`--decisions auto` because a bump is a loop, not a conversation: the mechanical
tier is applied, anything shape-changing comes back as an advisory attached to
that package. A ten-patch bump asks once, at the plan, and never again.

The cost is a second validation pass — test and build only, since the refactor's
own re-green already ran `fix` — on any patch the refactor actually touched.
Patches it leaves alone, which is most version-string bumps, skip it entirely.

Changed files only, not the containing modules. Widening makes every bump's
refactor read a directory to catch a case that hasn't happened yet.

## A failing patch splits before it's abandoned

The grouped minor/patch patch is where attribution goes soft: fifteen packages in
one diff, one breaks the suite, and reverting throws away the fourteen that were
fine. A failure is the signal to cut finer and try again.

| Level | The patch                         | On failure                                             |
| ----- | --------------------------------- | ------------------------------------------------------ |
| 1     | everything minor + patch, grouped | split into **minor** and **patch**                     |
| 2     | one patch per bump kind           | split into **one patch per package**                   |
| 3     | a single package                  | revert, hand to `qoq-bumper`, queue for the next round |

Each level reverts, re-cuts, and re-applies from the top — re-refactored and
re-validated like any other patch, because at levels 2 and 3 they _are_ other
patches. The tree is back to its last-green state before each attempt, so no
level inherits the previous one's damage.

**Splitting minor before patch, rather than bisecting**, is deliberate: it's the
axis that correlates with breakage. Patch releases rarely break anything, so one
split usually lands the whole patch group green in one go and leaves a much
smaller minor group to take apart.

**Level 3 is where the ladder stops.** One package, one version, still failing —
that's not a grouping problem, it's a migration, which is what `qoq-bumper`
exists to read. A package that has _already_ been through the agent and still
fails is carried as unbumpable with the failure named; re-reading the same
changelog to get the same answer is a loop, not a retry.

Re-cutting never needs re-approval. It changes how the approved bumps are sliced,
not which ones were approved.

An override suggested by the plan is a patch like any other: `package.json`,
reinstall, validate, refactor. It's one change, so it can't split; a failure
reverts it and reports it.

## Existing overrides: tested for removal after the bumps, one at a time _(scan on)_

**Which ones.** Only overrides whose target or scoping parent is in the
dependency subtree of the chosen packages. Every other override stays untouched
and unmentioned: testing it would re-resolve parts of the tree the user didn't
pick. The plan lists the ones in scope, and the user picks and excludes them
with everything else; that pick is the approval.

**When.** After every bump patch is green, never before. Removing overrides
first means a red patch could be the bump or the missing pin, and attribution
is the whole point of this command.

**How**, for each one:

1. Remove that override, reinstall.
2. Validate (all three) and re-scan.
3. **Drop it only when both are clean**: no finding for its package, and
   validation green. Either failing → restore it **exactly as it was**,
   reinstall, report `kept: <the finding | the failing check>`.

Overrides aren't all security; a compatibility or dedupe pin shows up as a red
validation, not a scan finding, which is why both have to pass.

A kept override whose value now falls outside the bumped parent's declared range
is reported as such, with an offer to recompute it by the rule above. That's a
new change and needs its own yes.

## One re-scan at the end _(scan on)_

After the last patch, `npx qoq scan --json` once more. Report each finding that
was planned for and is still there. A suggested override whose version turns out
to have its own advisory comes back to the user; never step it up to the next
version unasked.

## One major step per package, per round

A round moves each package **at most one major**. A package two majors behind
gets planned to the next one only; when that lands green, the whole thing loops —
re-plan, re-dispatch `qoq-bumper` against the _new_ current version, and **ask
for approval again**.

Analysing v3 → v5 in one go asks the agent to reason about a migration from a
starting point that doesn't exist yet, and asks the user to choose on evidence
that doesn't apply. Two majors is two decisions, and approval is never inherited
from the previous round — a `bump` that quietly telescoped v3 → v5 is exactly the
unattributable breakage this command exists to prevent.
