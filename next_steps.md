# Next Steps & Future Implementation Roadmap

This file tracks planned follow-up work, one-off migration scripts, and potential enhancements to tackle in future sessions.

---

## 1. One-Off Excel Workbook (`.xlsx`) to Tracker `.ZIP` Migration Script
**Goal:** Migrate the existing 20+ map sheets, embedded cell screenshots, and 100+ comment/tablet rows from the personal Microsoft Excel `.xlsx` workbook directly into a portable `.zip` archive that can be imported via **Customize & Backup -> Import Backup (.ZIP)** (with no bloat added to the web app itself).

### How `.xlsx` Files Work Under the Hood (Why This Is Very Doable)
An Excel `.xlsx` file is actually a standard ZIP archive containing:
- `xl/workbook.xml` & `xl/worksheets/sheet1.xml ... sheetN.xml`: Sheet names, cell values (`X` for blocked cells, text comments), and coordinate references.
- `xl/drawings/drawing1.xml ...`: Anchors (`<xdr:twoCellAnchor>` or `<xdr:oneCellAnchor>`) that map each embedded screenshot image to its exact `<xdr:from><xdr:col>` and `<xdr:row>` cell coordinate!
- `xl/media/image1.png ...`: The raw embedded room screenshots.

### Proposed Standalone Node/Python Migration Script (`scripts/migrate-excel.ts` or `.py`)
1. **Parse Map Sheets:**
   - Iterate over all map tabs (e.g., `YgA Roots of Yggdrasil`, `DfA Divine Fortress`, etc.), splitting the tab name into `codePrefix` (`YgA`) and `name` (`Roots of Yggdrasil`).
   - Detect grid bounds (`rows × cols`) and mark cells containing `'X'` as `state: 'blocked_x'`.
2. **Extract Embedded Images by Cell Anchor:**
   - Read `xl/drawings/*.xml` to see which `xl/media/imageN.png` is anchored to which `(row, col)` on each sheet.
   - Convert each extracted image to 90% quality `.webp` + thumbnail `.webp` and assign `screenshotBlobId` / `thumbnailBlobId` to the corresponding `GridCell`.
3. **Parse the `Comments` Sheet:**
   - Read each row (`Sheet`, `Cell` e.g. `$C$2`, `Room Name`, `Replies`, `Race/Tribe`).
   - Populate `GridCell.roomName` automatically from the `Room Name` column.
   - Classify each entry (`T:` -> `tablet`, `NPC` -> `npc`, `Sk:` -> `shortcut_hint`, `TODO:` -> `todo`, else `general`).
   - Create a Custom Dropdown Field (`CustomFieldDefinition`) named `"Race / Tribe"` (`type: 'select'`, `showInTable: true`, `filterable: true`) populated with the unique values from the Excel `Race/Tribe` column, and store each row's value in `comm.customFields[raceFieldId]`.
4. **Output Portable `.zip`:**
   - Bundle `project-data.json` + `/images/*.webp` into `migrated-excel-backup.zip` ready for one-click import in the web app.

---

## 2. Insert / Delete Row or Column in the Middle of a Grid (& Move/Swap Rooms)
**Goal:** Allow inserting or deleting a row/column between existing rooms (e.g., inserting a new column between `Col A` and `Col B` if a room or vertical shaft was missed), or dragging/moving a room cell to another coordinate.

### Implementation Details
- **Generalize `expandMapGrid` / `shrinkMapGrid` in `src/db/repository.ts`:**
  - Add `insertRowAt(mapId, targetRowIndex)` and `insertColAt(mapId, targetColIndex)`.
  - Shift all existing cells on `mapId` where `cell.row >= targetRowIndex` (or `cell.col >= targetColIndex`) by `+1`, recalculate their `coord` (`$Col$Row`), and atomically update `CommentEntry.cellCoord` via `cellId`.
- **UI Controls on Column/Row Headers (`MacroMapGrid.tsx`):**
  - Hovering a column header (`A`, `B`, `C...`) or row header (`1`, `2`, `3...`) reveals tiny `+Before / +After / Trash` actions (or a right-click context menu) just like Excel.
- **Swap / Move Room Cell:**
  - Allow moving or swapping two cells' contents (screenshot, room name, pins, arrows, and linked comments) if a room was accidentally pasted into the wrong coordinate.

---

## 3. Cross-Cell Map Grid Arrows (Room-to-Room Passages & Connections)
**Goal:** Allow drawing directional arrows directly on the **Macro Map Grid** that span from one cell to another (e.g., showing a passage from `$C$1` into `$C$2`, a one-way drop between rooms, or a warp connection across the grid).

### Implementation Details
- **Data Model (`MapConnectionArrow` on `MapPage`):**
  - Store `fromCellId` + `(fromXPercent, fromYPercent)` and `toCellId` + `(toXPercent, fromYPercent)` alongside `color`, `dashed`, `bidirectional`, and optional `label`.
  - Because endpoints reference stable `cellId`s rather than raw pixel coordinates, cross-cell arrows will automatically stay anchored even when zooming the grid or inserting/shifting rows and columns.
- **Map-Level SVG Overlay (`MacroMapGrid.tsx`):**
  - Render a single `<svg>` layer over the entire `rows × cols` grid container (above individual `GridCellCard`s so `overflow-hidden` does not clip lines crossing cell borders).
  - Add a **"Draw Room Connection Arrow"** tool toggle in the `MacroMapGrid` toolbar (Click start spot in Cell A -> Click destination spot in Cell B).

