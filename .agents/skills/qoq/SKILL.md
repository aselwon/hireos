---
name: qoq
description: Quality toolkit for JavaScript/TypeScript repos — `fix`, `refactor`, `bump`, `plan`, `replan`, `execute`, `test`, `compress`, `document`, `mermaid`, `sheriff`, `review`. Use it whenever the user wants lint or formatting cleaned up, dead code or dead dependencies removed, a branch checked before merge, duplication refactored, npm dependencies bumped or known vulnerabilities in them fixed, a spec broken into tickets, an existing plan reshaped or re-decomposed after it stalled or the requirements moved, an approved plan executed or resumed — from a plan file or a Jira, Linear or Trello milestone — tests written for code that already exists, or agent-facing markdown (CLAUDE.md, AGENTS.md, skill docs) made terser to stop burning context, the why behind code written down as JSDoc and `./docs` for the next session or person, a flow, lifecycle, data model or architecture drawn as a Mermaid diagram that renders on GitHub, or a change or a path checked for security problems a linter can't see — injection, missing auth checks, leaked secrets, unsafe input, or a delivered change or pull request checked against its plan or description for wrong turns, scope creep or inconsistency between tickets. Trigger it even when the user never says "qoq" or names a tool.
argument-hint: '[fix|refactor|bump|plan|replan|execute|test|compress|document|mermaid|sheriff|review] [scope]'
allowed-tools:
  - Read
  - Write
  - Edit
  - Grep
  - Glob
  - Agent
  - Skill
  - AskUserQuestion
  - Bash(npm run:*)
  - Bash(npm test:*)
  - Bash(npm install:*)
  - Bash(npm ci:*)
  - Bash(npm view:*)
  - Bash(npx qoq:*)
  - Bash(git clone:*)
  - Bash(node:*)
  - Bash(git status:*)
  - Bash(git ls-files:*)
  - Bash(git log:*)
  - Bash(git diff:*)
  - Bash(git add:*)
  - Bash(git commit:*)
  - Bash(git checkout:*)
  - Bash(git branch:*)
  - Bash(git apply:*)
  - Bash(git restore:*)
  - Bash(git revert:*)
  - Bash(git symbolic-ref:*)
  - Bash(git merge-base:*)
  - Bash(git fetch:*)
  - Bash(gh pr view:*)
  - Bash(gh repo clone:*)
  - Bash(gh issue view:*)
