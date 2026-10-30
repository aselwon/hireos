# Chain of Responsibility

A request travels along a sequence of handlers until one of them deals with it —
or all of them have had their say.

The version most TypeScript developers already know is middleware: Express,
Koa, and every HTTP framework since are this pattern.

## The smell it answers

A long if-chain of independent checks whose order is significant and undocumented.
Validation, authorization, rate limits, feature flags, request normalisation —
twelve conditions in one function, where inserting a thirteenth means reading all
twelve to find where it goes and what it may assume has already run.

The tell: a function that is nothing but guard clauses, and a comment saying
"this must run before the auth check".

## The cheaper thing first

An array, iterated:

```ts
type Check = (req: Request) => string | undefined; // a message means rejected

const checks: Check[] = [
  (r) => (r.token ? undefined : 'missing token'),
  (r) => (rateLimit.ok(r.ip) ? undefined : 'rate limited'),
  (r) => (r.body.length < MAX ? undefined : 'payload too large'),
];

const reject = (r: Request) =>
  checks.reduce<string | undefined>((found, c) => found ?? c(r), undefined);
```

The order is the array literal — visible, editable, and reviewable in a diff. No
linked list, no `setNext`, no handler holding a reference to its successor.

## The TypeScript shape

For the middleware variant, where handlers wrap the rest of the chain rather than
just voting on it:

### Before

```ts
async function handle(req: Request) {
  if (!req.token) return unauthorized();
  const user = await verify(req.token);
  if (!user) return unauthorized();
  if (!rateLimit.ok(req.ip)) return tooMany();
  if (!user.features.includes('beta')) return notFound();
  log.info('request', { user: user.id });
  const started = Date.now();
  const res = await route(req, user);
  metrics.timing('request', Date.now() - started);
  return res;
}
```

### After

```ts
type Next = () => Promise<Response>;
type Middleware = (ctx: Ctx, next: Next) => Promise<Response>;

const chain = (mws: Middleware[], final: (ctx: Ctx) => Promise<Response>) => {
  const run = (i: number, ctx: Ctx): Promise<Response> =>
    i === mws.length ? final(ctx) : mws[i](ctx, () => run(i + 1, ctx));
  return (ctx: Ctx) => run(0, ctx);
};

export const handle = chain([authenticate, rateLimited, requireFeature('beta'), timed], route);
```

Each middleware now runs in isolation in a test, and the pipeline is one readable
line. Note that `next()` gives handlers control over _both_ sides — before and
after — which the vote-only array form does not.

## What it costs

Control flow becomes non-local: reading one handler no longer tells you what
happens next. A handler that forgets to call `next()` silently swallows the
request, and nothing in the types catches it — that is the classic middleware
bug and it survives here.

Debugging means stepping through the chain, and an exception's stack trace runs
through the runner rather than the handlers you care about.

## When it's the wrong call

- **The checks are order-independent and few.** Guard clauses read better than
  an array of closures.
- **Exactly one handler ever responds, chosen by a tag.** That's Strategy — a
  lookup, not a walk.
- **The framework already has middleware.** Register there instead of building a
  parallel pipeline beside it.

## Further reading

<https://refactoring.guru/design-patterns/chain-of-responsibility>.
