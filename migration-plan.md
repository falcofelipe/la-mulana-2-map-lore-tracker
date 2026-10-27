# Excel Workbook (`.xlsx`) to Tracker `.ZIP` Migration Plan

This document outlines the architecture, data-mapping rules, and edge-case considerations for the standalone migration script that will convert an existing La-Mulana 2 Excel spreadsheet (`La Mulana 2.xlsx`) into a portable `.zip` archive importable via **Customize & Backup -> Import Backup (.ZIP)**.

---

## 1. High-Level Pipeline Overview

An `.xlsx` file is a standard ZIP archive containing XML documents and binary media assets:
- `xl/workbook.xml` & `xl/_rels/workbook.xml.rels`: Ordered list of worksheet tabs (`YgA Roots of Yggdrasil`, `DfA Divine Fortress`, ..., `Comments`).
- `xl/sharedStrings.xml`: Deduplicated string table referenced by worksheet cells.
- `xl/worksheets/sheetN.xml`: Grid cell contents (such as `'X'` for unreachable cells, or inline text annotations/labels).
- `xl/worksheets/_rels/sheetN.xml.rels` $\rightarrow$ `xl/drawings/drawingN.xml` $\rightarrow$ `xl/drawings/_rels/drawingN.xml.rels`: Floating drawing objects (16:9 room screenshots, pin shapes/callouts, arrows, and freehand diagrams) anchored to `(row, col)` coordinates, referencing binary images in `xl/media/imageM.png`.

The migration script will parse these XML structures and output a single `migrated-excel-backup.zip` containing:
1. `project-data.json` (conforming to `BackupJsonPayload`: `config`, `maps`, `cells`, `comments`, `sketches`, `blobMeta`).
2. `images/<blobId>.webp` (full-resolution 90% WebP room screenshots, 320×180 WebP thumbnails, and comment/sketch attachments).

---

## 2. Step-by-Step Extraction & Mapping Rules

### Step A: Worksheet Tabs $\rightarrow$ `MapPage` & `GridCell` Matrix
1. **Identify Map Tabs vs. Comments Tab:**
   - Any worksheet tab other than `Comments` (or summary tabs) is parsed as a `MapPage`.
   - Split the sheet name on the first space to extract `codePrefix` (e.g., `"YgA"`) and `name` (e.g., `"Roots of Yggdrasil"`).
2. **Determine Grid Dimensions (`rows`, `cols`):**
   - Inspect both the cell matrix in `sheetN.xml` and the maximum `<xdr:from>` / `<xdr:to>` anchors in `drawingN.xml` to determine the bounding `(rows, cols)` for each map.
3. **Parse Blocked Cells (`state: 'blocked_x'`):**
   - Any cell in `sheetN.xml` whose string value is `'X'` or `'x'` (and has no room screenshot) is marked `state: 'blocked_x'`.

### Step B: Embedded Room Screenshots (`xl/drawings/drawingN.xml`)
1. **Anchor Resolution (`<xdr:twoCellAnchor>` / `<xdr:oneCellAnchor>`):**
   - For each `<xdr:pic>` element, inspect `<xdr:from><xdr:col>` and `<xdr:from><xdr:row>` (plus `<xdr:colOff>` / `<xdr:rowOff>` if an image slightly overlaps an adjacent border, snapping to the cell containing the center of the image).
2. **Distinguishing Room Screenshots from Floating Diagrams / Sketches:**
   - **Standard 16:9 Room Screenshot:** Spans approximately 1 grid cell (`colSpan ≈ 1`, `rowSpan ≈ 1`) and has an aspect ratio near `16:9`. Assigned to `GridCell.screenshotBlobId` + `thumbnailBlobId` (`state: 'room'`).
   - **Multi-Cell Floating Diagram (e.g., Yggdrasil Root Map) or Small Crop:** If an image spans multiple cells outside the room grid or is placed in a notes area, convert it into a map-attached `SketchNote` (`sketch.mapId = map.id`) or attach it to the corresponding `CommentEntry`.
3. **WebP Conversion & Thumbnail Generation:**
   - Convert each `xl/media/imageM.png` into:
     - Full image (`1280×720` max, 90% WebP) $\rightarrow$ `images/blob-full-....webp`
     - Thumbnail (`320×180`, 75% WebP) $\rightarrow$ `images/blob-thumb-....webp`

### Step C: `Comments` Worksheet $\rightarrow$ `CommentEntry`, Room Names & Custom Fields
1. **Column Mapping:**
   - **Sheet / Map Column:** Match by `codePrefix` or full sheet name to `MapPage.id`.
   - **Cell Coordinate Column (`$C$2`, `C2`, etc.):** Normalize via `normalizeCellCoord` to `$Col$Row` and resolve `cellId` to the target `GridCell.id`.
   - **Room Name Column:** Populate `GridCell.roomName` on the target `(mapId, cellCoord)` cell so the Room Name is stored on the room itself and inherited by all comments in that room.
   - **Replies / Content Column:**
     - Parse prefixes / patterns into `CommentCategoryDefinition.id` and `speakerOrTitle`:
       - `T:` / `T1:` / `Tablet` $\rightarrow$ `category: 'tablet'`
       - `NPC:` / `NPC <Name>:` $\rightarrow$ `category: 'npc'`, `speakerOrTitle: 'NPC <Name>'`
       - `Sk:` / `Shortcut` $\rightarrow$ `category: 'shortcut_hint'`
       - `TODO:` $\rightarrow$ `category: 'todo'`
       - Otherwise $\rightarrow$ `category: 'general'`
   - **Race / Tribe Column (Spoiler-Free Custom Field Integration):**
     - Automatically register a filterable `'select'` custom field in `ProjectConfig.customCommentFields`:
       ```json
       {
         "id": "field-race-tribe",
         "name": "Race / Tribe",
         "type": "select",
         "options": ["<distinct values extracted from column>"],
         "showInTable": true,
         "filterable": true
       }
       ```
     - Populate `comment.customFields['field-race-tribe']` for each row.
   - **Embedded Images inside the `Comments` Sheet:**
     - Any `<xdr:pic>` anchored to a row in `Comments` is converted to WebP and appended to that row's `comment.attachmentBlobIds`.

### Step D: Shapes, Callouts, Pins & Arrows on Map Drawings (Optional / Phase 2 of Migration)
- Excel drawing XML (`drawingN.xml`) can also contain `<xdr:sp>` (shapes/textboxes for pins like `?`, `X`, warp labels `-> AcB $A$8`) and `<xdr:cxnSp>` (connector arrows).
- Where present, their `<xdr:from>` cell + intra-cell offset can be converted into `PinMarker` (`xPercent`, `yPercent`, `shortLabel`) and `VectorArrow` / `MapGridArrow` records.

---

## 3. Open Design Questions to Confirm Before Implementation

1. **Exact Column Headers & Structure of `La Mulana 2.xlsx`:**
   - What are the exact column headers in your `Comments` tab, and are there any multi-row merged comments or extra tabs (e.g., Glossary/Mantras) we should map?
2. **In-Cell Text / Shape Annotations on Map Sheets:**
   - Are your room pins/warps in Excel stored as floating Excel Shapes (`<xdr:sp>`), cell text comments, or baked into the pasted screenshots?
3. **Runtime Preference:**
   - Would you prefer a **Python script** (`scripts/migrate_excel.py` using `openpyxl` + `Pillow`) or a **Node/TypeScript script** (`scripts/migrate-excel.ts` using `jszip` + `fast-xml-parser` + `sharp`)?
