# `qoq compress` — strip agent docs to what an agent acts on

Markdown written for agents gets read on every single run, forever. A paragraph
of rationale that a human reads once is a paragraph the model pays for a
thousand times. This command deletes the part nobody acts on and keeps the part
somebody does.

## Scope

```
/qoq compress                              # every CLAUDE.md and AGENTS.md in the repo
/qoq compress docs/qoq-workflows.md        # those files only
/qoq compress skills/qoq/references        # every .md underneath
```

Positional, like `fix` and `refactor` — the same concept spelled the same way
everywhere.

The default is what agents load without being asked for it:

```bash
git ls-files '*CLAUDE.md' '*AGENTS.md'
```

`git ls-files` and not a glob walk, because an untracked scratch file has no
reader to save and `node_modules` is full of other people's docs. List what
matched before touching anything — in a monorepo that default can be twenty
files, and some of them ship to npm.

## No discovery

`compress` is the one command that skips discovery entirely. Every line
of the record answers "how is this project built, tested, checked" and none of
that bears on editing prose. Reading a manifest to learn the test command before
deleting an adjective would be this command failing at its own premise.

It ends by calling `qoq fix` over the files it changed, and that call does its
own discovery. Deferred, not skipped.

## What compression is

One test, applied sentence by sentence: **would an agent do anything differently
if this were gone?** No → cut it. That's the whole judgement, and it's sharper
than a word budget because it survives contact with a doc that's already tight.

The other half of the win isn't deletion at all — it's shape. A paragraph of six
parallel facts costs twice what the table of six rows costs, and the table is
easier to act on. Reach for the reshape before the delete.

| Cut                                                   | Keep                                                      |
| ----------------------------------------------------- | --------------------------------------------------------- |
| rationale that only restates the rule                 | every path, command, flag, filename, version, URL         |
| hedging and throat-clearing — "it's worth noting"     | every rule, constraint, prohibition, ordering requirement |
| the second and third example of an already-clear rule | conditionals — "if X then Y", and both branches           |
| prose that recreates the table next to it             | anything named as a trap, gotcha, or common mistake       |
| history — "we used to do X" — with nothing at stake   | history that exists to stop someone reverting to X        |
| structure a `ls` or a `package.json` already answers  | facts the repo does **not** state anywhere else           |
| motivational framing, apologies, meta-commentary      | headings other files link to (see below)                  |

### The "why" is not automatically prose

The instinct is to delete every _because_. Don't — some of them are load-bearing.

Keep a why when it stops a wrong action: the clause that explains why the rule
isn't the obvious thing is what stops the next agent from cheerfully re-deriving
the obvious thing and undoing it. Cut a why when it only justifies a right
action nobody was going to argue with.

> `--json` is what writes the reports at all — without it there's nothing to
> summarize.

Load-bearing. An agent that reads `--json` as an output-format preference drops
it. Twelve words that prevent a silent failure.

> This is important for maintainability and long-term code health.

Nothing acts on it. Gone.

### Headings are an API here

Other files link to these headings by anchor — the skill's router by name, and
`docs/qoq-workflows.md` by anchor. Rewording a heading to save four words breaks
a link silently, and a broken route costs far more than the words saved. Keep
heading text stable unless you're also fixing what points at it —
`grep -rn '#the-anchor'` first.

## Per file, one at a time

Nothing runs in parallel here either. Compression is judgement about meaning,
and two agents rewriting sibling docs will make the same fact disagree with
itself in two places.

1. **Read the whole file** before cutting a line of it. A rule stated once in
   paragraph two and relied on in paragraph nine looks redundant from paragraph
   nine — that's how a lone statement of a constraint gets deleted as a repeat.
2. **Estimate first.** Under ~15% and the file is already tight: skip it, say so,
   move on. A diff that churns a doc to save thirty words costs more in review
   than it ever returns.
3. **Write the compressed version to a scratch path**, not over the original —
   the check needs both halves.
4. **Check it:**

   ```bash
   node <skill>/scripts/compress-check.mjs <original> <scratch>
   ```

   It compares the _literals_ — paths, commands, flags, filenames, URLs, fenced
   lines — and prints a word delta. Exit 1 means something was `dropped` or
   `invented`; that's a list to read, not an automatic revert. Restore each
   dropped literal or be able to say why it was redundant. Treat `invented`
   as serious: compression has no business creating a path that wasn't there, and
   a hit points at a hallucinated filename.

5. **Move it into place** and go to the next file.

The script catches lost facts, not lost meaning — it can't tell you the sentence
you cut was the only thing explaining when a rule applies. Rereading the
compressed file cold, as if you'd never seen the original, is the check for that,
and it's the one that has to happen in your head.

## Ending

Dispatch `qoq fix` over exactly the files changed. Markdown is Prettier's
business — reflowed paragraphs and re-aligned tables come back unformatted
otherwise, and a compress that leaves the repo failing its own gate isn't done.

Then one table, and nothing else:

| File                     | Before | After | Saved                   |
| ------------------------ | ------ | ----- | ----------------------- |
| `CLAUDE.md`              | 364    | 180   | -51%                    |
| `packages/cli/AGENTS.md` | 1204   | 1190  | skipped — already tight |

Words, from the script's own output, so the number is measured rather than
claimed. Say which files were skipped and why, and name any dropped literal you
decided was redundant — that's the one judgement call in the run a reader can't
recover from the diff.

## What this command will not do

**It never edits code, config, or tests.** A `.md` file is the whole surface. A
comment in a source file is not prose to compress. It may be the only record of a
decision, and it goes only under `refactor`, for a reason
[code-conventions.md](code-conventions.md) accepts.

**It never rewrites the specification of a behaviour to be terser than it is
true.** "Stops to ask after 3 loops rather than looping indefinitely" does not
compress to "loops 3 times". Losing a fact to save a word is the one failure
this command can cause and the gate can't catch.
