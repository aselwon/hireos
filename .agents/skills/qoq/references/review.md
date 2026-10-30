# `qoq review` — does this delivery make sense against the plan?

`qoq-reviewer` reads a delivered change against the intent behind it and returns
typed findings; what it looks for lives in `agents/qoq-reviewer.md`. This file is
the main thread's side: scope, dispatch, routing, remediation, the end-of-plan
pass, and the sign-off. **The analysis is delegated; every decision stays here**.
The agent can't stop to ask, so asking, accepting and remediating are this
thread's job.

## Scope

```
/qoq review https://github.com/acme/api/pull/123
```

Standalone, the reviewer takes **a pull request link and nothing else**. It
judges a diff against the intent behind it. A path snapshot has no intent, and
`sheriff` and `refactor` already read code as it stands. A link names its own
repository, so it works from any directory, for any repo the user's `gh` can
see. A bare number, a path or no argument stops with one line asking for the
link.

## Pull requests — shared with `sheriff`

`sheriff` follows this section to the letter for its own pull request runs.

1. **Resolve it.** Run
   `gh pr view <link> --json number,url,title,body,baseRefName,headRefOid,closingIssuesReferences`,
   then `gh issue view <issue url> --json title,body` for each issue it closes.
   If either fails (wrong link, no access), stop and quote the error.
2. **Get the code into a scratch clone, never the working directory.** The pull
   request may belong to another repository entirely. The directory is
   `<os tmpdir>/qoq-pr/<owner>-<repo>-<n>`, the same tmpdir convention
   `mermaid-check.mjs` uses. If it doesn't exist, run
   `gh repo clone <owner>/<repo> <dir> -- --filter=blob:none --no-checkout`. In
   either case, run `git -C <dir> fetch origin <base> pull/<n>/head:refs/qoq/pr-<n> --force`
   and then `git -C <dir> checkout -q --detach refs/qoq/pr-<n>`. The range is
   `origin/<base>...refs/qoq/pr-<n>`. Reuse the clone on later runs. Nothing in
   it is ever committed or pushed.
3. **Decide whether it states intent.** It does when the title, body or a closed
   issue says what the change should do. If all that's there is "fixes stuff",
   an empty template or a bare issue link, it doesn't.
4. **Dispatch** at the **session's** model with `mode: pr`, the clone's path as
   the repo to read (never the working directory), the range, the title, body
   and issue texts verbatim, whether intent was stated, and this skill's
   absolute path.
5. **`status: question`** → ask the user, then re-dispatch with the answer
   verbatim.
6. **Print the report.** If no intent was stated, say so once at the top. Then
   list every finding with its severity, confidence, locations, reason and
   evidence or exploit.
7. **Propose comments.** Never remediate in this mode: the pull request is
   someone else's branch, possibly in another repository, and the comments are
   how the author hears about it. Draft **one inline comment per finding** at
   its first location's file and the last line of its range. Draft each one the
   way the user would write it to a colleague: what is wrong, why, and what to
   do, plus the question when there is one. Leave out finding ids, YAML,
   confidence labels and any mention of qoq or an agent. The comment goes out
   under the user's name. Extra locations go into the same comment as links. A
   finding whose line isn't in the diff, or that has no location (a gap), goes
   into the review body instead, since GitHub only takes inline comments on
   lines the diff shows.
8. **Let the user pick.** Show every draft, numbered, and ask which to post. The
   user can drop any of them, rewrite any of them, or post none. Never post
   without that answer.
9. **Post the approved ones as one review.** Write
   `{commit_id: <headRefOid>, event: "COMMENT", body, comments: [{path, line, side: "RIGHT", body}]}`
   to a scratch file, then run
   `gh api repos/<owner>/<repo>/pulls/<n>/reviews --method POST --input <file>`.
   The event is always `COMMENT`, never `APPROVE` or `REQUEST_CHANGES`: those
   are the user's verdict to give on GitHub, not a side effect of a report.
   Print the review's URL. Nothing else is written to disk.

