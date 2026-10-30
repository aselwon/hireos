# State

An object behaves differently depending on which of several states it is in, and
the transitions between them are explicit and finite.

In TypeScript this is a discriminated union, and it is one of the clearest wins
the type system offers — the compiler makes invalid states unrepresentable rather
than merely unlikely.

## The smell it answers

Boolean state soup: `isLoading`, `hasError`, `data`, `isEmpty` as four
independent fields, guarded by `if (!isLoading && !hasError && data)` at every
read. Four booleans are sixteen combinations, of which perhaps four are real. The
other twelve compile fine, and the bug report is a screenshot of a spinner over
an error message.

Also: a `status` string field paired with data that is only meaningful for some
statuses — `error` populated while `status === 'success'`.

## The cheaper thing first

A discriminated union. Not a class per state, not a transition table — a union:

```ts
type Request<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'failed'; error: Error };
```

Sixteen combinations become four, and `data` cannot be read without narrowing to
`'success'` first. The compiler now enforces what the comments used to ask for.

## The TypeScript shape

### Before

```ts
type State<T> = {
  isLoading: boolean;
  hasError: boolean;
  error?: Error;
  data?: T;
};

function render(s: State<Report>) {
  if (s.isLoading) return spinner();
  if (s.hasError) return errorView(s.error!); // the ! is the smell
  return table(s.data!); // and again
}
```

### After

```ts
function render(s: Request<Report>) {
  switch (s.status) {
    case 'idle':
      return placeholder();
    case 'loading':
      return spinner();
    case 'failed':
      return errorView(s.error); // narrowed, no assertion
    case 'success':
      return table(s.data);
  }
}
```

Transitions become a function, and the illegal ones simply have no case:

```ts
const next = <T>(s: Request<T>, e: Event<T>): Request<T> => {
  switch (s.status) {
    case 'idle':
      return e.type === 'fetch' ? { status: 'loading' } : s;
    case 'loading':
      return e.type === 'ok'
        ? { status: 'success', data: e.data }
        : e.type === 'err'
          ? { status: 'failed', error: e.error }
          : s;
    default:
      return s;
  }
};
```

Add a `case` to the union and every `switch` over it fails to compile until
handled — provided the function has an explicit return type, or you end with an
`assertNever(s)` default. Without one of those, TypeScript widens and you lose
the exhaustiveness check that is the entire point.

## What it costs

Every read site narrows before it can touch the payload, which is more ceremony
than reading `s.data` — and is precisely the ceremony that was missing. Shared
fields must either be repeated in each variant or hoisted into a wrapper object,
and neither is free.

## When it's the wrong call

- **Two states with no payload.** A boolean is a two-state union already.
- **The states share every field.** Then the tag is data, not state.
- **The transitions are unconstrained.** If anything can follow anything, there
  is no state machine to model — you have a mode flag.

The GoF class-per-state form is worth it only when states carry substantial
behaviour and shared implementation. In application code, that is rare; the union
covers it.

## Further reading

<https://refactoring.guru/design-patterns/state>.
