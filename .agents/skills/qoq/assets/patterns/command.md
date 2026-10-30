# Command

Turn an action into a value. Once it's a value it can be queued, logged,
retried, undone, replayed, sent over a wire, or tested without performing it.

## The smell it answers

Behaviour that needs any of undo, audit, replay, or queueing, implemented as
direct calls. The undo stack stores ad-hoc snapshots; the audit log is a
`log.info` next to each mutation and already misses two paths; retry means
calling the function again and hoping it was idempotent.

The tell: a feature request for "undo" or "show me what changed" that has no
obvious place to hook into.

## The cheaper thing first

A tagged union and one reducer:

```ts
type Action =
  | { type: 'rename'; id: string; from: string; to: string }
  | { type: 'delete'; id: string; snapshot: Item };

const apply = (state: State, a: Action): State => {
  switch (a.type) {
    case 'rename':
      return { ...state, items: rename(state.items, a.id, a.to) };
    case 'delete':
      return { ...state, items: remove(state.items, a.id) };
  }
};
```

This is Command, in the shape every Redux-style codebase already uses. The
action carries what it needs to be inverted (`from`, `snapshot`), the log is the
action array, and replay is a `reduce`.

## The TypeScript shape

### Before

```ts
function renameItem(id: string, name: string) {
  const item = store.get(id);
  store.set(id, { ...item, name });
  auditLog.push(`renamed ${id}`); // a string, unparseable, and not undoable
}
```

### After

```ts
type Action =
  | { type: 'rename'; id: string; from: string; to: string }
  | { type: 'delete'; id: string; snapshot: Item };

const invert = (a: Action): Action =>
  a.type === 'rename' ? { ...a, from: a.to, to: a.from } : { type: 'restore', item: a.snapshot };

const history: Action[] = [];

export function dispatch(a: Action) {
  state = apply(state, a);
  history.push(a);
}

export function undo() {
  const last = history.pop();
  if (last) state = apply(state, invert(last));
}
```

Undo, audit, and replay all fall out of the same representation, and `invert`
fails to compile when a new action type has no inverse — which is exactly the
bug you would otherwise ship.

## What it costs

Indirection between wanting something and it happening, and a second
representation of every action that must stay in step with what actually
performs it. Serializability constrains what an action may carry: functions,
class instances, and closures stop working the moment you persist the log.

## When it's the wrong call

- **Nothing needs undo, audit, replay, or a queue.** Then this is a plain
  function call wearing a costume — the exact ceremony assessment 3 deletes.
- **The action isn't reversible in the world.** An email that has been sent has
  been sent; a compensating action is a different design, not an `invert`.
- **A framework already dispatches actions.** Use its shape rather than a second
  one beside it.

## Further reading

<https://refactoring.guru/design-patterns/command>.
