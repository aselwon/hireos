# Discovery — the record every command starts from

One cached JSON file, six consumers, derived on the main thread only when the
file can't be trusted. **No command re-derives any of this.**

`entry.mjs` decides whether the record is current. This file is what the record
holds, how to fill it in when it isn't, and what to do with the answers that came
from a person.

## Who reads what

| Command         | Fields it needs                                                 |
| --------------- | --------------------------------------------------------------- |
| `fix`           | `test:one`, `build`                                             |
| `refactor`      | the same                                                        |
| `bump`          | `test`, `build`                                                 |
| `plan`          | `test`, `build` — copied into the plan's Commands header        |
| `execute`       | `test`, `build` — for the milestone gate                        |
| `test`          | `test:one`, `test`, `runner`, `globals`, `react`, `conventions` |
| `qoq-developer` | all of it                                                       |

Nobody passes anything but the project root, and nobody gets a different answer
than anybody else.

Which review lenses are installed is deliberately **not** here: a cached answer
goes stale silently the moment somebody installs one, so `ponytail-review` is
resolved from the available-skills list at the moment it's needed.

**How the qoq CLI is invoked is not here either.** It is a constant, spelled out
in [cli.yaml](cli.yaml) — so there is nothing to discover, no field to go stale,
and nothing that has to read the CLI's own docs to learn two flags. Everyone runs
the same line.

## The record

```
node_modules/@ladamczyk/qoq-cli/bin/qoq-skill-discovery.json
```

The record lives and dies with the installed CLI: `npm install` wipes it and
discovery re-runs.

**Written for an agent, not a human.** Nothing in it that isn't read back, no
commentary fields.

```json
{
  "hash": "9f2c41ab77d0e315",
  "test": "npm test",
  "test:one": "npm run test -- {file}",
  "build": "npm run build",
  "runner": "vitest",
  "globals": true,
  "react": true,
  "conventions": "./testing-gate.md"
}
```

`hash` covers two inputs, and of each one only the part the record's answers came
from:

- `package.json`'s **`scripts` block** — every command field quotes one verbatim,
  and renaming one moves no lockfile at all
- the **watched dependencies** — `vitest`/`jest`, `@testing-library/react` — by
  name in `package.json`'s `dependencies` and `devDependencies`, and by the lines
  naming them in the project's lockfile (`package-lock.json`,
  `npm-shrinkwrap.json`, `pnpm-lock.yaml`, `yarn.lock`, in that order). `runner`
  and `react` are read off those.

Nothing else in those files, versions included: a `version` bump and an unrelated
transitive dependency each moved the hash without changing a word of the record.
`scripts/discovery-check.mjs` owns computing it, and the agent stamps the value
it was handed rather than deriving its own — two implementations that disagree
mean a record that never matches and an agent dispatched on every run.

There is no `lint` field, and no `run` or `check` field — linting is what the CLI
does, and its invocation is a constant.

`test:one` carries a `{file}` placeholder. It exists because most checks in this
skill are narrow — one spec just written, one file just fixed — and re-running a
whole suite to learn about one file is the difference between a loop that's
usable and one that isn't. `bump` deliberately never uses it: after a dependency
moves, "which tests could this have broken" isn't answerable.

## Filling it in

`entry.mjs` hands you three things when the record is stale: the `hash` to stamp,
a `proposed` block, and an `unresolved` list. That work stays on this thread —
it's a handful of reads, most of the answers are already derived or already
committed to the project's docs, and the one move it can end in is a question
only this thread can ask.

**Stamp the `hash` verbatim.** Computing your own means a record that never
matches and a re-derive on every run.

**`proposed` is checked, not re-derived.** `discovery-check.mjs` read the
manifest a moment ago; those lines have the standing of a stale record's
surviving ones — usually right, worth a glance, yours to overrule when the
project's docs say otherwise.

**A record that's already there is a starting point, not an answer.** Verify it
line by line: `qoq.config.js` still at the root, every recorded script still in
`package.json`, the runner's config still saying what `runner`, `globals` and
`react` claim, the file named by `conventions` still existing. All hold → rewrite
with the new hash and change nothing else. Any line failing → re-derive that line
only.

**Read the project's own docs before inferring anything** — `CLAUDE.md`, then
`AGENTS.md`, then `README.md`, for the `qoq:discovery` block below. A human wrote
it, usually because a previous run asked, and it outranks anything
`package.json` implies.

**The commands are the project's own scripts, verbatim** — `npm test`,
`npm run build`, `npm run test:execute -- {file}` — under the standing `npx` rule.
An `npx vitest …` or `npx tsc …` the docs give is still not recordable: the hook
blocks it, so the field would never run. Ask the user for a `package.json` script
that wraps it, and record that script.

**Anything still ambiguous is a question, and the file stays unwritten until it's
answered.** Half a record is worse than none — the next run reads it as whole.

**A repaired record is announced, at the end of the run.** Stale fields are
re-derived without asking — no permission is needed to re-derive a fact you
already know how to derive — but a silent rewrite of the file every command
trusts is exactly what should never happen unannounced:

```
Discovery record updated:
  test:one   npm run test -- {file}  →  npm run test:execute -- {file}
```

A record that verified clean produces no notice at all, and a record the script
accepted was never opened at all.

## An answered question gets written down outside `node_modules`

The record dies with the CLI package, so an answer must not live only there.
`npm install` wipes it, the next run re-discovers, hits the same ambiguity, and
asks the same question. A user who has said once that the single-file test
command is `npm run test:execute -- {file}` should never be asked again.

So when you ask the user something discovery couldn't resolve, **record the
answer in the project's own docs before writing the record** —
`CLAUDE.md` if there is one, else `AGENTS.md`, else `README.md`, in that order,
and never a new file if one of those exists. A short marked block, so it's
updated in place rather than accumulating:

```md
<!-- qoq:discovery -->

- test (full suite): `npm test`
- test (one file): `npm run test:execute -- {file}`
- build: `npm run build`
- runner: vitest, globals on, React

<!-- /qoq:discovery -->
```

One property the record alone can't give: it survives a reinstall, a deleted
`node_modules`, or a fresh clone on another machine — the second discovery is
silent because the answers are committed, and costs a read of one Markdown block
instead of a derivation.

Keep the block's scope tight. It holds answers to discovery's questions, not
project documentation at large — if something isn't one of the recorded fields,
it doesn't go in.
