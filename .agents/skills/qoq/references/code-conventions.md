# Code conventions — names say what, comments say why

House rules for anyone writing or tidying production code: `qoq-developer`,
`qoq-tester` for its helpers, `refactor`'s assessments, and `qoq-architect` for
the names a Contract fixes. **The project's own conventions file wins** where it
says otherwise. It's human-written and knows things this file can't.

## Names carry the what

Write code that explains itself. Functions, variables, parameters and types are
named for what they mean, spelled out: `isExpiredAtExactMillisecond`, not
`chkExp`; `retryDelayInMilliseconds`, not `rd`. The goal is that a reader never
needs a comment to learn _what_ something is, so comments are left for the
things only a comment can say.

The exact mechanics — casing, allowed abbreviations, length — belong to the
project's ESLint config, not to this file. Where it is silent, the spelled-out
name is the default. Two things stay as they are: a name fixed by an external
contract (a framework signature, an API field, an env var) and an acronym more
familiar than its expansion (`id`, `url`, `json`).

**New names follow this; existing names move only inside the change.** A private
or local name in a file you're already changing may be renamed while you're
there. An exported name is never renamed as a tidy — that's an interface change,
and it belongs to a ticket that says so.

## Comments carry the why

A comment is for what the names can't carry: a decision and the alternative it
rejected, an edge case, a constraint imposed from outside the file, a unit or a
convention the type doesn't show. A comment that restates the code is a name that
should have been better. Fix the name; don't write the comment.

## Existing comments are evidence

A comment that existed before your change may be the only record of why the code
is the way it is. The commit that introduced it, the ticket, the conversation —
any of them can be gone. So deleting or rewriting one needs a reason that holds
on its own:

- **it's false** about the code as it now stands, or
- **the fact it states is now carried** by a name, a type or a test in the same
  change.

"Redundant", "noisy" and "obvious" are not reasons. Obvious to whom? The reader
the comment was written for didn't find it obvious. Comments your own change
wrote are yours to edit freely.

**Every removal is recorded with its text.** Quote the comment verbatim with its
location and the reason (`src/auth/token.ts:42 "…" — now carried by
isExpiredAtExactMillisecond()`) wherever the change is reported. When the change
is committed, put that quote in the commit body, so git history keeps the text
the code no longer holds.

**Nobody watching, nothing removed.** Under `--decisions auto` a pre-existing
comment is never removed, even when the reasons above hold. The removal comes
back as an advisory for a person to decide.
