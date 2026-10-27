# La-Mulana 2 Map & Lore Tracker — Product & Technical Specification

## 1. Project Overview & Objective

Build a local-first web application (optionally wrapped as a desktop app via Tauri/Electron) that replaces a complex multi-tab Microsoft Excel workbook used to map rooms, annotate puzzles/traps, and catalog tablet writings, NPC dialogue, and sketches for **La-Mulana 2**.

### Why Migrate Away from Excel?
In the original Excel workflow:
- Users manually paste room screenshots into fixed grid cells (`$A$1`, `$B$2`, etc.) and mark unreachable cells with an `X`.
- Users draw freehand ink/shapes on top of cells to point out traps, switches, chests, bosses (`Raijin / Fujin`), unsolved mysteries (`?`), and room-to-room movement paths or warps (`$A$8 (wB)`).
- Users maintain a separate **Comments** sheet where rows manually reference the `Sheet` (Map name), `Cell` (`$C$2`), `Room Name` (`Room of Generations`), `Replies` (Tablets `T:`, NPC quotes `NPC Thor:`, `Sk:` shortcuts, `TODO:` reminders, and `IMAGE` placeholders), and `Race/Tribe` (`6 AESIR`, `6 VANIR`, `Underworld`), alongside freehand sketches (such as tree-root maps) floating next to the table.

This application unifies the **Visual Map Grid**, **Pin/Path Annotations**, and **Relational Lore/Comments Database** so coordinates never drift, screenshots stay locked to cells, and clicking any room immediately reveals both its high-resolution annotated screenshot and all linked tablets/NPC notes.

---

## 2. Core Functional Requirements

### 2.1 Multi-Map Tab Management
- **Customizable Map Pages:** Users can create, rename, reorder, and delete map tabs representing different in-game fields (e.g., `YgA Roots of Yggdrasil`, `DfA Divine Fortress`, `TsA Takamagahara Shrine`, `AcB Ancient Chaos`, `HlA Heaven's Labyrinth`, `HmB Hall of Malice`).
- **Configurable Grid Dimensions:** Each map tab supports a configurable grid size (defaulting to e.g. `8 columns × 7 rows`, expandable dynamically by adding rows/columns on any edge without shifting existing coordinate keys).
- **Excel-Style Coordinate Labels:** Columns are labeled `A, B, C...` and rows `1, 2, 3...`, displaying cell coordinates in standard format (`$C$2`, `$D$4`) for familiarity with the original spreadsheet.
- **Global Views:** Dedicated tabs for **All Comments / Lore Database**, **Tablet Sketches & General Notes**, and **Project Backup (Export/Import)**.

### 2.2 Grid Cell Capabilities (Macro Map View)
- **Screenshot Background Assignment:**
  - Each cell accepts a 16:9 game screenshot via **Clipboard Paste (`Ctrl+V`)**, **Drag-and-Drop**, or file picker.
  - The screenshot renders as the persistent background of that cell at its native 16:9 aspect ratio.
  - Replacing or clearing the screenshot preserves all metadata, markers, and comments attached to that cell.
- **Cell State Toggles:**
  - **Normal / Unexplored:** Empty cell awaiting a screenshot.
  - **Blocked / Out-of-Bounds (`X`):** Displays a clean `X` state (matching the Excel layout) for grid coordinates where no room exists.
  - **Visited / Completed:** Optional visual border or badge indicating room completion status.
- **Cell Properties (Metadata):**
  - `roomName` (e.g., `"Verdandi's Root"`, `"Dark Star Lord's Footprint"`, `"Gate of Yggdrasil"`, `"Room of Generations"`).
  - `coordinates` (e.g., `"$C$2"`).
  - `tags` / `flags` (e.g., Save Point, Grail Tablet, Ankh Jewel, Boss Room).
- **Macro Overlay Preview:**
  - On the full map grid, cells display their screenshot along with compact, toggleable pin icons and directional arrows so the user can read the overall dungeon flow at a glance.

### 2.3 Dual-Mode Room Inspector & Map Annotations
Clicking or double-clicking any cell opens the **Room Detail View** (either as a split-screen inspector or a large modal/page view) while keeping the ability to toggle annotations directly on the macro grid:

