# Strategy

One decision, several interchangeable ways to make it, chosen at runtime. The
caller knows it needs a price calculated; it doesn't know or care which of the
six pricing rules applies.

In TypeScript this is a function you pass, not a class hierarchy. The GoF
diagram draws an interface with N implementations because its language had no
first-class functions. Yours does.

## The smell it answers

The same `switch` on the same tag appearing in several places, drifting. Add a
provider, a plan, a locale, an export format — and you edit four files that
have no idea about each other, and miss the fifth.

Or its cousin: boolean parameters selecting behaviour. `send(msg, true, false)`
has four combinations, of which two were ever tested.

## The cheaper thing first

A `Record` of functions in one module:

```ts
const pricing = {
  flat: (cents: number) => cents,
  bulk: (cents: number, qty: number) => (qty > 10 ? cents * 0.9 : cents),
} satisfies Record<string, (cents: number, qty: number) => number>;
```

That is Strategy. It has a name in the catalogue and no ceremony in the code.
Reach past it only when a strategy needs state of its own between calls, or
setup and teardown — then it becomes an object, and the object is still not an
interface hierarchy unless several of them share real implementation.

## The TypeScript shape

### Before

```ts
function calculate(order: Order): number {
  switch (order.plan) {
    case 'flat':
      return order.cents;
    case 'bulk':
      return order.qty > 10 ? order.cents * 0.9 : order.cents;
    case 'contract':
      return contractRate(order.customerId) * order.qty;
  }
}

// …and in three other modules, the same switch on order.plan
```

### After

```ts
type Pricing = (order: Order) => number;

const pricing: Record<Order['plan'], Pricing> = {
  flat: (o) => o.cents,
  bulk: (o) => (o.qty > 10 ? o.cents * 0.9 : o.cents),
  contract: (o) => contractRate(o.customerId) * o.qty,
};

export const calculate = (order: Order) => pricing[order.plan](order);
```

`Record<Order['plan'], Pricing>` is the part that pays. A new plan added to the
union fails to compile until it has an entry — the switch it replaced silently
fell through.

## What it costs

One indirection. The behaviour for a given case is no longer at the call site;
you follow a key into a table. That is a real readability cost and it is small,
which is why this is the pattern to reach for first among all of them.

## When it's the wrong call

- **Two branches that have been two branches for a year.** An `if` is fine.
- **The branches differ in a value, not in behaviour.** That's a lookup table
  of data, not of functions.
- **Exactly one implementation.** An interface with one implementer is the
  abstraction assessment 3 exists to delete.
- **The choice is made at build time, not runtime.** Then it's a module import.

## Further reading

<https://refactoring.guru/design-patterns/strategy> — the classical write-up and
the UML, if the class form turns out to be what you need.
