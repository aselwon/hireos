# Factory

Covers both GoF factory patterns, because the distinction between them —
Factory Method's subclass-per-product and Abstract Factory's family-of-products —
is an inheritance distinction, and TypeScript codebases rarely have the class
hierarchy that makes it real. What survives is the useful part: **callers should
name what they want, not construct it.**

## The smell it answers

A `switch` that returns different concrete instances, copied wherever an
instance is needed. Every caller ends up importing every subtype and knowing its
constructor arguments — so a change to one constructor is a change everywhere,
and a new variant means finding all the switches.

Also: construction that can fail, spread across call sites that each handle the
failure differently, or not at all.

## The cheaper thing first

A discriminated union and one function:

```ts
type Storage = { kind: 's3'; bucket: string } | { kind: 'local'; dir: string };

export function openStorage(config: Storage) {
  return config.kind === 's3' ? s3Client(config.bucket) : localClient(config.dir);
}
```

One exported function, one place that knows the constructors, and the union
makes the config shapes exhaustive. No class, no registry, no `AbstractFactory`.

## The TypeScript shape

### Before

```ts
// in the uploader
const client =
  cfg.storage === 's3' ? new S3Client(cfg.bucket, cfg.region) : new LocalClient(cfg.dir);

// in the report job, again
const client =
  cfg.storage === 's3' ? new S3Client(cfg.bucket, cfg.region) : new LocalClient(cfg.dir);
```

### After

```ts
export interface Storage {
  put(key: string, body: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
}

export function createStorage(cfg: Config): Storage {
  switch (cfg.storage) {
    case 's3':
      return new S3Client(cfg.bucket, cfg.region);
    case 'local':
      return new LocalClient(cfg.dir);
  }
}
```

The `switch` still exists — it moved, and there is now exactly one of it. That
is the entire win, and it is worth having; the version where it is a class with
a `create` method is the same code with a `new` in front of it.

## What it costs

The return type becomes an interface, so call sites lose the concrete type and
whatever it offered beyond the interface. That is usually the point, and
occasionally an annoyance worth a narrower factory instead.

## When it's the wrong call

- **One product type.** `createFoo()` that always returns a `Foo` is a
  constructor with extra steps.
- **The variants aren't substitutable.** If callers branch on which one they
  got, the factory bought nothing — they still know the subtypes.
- **A framework already does it.** DI containers, module registries, and test
  doubles usually make a hand-rolled factory redundant.

## Further reading

<https://refactoring.guru/design-patterns/factory-method> and
<https://refactoring.guru/design-patterns/abstract-factory>.
