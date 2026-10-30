# Control Props

Let a component own its state by default, and let a parent take that state over
when it needs to — the `value` + `onChange` contract that `<input>` has had
since the beginning. One component, two modes: uncontrolled when you pass
nothing, controlled when you pass both.

## The smell it answers

State mirrored across a boundary. The parent keeps a copy of the child's state
and an effect to keep them in step:

```tsx
useEffect(() => setLocalValue(value), [value]);
```

Now there are two sources of truth, the copy is one render behind, and every bug
report is "it shows the old value for a moment". Its variants are just as
common: an imperative `ref.current.reset()` to reach into a child, or a
`key={version}` bump to force a remount because there was no other way to make
the child forget.

## The cheaper thing first

**Ask whether the state should live in one place only.** Most mirrored state is
a decision that was never made:

- The parent needs the value → lift it. The child takes `value` and `onChange`
  and holds nothing.
- The parent doesn't → leave it in the child and delete the copy.
- The parent needs something _derived_ from it → compute during render. `const
isValid = value.length > 3` needs no state and no effect.

Two modes is genuinely more code than one, so only build it when the same
component has real callers on both sides — a shared component in a library, or
one used both in a form and standalone.

## The React shape

### Before

```tsx
function Parent() {
  const [query, setQuery] = useState('');
  return <Search value={query} onChange={setQuery} />;
}

function Search({ value, onChange }: Props) {
  const [internal, setInternal] = useState(value);
  useEffect(() => setInternal(value), [value]); // the mirror
  return (
    <input
      value={internal}
      onChange={(e) => {
        setInternal(e.target.value);
        onChange(e.target.value);
      }}
    />
  );
}
```

### After

```tsx
type Props = {
  value?: string; // present ⇒ controlled
  defaultValue?: string; // used only when uncontrolled
  onChange?: (next: string) => void;
};

export function Search({ value, defaultValue = '', onChange }: Props) {
  const [internal, setInternal] = useState(defaultValue);
  const isControlled = value !== undefined;
  const current = isControlled ? value : internal;

  const set = (next: string) => {
    if (!isControlled) setInternal(next);
    onChange?.(next);
  };

  return <input value={current} onChange={(e) => set(e.target.value)} />;
}
```

The state is never duplicated: when controlled, `internal` is dead and the
parent's value renders directly. `onChange` fires in both modes, so a caller can
observe without taking over. Whether a component is controlled must not change
across its lifetime — deciding once from `value !== undefined` is what keeps
that true, and it is worth a dev-mode warning if a caller flips it.

## What it costs

Every read of the state goes through the `isControlled` branch, and every write
has to remember to notify. Miss one and the controlled mode desyncs in exactly
the way this pattern was meant to prevent.

It also doubles what the component means: two modes, two sets of edge cases, and
a props type where the relationship between `value` and `defaultValue` is a
comment rather than something the compiler checks.

## When it's the wrong call

- **All callers control it.** Take `value` and `onChange`, required, and hold no
  state. That's a simpler and better component.
- **No caller controls it.** Keep it internal and expose nothing.
- **A form library owns it.** Its register/field API already solved this;
  a second control layer inside it fights the first.
- **The "sync" is really derivation.** Compute it during render and delete both
  the state and the effect.

## Further reading

<https://react.dev/learn/sharing-state-between-components> for the lift-it-up
answer, which is the one to take first.
