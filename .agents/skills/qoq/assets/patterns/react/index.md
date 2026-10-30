# Smell → pattern index — React

Read this **in addition to** [`../index.md`](../index.md), never instead of it. A
component file still has divergent switches, boolean state soup and telescoping
props, and the base table is where those are answered. This one holds the smells
that only exist because there is a render loop, and it is the only table whose
patterns cost re-renders when you get them wrong.

Every row's **cheaper** column is the thing React already gives you. Most of the
time it is `children` — passing a subtree down instead of passing the data a
subtree needs. Check that first; the pattern is what that answer becomes if it
stops holding.

## The smells worth hunting

| Smell                                                                                       | Costs you                                                          | Cheaper first                                             | Pattern                                                   |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------- | --------------------------------------------------------- |
| **Copy-pasted hook trio** — same `useState` + `useEffect` + cleanup block in several files  | a fix to the cleanup lands in one copy; the others still leak      | a plain function — most of it probably isn't stateful     | [Custom Hook](custom-hook.md)                             |
| **Prop drilling** — a value threaded through three components that never read it            | every intermediate re-renders and re-types on each change          | pass `children`, so the middle never sees the value       | [Provider](provider.md)                                   |
| **Config-prop explosion** — `<Modal title footer showClose renderHeader onHeaderClick …>`   | each new layout adds a prop nobody else uses; the combinations rot | `children` plus named slot props                          | [Compound Components](compound-components.md)             |
| **Forked skin** — the same logic behind two visual variants, or `variant`/`isMobile` in JSX | a behaviour fix has to be made twice and usually isn't             | extract only the hook; leave both JSX trees alone         | [Headless Component](headless.md)                         |
| **Fetch-and-render** — one component fetches, transforms and renders                        | no test without mocking the network; no reuse with data you have   | take the data as a prop, fetch in the route or loader     | [Container / Presentational](container-presentational.md) |
| **Mirrored state** — a parent copying a child's state into its own via `useEffect`          | two sources of truth, one render behind; the classic stale bug     | derive it during render, or lift it once and pass it down | [Control Props](control-props.md)                         |
| **Blank screen** — one throwing render takes the whole app; `try/catch` around JSX          | any render bug is a total outage instead of a broken panel         | nothing — a boundary is the floor, not an optimisation    | [Error Boundary](error-boundary.md)                       |
| **z-index war** — a modal or tooltip clipped by an ancestor's `overflow` or `transform`     | escalating z-index that never settles; content cut off             | native `<dialog>`, or the `popover` attribute             | [Portal](portal.md)                                       |
| **Hand-wired props** — every call site spelling out the same `aria-*`, `id`, `onKeyDown`    | accessibility is correct wherever someone remembered it            | export one plain props object and spread it               | [Props Getters](props-getters.md)                         |

A smell not on this list is still a finding. Report it with its cost and no
pattern rather than forcing it into the nearest row.

## The other twelve from the catalogue

Named so nothing is silently unmappable. These are the rest of the commonly
listed React patterns, and none of them earns a write-up — either because it is
a principle rather than a refactor, or because something else on this page
replaced it.

| Pattern                         | In a React codebase                                                                                                                                          |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Component Composition**       | not a pattern to propose — it is the **cheaper** column of half this table. Say "pass `children`", not "apply composition".                                  |
| **Higher-Order Component**      | a custom hook, unless the code is class components. Wrapping to inject props costs a tree layer and erases the display name.                                 |
| **Render Props**                | a custom hook. Kept alive only where the consumer must control _where_ the render happens — which is a slot prop, and that's Compound Components.            |
| **Atomic Design**               | a directory naming convention, not a refactor. Proposing it means moving every file for no behaviour change; leave it to whoever owns the design system.     |
| **Dependency Injection**        | Provider is React's DI. If the reason is testability, the smaller answer is passing the dependency as a prop.                                                |
| **MVVM**                        | a custom hook is the ViewModel and the component is the View. Naming the layers adds nothing the hook boundary didn't already draw.                          |
| **Separation of Concerns**      | already the point of Container/Presentational and Custom Hook. As a finding on its own it names no cost, so it isn't one.                                    |
| **DRY**                         | assessment 1 is the honest JSCPD read and assessment 3 argues for deletion. Two components that look alike and change for different reasons should stay two. |
| **SOLID**                       | written for class hierarchies. The parts that survive here — one reason to change, depend on the prop not the module — are already the rows above.           |
| **KISS**                        | assessment 3's entire job. Repeating it as a design finding proposes nothing actionable.                                                                     |
| **Stable Dependency Principle** | `qoq bump` territory, not a refactor. A volatile dependency is a package decision, not a shape.                                                              |
| **Clean Architecture**          | a backend layering scheme. Ports, adapters and use-case classes around a component tree buy indirection and no test that wasn't already possible.            |

## What the caller does with a finding

Same as the base index: `qoq-designer` names the pattern and its file and never
opens it. The caller reads that one file — intent, the React-idiomatic shape, a
worked before/after, the cost including what it does to re-renders, and when the
pattern is the wrong call — and takes it to the user with the code in front of
them.
