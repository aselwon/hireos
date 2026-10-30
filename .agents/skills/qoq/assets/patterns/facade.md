# Facade

One entry point in front of a subsystem, so callers state intent instead of
reproducing a sequence.

## The smell it answers

Every caller wiring the same four modules in the same fixed order, where the
order is folklore. Open the connection, begin the transaction, build the mapper,
run, commit, close — repeated in eight places, subtly different in two, and the
one that forgot the rollback is a bug nobody has hit yet.

The tell: a chunk of setup you can grep for verbatim, appearing in files that
otherwise have nothing in common.

## The cheaper thing first

An exported function. That is all a facade is:

```ts
export async function publishPost(id: string) {
  const post = await repo.load(id);
  const rendered = await renderer.render(post);
  await cdn.upload(post.slug, rendered);
  await search.index(post);
  await repo.markPublished(id);
}
```

In a TypeScript project the module system is already doing most of this work: an
`index.ts` that re-exports the two functions outsiders need, and keeps the other
nine internal, is a facade with no code in it at all.

## The TypeScript shape

### Before

```ts
// in the admin route, and the CLI, and the cron job
const post = await repo.load(id);
const rendered = await renderer.render(post, { theme: cfg.theme });
await cdn.upload(post.slug, rendered);
await search.index(post); // the cron job forgets this one
await repo.markPublished(id);
```

### After

```ts
// publishing/index.ts
export { publishPost } from './publish';
// renderer, cdn client, and repo stay internal — not exported

// callers
await publishPost(id);
```

## What it costs

A layer. Callers with a legitimately unusual need must either go around the
facade — at which point it stops being the single entry point and its guarantees
weaken — or the facade grows options until it is a worse version of the subsystem
it wraps.

Watch for that second failure: `publishPost(id, { skipIndex: true, dryRun: true,
theme })` is a facade turning back into the thing it replaced.

## When it's the wrong call

- **One caller.** Its own function is the facade.
- **Callers need genuinely different subsets.** Two or three narrow functions
  beat one wide one with flags.
- **You're wrapping a single module.** That's a rename, not a pattern.

## Further reading

<https://refactoring.guru/design-patterns/facade>.
