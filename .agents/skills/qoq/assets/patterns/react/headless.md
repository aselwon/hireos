# Headless Component

Behaviour, state and accessibility with no markup and no styles — shipped as a
hook (or a component that renders only `children`), so the consumer owns every
element. A combobox that knows about keyboard navigation, focus and `aria-*` and
renders nothing.

## The smell it answers

The same behaviour duplicated behind two skins. There's a `DesktopDropdown` and a
`MobileDropdown`, or `variant="compact"` branching the JSX halfway down, and both
copies contain the same keyboard handling and open/close logic. A fix to the
Escape-key behaviour goes into one of them.

Its cousin: a shared component that grew styling props — `size`, `density`,
`theme`, `asCard` — because two teams needed the same behaviour and different
appearance, and props were the only seam available.

## The cheaper thing first

**Extract only the hook and leave both components alone.** This is the whole
pattern in the common case:

```ts
export function useDisclosure(initial = false) {
  const [open, setOpen] = useState(initial);
  return {
    open,
    toggle: useCallback(() => setOpen((o) => !o), []),
    close: useCallback(() => setOpen(false), []),
  };
}
```

Two components, one hook, zero shared markup. Nothing else about "headless" is
required unless the behaviour also owns DOM concerns — focus, keyboard, ARIA
relationships — which is when the returned props start to matter and the write-up
below applies.

## The React shape

### Before

```tsx
function DesktopMenu({ items }: Props) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') setIndex((i) => Math.min(i + 1, items.length - 1));
    if (e.key === 'ArrowUp') setIndex((i) => Math.max(i - 1, 0));
    if (e.key === 'Escape') setOpen(false);
  };
  return (
    <div className="menu-desktop" onKeyDown={onKeyDown}>
      …
    </div>
  );
}

// MobileMenu: the same twenty lines, different className and element order
```

### After

```ts
export function useMenu<T>(items: T[]) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') setIndex((i) => Math.min(i + 1, items.length - 1));
    if (e.key === 'ArrowUp') setIndex((i) => Math.max(i - 1, 0));
    if (e.key === 'Escape') setOpen(false);
  };

  return {
    open,
    activeIndex: index,
    triggerProps: { 'aria-expanded': open, onClick: () => setOpen((o) => !o) },
    listProps: { role: 'menu', onKeyDown, tabIndex: -1 },
    itemProps: (i: number) => ({ role: 'menuitem', 'aria-current': i === index }),
  };
}
```

```tsx
function DesktopMenu({ items }: Props) {
  const { open, listProps, triggerProps, itemProps } = useMenu(items);
  return (
    <div className="menu-desktop">
      <button {...triggerProps}>Menu</button>
      {open && (
        <ul {...listProps}>
          {items.map((it, i) => (
            <li key={it.id} {...itemProps(i)}>
              {it.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

The hook returns prop objects rather than raw handlers — see
[Props Getters](props-getters.md), which is the half of this pattern that
survives on its own. Both menus now get the same keyboard behaviour and the same
ARIA, and neither is constrained in what it renders.

## What it costs

Every consumer has to render correctly, and now they can render wrongly: forget
to spread `listProps` and the keyboard support is silently gone, with no type
error. You've traded a component that could only look one way for a contract
nothing enforces.

It also spreads the markup. Three consumers means three near-identical trees, so
if they never actually diverge you've paid for flexibility nobody used — the
thing assessment 3 exists to delete.

## When it's the wrong call

- **One consumer, one look.** Keep the component.
- **The variants differ in behaviour, not appearance.** Then the shared hook is a
  fiction and you'll add flags to it until it's the switch you started with.
- **A headless library already covers it.** Combobox, dialog and menu semantics
  are large and easy to get subtly wrong; don't re-derive them.
- **Simple components.** A styled button does not need a `useButton`.

## Further reading

<https://www.merrickchristensen.com/articles/headless-user-interface-components/>
— the original framing, still the clearest.