hooks:
  PreToolUse:
    - matcher: Bash
      hooks:
        - type: command
          command: |
            node -e '
            let s = "";
            process.stdin.on("data", (d) => (s += d)).on("end", () => {
              const c = JSON.parse(s).tool_input?.command ?? "";
              if (/(^|[\s;&|(`])npx\s+(?:-{1,2}[\w-]+\s+)*(?!qoq(?:\s|$))[^\s-]/.test(c)) {
                process.stderr.write("qoq: npx is for qoq and nothing else. Run the project script verbatim (npm test, npm run <script>); a project with no script for this is a question for the user.\n");
                process.exit(2);
              }
            });
            '
---

# QoQ — quality over quantity

Twelve commands, one shared discovery record, eleven agents.

**This file routes.** Each command's reference owns its rules — read the one you
need, not all of them.

| Command    | Does                                                        | Reference                                        |
| ---------- | ----------------------------------------------------------- | ------------------------------------------------ |
| `fix`      | check/fix loop over tool findings, ends on PASS/FAIL        | [references/fix.md](references/fix.md)           |
| `refactor` | green base, then four judgement assessments over a scope    | [references/refactor.md](references/refactor.md) |
| `bump`     | analyse dependencies, pick, then apply one patch at a time  | [references/bump.md](references/bump.md)         |
| `plan`     | requirements → an approved plan file under `./plans/`       | [references/plan.md](references/plan.md)         |
| `replan`   | an existing plan, reshaped — delivered work stays frozen    | [references/replan.md](references/replan.md)     |
| `execute`  | an approved plan, local or imported → delivered milestones  | [references/execute.md](references/execute.md)   |
| `test`     | unit/integration coverage for code that already exists      | [references/test.md](references/test.md)         |
| `compress` | strip agent-facing markdown to what an agent acts on        | [references/compress.md](references/compress.md) |
| `document` | _experimental_ — the why, as JSDoc, `./docs`, `Contents`    | [references/document.md](references/document.md) |
| `mermaid`  | a validated Mermaid chart — printed, or written to a doc    | [references/mermaid.md](references/mermaid.md)   |
| `sheriff`  | security judgment on a change — typed findings, remediated  | [references/sheriff.md](references/sheriff.md)   |
| `review`   | a delivery or PR judged against its intent — typed findings | [references/review.md](references/review.md)     |

Two files sit under every command rather than beside them. What this skill knows
about the _project_ is one cached record, derived once per top-level run:
[references/discovery.md](references/discovery.md). What it knows about the _qoq
binary_ — invocations, flags, report location, the digest scripts, and which
command or agent may run which — is
[references/cli.yaml](references/cli.yaml). Open either when you need it; this
file states neither, so there is one copy of each to go stale.

## Usage

**Scope is positional, everywhere.** One spelling across all twelve commands, so
nobody has to remember which one took a flag. `mermaid`'s is a description,
not a path.

| Invocation                                     | Scope                                                  |
| ---------------------------------------------- | ------------------------------------------------------ |
| `/qoq fix`                                     | `qoq.config`'s `srcPath`                               |
| `/qoq fix src/auth/token.ts`                   | those files only                                       |
| `/qoq refactor`                                | `qoq.config`'s `srcPath`                               |
| `/qoq refactor src/modules/npm`                | those paths only                                       |
| `/qoq refactor --decisions auto <paths>`       | unattended: apply the mechanical tier, advise the rest |
| `/qoq bump`                                    | every outdated dependency                              |
| `/qoq bump --scan`                             | also vulnerable ones, via `qoq scan` — experimental    |
| `/qoq plan <requirements file or description>` | —                                                      |
| `/qoq plan <requirements> --tool jira`         | also raise the tickets there — experimental            |
| `/qoq plan <requirements> --diagrams`          | also chart the plan before approval — experimental     |
| `/qoq replan plans/<file>.md`                  | that plan only — refuses on uncommitted changes        |
| `/qoq execute [plans/<file>.md]`               | omitted → ask, unless exactly one plan is approved     |
| `/qoq execute --source jira`                   | import a milestone from there, run it — experimental   |
| `/qoq execute <plan> --session-limit 60`       | stop before spending past 60% of the 5-hour limit      |
| `/qoq execute <plan> --weekly-limit 80`        | same for the 7-day limit; both default to 100          |
| `/qoq execute <plan> --docs`                   | also document each milestone — experimental, opt-in    |
| `/qoq execute <plan> --sheriff`                | also security-sweep each milestone — experimental      |
| `/qoq execute <plan> --review`                 | also review each milestone and the plan — experimental |
| `/qoq test <what to cover>`                    | —                                                      |
| `/qoq compress`                                | every `CLAUDE.md` and `AGENTS.md` git tracks           |
| `/qoq compress docs/ skills/qoq/references`    | those paths only                                       |
| `/qoq document`                                | files changed since the merge-base with the default    |
| `/qoq document src/auth`                       | those paths only                                       |
| `/qoq mermaid <description>`                   | print the chart                                        |
| `/qoq mermaid <description> --to docs/a.md`    | write it there — created, or appended                  |
| `/qoq mermaid <description> --to docs/a.md#x`  | at the end of the section whose anchor is `x`          |
| `/qoq sheriff`                                 | files changed since the merge-base, as they stand      |
| `/qoq sheriff src/auth 'src/**/*.ts'`          | a snapshot of those paths — intent not judged          |
| `/qoq sheriff main..HEAD`                      | that range's diff, no plan — intent not judged         |
| `/qoq sheriff <PR link>`                       | any repo's PR, security → proposed comments            |
| `/qoq review <PR link>`                        | any repo's PR vs its description → proposed comments   |

Eleven flags exist. `--decisions auto` is for the two callers that can't stop to
answer questions — `execute`'s milestone gate and `bump`
([references/refactor.md](references/refactor.md)). `--session-limit` and
`--weekly-limit` cap what a plan run may spend of the account's 5-hour and 7-day
limits; give neither and no usage check runs at all
([references/execute.md](references/execute.md)). `--docs` turns on `execute`'s
experimental per-milestone `document` step, which `qoq.config`'s
`future.unstable_skill_docs: true` also does. `--scan` is the same kind of switch
for `bump`'s experimental vulnerability scan, and
`future.unstable_skill_bump_with_scan: true` is its config twin. `--diagrams`
(twin: `future.unstable_skill_diagrams: true`) turns on `qoq-artist` in `plan`,
`replan` and — with docs on too — `execute`; `--to` is where `mermaid` writes
([references/mermaid.md](references/mermaid.md)). `--sheriff` (twin:
`future.unstable_skill_sheriff: true`) turns on `execute`'s milestone security
sweep and `plan`'s `Security sweep` proposals
([references/sheriff.md](references/sheriff.md)). `--review` (twin:
`future.unstable_skill_review: true`) turns on `execute`'s milestone review, the
end-of-plan pass and the sign-off ([references/review.md](references/review.md)).

`--tool` and `--source` are the two ends of the same road, and both default to
`local`. `--tool` is `plan`'s: `jira`, `linear` or `trello` offer to raise the
approved tickets there. `--source` is `execute`'s: those same three values ask
which milestone to run, import it into a plan file, and then execute that file
like any other. Both directions are experimental: each tracker needs its
`future.unstable_skill_plan_<tool>: true` in `qoq.config` as well, and the flag
alone is refused ([references/plan.md](references/plan.md)). Neither makes a tracker authoritative — the plan file is the
state in both directions ([references/export.md](references/export.md)).

## Entry

Invoked with: `$ARGUMENTS`

`<skill>` is `${CLAUDE_SKILL_DIR}`.

1. **The head-of-run checks have already run.** This is `entry.mjs`'s output —
   the agents, the discovery record, any tier mapped to a dearer model, the usage
   stats, a section each with what to
   do about it. Do what the sections say.

   !`node "${CLAUDE_SKILL_DIR}/scripts/entry.mjs" --project "${CLAUDE_PROJECT_DIR}" --command "$0"`

   Once per **top-level** run, keyed to the command the user typed. A command
   invoked from inside another inherits everything the outer run already
   established rather than re-checking — a `fix` dispatched from inside
   `refactor` is part of that refactor, not a second run. So never re-invoke this
   skill for an inner command: that re-runs every check. Instead, each time an
   inner command starts, run `node <skill>/scripts/stats.mjs <inner> --project
   <dir>` once, with the same `<dir>` the entry ran with (it counts that run and
   does nothing else), then
   open its reference. Exit 1 there means consent went unanswered at the top, so
   carry on without asking. Don't report what it prints.

2. **If it reports the record stale**, fill it in from the payload it printed —
   here, on this thread, not in an agent. It's a few reads, and the one move it
   can end in is a question only this thread can ask
   ([references/discovery.md](references/discovery.md)). Note any field you
   repaired for the end-of-run notice.

3. **No command given** → the output above is a single `command` section. Ask,
   then run the line it prints yourself.

4. **Run the command**, then close the run by reporting anything discovery
   repaired — one line per field, _after_ the real work, never before it.

## Who calls whom

Commands compose, but **only on the main thread**.

| Command    | Calls                                                                | Called by                                                          |
| ---------- | -------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `fix`      | its own `qoq-checker`                                                | `refactor`, `bump`, `execute`, `test`, `compress`                  |
| `refactor` | `fix`                                                                | `bump`, `execute`, `test`                                          |
| `bump`     | `fix`, `refactor` — both per patch                                   | —                                                                  |
| `plan`     | `grilling` (external), `mermaid`                                     | —                                                                  |
| `replan`   | `grilling` (external), `mermaid`                                     | —                                                                  |
| `execute`  | `fix`, `refactor`, `sheriff`, `review`, `document`, `mermaid`        | `plan` — offered at approval, never dispatched from inside it      |
| `test`     | `fix`, `refactor`                                                    | —                                                                  |
| `compress` | `fix`                                                                | —                                                                  |
| `document` | its own `qoq-scribe`; offers `mermaid`                               | `execute` — per milestone, after the gate                          |
| `mermaid`  | its own `qoq-artist`                                                 | `plan`, `replan`, `execute` — when `--diagrams` is on              |
| `sheriff`  | its own `qoq-sheriff`; `fix` to re-gate                              | `execute` — per milestone, when `--sheriff` is on                  |
| `review`   | its own `qoq-reviewer`; `fix` to re-gate; `sheriff` to recheck a fix | `execute` — per milestone and once per plan, when `--review` is on |

`compress` changes what future runs read, never what this one does, so no
command should be reaching for it mid-task.

Two commands reach for a skill this one doesn't own, and both resolve the name
the same way: look it up in **your own available-skills list** at the moment you
need it, because that list is already in the thread's context and is never out of
date. `refactor`'s assessment 3 is `ponytail-review` (assessment 4 is
`qoq-designer`, which ships here); `plan` opens with `grilling`, the interview
that closes the gaps in a set of requirements before they become invented
acceptance criteria. Each reference states what to do when its skill is missing.

## Standing rules

These hold in every command. Each command's reference assumes them rather than
restating them.

**Never assume a default.** Anything unclear is a question for the user, not a
sensible guess with a note afterwards — a guess that looks plausible is worse
than a stop, because nobody notices it. Subagents can't ask, so an agent on any
doubt **writes nothing and returns the question**: a half-written artifact is
indistinguishable from a stale one on the next run. The caller asks and
re-dispatches with the answer.

**`npx` is for `qoq` and nothing else.** Every other command is the project's own
script, verbatim — `npm test`, `npm run build`, `npm run test:execute -- {file}`.
This skill's `PreToolUse` hook blocks any other `npx`, in agents too, for the
rest of the session.
Never compose `npx vitest …` or `npx tsc …` out of a dependency spotted in
`package.json`: that invocation skips the project's config, flags, and setup
files, and it is plausible enough that nobody notices it was invented. A project
with no script for something is a project that has to be asked.

**Nothing runs in parallel.** Not tickets, not test slices, not assessments, not
patches. Every check that matters is an attribution question — "did _this_
change break it?" — which a second agent writing concurrently makes
unanswerable.

**An agent that reports never fixes.** `qoq-checker`, `qoq-bumper`,
`qoq-designer`, `qoq-architect`, `qoq-test-reviewer`, `qoq-sheriff` and `qoq-reviewer` return findings and edit
nothing. An agent permitted to do both will quietly do both, and the finding
disappears into the diff instead of reaching the user.

**Never buy green.** No `.skip`, no loosened assertion, no narrowed ticket, no
weakened gate. If the bar can't be met, that's a report, not something to route
around.

**The CLI is a constant.** `npx qoq` is installed wherever this skill runs;
nothing discovers it, checks for it, or derives its flags. Whoever needs it reads
`references/cli.yaml` at the moment they need it. What stays with `fix` is the
_verdict_ — it owns the check/fix loop and the one PASS/FAIL line its callers
read.

## Agents

Eleven, in `agents/`. Everything is pinned except five: `qoq-developer`, whose tier
is a property of the ticket and is passed at dispatch, `qoq-scribe`, whose tier
follows its mode and is passed at dispatch, `qoq-architect`, which
inherits the session's model because a design error propagates into every ticket
that inherits the contract, and `qoq-sheriff` and `qoq-reviewer`, which run at
the session's model, always cold, because a judgment read shares the author's
blind spots at any cheaper tier.

| Agent               | Model      | Job                                                         |
| ------------------- | ---------- | ----------------------------------------------------------- |
| `qoq-checker`       | haiku      | run the tools, return the digest — one per `fix` loop       |
| `qoq-bumper`        | sonnet     | read a changelog, find what lands here — one per package    |
| `qoq-architect`     | _session_  | contracts · surface · risks · unknowns — one per plan       |
| `qoq-developer`     | _dispatch_ | one ticket, red-green-refactor — one per ticket             |
| `qoq-test-reviewer` | sonnet     | do the specs test the criteria — one per ticket, pre-commit |
| `qoq-tester`        | sonnet     | write the specs for one slice — one per slice               |
| `qoq-designer`      | sonnet     | stack → smells → patterns — `refactor`'s assessment 4       |
| `qoq-scribe`        | _dispatch_ | the why, as comments and docs — one per run or milestone    |
| `qoq-artist`        | sonnet     | a validated Mermaid chart, or a reasoned decline            |
| `qoq-sheriff`       | _session_  | logic-level security findings — one per sweep or recheck    |
| `qoq-reviewer`      | _session_  | the delivery against the plan — one per milestone or plan   |

Entry copies them into the project's `.claude/agents/`, because an agent file
inside a skill is registered by nothing, and Claude Code picks that directory up
on its own a moment later. It also deletes the copies of agents this skill has
stopped shipping, so nothing stays dispatchable with a contract that no longer
exists. Do what `entry.mjs`'s **agents** section says: it decides whether a fresh
install is a question or an end-of-run line, and on the one run where an agent
isn't registered yet it prints the `general-purpose` fallback to dispatch
instead.

**Every dispatch passes this skill's absolute path** — the `<skill>` line under
Entry. An agent starts cold and cannot derive it, and it's what `<skill>` stands
for in every path an agent is told to run — `references/cli.yaml` included.

`qoq-developer` and `qoq-tester` carry a `maxTurns` cap. One that stops on it
comes back marked partial: that is a hand-back and spends an attempt, never
something to resume with `SendMessage`.

An agent reported as `kept (edited here)` is the user's own version and stays
that way. Dispatch it like any other; it's registered.

**A tier that doesn't resolve is the user's to remap, never yours.** `opus`,
`sonnet` and `haiku` resolve through Claude Code's
`ANTHROPIC_DEFAULT_*_MODEL` settings, so a dispatch that comes back with a
model error (not found, not enabled, unavailable) means that tier has no model on
this host. Run `node <skill>/scripts/model-tiers.mjs --project <root> --failed
<tier>` and do what it prints. Don't re-dispatch on another tier to get past it,
because a dearer fallback is silent spend. Never write a model or tier choice to
memory, even a confirmed one: the settings file is the one place the user can see
it and undo it. When Claude Code substitutes a model on its own and says so,
relay its notice and carry on.

## Test and code conventions

[references/test-conventions.md](references/test-conventions.md) holds the house
rules for writing specs. Whoever writes a test in this project reads it rather
than reinventing a style.
[references/code-conventions.md](references/code-conventions.md) is its sibling
for production code: names say what, comments say why, and a comment that
predates the change is never removed without a recorded reason. Both are read by
whoever writes or tidies code. Where either conflicts with the project's own file — named
on the record's `conventions` field — **the project's file wins**: it's
human-written and knows things this skill can't infer.
