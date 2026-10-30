# `qoq sheriff` — is this change introducing anything fishy?

`qoq-sheriff` reads a change for logic-level security problems and returns typed
findings; what it looks for lives in `agents/qoq-sheriff.md`. This file is the
main thread's side: scope, dispatch, routing, the remediation loop, and what gets
recorded. **The analysis is delegated; every decision stays here** — the agent
can't stop to ask, so asking, accepting and remediating are this thread's.

## Scope

```
/qoq sheriff                                       # files changed since the merge-base with the default branch
/qoq sheriff src/auth 'src/**/*.ts'                # snapshot: those paths, as they stand
/qoq sheriff main..HEAD                            # diff: that range, no plan
/qoq sheriff https://github.com/acme/api/pull/123  # pr: that pull request, against its description
```

Positional, like every other command. A `https://…/pull/<n>` link is a pull
request, an argument containing `..` is a range, and anything else is a path or
a glob. A bare number is not a pull request; it stops with one line asking for
the link. The default is `document`'s:
`git diff --name-only $(git merge-base HEAD <default branch>)`, swept as a
snapshot of those files. An empty default scope is a one-line stop.

## Standalone — `/qoq sheriff`

Ungated: typing it is the opt-in.

**A pull request link** runs [review.md](review.md)'s **Pull requests** section
with `qoq-sheriff`, step for step. The PR may belong to any repository, and it
is read from a scratch clone. The output is proposed inline comments for the
user to pick, posted as one `COMMENT` review under their name, and there is no
remediation. When the PR states its intent, say up top what the sweep was
judged against. Otherwise say that intent was not judged. The run reads nothing
on the working directory's record, so a discovery action to fill the record is
skipped for it. The sheriff's review and `qoq review`'s are separate runs that
post separate reviews.

**Paths, globs and ranges** are local:

1. **Dispatch `qoq-sheriff`** at the **session's** model with `mode: snapshot`
   or `diff`, the scope, and this skill's absolute path.
2. **`status: question`** → ask the user, then re-dispatch with the answer
   verbatim.
3. **Print the report**: every finding with its severity, confidence,
   locations, reason and exploit. Say once, at the top, that **intent was not
   judged**. With no plan, the sheriff can say what the code does but not
   whether anyone meant it. Nothing is written to disk.
4. **Offer remediation**, but don't start it. On the user's yes, take each
   finding through the routing and the loop below, with two differences. First,
   run the branch check (on the default branch, ask, and suggest
   `sheriff/<topic>`). Second, the re-gate is `qoq fix` over the touched files
   plus the project's full build and suite from the record, since there's no
   milestone union.

## Pipeline — from `execute`

**Experimental, so opt-in:** it runs only when `execute` was given `--sheriff`,
or the project's `qoq.config.*` sets `future: { unstable_skill_sheriff: true }`
([execute.md](execute.md), Setup). No skip rule: on, it sweeps every milestone,
spec-only ones included — a clean report on a small diff is cheap, and deciding
"nothing security-relevant here" is the judgment this agent exists to make.

### The milestone sweep

After the milestone gate is green, before `document`
([execute.md](execute.md)). Remediating code before the gates would spend
judgment on text that's about to change; after them, the sheriff sees what will
actually ship.

Dispatch at the **session's** model, cold — a fresh dispatch every time, never
`SendMessage` — with `mode: milestone`, the range
`<first ticket commit>^..<last ticket commit>` over **`done`** tickets only, the
union of their files, the milestone's Goal and Contracts and every ticket's
acceptance criteria, the plan's `**Security context:**` line if it has one, and
this skill's absolute path.

**`status: question`** stops the run: the sweep can't happen without the
answer, and the next milestone would build on code nobody swept. Ask, write the
answer into the plan header as `**Security context:** <answer>` (appending to an
existing line), and re-dispatch. Every later dispatch carries it, so it's never
asked twice.

### The per-ticket sweep

A ticket whose **Security sweep** is `ticket` gets an early sweep after Gate 2
and before its commit — `mode: ticket`, the working-tree diff of its `files`,
its own criteria. Auto-routed findings go back to the same developer as a
verbatim re-dispatch and spend that ticket's **delivery** attempts: it isn't
green-and-committed yet, so this is still delivery. Human-routed ones become
Security advisories now and are passed to the milestone sweep as already known.
The milestone sweep still covers the whole diff, this ticket included; the early
one replaces none of it.

### Routing

| Finding                            | Goes to                                                |
| ---------------------------------- | ------------------------------------------------------ |
| `confirmed` + `critical` or `high` | remediation, now — no question                         |
| `ambiguous` + `critical` or `high` | **the user, now** — the run stops at this gate         |
| anything `medium` or `low`         | a **Security advisory** — walked through at end of run |

