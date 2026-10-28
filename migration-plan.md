# Excel Workbook (`.xlsm`) to Tracker `.ZIP` Migration Plan

This document outlines the architecture, data-mapping rules, and edge-case considerations for the standalone migration script (`scripts/migrate_excel.py`) that converts `migration-input/La Mulana 2 - Maps.xlsm` into a portable `.zip` archive importable via **Customize & Backup -> Import Backup (.ZIP)**.

---

## 1. High-Level Pipeline Overview

`La Mulana 2 - Maps.xlsm` is an OpenXML ZIP archive containing XML metadata, RichData in-cell image tables, InkML vector strokes, Threaded Comments, and PNG media assets:
- `xl/workbook.xml` & `xl/_rels/workbook.xml.rels`: Ordered list of worksheet tabs (`Legend`, 15 area map tabs from `YgA Roots of Yggdrasil` to `HmB Hall of Malice`, `Dark Star Lord Footprints`, `Tablet Images`, `General Notes`, `Comments`, `Map Template`).
- `xl/sharedStrings.xml`: Deduplicated string table referenced by worksheet cells.
- `xl/metadata.xml` $\rightarrow$ `xl/richData/rdrichvalue.xml` $\rightarrow$ `xl/richData/richValueRel.xml` $\rightarrow$ `xl/richData/_rels/richValueRel.xml.rels`: Maps cell `vm="1..363"` attributes ("Place in Cell" RichData images) to binary room screenshots in `xl/media/imageN.png`.
- `xl/worksheets/sheetN.xml`: Grid cell contents (`'X'` for unreachable cells, `vm="..."` for room screenshots, and inline text tables).
- `xl/threadedComments/threadedCommentN.xml`: Modern Excel threaded comments anchored to map cells (where the root comment is the Room Name and replies are lore/puzzle notes) and to `Tablet Images` / `Dark Star Lord Footprints`.
- `xl/drawings/drawingN.xml` $\rightarrow$ `xl/ink/inkM.xml` & fallback `xl/media/imageK.png`: Excel Draw pen strokes (`<xdr:contentPart>`) with sub-cell EMU bounding boxes (`<xdr:from>`, `<xdr:to>`, `<xdr14:xfrm>`), InkML brush color (`#F6630D`, `#66CC00`, `#33CCFF`), brush thickness, and vector coordinate traces.

The migration script parses these structures (streaming directly from the `.xlsm` ZIP without extracting raw uncompressed PNGs to disk) and outputs `migration-input/migrated-excel-backup.zip` containing:
1. `project-data.json` (conforming to `BackupJsonPayload`: `config`, `maps`, `cells`, `comments`, `sketches`, `blobMeta`).
2. `images/<blobId>.webp` (full-resolution 90% WebP room screenshots, 320×180 WebP thumbnails, and sketch/tablet image attachments).

---

## 2. Step-by-Step Extraction & Mapping Rules

### Step A: `Legend` Tab $\rightarrow$ `ProjectConfig.markerDefinitions`
All 25 distinct hand-drawn categories in `Legend` (`sheet1.xml` + `drawing1.xml`) are registered in `ProjectConfig.markerDefinitions` with their exact 3-color palette:
- **Orange (`#F6630D`) — Lore, Save & Reading Spots:**
  - `legend_tablet` (`E2: Tablets (' = not read)`), `legend_skeleton` (`E3: Skeleton with info`), `legend_save` (`E4: Save Tablet`), `legend_statue` (`E5: Mural/Statue`, including `"S"` / `"S'"` in `HmB`), `legend_totem` (`E6: Totem Pole`).
