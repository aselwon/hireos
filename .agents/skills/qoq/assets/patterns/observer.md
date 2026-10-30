# Observer

One thing happens; an open-ended set of others need to know. The thing that
happened doesn't know who they are.

## The smell it answers

Manual fan-out: an action calling five unrelated side effects inline. `createUser`
writes the row, sends the welcome email, adds the analytics event, warms the
cache, and posts to Slack. Now it depends on all five, cannot be tested without
all five, and the sixth requirement means editing it again.

The tell is a function whose name describes one thing and whose body imports
five subsystems.

## The cheaper thing first

An array of callbacks:

```ts
type UserCreated = (user: User) => void;
const listeners: UserCreated[] = [];

export const onUserCreated = (fn: UserCreated) => listeners.push(fn);
export const userCreated = (user: User) => listeners.forEach((fn) => fn(user));
```

Or the platform's own: `EventTarget` in browsers and Node, `EventEmitter` in
Node. Both are Observer, already written, already tested, already typed.

## The TypeScript shape

Typed events are the part worth doing by hand, because the built-ins are weak
here — `EventEmitter`'s payloads are `any[]` unless you fight it.

### Before

```ts
async function createUser(input: NewUser) {
  const user = await db.users.insert(input);
  await mailer.send('welcome', user.email);
  analytics.track('user_created', { id: user.id });
  await cache.warm(user.id);
  await slack.post(`#signups`, user.email);
  return user;
}
```

### After

```ts
type Events = {
  'user.created': User;
  'order.paid': Order;
};

const handlers: { [K in keyof Events]?: Array<(p: Events[K]) => void | Promise<void>> } = {};

export const on = <K extends keyof Events>(k: K, fn: (p: Events[K]) => void | Promise<void>) =>
  (handlers[k] ??= []).push(fn);

export const emit = async <K extends keyof Events>(k: K, payload: Events[K]) => {
  await Promise.all((handlers[k] ?? []).map((fn) => fn(payload)));
};

// the action shrinks to what its name says
async function createUser(input: NewUser) {
  const user = await db.users.insert(input);
  await emit('user.created', user);
  return user;
}
```

The `Events` map is what makes this worth having: `emit('user.created', order)`
does not compile.

## What it costs

**The call graph disappears.** You can no longer answer "what happens when a user
is created" by reading `createUser` — you grep for the event name and hope every
subscription is registered somewhere greppable. That is a permanent, real cost
paid by everyone who reads the code afterwards.

Error handling and ordering get murky. Does a failed listener fail the action?
Do listeners run in registration order? The version above says yes and no
respectively, and neither is obviously right.

## When it's the wrong call

- **Fewer than three listeners, and stable.** Call them. Explicit calls that
  read top to bottom beat indirection you have to grep for.
- **The caller needs the results.** Observers return nothing by design.
- **The order matters.** You wanted a pipeline, not a broadcast.
- **It's really a queue.** Retries, durability, and back-pressure are a job
  queue's problem; an in-process emitter drops work on restart.

## Further reading

<https://refactoring.guru/design-patterns/observer>.