A possible hole the next milestone will build on is worth stopping for; the rest
waits for the walkthrough so an unattended run keeps going. The user's options
for any finding put to them, now or at the end:

- **remediate** — into the loop below
- **accept** — this thread writes `qoq-sheriff: accepted — <the user's reason,
verbatim>` above the first location, in that file's comment syntax, and commits
  it alone as `chore(m<N>): accept security risk S<n>`. A file with no comment
  syntax (JSON) can't carry one: say so, and record it as **defer** instead,
  which re-raises on later runs
- **defer** — a ticket appended to the next milestone that hasn't started, with
  `Security sweep: ticket`, or to a new final milestone "Security follow-ups" when
  none is left; confirm the placement in the same question

An accepted marker comes back as an ambiguous finding when the diff touches it or
when another finding breaks the reason it states (`agents/qoq-sheriff.md`). It
routes like any other ambiguous finding. Put it to the user beside the finding
that broke it, since their answer to one usually settles the other. A
**remediate** answer removes the marker in the remediation ticket, and a fresh
**accept** replaces it with the new reason.

### Remediation

Not a loop back into the ticket: that ticket is delivered and green. A security
fix is a new, narrow job, and **its budget is two rounds**, counted apart from
any ticket's three delivery attempts — a hard ticket must not starve its own
security fix, and "the fix didn't work" is a different failure from "the ticket
was hard".

**One round** is: dispatch → scope check → Gate 1 → Gate 2 → re-gate → recheck.

1. **Write a remediation ticket** for every remediate-routed finding of this
   sweep, in the plan's ticket shape, appended under the milestone as
   `Ticket <N>.S<k>`:
   - **Files** — the findings' files, plus one new spec file. More than five
     files means one ticket per cluster of findings sharing files, run one after
     another inside the same round
   - **Acceptance criteria** — per finding, the exploit stated as an assertion
     that must now fail: "a signed-in user requesting another user's
     `/orders/:id` gets 404". A finding with no runtime exploit to assert — a
     secret in source, a token in a log — gets a static assertion: a spec that
     reads the file and asserts the secret or the logging call is gone. Never a
     criterion with no spec; that would be buying green
   - **Context** — the findings verbatim, and: change nothing outside these
     findings; a fix that needs more is a hand-back
   - **Agent tier** — `sonnet`; this is scoped mechanical work
2. **Dispatch `qoq-developer`** exactly as `execute` dispatches any ticket.
   Gate 1 or Gate 2 failing inside the round re-dispatches inside the round on
   the developer's own three attempts; only a finding surviving the recheck
   spends a round.
3. **Scope check, here, by file.** The developer's `files` and
   `git diff --name-only` must both be inside the ticket's **Files**. Any other
   file: `git restore` it, re-dispatch with the violation quoted, and the round
   is spent. Regions inside a file aren't checked here — the fix moves lines,
   and the recheck reads the diff.
4. **Gate 1, Gate 2, commit** as for any ticket —
   `fix(m<N>): security S1,S2`, `--no-verify`.
5. **Re-gate**: `qoq fix` over the milestone union with Knip on, plus the full
   build and suite. Not `qoq refactor`: its auto tier could reshape the fix.
   Red → the round is spent, the digest goes into the next dispatch.
6. **Recheck** — dispatch `qoq-sheriff` with `mode: recheck`, the findings
   verbatim and the remediation's range. `surviving` and any new finding route
   again by the table above. A review remediation sends the same mode with
   `findings: []` ([review.md](review.md)); what that raises routes here too.

**Two rounds spent with findings surviving** → bring the user each surviving
finding, both rounds' diffs and both rechecks' verdicts, and four options: one
more round at the session's model · accept · defer · stop the run.

Remediation tickets are **not** filed with `estimate.mjs` — no plan estimate
exists to grade — and on an imported plan they stay local: the tracker gets no
new issues, only the milestone's Security line through the write-back it already
has.

## What gets recorded

The milestone's Completed block gains **Security**: the sweep's verdict, then one
entry per finding — id, severity, and how it ended (remediated `<hash>`,
accepted, deferred to `<ticket>`, open advisory). **Gate evidence** gets the
sweep's one-line verdict beside the refactor and suite results.

**At the end of the run**, walk the user through every milestone's Security
advisories once, with the options above. A remediate answer runs the loop then,
on an already-archived milestone: its commits land after the archive, and its
Security line is updated in both the Completed block and `.completed.md` — the
one edit an archive takes, because a line still saying "open" about a fixed
finding is false.
