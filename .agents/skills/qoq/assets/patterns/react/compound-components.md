# Compound Components

Several components that only make sense together, sharing state implicitly so
the consumer arranges them rather than configuring one component to arrange
itself. `<Select>`, `<Select.Option>` — the parent owns the state, the children
read it, and the markup between them is the consumer's business.

## The smell it answers

Config-prop explosion. One component grew a prop for every layout anyone needed:
`title`, `subtitle`, `footer`, `showClose`, `closeLabel`, `renderHeader`,
`headerAlign`. Each was added for one screen and is `undefined` everywhere else,
the render-function props are components in prop clothing, and nobody can answer
what happens when `renderHeader` and `title` are both passed.

The trajectory matters more than the count: a component whose last four commits
each added a prop is going to get a fifth.

## The cheaper thing first

**`children`, and named slots for the rest.** Most of these props exist to
inject markup, and markup is what `children` is:

```tsx
<Modal>
  <h2>Delete project?</h2>
  <p>This cannot be undone.</p>
</Modal>
```

When there are genuinely two or three places to fill, take them as `ReactNode`
props rather than render functions:

```tsx
<Modal header={<Title />} footer={<Actions />}>
  …
</Modal>
```

A `ReactNode` slot beats a `() => ReactNode` render prop whenever the slot
doesn't need the parent's state — less to type, and it doesn't re-run. Reach
past slots only when the children need state the parent owns, which is the one
thing slots can't do and this pattern can.

## The React shape

### Before

```tsx
<Tabs
  tabs={[
    { id: 'a', label: 'Details', badge: 3 },
    { id: 'b', label: 'History' },
  ]}
  activeId={active}
  onChange={setActive}
  renderPanel={(id) => panels[id]}
  align="start"
  showBadges
/>
```

### After

```tsx
const TabsContext = createContext<{ active: string; select: (id: string) => void } | null>(null);
const useTabs = () => {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error('<Tabs.*> must be used inside <Tabs>');
  return ctx;
};

export function Tabs({ defaultId, children }: { defaultId: string; children: ReactNode }) {
  const [active, select] = useState(defaultId);
  const value = useMemo(() => ({ active, select }), [active]);
  return <TabsContext value={value}>{children}</TabsContext>;
}

Tabs.Tab = function Tab({ id, children }: { id: string; children: ReactNode }) {
  const { active, select } = useTabs();
  return (
    <button role="tab" aria-selected={active === id} onClick={() => select(id)}>
      {children}
    </button>
  );
};

Tabs.Panel = function Panel({ id, children }: { id: string; children: ReactNode }) {
  return useTabs().active === id ? <div role="tabpanel">{children}</div> : null;
};
```

```tsx
<Tabs defaultId="a">
  <Tabs.Tab id="a">
    Details <Badge count={3} />
  </Tabs.Tab>
  <Tabs.Tab id="b">History</Tabs.Tab>
  <Tabs.Panel id="a">
    <Details />
  </Tabs.Panel>
</Tabs>
```

`align` and `showBadges` didn't move — they stopped existing. Alignment is the
consumer's CSS on their own wrapper, and the badge is markup they already know
how to write. That's the trade: the component keeps the state and the ARIA
wiring, and gives back every layout decision.

## What it costs

The contract stops being checkable. Nothing in the types stops `<Tabs.Panel>`
appearing outside `<Tabs>`, or a `<Tabs>` with no tabs — which is why the context
throw above is part of the pattern rather than a nicety. Consumers can also
assemble states you never intended, and will.

It's more code and more files for the same feature, and the state flow is now
implicit: reading `<Tabs.Tab>` doesn't show you where `active` comes from.

## When it's the wrong call

- **The component has one layout and always will.** Two props are two props.
- **The consumer is the app, not a library.** If every call site renders the same
  three children in the same order, you've moved that duplication outward.
- **Children don't need the parent's state.** Then slots are the answer and this
  is context for nothing.
- **Order or presence matters structurally.** Enforcing "exactly one panel per
  tab" through children means runtime checks; a data prop had it for free.

## Further reading

<https://www.smashingmagazine.com/2021/08/compound-components-react/> — and read
any headless UI library's source, which is this pattern at full size.