- **Green (`#66CC00`) — Puzzles, Gates, Bosses & Key Mechanics:**
  - `legend_question` (`A2: Open Question`), `legend_return` (`A3: Return Later (missing item)`), `legend_soul_gate` (`A4: Soul Gate`), `legend_candlestick` (`A5: Candlestick of Time`), `legend_mimir` (`A6: Bust of Mimir`), `legend_seal` (`A7: Seal`), `legend_mural` (`A8: Mural`), `legend_boss` (`A9: Boss / Guardian`), `legend_ankh` (`A10: Ankh`), `legend_fairy` (`A11: Fairy`), `legend_tree_gate` (`A12: Tree of Life Gate`), `legend_altar_gate` (`A13: Altar Gate`), `legend_reverse_gate` (`A14: Reverse Gate`), plus `legend_warp_gate` (for area transition gates like `AnA`, `IfAB`, `IbAB`).
- **Cyan (`#33CCFF`) — Room Mechanics, Switches, Doors & Traps:**
  - `legend_switch` (`C2: Switches (' = not activated)`), `legend_eye` (`C4: Eye`), `legend_treasure` (`C5: Treasure`), `legend_shop` (`C6: Shop`), `legend_npc` (`C7: NPC`), `legend_map_switch` (`C8: Map Switch`), `legend_trap` (`C9: Trap`), `legend_switch_door` (`C10: 1 or 2 Way Switch Door`), `legend_breakable_wall` (`C11: Breakable Wall`).

---

### Step B: Map Tabs & RichData Room Screenshots $\rightarrow$ `MapPage` & `GridCell`
1. **Map Tabs (15 Area Maps):**
   - `YgA`, `DfA`, `VaB`, `CoB`, `AnA`, `SfA_`, `IbAB`, `IfAB`, `GdA`, `DsB`, `TsA`, `AcB`, `HlA`, `HmB`.
   - Split the sheet name on the first space into `codePrefix` and `name`.
2. **Grid Dimensions & Cell States:**
   - Determine `(rows, cols)` from the bounding box of populated/blocked cells in `sheetN.xml`.
   - Cells with string `'X'` / `'x'` (and no `vm` screenshot) $\rightarrow$ `state: 'blocked_x'`.
   - Cells with `vm="k"` $\rightarrow$ resolve via `xl/metadata.xml` & `xl/richData/rdrichvalue.xml` to `xl/media/imageM.png`, convert to full-res WebP (`1280×720` max, 90% quality) and thumbnail WebP (`320×180`, 75% quality), and set `state: 'room'`.

---

### Step C: `Comments` Tab, Threaded Comments & `General Notes` $\rightarrow$ `CommentEntry`
1. **Map Room Comments (`sheet19.xml` + `threadedCommentN.xml`):**
   - Populate `GridCell.roomName` from the `Room Name` column (and root threaded comment on each cell).
   - Map reply prefixes into `CommentCategoryDefinition.id`:
     - `T:` / `Tablet` $\rightarrow$ `'tablet'`
     - `NPC:` / `Statue of ...:` / `Mail ...:` $\rightarrow$ `'npc'`
     - `Sk:` / `Shortcut` $\rightarrow$ `'shortcut_hint'`
     - `TODO:` $\rightarrow$ `'todo'`
     - `Gate: <MapCode> <Coord>` $\rightarrow$ `'general'` (and cross-referenced to automatically link Warp/Gate `PinMarker`s in that cell to `targetMapId` and `targetCellId`).
     - Otherwise $\rightarrow$ `'general'`.
   - Register the spoiler-free `'Race / Tribe'` custom select field (`field-race-tribe`) from Column E of `Comments`.
2. **`General Notes` Tab (`sheet18.xml`):**
   - Migrate `SKULLS`, `JOURNAL`, and `OVERWORLD NPCS` rows as global `CommentEntry` records (with `speakerOrTitle` set to Column A and `content` set to Column B).

---

### Step D: Excel Ink Sketches (`xl/drawings/drawingN.xml` & `xl/ink/inkM.xml`) $\rightarrow$ `PinMarker`, `VectorArrow` & `MapGridArrow`
1. **Noise Filtering:**
   - Filter out stray single-pixel pen taps (`cx < 15,000` and `cy < 15,000` EMUs, or alpha mask $\le 3\times 3$ px).
