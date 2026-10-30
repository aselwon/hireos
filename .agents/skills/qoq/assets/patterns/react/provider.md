# Provider

One value made readable by an entire subtree without every component in between
being told about it. React's Context is the mechanism; Provider is the shape you
build around it so consumers get a hook and a real error instead of `undefined`.

## The smell it answers

Prop drilling: a value passed through three or four components that don't use
it, purely to reach the one that does. Adding a field to it edits every layer,
and the intermediate components' prop types now describe things they never read.

The tell that it's real rather than annoying is depth plus fan-out — the value
reaches several leaves down several branches. Two levels to one consumer is not
a smell.

## The cheaper thing first

**Pass `children`.** Prop drilling usually means the tree was built inside out.
Render the leaf where the data already is, and hand the subtree down instead:

```tsx
// before: Layout needs `user` only to give it to Sidebar
<Layout user={user} />

// after: Layout never hears about user
<Layout sidebar={<Sidebar user={user} />} />
```

Nothing in between re-renders when `user` changes, no context exists to be read
in a test, and the type of `Layout` shrinks. Try this before any context: it
removes far more drilling than people expect, because the drilled prop is
usually needed at one place under a generic shell.

## The React shape

### Before

```tsx
<App theme={theme}>
  <Page theme={theme}>
    <Toolbar theme={theme}>
      <Button theme={theme} />
```

### After

```tsx
const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({ theme, children }: { theme: Theme; children: ReactNode }) {
  const value = useMemo(() => ({ ...theme, toggle: () => setTheme(next(theme)) }), [theme]);
  return <ThemeContext value={value}>{children}</ThemeContext>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
```

Two things carry their weight here. The `null` default plus the throw turns
"rendered outside the provider" into a message at the call site rather than a
`cannot read property of undefined` three components away. And the `useMemo` is
not optional: a value object rebuilt every render re-renders every consumer in
the subtree, which is the failure that gets Context blamed for being slow.

## What it costs

Every consumer re-renders when the value changes — all of them, regardless of
which field they read. That's why a context holding several unrelated concerns
is worse than several contexts: split by update frequency, not by topic. Theme
and current user rarely change; a mouse position changes constantly and does not
belong in the same provider.

It also makes the dependency invisible. A component that reads context has a
requirement its props don't state, so a test that renders it in isolation fails
until someone finds the provider it needed.

## When it's the wrong call

- **Two levels deep.** Pass the prop.
- **Global mutable app state.** Context distributes a value; it isn't a store.
  Frequent writes plus many readers is what a state library is for.
- **As dependency injection everywhere.** A provider per service turns the app
  root into a wrapper stack and every test into provider assembly. Pass the
  dependency as a prop for the components that need one.
- **The value changes on every render.** Then the context re-renders the subtree
  continuously and the drilling it replaced was cheaper.

## Further reading

<https://react.dev/learn/passing-data-deeply-with-context> — read its "before
you use context" list first; it is the cheaper column above, in more detail.
