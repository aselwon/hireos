# `qoq document` — write down the why

The code says what it does; `qoq-scribe` writes down why — in JSDoc, in
`./docs`, and in the `## Contents` section that closes `README.md`. Its rules for
_what_ to write live in `agents/qoq-scribe.md`. This file is the main thread's
side: scope, dispatch, the walkthrough, and what gets committed.

## Scope

```
/qoq document                    # files changed since the merge-base with the default branch
/qoq document src/auth src/a.ts  # those paths only
```

Positional, like every other command. The default:

```bash
git merge-base HEAD <default branch>
git diff --name-only <merge-base>
```

An empty default scope is a one-line stop, not a question.

Monorepos get no special handling: one `./docs` and one `## Contents` at the
root, like any other repo.

## Path mode — `/qoq document`

1. **Dispatch `qoq-scribe`** at the **session's** model, with `mode: path`, the
   scope, and this skill's absolute path. Path mode is inference on code nobody
   explained to it, so the tier has to match.
2. **`status: question`** → ask the user, then re-dispatch with the answer
   verbatim. It wrote nothing, so there's nothing to undo.
3. **`npx qoq prettier --fix`** — the `format` form in
   [cli.yaml](cli.yaml). Prettier reflows JSDoc and Markdown, and nothing else
   in a comments-only change can trip a gate.
4. **Walk the user through the report**: each `markers` entry, then
   `readme: missing` (ask whether to create a README holding only a title and
   `## Contents`). For a marker the user explains, replace the marker with their
   explanation, worded as a comment — no re-dispatch. Unanswered markers stay.
5. **Stop.** Changes stay in the working tree for the user to review. Non-empty
   `diagram_candidates` → offer to draw them ([mermaid.md](mermaid.md)); mention
   any file prettier changed outside the
   scribe's lists.

## Plan mode — from `execute`'s milestone gate

**Experimental, so opt-in:** it runs only when `execute` was given `--docs`, or
the project's `qoq.config.*` sets `future: { unstable_skill_docs: true }`
([execute.md](execute.md), Setup). Standalone `/qoq document` needs neither,
because typing it is the opt-in.

Runs after the gate is green and before the milestone is archived, while its text
is still in the plan ([execute.md](execute.md)). Nobody is watching, so nothing
here stops the run.

1. **Dispatch `qoq-scribe`** at **sonnet** — plan mode is translation — with
   `mode: plan`, the milestone's full text, the range
   `<first ticket commit>^..<last ticket commit>` (gate fix-up tickets
   included), the union of the tickets' files as scope, the plan's
   `**Docs conventions:**` line if it has one, and this skill's absolute path.
2. **`status: question`** → don't ask now. Write `docs skipped: <question>` into
   the milestone's **Docs advisories**, archive, carry on. The question goes to
   the user at the end of the run, and the answer becomes the plan header's
   `**Docs conventions:**` line, passed to every later dispatch.
3. **Diagrams on** → `qoq-artist` in docs mode ([mermaid.md](mermaid.md)).
   Then **`npx qoq prettier --fix`.**
4. **Commit** exactly `files_written` + `files_changed`, plus the artist's
   `files_changed` — never `git add -A`,
   because prettier formats the whole repo. Message
   `docs(m<N>): <milestone name>`, with the run's usual trailer. A file prettier
   changed outside those lists is a report line, not part of the commit.
5. **Docs advisories** in the milestone's summary block: every `drift` entry and
   every `markers` entry, one line each. They go nowhere else — drift is the
   user's decision, and nothing about it is written into `docs/`.

**At the end of the run**, walk the user through every milestone's Docs
advisories once — drift, markers, skipped questions. Marker answers are written
in place as in path mode and committed together as
`docs: resolve scribe markers`.
