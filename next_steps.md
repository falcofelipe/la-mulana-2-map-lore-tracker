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
   - Collect all unique values from the `Race/Tribe` column into `ProjectConfig.raceOrTribeOptions`.
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

## 4. Automated Unit & Integration Test Suite
- Add **Vitest** + **`fake-indexeddb`** to test:
  - Coordinate math (`colIndexToLetter`, `letterToColIndex`, `formatCellCoord`, `parseCellCoord`).
  - Atomic 4-edge grid expansion/shrinking (`expandMapGrid` / `shrinkMapGrid` on `'top'`, `'left'`, `'bottom'`, `'right'`) and verifying that linked `CommentEntry.cellCoord` values update accurately when cells shift.
  - `.zip` backup export and import round-trip integrity.
