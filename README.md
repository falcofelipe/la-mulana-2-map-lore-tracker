# La-Mulana 2 — Interactive Map & Lore Tracker

A local-first, spoiler-free web application designed for **La-Mulana 2** (and similar metroidvania / archaeological puzzle games) to replace complex multi-tab spreadsheets. It unifies a **16:9 Visual Room Grid**, **Pin & Vector Arrow Annotations**, a **Relational Tablet/NPC/TODO Lore Database**, and a **Freehand Sketch Pad** in a single fast workspace.

---

## ✨ Key Features

- **Multi-Map Field Tabs:** Create, rename, reorder, and delete map tabs (e.g. `YgA Roots of Yggdrasil`, `DfA Divine Fortress`) with Excel-style `$Col$Row` coordinates (`$C$2`, `$D$4`).
- **4-Edge Dynamic Grid Expansion:** Add or remove rows and columns on any edge (**Top, Bottom, Left, Right**). Adding rows above or columns to the left automatically shifts existing cell coordinates and updates all linked comments in a single atomic transaction.
- **High-Performance Local WebP Screenshot Storage:**
  - Paste 16:9 game screenshots directly from your clipboard (`Ctrl+V`) or drag-and-drop image files onto any grid cell.
  - Automatically encodes pasted screenshots into **90% quality WebP (`image/webp`)** (~85–90% smaller than raw PNGs) plus a lightweight macro-grid thumbnail, stored as native binary `Blob`s in **IndexedDB** (`Dexie.js`)—bypassing `localStorage`'s 5 MB cap completely.
- **Dual-Mode Room Inspector (Split Drawer or Full Modal):**
  - **Percentage-Anchored Pin Markers (`0–100%`):** Place, drag-to-reposition, edit, and check off markers (`Resolved`) for Chests/Switches, Tablets/Lore, Unsolved Mysteries (`?`), Traps/Hazards (`X`), Bosses (`Raijin / Fujin`), Warps (`-> AcB $A$8`), or your own custom marker categories.
  - **2-Click Vector Arrows:** Draw one-way or bidirectional, solid or dashed SVG movement paths over rooms.
- **Relational Comments, Tablets & NPC Log:**
  - Linked directly to `Map + Cell` coordinates—renaming a room automatically updates every linked comment.
  - Automatic visual highlighting for `ALL-CAPS` lore keywords (e.g., `GOLDEN WINGS`, `UNDERWORLD`).
  - **Built-in Freehand Sketch Pad:** Draw tablet symbols, mantra sequences, or Yggdrasil root diagrams directly in the app and attach them to comments or the global **Sketches & Notes** board.
- **Spoiler-Free & Fully Customizable:**
  - Starts **100% blank and spoiler-free** by default so new players can share and use the app without seeing late-game area names or tribes.
  - Inline-editable **Race / Tribe / People** dropdown options.
  - Add custom **Marker Types** and custom **Comment Fields / Table Columns** in the **Customize & Backup** tab without touching code.
- **One-Click Portable `.ZIP` Backups:** Export all JSON tables and `/images/*.webp` screenshots into a single `.zip` archive (`JSZip`) for backup or sharing maps with friends.

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| **`Click Cell` + `Ctrl+V`** | Paste a 16:9 screenshot from clipboard directly into the selected (or inspected) room |
| **`Click Cell` + `X`** | Toggle the **Blocked / Out-of-Bounds (`X`)** state on the selected cell |
| **`Double-Click Cell`** or **`Enter`** | Open the **Room Detail Inspector** for the selected cell |
| **`Ctrl+K`** (or **`Cmd+K`**) | Open the **Global Search Palette** across all rooms, pins, tablets, NPCs, and TODOs |
| **`Esc`** | Close the active modal or Room Inspector |

---

## 🚀 Getting Started (Local Development)

### Prerequisites
- [Node.js](https://nodejs.org/) (v18+ recommended)

### Install & Run
```bash
# 1. Install dependencies
npm install

# 2. Start the local development server
npm run dev

# 3. Build for production (outputs static bundle to /dist)
npm run build
```

---

## 🌐 Hosting & Open-Source Sharing Guide

### Static Web Hosting (GitHub Pages, Cloudflare Pages, Vercel, Netlify)
Because this application is **100% client-side ("local-first")** and uses `base: './'` in `vite.config.ts`:
- You can deploy the `dist/` folder to **GitHub Pages** or **Cloudflare Pages** with **zero code changes** and **$0 hosting cost**.
- Every player who visits the hosted URL gets their own private, isolated **IndexedDB** database stored on their own computer—meaning **no server upload limits** and complete privacy.

### Project Directory Structure
```text
src/
├── config/
│   └── defaultDefinitions.ts   # Spoiler-free defaults + optional Starter Sample Dataset
├── types/
│   └── models.ts               # Core TypeScript interfaces (MapPage, GridCell, CommentEntry, ProjectConfig)
├── db/
│   ├── database.ts             # Dexie.js IndexedDB schema & initialization
│   ├── repository.ts           # Atomic CRUD operations & 4-edge coordinate shifting
│   ├── imageProcessor.ts       # Offscreen Canvas 90% WebP encoder & thumbnail generator
│   └── backupService.ts        # JSZip full archive export & import
├── hooks/
│   └── useBlobUrl.ts           # Automatic ObjectURL lifecycle management for IndexedDB Blobs
├── utils/
│   ├── coordinates.ts          # Excel-style ($C$2 <-> row/col) conversion helpers
│   └── textHighlight.tsx       # Automatic ALL-CAPS lore keyword highlighter
└── components/
    ├── common/                 # MarkerIcon, VectorArrowSvg, BlobImagePreview
    ├── layout/                 # TopNavbar, MapTabsBar, GlobalSearchModal
    ├── map/                    # MacroMapGrid, GridCellCard
    ├── inspector/              # RoomDetailDrawer, AnnotatedRoomCanvas
    ├── comments/               # CommentsTableView, RaceTribeSelector
    ├── sketches/               # SketchesBoardView, SketchCanvasModal
    └── settings/               # SettingsAndCustomizeView
```
