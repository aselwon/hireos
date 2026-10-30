# Portal

Render a subtree into a DOM node outside the parent's hierarchy while keeping it
in the React tree — so state, context and event bubbling all still work, but CSS
stacking and clipping don't apply. `createPortal(children, document.body)`.

## The smell it answers

The z-index war. A dropdown is clipped by an ancestor's `overflow: hidden`, or a
modal renders behind a header, and the fix is a bigger number: `z-index: 999`,
then `9999`, then a constants file of them. Nothing settles, because the problem
isn't the number — a `transform`, `filter` or `contain` on any ancestor creates a
stacking context the child can never escape.

The other tell: a modal whose CSS includes `position: fixed` plus `top: 0; left:
0; width: 100vw` and still gets cut off. That's an ancestor clipping it, and no
amount of positioning will fix it from inside.

## The cheaper thing first

**Check whether the platform already does this.** Both of these render in the
browser's top layer, above everything, with no portal and no z-index at all:

```html
<dialog>
  <!-- modals: showModal() adds the backdrop and focus trap -->
  <div popover><!-- tooltips, menus, dropdowns --></div>
</dialog>
```

`<dialog>` also gives you Escape-to-close, focus containment and `::backdrop`
for free — all things a portal-based modal has to implement. Check the project's
browser support and reach for these first; the portal is what you need when you
must render into a specific container rather than the top layer, or when support
rules them out.

If a component library is already in the tree, its `Dialog`/`Popover` is a
portal that has had the focus and scroll edge cases beaten out of it.

## The React shape

### Before

```tsx
function Row({ order }: { order: Order }) {
  const [open, setOpen] = useState(false);
  return (
    <td>
      {' '}
      {/* the table has overflow: auto */}
      <button onClick={() => setOpen(true)}>Edit</button>
      {open && (
        <div className="modal" style={{ zIndex: 9999 }}>
          …
        </div>
      )}
    </td>
  );
}
```

### After

```tsx
function Modal({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return createPortal(
    <div className="overlay" onClick={onClose}>
      <div role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>,
    document.body
  );
}
```

```tsx
function Row({ order }: { order: Order }) {
  const [open, setOpen] = useState(false);
  return (
    <td>
      <button onClick={() => setOpen(true)}>Edit</button>
      {open && (
        <Modal onClose={() => setOpen(false)}>
          <EditForm order={order} />
        </Modal>
      )}
    </td>
  );
}
```

`EditForm` still reads the same context and its `onChange` still bubbles to
handlers in `Row`, because the React tree didn't change — only the DOM did.
That's the property that makes a portal different from rendering the modal at
the app root and threading state to it.

## What it costs

Events bubble along the React tree, not the DOM one, and that surprises people
in both directions: a click inside the portal fires the `onClick` of a DOM-distant
React ancestor, and a `document`-level listener sees it at `body`.

The portal also renders outside your layout, so everything the layout was doing
for you is now yours: focus trapping, restoring focus on close, `Escape`, locking
background scroll, and `aria-modal`. A portal is the easy half of a modal.

SSR needs a guard — `document` doesn't exist on the server, so the call has to be
client-only or deferred to an effect.

## When it's the wrong call

- **Nothing is clipping it.** If the element renders correctly where it is,
  a portal adds a DOM indirection for nothing.
- **`<dialog>` or `popover` covers it.** Use them.
- **A tooltip that must track its trigger.** The portal doesn't position
  anything; you'll need an anchor-positioning library or CSS anchor positioning
  regardless, and that may remove the need for the portal too.
- **To escape a layout you control.** If the clipping ancestor is your own CSS,
  fixing the `overflow` is smaller than adding a portal.

## Further reading

<https://react.dev/reference/react-dom/createPortal>, and the `<dialog>` page on
MDN for what you no longer have to write.
