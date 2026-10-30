# Builder

Construct something complicated in steps, so that no half-built version of it
ever escapes.

TypeScript changes the calculation here more than for any other creational
pattern: an options object plus the type system handles most of what Builder was
invented for, and does it at compile time.

## The smell it answers

Telescoping construction. A constructor with nine parameters, six optional, four
of them booleans. Call sites read `new Report(data, true, false, null, undefined,
'utc')` and nobody can say what the third argument means without opening the
definition.

Or worse: an object assembled field by field across twenty lines, in which every
intermediate state is invalid and any one of them can be passed somewhere by
mistake.

## The cheaper thing first

An options object with the required/optional split in the type:

```ts
type ReportOptions = {
  data: Row[];             // required
  timezone?: string;       // optional, with a default
  includeTotals?: boolean;
};

export const report = ({ data, timezone = 'UTC', includeTotals = false }: ReportOptions) => ...
```

Named at the call site, defaults in one place, and the compiler enforces the
required fields. This is the answer perhaps nine times in ten.

## The TypeScript shape

Reach for a real builder when **order matters or steps are conditional** — a
query assembled from filters the caller discovers one at a time.

### Before

```ts
let sql = 'SELECT * FROM orders';
const where: string[] = [];
if (status) where.push(`status = '${status}'`);
if (since) where.push(`created_at > '${since}'`);
if (where.length) sql += ' WHERE ' + where.join(' AND ');
if (limit) sql += ` LIMIT ${limit}`;
// …the same accumulation, in five endpoints
```

### After

```ts
class QueryBuilder {
  #where: string[] = [];
  #limit?: number;

  where(clause: string) {
    this.#where.push(clause);
    return this;
  }

  limit(n: number) {
    this.#limit = n;
    return this;
  }

  build(): string {
    return [
      'SELECT * FROM orders',
      this.#where.length ? `WHERE ${this.#where.join(' AND ')}` : '',
      this.#limit ? `LIMIT ${this.#limit}` : '',
    ]
      .filter(Boolean)
      .join(' ');
  }
}
```

`return this` is what makes it chain. The stronger variant tracks progress in the
type — `QueryBuilder<'has-table'>` — so `build()` doesn't exist until the
required steps have been called. Do that only when the invalid ordering is a bug
you have actually hit; it is a lot of type machinery to read.

## What it costs

A second object whose only job is to make the first one, and an interface that
must grow with every field. The fluent form also hides mutation behind what looks
like a pure chain — `q.where(x)` returns the same instance it mutated, and a
caller who assumed otherwise has a shared-state bug.

## When it's the wrong call

- **Fields are independent and unordered.** Options object. Done.
- **Fewer than four or five fields.** Positional arguments are fine.
- **A library already builds it.** Query builders, form libraries, and HTTP
  clients ship theirs.

## Further reading

<https://refactoring.guru/design-patterns/builder>.