## Standalone — `/qoq review <link>`

Ungated: typing it is the opt-in. Discovery is skipped, because nothing on the
working directory's record bears on someone's pull request.

Run [Pull requests](#pull-requests--shared-with-sheriff) with `qoq-reviewer`.
When no intent was stated, the report says that the reviewer can describe what
the code does but not whether it's what anyone asked for, and that it raised no
scope findings. List `security_noticed` lines as "worth a `/qoq sheriff <link>`".
There's no accept and no defer: with no plan there's nowhere to record either,
and the next review raises the same finding again. Say that once.

## Pipeline — from `execute`

**Experimental, so opt-in.** It runs only when `execute` was given `--review`, or
when the project's `qoq.config.*` sets `future: { unstable_skill_review: true }`
([execute.md](execute.md), Setup). With no skip rule, it reviews every
milestone.

### The milestone review

This runs after the sheriff and its remediation loop, when the sheriff is on,
and before `document`. The reviewer should read the diff that will ship, with
the security fixes already in it. The scribe then documents code nobody is about
to change.

Dispatch at the **session's** model, cold: a fresh dispatch every time, never
`SendMessage`. Pass:

- `mode: milestone`
- the range `<first ticket commit>^..<last>` over **`done`** tickets, including
  any sheriff remediation commits
- the union of their files
- the milestone's Goal and Contracts, plus every ticket's acceptance criteria and
  **Files**
- the plan's `**Review context:**` line, if it has one
- the milestone's **Security** line, if the sheriff ran
- every earlier milestone's **Review** line
- the refactor gate's advisories
- this skill's absolute path

**`status: question`** stops the run. The next milestone would build on a
review that never happened. Ask the user, write the answer into the plan header
as `**Review context:** <answer>` (appending to an existing line), and
re-dispatch. Every later dispatch carries that line, so the question is never
asked twice.

### Routing

| Finding                    | Goes to                                             |
| -------------------------- | --------------------------------------------------- |
| `confirmed` + `high`       | remediation, now, with no question                  |
| `judgment` + `high`        | **the user, now**: the run stops at this gate       |
| anything `medium` or `low` | a **Review advisory**, walked through at end of run |

A wrong turn the next milestone will build on is worth stopping for. Everything
else waits for the walkthrough, so an unattended run keeps going. For any finding
put to them, now or at the end, the user can choose:

- **remediate**: into the loop below
- **accept**: the finding goes on the milestone's **Review** line as
  `R<n> accepted — <file>:'<anchor>' — "<the user's reason, verbatim>"`. Later
  reviews read it and stop raising the finding, until a diff touches that anchor
  or another finding breaks the reason. Nothing is written into the code.
- **defer**: append a ticket to the next milestone that hasn't started, or to a
  new final milestone called "Review follow-ups" when none is left. Confirm the
  placement in the same question. It runs in a later run, not this one.

**`security_noticed`.** With the sheriff on, these lines are listed in the
sign-off as "the reviewer noticed; the sheriff already swept this milestone", and
nothing more. With the sheriff off, each one becomes a Review advisory
suggesting `/qoq sheriff <file>`. They never route as findings.

### Remediation

This is the sheriff's loop ([sheriff.md](sheriff.md), Remediation): a new narrow
ticket rather than a reopened one, **two rounds** of its own budget, a scope
check by file, Gate 1 and Gate 2, a re-gate without `qoq refactor`, then a
recheck. Read it there. The differences are:

- **Tickets** are `Ticket <N>.R<k>`. The acceptance criteria are each finding's
  `plan_ref` restated as an assertion that must now hold: "a missing order id
  gets 404 from `/orders/:id`". A `scope` finding's criterion is a static one: a
  spec asserting the untraced export, route or file is gone.
- **Tier comes from the category.** `correctness` and `consistency` run at the
  **session** model, because putting the delivery back on its intent is
  judgment. `scope` and `maintainability` run at `sonnet`.
- **Too big to remediate.** If a finding's fix needs more than five files, or
  would change a milestone's **Contracts**, it doesn't go into the loop. It goes
  to the user, with "hand to `qoq replan`" as the recommended option. Rework of
  that size is a plan change, not a patch.
- **Commit:** `fix(m<N>): review R1,R2`, with `--no-verify`.
- **Sheriff after the re-gate, when it's on.** Dispatch `qoq-sheriff` with
  `mode: recheck`, `findings: []` and the remediation's range. That reads only
  the review fix, so a change made for maintainability can't quietly drop a
  guard. Anything it raises routes by sheriff.md's table, and its remediation
  ends the chain: there is no second reviewer pass over a security fix, because
  that fix is already scope-checked by file.
- **Then the reviewer recheck**: `mode: recheck`, with the findings verbatim and
  the remediation's range.

After **two rounds with findings still surviving**, bring the user each
surviving finding, both rounds' diffs and both rechecks. Offer four options: one
more round at the session's model, accept, defer, or stop the run.

Remediation tickets aren't filed with `estimate.mjs`. On an imported plan they
stay local: the tracker gets no new issues, only the milestone's **Review** line
through the write-back it already has.

## What gets recorded

The milestone's Completed block gains a **Review** line. It holds the verdict,
then one entry per finding: the id and severity, plus how it ended (remediated
`<hash>`, accepted with its anchor and reason as above, deferred to `<ticket>`,
or open advisory). **Gate evidence** gets the review's one-line verdict beside
the refactor, suite and sheriff results.

## The end-of-plan pass

This runs once the last milestone has archived, but only when **every**
milestone is archived and no ticket is `blocked`. A run that stopped on a
spending limit, or that left blocked tickets, skips it and says why in its
closing line. A later resume that finishes the plan runs it then.

Dispatch `qoq-reviewer`, cold, at the session's model, with `mode: plan`. Pass:

- the plan's Goal, Architecture and requirements source
- every milestone's Completed block
- the range from the plan's first ticket commit to `HEAD`
- this skill's absolute path

It doesn't get the full diff. It reads code only to confirm or dismiss a gap.

What it returns:

- **A `gap` finding** goes to the user with a recommendation and four options:
  - a new final **"Plan gaps"** milestone, run in this run
  - hand to `qoq replan`
  - accept as out of scope, recorded on the sign-off
  - drop

  Nothing runs without a yes. A Plan gaps milestone goes through the normal
  milestone gate, review included. After it archives, the end-of-plan pass runs
  **once more**, with its earlier gaps passed in. Gaps it marks `surviving` go to
  the user with only replan, accept or drop. No second gaps milestone is
  offered, so this can't loop.

- **Any other finding** (drift between milestones) is a Review advisory for the
  walkthrough.
- **`coverage`** is the "asked vs delivered" table in the sign-off.

## The sign-off

The sign-off happens only when the review is on. With it off, the end of the run
is unchanged. The order is:

1. the end-of-plan pass, its gap decisions, and the Plan gaps milestone if the
   user approved one
2. the advisory walkthrough: every milestone's Docs, Security and Review
   advisories, once
3. then the sign-off, rendered on this thread from the typed reports and the
   Completed blocks. The agent never writes it, because it can't see the other
   gates or the user's decisions.

The sign-off contains:

- **Verdict**, one line: _delivered_, _delivered with open items_, or _gaps_
- **Asked vs delivered**: each requirement with the milestone(s) that delivered
  it, taken from `coverage`. A partial or missing requirement shows how it ended
  (gaps milestone, replan, accepted)
- **Open items**: the deferred tickets, open advisories and accepted findings,
  plus the `security_noticed` lines
- **Gate evidence**: one line per milestone
- **The question**: does the user sign off? On a yes, write
  `**Signed off:** <YYYY-MM-DD> — <the user's note, or none>` into the plan
  header. On a no, record nothing. The user's reason is the next step, and it's
  usually a `qoq replan`.
