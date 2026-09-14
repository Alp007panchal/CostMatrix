# D-2026-09-14-nothing-deletes-a-panel-without-asking

**14 September 2026.** A panel can be removed from the grid, **no panel is deleted anywhere without
being asked about first**, and the grid's panel names and kit names stay in view while it scrolls.

The middle one is the part worth recording, because the owner found it by asking for the first.
**Remove panel** in the panel tab deleted a panel and every kit on it on one click — no question, no
undo, no trace beyond the history saying it happened. The one genuinely destructive button in the
costing editor was the only one that never checked, and putting the same button into the grid, where
five columns sit side by side and the wrong one is easy to hit, would have made that worse rather
than better.

So both buttons go through `remove-panel.ts`, which is the only place `window.confirm` is called for
a panel. That is a small piece of plumbing with a real purpose: a second screen cannot grow a delete
that skips the question, because there is one function and it asks.

The wording is the part that had to be right, so it is pure and tested. "Remove panel?" is a
question people click through. **Remove "MDB 1600 A"? It holds 2 kits and 1 line of loose parts,
worth KES 7,537,900. This cannot be undone, and the costing is repriced without it** is one they
read. It names the panel so nobody deletes the wrong column, says what is on it and what it is worth,
and — for an empty panel — says plainly that nothing is lost but that it still does not come back.
The tests were proved by taking the `window.confirm` out and watching two of them fail.

The scrolling is a plain fix to a plain complaint: with five panels the names scrolled off the top
and the kit names off the left, leaving a wall of numbers with nothing to read them against. The
grid gets its own scrolling box (`.grid-scroll`), with the heading row stuck to its top and the first
column to its left. It had to be its own box: `overflow-x: auto` alone makes the page the scroller,
which would have pinned the heading to the top of the *window* rather than the top of the table.

Two smaller things went with it. The grid's section and totals rows had their colours as inline
styles, left from before the house style; they are `.grid-section` and `.subtotal` now, which is what
let the sticky column keep each row's own fill instead of painting everything white. And the remove
button is a quiet `×` on the name's line rather than a fourth line in the heading — the heading is
already three lines, and a column heading that grows into a form stops being a heading.