1. **Point Markers (Pin System):**
   - Clicking anywhere on the room screenshot places a marker at relative percentage coordinates (`xPercent: 0–100`, `yPercent: 0–100`) so markers stay anchored regardless of screen size or zoom level.
   - **Predefined Marker Categories (with custom Legend support):**
     - **Chest / Item (`Orange Circle`):** Treasure chests, item pickups, or weight switches.
     - **Tablet / Lore (`Blue Tablet Icon`):** Stone tablets, skeletons, or readable murals (can link directly to a specific Comment entry).
     - **Puzzle / Mystery (`Green ? Circle`):** Unsolved puzzles, sealed sigils, or suspicious mechanisms.
     - **Trap / Hazard (`Red/Orange X or Warning`):** Fake floors, crushers, or spike triggers.
     - **Boss / Miniboss (`Green/Crossed Icon + Text Label`):** Named encounters (e.g., `Raijin / Fujin`).
     - **Warp / Transition (`Cyan Portal Badge`):** Teleport destinations with target coordinate labels (e.g., `-> AcB $A$8`).
   - Each marker supports a short hover label, detailed tooltip note, and a "Resolved/Completed" checkbox (which dims or checks off the marker once solved without deleting it).

2. **Directional Arrows & Movement Paths (2-Click Vector Tool):**
   - To replace Excel freehand arrows showing one-way drops, hidden passages, or platforming routes, users can select the **Path/Arrow Tool**:
   - Click start point `(x1%, y1%)` and end point `(x2%, y2%)` (or multi-point polyline) to render a crisp SVG arrow overlay (solid, dashed, or bidirectional) in selectable colors (cyan, green, orange).
   - Arrows can span within a single cell or across adjacent cells on the macro grid.

### 2.4 Relational Comments, Tablets & NPC Log
Replaces the Excel `Comments` sheet and `Tablet Images` sheet with a structured database linked directly to Map + Cell coordinates:
- **Linked to Specific Cells:** Every comment entry belongs to a `mapId` and `cellCoord` (e.g., `DfA Divine Fortress` -> `$C$2`), automatically inheriting and syncing the cell's `Room Name` (`Room of Generations`) so the user never has to type the room name twice.
- **Multiple Entries Per Cell:** A single room (like `$C$2 Room of Generations`) can hold any number of separate entries.
- **Entry Classification & Properties:**
  - `category`: **Tablet (`T`)**, **NPC Dialogue (`NPC`)**, **Shortcut/Hint (`Sk`)**, **Reminder (`TODO`)**, or **General Note**.
  - `speakerOrTitle`: Optional speaker or header (e.g., `"NPC Thor (after Mjolnir)"`, `"NPC Hermod"`, `"NPC Tyr"`, `"T2: The Alfr Seeress' Prophecy P1"`).
  - `content`: Rich text / multiline transcript supporting uppercase keyword highlighting (e.g., `GOLDEN WINGS`, `GLOVE OF POWER`, `FIRE`, `EARTH`, `UNDERWORLD`).
  - `raceOrTribe`: Filterable tag/dropdown (e.g., `6 AESIR`, `6 VANIR`, `Underworld`, `Alfr`, `Dwarf`).
  - `isTodoResolved`: Boolean toggle for `TODO` entries (e.g., *"TODO: Find what is needed to press the Yuga switch without the spikes appearing"*).
  - `attachedImages`: Ability to paste or upload reference screenshots or draw/attach simple visual sketches (replacing the `IMAGE OF TREE ROOTS` / `IMAGE: 3 knots with medallions` text placeholders and the freehand Yggdrasil root diagram in the Excel sheet).
- **Global Search & Filtering:**
  - In the **Comments Tab**, users can filter by Map, Cell Coordinate, Room Name, Category (`TODO` only, `Tablet` only, `NPC` only), Race/Tribe, or full-text keyword search across all maps (crucial for cross-referencing La-Mulana 2 riddles and mantras).
  - Clicking any row in the Comments table jumps directly to that Map and opens the corresponding Cell.

---

## 3. Data Model & TypeScript Schema

Use the following schema as the foundation for application state and IndexedDB persistence:

