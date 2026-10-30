# Custom Hook

Stateful logic pulled out of a component and given a name, so the components
that need it call one function instead of re-assembling the same state, effect
and cleanup. It is React's unit of logic reuse — the thing HOCs and render props
were both trying to be.

A hook is a plain function that happens to call other hooks. The `use` prefix
isn't decoration: it's what tells React and the lint rule that the rules of
hooks apply inside.

## The smell it answers

The same three-part block in several components: a `useState`, a `useEffect`
that subscribes or fetches, and a cleanup. Someone fixes the cleanup in one of
them — the listener that was never removed, the abort that was never wired — and
the other four go on leaking, because nothing connects them.

Or the single component that has two hundred lines of logic above the `return`,
so the JSX is off the bottom of the screen and the logic can't be tested without
rendering it.

## The cheaper thing first

**Check whether it needs to be a hook at all.** Most of what gets extracted into
one is a pure transform that never touches React:

```ts
export const visibleRows = (rows: Row[], filter: Filter) => rows.filter((r) => matches(r, filter));
```

A plain function is testable without a renderer, callable from a loader or a
worker, and can't accidentally add a render. Extract the pure part first and see
what's left — often the leftover is two lines that belong in the component.

For state that lives outside React — a media query, an element's size, a store —
`useSyncExternalStore` is the built-in, and it gets tearing and SSR right in a
way a hand-written `useState` + `useEffect` pair does not.

## The React shape

### Before

```tsx
function UserPanel({ id }: { id: string }) {
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    fetchUser(id, ac.signal).then(setUser).catch(setError);
    return () => ac.abort();
  }, [id]);

  if (error) return <Error error={error} />;
  return user ? <Profile user={user} /> : <Spinner />;
}

// …the same fifteen lines in OrderPanel, InvoicePanel, PlanPanel
```

### After

```ts
type Async<T> = { data: T | null; error: Error | null };

export function useResource<T>(load: (signal: AbortSignal) => Promise<T>, key: string): Async<T> {
  const [state, setState] = useState<Async<T>>({ data: null, error: null });

  useEffect(() => {
    const ac = new AbortController();
    load(ac.signal)
      .then((data) => setState({ data, error: null }))
      .catch((error) => !ac.signal.aborted && setState({ data: null, error }));
    return () => ac.abort();
  }, [key]);

  return state;
}
```

```tsx
function UserPanel({ id }: { id: string }) {
  const { data: user, error } = useResource((s) => fetchUser(id, s), id);
  if (error) return <Error error={error} />;
  return user ? <Profile user={user} /> : <Spinner />;
}
```

The `key` parameter is the part that pays. The effect's dependency array can't
see inside the closure you passed it, so the identity of the thing being loaded
has to be handed over explicitly — otherwise the hook refetches on every render
or never refetches at all, and both bugs look like the code working.

## What it costs

Indirection at the call site: the state a component renders is no longer visible
in that component. React DevTools shows hook values without names, so debugging
a five-hook component means counting positions.

The real cost is that a hook is still tied to the render cycle. Everything
inside it re-runs when its host re-renders, and a hook that returns a fresh
object each call re-renders every consumer that reads it. A plain function has
neither problem, which is why it's the first thing to try.

## When it's the wrong call

- **One consumer.** Logic used by exactly one component belongs in it. The hook
  is a boundary you'd cross to read what the component does.
- **It doesn't call a hook.** Then it's a function; don't prefix it with `use`
  and don't drag it into the render cycle.
- **A library already owns it.** Data fetching, form state and routing all have
  hooks that handle cache, retry, and race conditions you will re-derive badly.
- **The extraction is the whole component.** A hook that returns everything the
  JSX renders has moved the code, not separated anything — that's the
  [Container / Presentational](container-presentational.md) question instead.

## Further reading

<https://react.dev/learn/reusing-logic-with-custom-hooks> — including the
section on when _not_ to, which is unusually direct for framework docs.
