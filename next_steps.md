# Next Steps & Future Implementation Roadmap

This roadmap organizes all planned enhancements, bug fixes, relational features, and the one-off Excel migration script into logical, self-contained phases for upcoming sessions.

---

## Milestone A: Bug Fixes & Quick UX Polish
*Small, high-impact fixes and quality-of-life improvements across existing views.*

1. **Fix Custom Dropdown Fields in `CommentsTableView.tsx` (Bug #7):**
   - Currently, custom fields in the Comments Table always render as `<input type="text">` instead of `<select>` when `field.type === 'select'`, and typing directly triggers async DB writes on every keystroke.
   - **Fix:** Render a proper `<select>` (with options + inline `+ Add Option`) for `'select'` custom fields in `CommentsTableView.tsx`, and use `onBlur` / local state or full row edit mode for `'text'` custom fields so values save reliably without input lag.
2. **Auto-Scroll to Linked Comment on "View" Click (Bug #2):**
   - In `RoomDetailDrawer.tsx`, clicking **View** on a pin's linked comment currently highlights the comment card (`highlightedCommentId`) but does not scroll the container.
   - **Fix:** Add `id="comment-card-${comm.id}"` to each comment element and call `element.scrollIntoView({ behavior: 'smooth', block: 'center' })` when jumping to a linked comment.
3. **`Delete` Key Shortcut for Selected Pin or Arrow (Item #8):**
   - In `AnnotatedRoomCanvas.tsx`, listen for the `Delete` key when `selectedPinId` or `selectedArrowId` is active (while not focused inside an `<input>`/`<textarea>`), show a quick confirmation prompt, and delete the selected marker or arrow.
4. **Live Visual Preview in Custom Marker Creator (Item #6):**
   - In `SettingsAndCustomizeView.tsx`, replace the text-only Icon `<select>` with a visual clickable icon picker (`<MarkerIcon />` buttons) and a live preview badge showing the selected color, icon, and badge symbol before clicking "Add Marker Type".

---

## Milestone B: 100% Spoiler-Free Custom Fields, Room Flags & Table Editing
*Removes all remaining hardcoded gameplay/lore concepts ("Race/Tribe", pre-made Room Flags) and upgrades the Comments Table editor.*

1. **Editable, Spoiler-Free Room Flags (Item #1):**
   - Remove the hardcoded `ROOM_TAG_SUGGESTIONS` (`Grail Tablet`, `Ankh Jewel`, `Dissonance`, etc.) from `defaultDefinitions.ts`.
   - Store `roomFlagOptions: string[]` inside `ProjectConfig` (starting empty `[]` by default for new playthroughs).
   - Add an inline `+ Add Room Flag` button inside `RoomDetailDrawer.tsx` and a flag manager in `SettingsAndCustomizeView.tsx`.
2. **Replace Hardcoded "Race / Tribe" with Filterable Custom Dropdown Fields:**
   - Remove the hardcoded `raceOrTribe` property from `CommentEntry` and `ProjectConfig`.
   - Upgrade `CustomFieldDefinition` (`type: 'text' | 'select'`) with:
     - `filterable: boolean` checkbox on field creation (automatically adds a filter dropdown to the top bar of `CommentsTableView.tsx`).
     - Inline `+ Add New Option...` support on `'select'` custom fields so users can add dropdown values on the fly.
3. **Full Comment Editing & Cell Migration in `CommentsTableView.tsx` (Item #4):**
   - Add an **Edit (`Edit3`)** button on every row in the `Comments & Lore` table that allows editing `Map`, `Cell Coordinate` (`$C$2`), `Category`, `Speaker/Title`, `Content`, and `Custom Fields`.
   - When a comment's `Map` or `Cell Coordinate` is changed in the table, automatically resolve and update `cellId` so the comment seamlessly migrates to the new cell on the map grid.

---

## Milestone C: Deep Relational Links (Pins $\leftrightarrow$ Any Comment/Cell & Comment Cross-References)
*Allows pins and comments to reference any room or lore entry across the entire expedition.*

1. **Cross-Room / Cross-Map Pin-to-Comment & Pin-to-Cell Links (Item #3 & Step 5A):**
   - **Link Pin to Any Comment/Tablet:** Upgrade the Pin Editor's *Link to Comment* selector so it prioritizes **Current Room Comments** at the top, followed by a **"🔍 Search All Comments / Tablets..."** picker that lets you link a pin (e.g., a puzzle blockage) to a hint/tablet in a completely different room or map!
   - **Preserved Links on Comment Migration:** Because pins reference `linkedCommentId` (UUID) and support cross-room comment links, moving a comment to a different cell in Milestone B.3 will never break existing pin links.
   - **Link Pin to Target Map + Cell (`targetMapId`, `targetCellId`, `isBidirectionalWarp`):** Allow Warp pins (or switch/gate pins) to point to a specific target `Map + Cell` coordinate with a 1-click **"Jump to Target Room"** button and auto-updating coordinate labels if rows/cols shift.
2. **"Related To" Cross-References on Comments (Comments, TODOs & Cells):**
   - Add `relatedCommentIds?: string[]` and `relatedCellIds?: string[]` to `CommentEntry`.
   - Render clickable badges on comments to jump to related tablets/TODOs or related rooms, plus automatic incoming **"Referenced By"** backlinks.

---

## Milestone D: Map-Level Connections Bar, Map-Attached Sketches & Cross-Cell Grid Arrows
*Enhances the Macro Map Grid workspace with map-level context, sketches, and cell-to-cell paths.*

1. **Map-Level "Leads To / Entered From" & Map Sketches Panel (Item #5 & Step 5B):**
   - Add a collapsible bottom/top section on `MacroMapGrid.tsx` showing:
     - **Map Connections:** Which other maps can be accessed from the active map (`Outgoing`) and which maps lead into this map (`Incoming`), auto-synced from Warp Pins (`targetMapId`) + optional manual map links.
     - **Map Sketches (`SketchesBoardView` integration):** Automatically display all sketches where `sketch.mapId === activeMap.id` directly below the map grid (with a `+ Draw Sketch for This Map` button) so field-specific diagrams (like root maps or multi-room puzzles) are visible right alongside the map!
2. **Cross-Cell Map Grid Arrows & Adjacent Border Toggles:**
   - Support drawing arrows directly on the Macro Map Grid from `fromCellId` to `toCellId` via a map-level `<svg>` overlay.
   - Optional 1-click doorway/passage toggles on the borders between adjacent cells.
3. **Middle-of-Grid Row/Column Insertion & Room Swap/Move:**
   - Generalize `expandMapGrid` / `shrinkMapGrid` to allow inserting or deleting a row or column at any index (`insertRowAt(mapId, index)`, `insertColAt(mapId, index)`), shifting only cells at `>= index`.
   - Add a **Move / Swap Cell** action to relocate a room's screenshot, pins, and comments if placed in the wrong coordinate.

---

## Milestone E: One-Off Excel Workbook (`.xlsx`) to Tracker `.ZIP` Migration Script *(Deferred — See `migration-plan.md`)*
*Tracked separately in [`migration-plan.md`](./migration-plan.md) so the migration pipeline and Excel XML/drawing nuances can be designed and tested as a dedicated feature.*

---

## Milestone F: Automated Unit & Integration Test Suite
- Add **Vitest** + **`fake-indexeddb`** covering coordinate math, atomic grid row/column insertion & coordinate shifting, relational comment/pin integrity, and `.zip` backup round-trip export/import.