2. **Modifier Grouping (`X` = Solved, `'` = Unread/Unactivated):**
   - Detect overlapping `X` strokes on top of an icon or arrow in the same cell and set `resolved: true` on the underlying marker.
   - Detect adjacent `'` tick strokes (`F2` / `D2`) next to Tablets (`E2`), Switches (`C2`), or Statues (`E5`) and mark the pin `shortLabel` with `'` (unread/unactivated, `resolved: false`).
   - In `HmB`, map handwritten orange `"S"` / `"S'"` strokes to `legend_statue` (`E5: Mural/Statue`).
3. **Lines, Paths, Dividers & Arrows:**
   - **Cross-Cell Strokes:** Ink strokes spanning between two adjacent cells $\rightarrow$ `MapGridArrow` on the `MapPage`.
   - **Plain Non-Grid-Aligned Divider / Barrier / Corridor Lines:** Single-trace or U-box plain lines without arrowheads (`>= 20%` span) $\rightarrow$ `VectorArrow` with `hasArrowhead: false`.
   - **Dashed Lines (`- - -` in `DfA C4/C5`, etc.):** Multi-collinear short dash traces $\rightarrow$ `VectorArrow` with `dashed: true`, `hasArrowhead: false`.
   - **Directional Intra-Room Arrows (`C3: Notes/Relations` & movement drops):** $\rightarrow$ `VectorArrow` with `hasArrowhead: true` traced along the InkML path coordinates.
4. **Point Icons & Handwritten Labels:**
   - **Short Vertical/Squiggly Bars (`< 20%` span):** Classify via aspect/waviness into `legend_switch_door` (`C10`), `legend_breakable_wall` (`C11`), or `legend_mural` (`A8`).
   - **Handwritten Gate / Boss Labels:** Match against the cell's `Gate: <Map> <Coord>` comments and known boss rooms (`Rat`, `Nid`, `Hugin & Munin`, etc.) to create linked Gate or Boss `PinMarker`s with `shortLabel`, `targetMapId`, and `targetCellId`.
   - **All Remaining Icons:** Classify against the 25 `Legend` templates using color, brush width, trace count, and normalized $32\times 32$ alpha mask similarity, placing a `PinMarker` at the exact `(xPercent, yPercent)` center of the ink bounding box.

---

### Step E: `Tablet Images` (`sheet17.xml`) & `Dark Star Lord Footprints` (`sheet12.xml`)
1. **`Tablet Images` Cross-Linking & Fallback Sketches:**
   - Parse the 11 area columns (`AnA`, `IbAB`, `SfA`, `DfA`, `VaB`, `IfA`, `TsA`, `Ds_`, `CoB`, `Ac_`, `Hm_`) and their threaded comments (`D4 T1`, `B5`, `C2`, `Coords?`, etc.).
   - Composite any ink annotations drawn over a tablet cell onto the tablet screenshot.
   - **When the threaded comment specifies a valid cell coordinate (e.g., `AnA D4 T1`, `DfA B5`, `VaB C2`):** Attach the WebP tablet image directly to the matching `CommentEntry.attachmentBlobIds` in that room (or create a `'tablet'` `CommentEntry` in that room if none exists yet).
   - **When the coordinate is unknown or ambiguous (`Coords?`, `Ac_ to ?`, `Post Corridor of Blood, wall art`):** Create a `SketchNote` on the Sketches board linked to that area's `mapId` with title `"[Unlinked Tablet Image] <Area> — <Note>"` so it is clearly flagged for review.
2. **`Dark Star Lord Footprints` (`sheet12.xml`):**
   - Render a high-resolution composite diagram of the 4×8 footprints grid (combining the 20 cell screenshots, the 19 footprint clue labels from `threadedComment11.xml`, the floating diagram image, and the 4 ink annotations) and save it as a `SketchNote` titled `"Dark Star Lord Footprints Puzzle Grid"` linked to `DsB Dark Star Lord's Mausoleum`.
