# Error Boundary

A component that catches a throw from anywhere in the subtree below it during
render, and shows a fallback instead of unmounting the whole tree. It is the
only way to contain a render error in React, and it is still the one thing that
requires a class component.

## The smell it answers

One bad render blanks the app. A `user.name` on a user that came back `null`, a
`.map` on something the API returned as an object — and React unmounts
everything, because a render error with no boundary above it takes the root.

The related tell is a `try/catch` wrapped around JSX, which never fires: the
throw happens when React renders the element, not when you create it.

And the third: exactly one boundary, at the app root. Better than none, but its
fallback can only be a whole-page error, so a broken sidebar takes the page with
it.

## The cheaper thing first

**There isn't one, and that's the point.** Every other pattern here is worth
weighing against doing nothing; this one is the floor. What _is_ cheaper is
being deliberate about placement rather than adding a boundary per component:

- one at the root, so nothing shows a blank page
- one per independently useful region — a route, a dashboard panel, a widget
  that renders third-party or user-supplied content

Also check what the framework already provides. Next.js's `error.tsx` and React
Router's `errorElement` are boundaries with routing wired in, and hand-rolling
one next to them means two error paths.

## The React shape

### Before

```tsx
<Dashboard>
  <RevenueChart /> {/* throws on a malformed series ⇒ whole app unmounts */}
  <RecentOrders />
</Dashboard>
```

### After

```tsx
type Props = { fallback: (error: Error, retry: () => void) => ReactNode; children: ReactNode };

export class ErrorBoundary extends Component<Props, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportError(error, { componentStack: info.componentStack });
  }

  render() {
    const { error } = this.state;
    return error
      ? this.props.fallback(error, () => this.setState({ error: null }))
      : this.props.children;
  }
}
```

```tsx
<Dashboard>
  <ErrorBoundary fallback={(e, retry) => <PanelError error={e} onRetry={retry} />}>
    <RevenueChart />
  </ErrorBoundary>
  <RecentOrders />
</Dashboard>
```

Three details carry the weight. `getDerivedStateFromError` sets the fallback
state and `componentDidCatch` does the reporting — splitting them keeps the
side effect out of the render phase. The retry callback matters because a
boundary without one is a dead end: the user's only recovery is a page reload.
And the boundary wraps the panel, not the dashboard, which is what makes the
rest of the page survive.

## What it costs

A class component in a codebase that otherwise has none, or a dependency
(`react-error-boundary`) for the hook-shaped wrapper around the same thing.

The bigger cost is silence. A boundary that catches and renders a friendly
message without reporting turns a loud crash into an error nobody hears about —
which is why `componentDidCatch` sending to your error service is part of the
pattern and not an extra.

Boundaries also don't reset on their own. After an error, that subtree stays in
the fallback until something changes its `key` or the retry runs, so a boundary
around a route needs to reset on navigation or the next page renders the old
error.

## When it's the wrong call

- **Event handlers.** A throw in `onClick` isn't a render error; boundaries never
  see it. Use `try/catch`.
- **Async code and timers.** Same — the throw happens outside React's render.
  A rejected promise needs to become state that the render reads.
- **Server-side rendering.** Boundaries don't catch during SSR in the way they do
  on the client; the framework's own error handling owns that path.
- **As flow control.** Throwing to trigger a fallback deliberately makes the
  control flow invisible. Return the error state and render it.

## Further reading

<https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary>
— the official write-up, including why there is still no hook version.
