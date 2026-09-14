# D-2026-09-14-grid-panel-headings-are-editable

**14 September 2026.** A panel's own details — name, quantity, tag, option label and the
optional-extra tick — are changed from the top of its column in the grid, not only on the panel's
own tab.

The owner found the gap the day the house style went live, and it is the sort that only shows once
a screen is used rather than read: the grid could edit **every quantity in the costing** but not the
**name of the column the quantity was in**. To rename a panel you left the grid, found its tab,
renamed it, and came back — which is precisely the trip the grid exists to save. Two panels named
"Panel 2" and "Panel 2 (copy)" in the screenshot that prompted this are what that costs in practice.

Nothing new was built underneath. The heading calls `updatePanel`, the same function the panel tab
calls, so the change is recorded in exactly the same way and the frozen prices are untouched. What
is new is `GridPanelHead.tsx`, which is the heading, and two guards in it that a form on a page can
be careless about and a column heading cannot: **a name typed blank is ignored** rather than saved,
because an empty column heading is also an empty line on the quotation; and **a quantity must be
more than nought**, because the grid multiplies by it. Both are asserted, and the name guard was
proved by removing it and watching the test fail.

Three fields of the panel tab's Details row are deliberately left there: the unit, the enclosure
dimensions and the technical description. They are read as much as typed, and a column heading is
the one place in this app with no room. A heading that tried to hold everything would stop being a
heading.

The read-only heading is unchanged — on a submitted or approved costing it still reads
`tag · qty 2 · option` as plain text, because the boxes appear on exactly the same condition the
grid's quantity cells do.