```typescript
export type CellState = 'empty' | 'room' | 'blocked_x';

export type MarkerType =
  | 'item_chest'      // Orange dot in user's Excel map
  | 'tablet_npc'      // Blue tablet/NPC icon
  | 'mystery_puzzle'  // Green '?' circle
  | 'trap_hazard'     // Orange/Red 'X' or hazard
  | 'boss_enemy'      // Boss/Guardian marker with text label (e.g. "Raijin / Fujin")
  | 'warp_door'       // Teleport or cross-map connection (e.g. "AcB (wB)")
  | 'custom';

export type CommentCategory = 'tablet' | 'npc' | 'shortcut_hint' | 'todo' | 'general';

export interface PinMarker {
  id: string;
  xPercent: number; // 0 to 100 relative to cell width
  yPercent: number; // 0 to 100 relative to cell height
  type: MarkerType;
  color: string;    // Hex color override
  shortLabel?: string; // Rendered next to pin if present (e.g. "?", "Raijin/Fujin", "AcB")
  notes?: string;
  linkedCommentId?: string; // Optional direct link to a CommentEntry
  resolved: boolean;
}

export interface VectorArrow {
  id: string;
  points: { xPercent: number; yPercent: number }[]; // Start, optional midpoint(s), end
  color: string; // e.g., '#00bfff' (cyan), '#32cd32' (green)
  bidirectional: boolean;
  dashed: boolean;
  label?: string;
}

export interface GridCell {
  coord: string;        // e.g., "$C$2"
  row: number;          // 0-indexed row
  col: number;          // 0-indexed col
  mapId: string;
  state: CellState;     // 'empty' | 'room' | 'blocked_x'
  roomName: string;     // e.g., "Room of Generations"
  screenshotBlobId?: string; // Reference to image blob in IndexedDB
  markers: PinMarker[];
  arrows: VectorArrow[];
  updatedAt: number;
}

export interface MapPage {
  id: string;
  codePrefix: string;   // e.g., "YgA", "DfA", "TsA", "AcB", "HlA", "HmB"
  name: string;         // e.g., "Roots of Yggdrasil", "Divine Fortress"
  rows: number;         // e.g., 7
  cols: number;         // e.g., 8
  order: number;
}

export interface CommentEntry {
  id: string;
  mapId: string;        // Links to MapPage.id
  cellCoord: string;    // e.g., "$C$2" (auto-resolves Room Name from GridCell)
  category: CommentCategory; // 'tablet' | 'npc' | 'shortcut_hint' | 'todo' | 'general'
  speakerOrTitle?: string;   // e.g., "NPC Thor (after Mjolnir)", "T2: The Alfr Seeress' Prophecy P1"
  content: string;           // Full text of tablet, dialogue, or TODO
  raceOrTribe?: string;      // e.g., "6 AESIR", "6 VANIR", "Underworld"
  resolved?: boolean;        // Useful for 'todo' items
  attachmentBlobIds: string[]; // Attached tablet symbol images or sketches
  createdAt: number;
}
```

---

## 4. Recommended Technical Architecture

| Layer | Technology | Rationale |
| :--- | :--- | :--- |
| **Frontend Framework** | **React 18 + TypeScript + Vite** | Fast local development, strong typing for relational IDs between cells, markers, and comments. |
| **Styling & UI** | **Tailwind CSS + Lucide Icons** | Dark-mode UI reduces eye strain while playing and makes vibrant game screenshots and neon markers pop. |
| **Local Storage Engine** | **IndexedDB via `Dexie.js`** | `localStorage` is limited to ~5MB and will choke on screenshots. `Dexie.js` (IndexedDB) stores gigabytes of raw `Blob` images and structured relational tables natively in the browser with instant querying. |
| **Interactive Annotations** | **HTML5 SVG Overlay + CSS `%` Positioning** | Placing an SVG + HTML pin layer directly over the `16:9` cell image container gives crisp vector arrows and clickable pins without complex `<canvas>` state management. |
| **Sketch / Doodle Pad** | **Lightweight Canvas Modal (optional)** | A simple drawing canvas modal for sketching tablet shapes or tree-root diagrams (like the Yggdrasil sketch on the Excel Comments tab) and saving them as PNG attachments. |
| **Backup & Portability** | **`JSZip` Export / Import** | Allows exporting all JSON tables (`maps.json`, `cells.json`, `comments.json`) plus a `/screenshots` folder into a single `.zip` archive so no progress is ever lost. |
| **Desktop Packaging (Optional)** | **Tauri** or **Electron** | Can wrap the Vite build into a standalone Windows/macOS desktop executable if desired. |

---

## 5. UI / UX Layout Specification