---

## 4. Relational Cross-References on Comments ("Related To" Comments, TODOs & Cells)
**Goal:** Allow linking any comment/tablet/NPC/TODO entry to other comments/TODOs or other map cells so multi-room riddles can be cross-referenced with 1 click.

### Why This Does Not Bloat the Database
- Uses two lightweight ID arrays on `CommentEntry` (~30–50 bytes per entry):
  - `relatedCommentIds?: string[]` (links to other Tablets, NPC quotes, or TODOs).
  - `relatedCellIds?: string[]` (links to other `GridCell.id` rooms on the current map or other maps).
- **Automatic Backlinks (Zero Duplicate Storage):** Because all comments are loaded in memory via Dexie, if Tablet A links to TODO B, viewing TODO B can automatically display *"Referenced by: Tablet A (`YgA $C$1`)"* dynamically without storing duplicate backlink arrays in IndexedDB.

---

## 5. Structured Warp Pins & Auto-Synced Map-to-Map Access Header
**Goal:** Allow Warp/Transition pins to point to a real target `Map + Cell` coordinate, and display on each Map Grid which other maps can be accessed from this map (`Outgoing`) and which maps lead into this map (`Incoming`).

### Step 5A — Structured Target Fields on `PinMarker`
- Add optional fields to `PinMarker` (shown when editing a `warp_door` pin or any pin):
  - `targetMapId?: string` (select target Map tab, or same map for intra-map teleports/passages).
  - `targetCellId?: string` (select target Cell coordinate, e.g. `$A$8`).
  - `isBidirectionalWarp?: boolean` (2-way door/portal vs. 1-way drop/warp).
- **Benefits:**
  - Clicking the Warp Pin offers a 1-click **"Jump to Destination Room (`AcB $A$8`)"** button.
  - Because it stores `targetCellId` (UUID), if rows/columns are inserted on the target map and `$A$8` shifts to `$B$8`, the warp pin's displayed coordinate updates automatically!

### Step 5B — Map-Level "Leads To / Entered From" Connections Bar
- At the top of `MacroMapGrid.tsx`, display a compact bar showing:
  - **Can Access (`Leads To`):** All other maps reachable from this map.
  - **Accessed From (`Entered From`):** All other maps that have a warp/door leading into this map.
- **Zero-Bloat Auto-Sync:** Derived automatically in real time from all pins across the database that have `targetMapId` set (plus an optional `manualConnectedMapIds?: string[]` on `MapPage` if you want to note a map connection before placing a specific pin). Clicking any pill in this bar jumps straight to that transition room!

---

## 6. Simple Cell-to-Cell Passage Indicators (Alternative to Freehand Arrows)
**Goal:** Provide a fast, 1-click way to show that two cells have a path between them without needing to draw a vector arrow.
- **Adjacent Cell Border Toggles:** Clicking the gap between two adjacent cells (`Top/Bottom/Left/Right` neighbor) cycles between `None` -> `Open Passage (<->)` -> `One-Way Drop/Gate (->)` -> `Locked/Sealed`.
- **Non-Adjacent Cell Link:** Handled automatically by **Step 5A** (setting a pin's `targetCellId` to another cell on the same map).

---

## 7. Replace Hardcoded "Race / Tribe" with Filterable Custom Dropdown Fields (100% Spoiler-Free)
**Goal:** Even knowing that tablets belong to specific "Races / Tribes" is a mid-game mechanical spoiler. By replacing the hardcoded `raceOrTribe` property with the existing `CustomFieldDefinition` system, we eliminate spoilers AND make the codebase smaller and more flexible.

### Why This Simplifies the Codebase (Zero Bloat)
- **Remove Hardcoded `raceOrTribe`:** Remove `raceOrTribe` from `CommentEntry`, `raceOrTribeOptions` from `ProjectConfig`, and delete `RaceTribeSelector.tsx` as a standalone concept.
- **Upgrade `'select'` Custom Fields:**
  - `CustomFieldDefinition` already supports `type: 'text' | 'select'` and `options?: string[]`.
  - Give `'select'`-type custom fields the ability to add new dropdown options inline on the fly (`+ Add Option...`) and optional badge color styling.
  - Add `filterable: boolean` to `CustomFieldDefinition` (toggled via a checkbox when creating/editing a custom field in Settings).
- **Dynamic Custom Field Filtering in `CommentsTableView.tsx` (~10 lines of code):**
  - Store `customFieldFilters: Record<string, string>` (`{ [fieldId]: selectedValue }`).
  - Render a filter `<select>` in the top filter bar for each custom field where `field.filterable === true`.
  - In `filteredComments`, check that `comm.customFields?.[fieldId] === selectedValue`.

---

## 8. Automated Unit & Integration Test Suite
- Add **Vitest** + **`fake-indexeddb`** to test:
  - Coordinate math (`colIndexToLetter`, `letterToColIndex`, `formatCellCoord`, `parseCellCoord`).
  - Atomic 4-edge grid expansion/shrinking (`expandMapGrid` / `shrinkMapGrid` on `'top'`, `'left'`, `'bottom'`, `'right'`) and verifying that linked `CommentEntry.cellCoord` values update accurately when cells shift.
  - `.zip` backup export and import round-trip integrity.
