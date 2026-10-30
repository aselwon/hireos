# Composite

A tree in which a leaf and a branch are treated the same way, so callers stop
asking which one they are holding.

## The smell it answers

Recursive special-casing. Every function over the tree opens with `if
(node.children) { … } else { … }`, and the two arms drift. Menus, file trees,
comment threads, org charts, nested form fields, rendered layout — anywhere a
thing can contain more of itself.

The tell: `isFolder(x)`, `hasChildren(x)`, or `Array.isArray(x)` appearing in
every traversal, and a `size()` that is correct for files and wrong for empty
directories.

## The cheaper thing first

A recursive type and a recursive function:

```ts
type Node =
  { kind: 'file'; name: string; bytes: number } | { kind: 'dir'; name: string; children: Node[] };

const size = (n: Node): number =>
  n.kind === 'file' ? n.bytes : n.children.reduce((t, c) => t + size(c), 0);
```

The branch is still there — it moved into one function per operation instead of
every caller, and the union means adding a node kind breaks every operation until
it is handled. The class hierarchy version buys polymorphic dispatch, which
matters when operations are open-ended and node kinds are fixed; the union is
better when node kinds are fixed and you keep adding operations, which is the
usual direction in application code.

## The TypeScript shape

### Before

```ts
function totalSize(node: any): number {
  if (node.children) {
    let t = 0;
    for (const c of node.children) t += totalSize(c);
    return t;
  }
  return node.bytes;
}

function render(node: any): string {
  if (node.children) return `<ul>${node.children.map(render).join('')}</ul>`;
  return `<li>${node.name}</li>`;
}
// the same shape check, in every operation, on an untyped node
```

### After

```ts
type Node =
  { kind: 'file'; name: string; bytes: number } | { kind: 'dir'; name: string; children: Node[] };

const fold = <T>(
  n: Node,
  leaf: (f: Extract<Node, { kind: 'file' }>) => T,
  join: (name: string, parts: T[]) => T
): T =>
  n.kind === 'file'
    ? leaf(n)
    : join(
        n.name,
        n.children.map((c) => fold(c, leaf, join))
      );

const size = (n: Node) =>
  fold(
    n,
    (f) => f.bytes,
    (_, parts) => parts.reduce((a, b) => a + b, 0)
  );
const paths = (n: Node) =>
  fold<string[]>(
    n,
    (f) => [f.name],
    (name, parts) => parts.flat().map((p) => `${name}/${p}`)
  );
```

`fold` is worth writing once the tree has three or more operations over it. With
one operation, the plain recursive function above is the answer.

## What it costs

Uniformity is a lie in one direction: leaves do not really have children, and any
`addChild` on the shared interface either throws for leaves or silently does
nothing. The union form avoids that by not offering the operation, which is the
main reason to prefer it in TypeScript.

Deep trees plus recursion means stack depth. Real trees in application code are
shallow; parsers and file systems are not, and there an explicit stack beats
elegance.

## When it's the wrong call

- **Fixed depth.** A two-level structure is a list of lists. Model it as one.
- **Leaves and branches genuinely differ to callers.** If every caller branches
  anyway, uniformity bought nothing.
- **A library owns the tree.** ASTs, DOM, and virtual DOMs come with their own
  traversal — use it.

## Further reading

<https://refactoring.guru/design-patterns/composite>.
