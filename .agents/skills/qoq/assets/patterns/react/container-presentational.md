# Container / Presentational

Split a component in two along the line between _where the data comes from_ and
_what it looks like_. The container fetches, subscribes and transforms; the
presentational component takes plain props and renders.

Hooks blurred this — a component with `useUser()` in it is already partly split.
The modern version isn't "every component gets a pair"; it's that a component
which renders should be renderable from the data you hand it.

## The smell it answers

A component that fetches, transforms and renders. Testing the empty state means
mocking the network. Rendering the same table with data you already have means
either a second component or a `data?` prop that makes the fetch conditional.
Storybook can't show it at all.

The tell is the test file: `vi.mock('../api')` at the top of a test whose
assertions are all about markup.

## The cheaper thing first

**Take the data as a prop and fetch one level up** — in the route, the loader, or
the page component that already knows the id:

```tsx
// page.tsx — the only thing that talks to the network
const orders = await loadOrders(customerId);
return <OrderTable orders={orders} />;
```

That's the whole pattern, without inventing a `OrderTableContainer`. The
container is whatever already had the id; adding a component whose entire body is
one hook plus one JSX line is a file for nothing.

## The React shape

### Before

```tsx
export function OrderTable({ customerId }: { customerId: string }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.orders(customerId).then((o) => {
      setOrders(o.filter((x) => !x.archived).sort(byDate));
      setLoading(false);
    });
  }, [customerId]);

  if (loading) return <Spinner />;
  return (
    <table>
      {orders.map((o) => (
        <Row key={o.id} order={o} />
      ))}
    </table>
  );
}
```

### After

```tsx
// presentational — no imports from the api layer, no async, no state
export function OrderTable({ orders }: { orders: Order[] }) {
  if (orders.length === 0) return <Empty />;
  return (
    <table>
      {orders.map((o) => (
        <Row key={o.id} order={o} />
      ))}
    </table>
  );
}
```

```tsx
// container — whatever already knew the customerId
export function CustomerOrders({ customerId }: { customerId: string }) {
  const { data } = useOrders(customerId);
  if (!data) return <Spinner />;
  return <OrderTable orders={visibleOrders(data)} />;
}
```

`visibleOrders` — the filter and sort — moved out of the effect into a plain
function, and that is where most of the testable logic actually was. Getting the
transform out of the async path is usually worth more than the component split
itself.

## What it costs

Two files and a prop-drilling hop for what used to be one component. If the
presentational half only ever renders one container's data, the boundary is
ceremony, and the props interface is a second copy of the domain type that now
has to be kept in step.

It also pushes loading and error states upward. Every container repeats the
`if (!data) return <Spinner />` line, and centralising _that_ is what Suspense
and [Error Boundary](error-boundary.md) are for.

## When it's the wrong call

- **The component doesn't fetch anything.** Nothing to split.
- **One container, one presentation, forever.** Keep them together until a
  second caller or a test actually asks.
- **The split is by file, not by dependency.** A "presentational" component that
  still imports the api client has been renamed, not separated.
- **The framework already draws the line.** Server components, route loaders and
  `getServerSideProps` are this pattern at the framework level — use that seam
  rather than adding one inside it.

## Further reading

<https://www.patterns.dev/react/presentational-container-pattern/> — including
its own note that hooks made the strict form largely unnecessary.
