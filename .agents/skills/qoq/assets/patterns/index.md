# Smell → pattern index

The routing table `qoq-designer` works from. Smells on the left, because that is
the direction the work runs: a pattern named without a smell behind it is a
rewrite looking for a justification.

Every row's **cheaper** column is the thing TypeScript already gives you. Check
it first. Most of the time it is the whole answer, and the pattern is only what
that answer becomes if it stops holding.

## Stacks

This table is the base and always applies — its smells are about how code is
shaped, whatever is rendering it. On top of it, one table per stack **present in
the scope**, which is a question about the files you were given rather than
about the project:

| In the scope                                     | Also read                        |
| ------------------------------------------------ | -------------------------------- |
| React — `.tsx`/`.jsx`, or an import from `react` | [react/index.md](react/index.md) |

Additive, never instead of. A component file still has divergent switches and
boolean state soup, and this page is where those are answered; the stack table
holds only what exists because of the framework.

A scope with no stack table is the common case and needs no comment — say which
stack you detected once, and move on.

## The smells worth hunting

| Smell                                                                               | Costs you                                                   | Cheaper first                                      | Pattern                                               |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------- |
| **Divergent switch** — same `switch`/if-chain on a type tag in several places       | one new case means finding every copy; they drift           | `Record<Tag, handler>` in one module               | [Strategy](strategy.md)                               |
| **Construction by switch** — a `switch` returning different concrete instances      | callers learn every subtype's constructor                   | a discriminated union + one `create` function      | [Factory](factory.md)                                 |
| **Boolean/mode parameters** — `doIt(x, true, false)` selecting behaviour            | unreadable call sites; combinations nobody tested           | separate named functions                           | [Strategy](strategy.md)                               |
| **Shape mismatch at a boundary** — SDK/API types leaking through the codebase       | the vendor's rename becomes your refactor                   | one mapping function at the edge                   | [Adapter](adapter.md)                                 |
| **Wrapper stack** — logging/retry/cache/auth hand-woven into each call              | every new concern edits every call site                     | higher-order functions, composed once              | [Decorator](decorator.md)                             |
| **Manual fan-out** — one action calling five unrelated side effects inline          | the caller depends on all five; tests need all five         | an array of callbacks                              | [Observer](observer.md)                               |
| **Untracked action** — behaviour that needs undo, replay, queue, or audit           | can't be reversed or retried; no record of what ran         | a tagged union of actions + one reducer            | [Command](command.md)                                 |
| **Wide surface** — callers wiring four internal modules in a fixed order            | the order is folklore; every caller re-derives it           | one exported function; `index.ts` re-exports       | [Facade](facade.md)                                   |
| **Telescoping construction** — many-argument constructors, half-built objects       | invalid states are representable; call sites are positional | an options object + `Required`/`Partial`           | [Builder](builder.md)                                 |
| **Copy-paste algorithm** — same sequence, one or two steps differing                | a fix to the shared part lands in one copy                  | one function taking the varying steps as arguments | [Template Method](template-method.md)                 |
| **Boolean state soup** — `isLoading && !isError && hasData` guarding everything     | impossible combinations compile; transitions are implicit   | a discriminated union of states                    | [State](state.md)                                     |
| **Recursive special-casing** — leaf and container handled separately at every level | every traversal duplicates the branch                       | a recursive type + one recursive function          | [Composite](composite.md)                             |
| **Ordered conditionals** — a long if-chain of independent checks, order significant | inserting a check means reading all of them                 | an array of predicates, iterated                   | [Chain of Responsibility](chain-of-responsibility.md) |

A smell not on this list is still a finding. Report it with its cost and no
pattern rather than forcing it into the nearest row.

## The other ten GoF patterns

Named here so nothing is silently unmappable. In TypeScript these are usually the
wrong answer — reach for the right-hand column instead, and only name the pattern
if you can say why that column fails here.

| Pattern         | In a TS codebase                                                                                                                                          |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Singleton**   | a module is already one — its bindings are evaluated once. A Singleton class adds a global you can't reset in tests.                                      |
| **Prototype**   | `structuredClone`, spread, or an explicit `clone()`. Nothing needs a registry.                                                                            |
| **Iterator**    | `Symbol.iterator` and generators are the language's version. Write `function*`, not a class with `next()`.                                                |
| **Proxy**       | the `Proxy` built-in for interception; otherwise a wrapper function. A hand-written forwarding class is a Decorator by another name.                      |
| **Bridge**      | two type parameters, or two functions composed. The class-pair form buys nothing without inheritance.                                                     |
| **Flyweight**   | only under measured memory pressure over very large object counts. `Map`-based interning if so. Almost never in application code.                         |
| **Mediator**    | usually a Facade with worse coupling, or an event bus that hides the call graph. Prefer explicit calls until they genuinely tangle.                       |
| **Memento**     | immutable state plus a history array. `structuredClone` for the snapshot.                                                                                 |
| **Visitor**     | a discriminated union plus an exhaustive `switch` — the compiler enforces exhaustiveness, which is Visitor's entire benefit, without the double dispatch. |
| **Interpreter** | a real parser library, or don't build a language. Hand-rolled interpreters outlive their justification.                                                   |

## What the caller does with a finding

`qoq-designer` names the pattern and its file; it never opens the file. The
caller reads that file — intent, the TS-idiomatic shape, a worked before/after,
the cost, and the cases where the pattern is the wrong call — and takes it to the
user with the specific code in front of them.

The split exists because pattern write-ups argue for their pattern. An agent that
reads them before scanning finds the pattern, not the smell.
