# Adapter

Convert one interface into the one your code already speaks, at the boundary,
once. The rest of the codebase never learns the foreign shape.

## The smell it answers

Vendor types leaking inward. An SDK's `PaymentIntent`, an API's snake_case JSON,
a legacy table's column names — spreading through modules that have no business
knowing where the data came from. Then the vendor renames a field in a minor
release and it is your refactor, in fifteen files.

The tell is grep: a third-party type name appearing in your domain layer, or
`response.data.attributes.user_name` more than a directory away from the fetch.

## The cheaper thing first

A mapping function. Genuinely — one function, at the edge:

```ts
const toUser = (dto: ApiUserDto): User => ({
  id: dto.user_id,
  name: dto.user_name,
  joinedAt: new Date(dto.created_ts * 1000),
});
```

That is Adapter. Reach for the object form only when the foreign thing is
stateful — a client, a connection, a subscription — and the adaptation has to
hold that state.

## The TypeScript shape

### Before

```ts
// domain code, knowing Stripe
async function refund(order: Order) {
  const intent = await stripe.paymentIntents.retrieve(order.stripe_pi);
  if (intent.status !== 'succeeded') throw new Error('not refundable');
  await stripe.refunds.create({ payment_intent: intent.id });
}
```

### After

```ts
// ports/payments.ts — the shape your domain speaks
export interface Payments {
  status(ref: string): Promise<'settled' | 'pending' | 'failed'>;
  refund(ref: string): Promise<void>;
}

// adapters/stripe.ts — the only file that imports stripe
export const stripePayments = (stripe: Stripe): Payments => ({
  async status(ref) {
    const intent = await stripe.paymentIntents.retrieve(ref);
    return intent.status === 'succeeded' ? 'settled' : 'pending';
  },
  async refund(ref) {
    await stripe.refunds.create({ payment_intent: ref });
  },
});
```

The domain now depends on three words it defined itself. Swapping the provider,
or faking it in a test, is one object.

## What it costs

A type and a file per boundary, plus the translation itself — which is real work
when the shapes differ structurally rather than in naming. Pay it at boundaries
you don't own. Don't pay it between two of your own modules.

## When it's the wrong call

- **The foreign type is already the right shape.** Renaming fields to prove
  independence is ceremony.
- **One call site, unlikely to grow.** Inline it and move on.
- **You control both sides.** Then change the other side.

## Further reading

<https://refactoring.guru/design-patterns/adapter>.
