# Template Method

One algorithm whose overall shape is fixed and whose individual steps vary.
The skeleton lives in one place; the varying steps are supplied.

GoF supplies them by subclassing. TypeScript supplies them as arguments, which
is the same pattern with less to read and no inheritance chain to trace.

## The smell it answers

Copy-pasted procedure. Three importers that each validate, parse, transform,
upsert, and report — identical but for the parse and the transform. A fix to the
shared reporting lands in one copy, and six months later the three have quietly
diverged in ways nobody chose.

The tell is diffing two files in the same directory and seeing the same fifteen
lines with two different lines in the middle.

## The cheaper thing first

A function taking the varying steps:

```ts
type Importer<T> = {
  parse: (raw: string) => T[];
  transform: (row: T) => Record;
};

export async function runImport<T>(raw: string, { parse, transform }: Importer<T>) {
  const rows = parse(raw);
  const records = rows.map(transform);
  const result = await db.upsert(records);
  report(result);
  return result;
}
```

The skeleton is the function body; the hooks are a parameter. No class, no
`protected abstract`, and the concrete importers become two functions each.

## The TypeScript shape

### Before

```ts
class CsvImporter {
  async run(raw: string) {
    const rows = parseCsv(raw);
    const records = rows.map(this.toRecord);
    const result = await db.upsert(records);
    report(result);
    return result;
  }
}

class JsonImporter {
  async run(raw: string) {
    const rows = JSON.parse(raw);
    const records = rows.map(this.toRecord);
    const result = await db.upsert(records); // and here someone added a retry
    report(result);
    return result;
  }
}
```

### After

```ts
export const csvImport = (raw: string) =>
  runImport(raw, { parse: parseCsv, transform: csvToRecord });
export const jsonImport = (raw: string) =>
  runImport(raw, { parse: JSON.parse, transform: jsonToRecord });
```

Optional steps become optional properties with defaults, which is the honest
version of GoF's "hook methods":

```ts
const { validate = () => true } = opts;
```

## What it costs

The algorithm is now split across two files, and reading any concrete case means
reading both. That is the trade: you give up local readability to make the shared
part singular. Worth it at three copies; rarely worth it at two.

Inversion of control also makes the steps harder to reason about in isolation —
a hook cannot see where in the sequence it is being called unless you tell it.

## When it's the wrong call

- **Two copies.** Wait for the third. Two similar things are frequently not the
  same thing, and merging them early forces both to change together forever.
- **The steps outnumber the skeleton.** If most of the algorithm is hooks, there
  is no shared algorithm — you have Strategy with extra steps.
- **The variants need different orders.** Then the skeleton isn't fixed, and this
  is the wrong pattern for it.

## Further reading

<https://refactoring.guru/design-patterns/template-method>.
