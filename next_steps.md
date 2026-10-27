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

## 2. Automated Unit & Integration Test Suite
- Add **Vitest** + **`fake-indexeddb`** to test:
  - Coordinate math (`colIndexToLetter`, `letterToColIndex`, `formatCellCoord`, `parseCellCoord`).
  - Atomic 4-edge grid expansion/shrinking (`expandMapGrid` / `shrinkMapGrid` on `'top'`, `'left'`, `'bottom'`, `'right'`) and verifying that linked `CommentEntry.cellCoord` values update accurately when cells shift.
  - `.zip` backup export and import round-trip integrity.
