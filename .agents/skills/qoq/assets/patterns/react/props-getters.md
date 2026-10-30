# Props Getters

A hook returns a function that produces a ready-made props object, and consumers
spread it onto their own element. `{...getInputProps()}` instead of six
individually named handlers and ARIA attributes.

It's the half of [Headless Component](headless.md) that's worth having on its
own: it lets a hook own DOM correctness without owning the DOM.

## The smell it answers

The same wiring spelled out at every call site. Each consumer of a hook writes
its own `aria-expanded`, `aria-controls`, `id`, `role`, `onKeyDown` — and gets it
slightly wrong somewhere. Accessibility ends up correct wherever the last person
remembered, and adding an attribute to the contract means editing every consumer.

The tell is a hook whose return type has grown past about five members, most of
them destined for the same element.

## The cheaper thing first

**Return a plain object, not a function.** Nine times out of ten there's nothing
to parameterise:

```ts
return { open, triggerProps: { 'aria-expanded': open, onClick: toggle } };
```

Spread it, done. A getter function earns its parentheses only when it needs an
index or an item — `itemProps(i)` — or when it must compose with props the
consumer also passes, which is the case worked below.

## The React shape

### Before

```tsx
const { open, toggle, close, listId, onKeyDown } = useMenu();

<button
  aria-haspopup="menu"
  aria-expanded={open}
  aria-controls={listId}
  onClick={toggle}
  onKeyDown={onKeyDown}
>
  Menu
</button>;
// …and the same six lines wherever a menu is used, minus whichever was forgotten
```

### After

```ts
type Getter<T> = (userProps?: T) => T & Record<string, unknown>;

export function useMenu() {
  const [open, setOpen] = useState(false);
  const listId = useId();

  const getTriggerProps: Getter<ComponentProps<'button'>> = (props = {}) => ({
    ...props,
    'aria-haspopup': 'menu',
    'aria-expanded': open,
    'aria-controls': listId,
    onClick: (e) => {
      props.onClick?.(e);
      setOpen((o) => !o);
    },
  });

  return { open, listId, getTriggerProps };
}
```

```tsx
<button {...getTriggerProps({ className: 'btn', onClick: track })}>Menu</button>
```

The composition is the entire reason this is a function rather than an object.
The consumer's `onClick` runs _and_ the menu still toggles; a plain spread would
have silently dropped one of them depending on order. Spreading `...props` first
and overriding the attributes the hook owns is the ordering that matters — it
lets consumers add anything and prevents them from breaking the contract.

## What it costs

The props on an element become invisible. Reading the JSX no longer tells you
what's on that button, so debugging means opening the hook or the elements panel.

Merging is subtle and easy to get wrong: handlers need calling in a defined
order, `className` needs concatenating rather than replacing, and `style` needs
merging. Every one of those is a bug that only shows up for the consumer who
passed that particular prop.

And the getter returns a fresh object on every render, so a memoised child that
receives it re-renders regardless.

## When it's the wrong call

- **One or two props.** Return them by name; a getter for `onClick` is worse than
  `onClick`.
- **Nothing to merge and nothing to parameterise.** A plain props object is the
  same pattern with less machinery.
- **The hook renders the element itself.** Then it owns the props already; a
  getter would be an escape hatch nobody asked for.
- **The types can't be kept honest.** A getter typed as `Record<string, any>`
  hands consumers a contract the compiler won't check, which loses most of what
  it was for.

## Further reading

<https://kentcdodds.com/blog/prop-getters-vs-render-props> — the argument for
this over render props, from when that was the live question.