### 5.1 Top Navigation Bar
- **Map Selector Tabs:** Quick-switch tabs for all created maps (`YgA Roots of Yggdrasil`, `DfA Divine Fortress`, etc.) + `+ New Map` button.
- **View Mode Switcher:**
  - `Map Grid View` (Interactive 2D screenshot grid + side inspector)
  - `Comments & Lore Table` (Spreadsheet-style filterable table view matching the user's second screenshot)
  - `Sketches & General Notes` (Freeform board for global puzzles like the Yggdrasil tree diagram)
- **Global Search Input:** Instant search bar (`Ctrl+K`) that searches Room Names, Tablet text, NPC replies, and `TODO` items across the entire game.
- **Export / Import Backup Button:** One-click JSON/ZIP save.

### 5.2 Map Grid View (Main Workspace)
- **Zoomable / Pannable Grid Canvas:**
  - Displays column headers (`A, B, C, D, E, F, G...`) and row headers (`1, 2, 3, 4, 5, 6...`).
  - Each cell maintains a strict `16:9` aspect ratio matching *La-Mulana 2* screen dimensions.
  - **Hovering or Selecting a Cell:** Highlights the border, displays the `$Col$Row` badge and `Room Name` banner, and allows immediate `Ctrl+V` screenshot pasting or pressing `X` on the keyboard to toggle the unreachable `X` marker.
  - **Layer Visibility Toggles:** Checkboxes in the toolbar to show/hide Pins, Arrows, Room Names, or Completed Markers on the macro map.

### 5.3 Room Detail Inspector (Drawer or Modal View)
Triggered when clicking a cell (or pressing `Enter` on a selected cell):
- **Left / Top Pane — High-Res Annotated Room Canvas:**
  - Displays the room screenshot large and clear.
  - **Annotation Toolbar:** Select between `Cursor/Inspect`, `Add Pin` (with icon/color picker: Chest, Tablet, Puzzle `?`, Hazard, Boss, Warp), or `Draw Arrow` (click start -> click end).
  - Clicking an existing pin edits its label/notes, toggles `Resolved`, or jumps to its linked comment.
- **Right / Bottom Pane — Room Properties & Linked Comments:**
  - Editable `Room Name` input (automatically updates all linked comments).
  - List of all **Comments / Tablets / NPCs / TODOs** for this specific cell (`$C$2`), styled with color-coded badges (`T`, `NPC`, `TODO`, `6 AESIR`, `Underworld`).
  - **Quick-Add Comment Form:** Pre-filled with the current Map and Cell ID so adding a new tablet or NPC quote takes seconds.

### 5.4 Comments & Lore Table View
Mirrors and upgrades the Excel `Comments` tab:
- Columns: `Map (Sheet)` | `Cell ($C$2)` | `Room Name` | `Type (T/NPC/TODO)` | `Replies / Content` | `Race/Tribe` | `Attachments` | `Actions`.
- Multi-column filter bar at the top (filter by Map, Room Name, Type, Race/Tribe, Unresolved `TODO`s, or text query).
- Clicking any cell coordinate (`$D$4`) navigates straight to that room on the map grid.

---

## 6. Implementation Roadmap for Antigravity

When starting this project in Antigravity, execute in the following milestones:

1. **Milestone 1 — Project Scaffold & Dexie Database:**
   - Initialize a Vite + React + TypeScript + Tailwind CSS project.
   - Set up `db.ts` using `Dexie` with tables for `maps`, `cells`, `comments`, and `blobs`.
   - Seed initial sample data based on the user's Excel workbook (`YgA Roots of Yggdrasil` and `DfA Divine Fortress`, including sample comments like `$C$1 Verdandi's Root`, `$C$2 Room of Generations`, etc.) so the UI can be tested immediately.
2. **Milestone 2 — Interactive Map Grid & Screenshot Handling:**
   - Build the dynamic `rows × cols` CSS Grid with Excel-style headers (`A..G`, `1..6`).
   - Implement cell selection, keyboard `X` toggle for blocked rooms, drag-and-drop image upload, and `Ctrl+V` clipboard screenshot paste stored as `Blob` in IndexedDB.
3. **Milestone 3 — Room Detail Modal & Pin/Arrow Annotation System:**
   - Build the zoomed-in Room Detail view with the SVG + percentage-pin overlay.
   - Implement the marker palette (Chest/Switch orange circle, Tablet blue icon, Mystery green `?`, Trap red/orange `X`, Boss label, Warp badge) and the 2-click SVG directional arrow tool.
4. **Milestone 4 — Relational Comments Database & Sketch Attachments:**
   - Build the linked comment list inside the Room Detail panel and the full-screen filterable **Comments Table View**.
   - Add image/sketch attachment support (via clipboard paste or a simple freehand sketch pad modal) so tablet symbols and lore diagrams live alongside the table.
5. **Milestone 5 — Full Backup Export/Import:**
   - Add one-click export/import (`JSZip` or JSON bundle) so the user can back up their maps and screenshots to disk at any time.
