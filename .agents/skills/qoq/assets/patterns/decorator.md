# Decorator

Add behaviour around something without changing it, and stack those additions
freely. Logging, retry, caching, timing, auth — the concerns that apply to many
operations and belong to none of them.

Note the name collision: TypeScript's `@decorator` syntax is a different feature.
This pattern is about composition, and in TS it is almost always a higher-order
function.

## The smell it answers

The same cross-cutting code hand-woven into every call. Every fetch has its own
try/catch/retry; every handler starts with the same four log lines; caching was
added to three of the nine functions that needed it. Adding a concern means
editing every call site, and the ones that get missed are found in production.

## The cheaper thing first

A higher-order function:

```ts
const withRetry =
  <A extends unknown[], R>(fn: (...args: A) => Promise<R>, times = 3) =>
  async (...args: A): Promise<R> => {
    for (let i = 1; ; i++) {
      try {
        return await fn(...args);
      } catch (e) {
        if (i >= times) throw e;
      }
    }
  };
```

`withRetry(withLogging(fetchUser))` is the pattern, fully. The generic signature
is what makes it usable everywhere — it preserves the wrapped function's
arguments and return type instead of collapsing them to `any`.

## The TypeScript shape

### Before

```ts
async function fetchUser(id: string) {
  log.info('fetchUser', { id });
  const started = Date.now();
  for (let i = 0; i < 3; i++) {
    try {
      const r = await http.get(`/users/${id}`);
      metrics.timing('fetchUser', Date.now() - started);
      return r;
    } catch (e) {
      if (i === 2) throw e;
    }
  }
}
// …and the same twenty lines in fetchOrder, fetchInvoice, fetchPlan
```

### After

```ts
const fetchUser = withLogging(
  'fetchUser',
  withTiming(withRetry((id: string) => http.get(`/users/${id}`)))
);
```

Or, when the stack repeats, name the stack once:

```ts
const guarded = <A extends unknown[], R>(name: string, fn: (...a: A) => Promise<R>) =>
  withLogging(name, withTiming(withRetry(fn)));

export const fetchUser = guarded('fetchUser', (id: string) => http.get(`/users/${id}`));
```

## What it costs

Stack traces get deeper and less obvious, and debugging steps through wrappers
before reaching the code you meant to read. Order becomes significant and
invisible — retry inside timing measures one attempt, outside it measures all
three, and nothing in the types says which you wanted.

## When it's the wrong call

- **One thing to wrap.** Put the behaviour in it.
- **The wrapper needs to know what it wraps.** That coupling means it isn't a
  cross-cutting concern; it's part of the operation.
- **The platform already offers it.** `AbortSignal.timeout`, an HTTP client's
  own retry config, a framework's middleware — use those before writing yours.

## Further reading

<https://refactoring.guru/design-patterns/decorator>.
