/**
 * Core Data Models & TypeScript Schema
 * ------------------------------------
 * Designed for local-first IndexedDB storage (via Dexie.js) and built-in
 * extensibility so users can add custom marker types, custom comment fields,
 * and spoiler-free Race/Tribe dropdown tags without schema refactoring.
 */

export type CellState = 'empty' | 'room' | 'blocked_x';

/**
 * Available icon identifiers that can be assigned to built-in or user-created
 * marker types. Mapped to Lucide icons in the UI layer.
 */
export type MarkerIconKey =
  | 'chest'
  | 'tablet'
  | 'mystery'
  | 'trap'
  | 'boss'
  | 'warp'
  | 'star'
  | 'key'
  | 'skull'
  | 'flag'
  | 'eye'
  | 'flame';

/**
 * Data-driven definition for a map pin marker category.
 * Stored in ProjectConfig so users can edit existing markers or create new ones.
 */
export interface MarkerDefinition {
  id: string;
  name: string;
  description: string;
  iconKey: MarkerIconKey;
  defaultColor: string;           // Hex color (e.g. '#f97316')
  defaultSymbol?: string;         // Optional badge character (e.g. '?', 'X')
  showShortLabelOnMacro: boolean; // Whether to display shortLabel text on the macro grid
  isBuiltIn?: boolean;
}

/**
 * Data-driven definition for a Comment / Lore entry classification.
 */
export interface CommentCategoryDefinition {
  id: string;               // e.g. 'tablet', 'npc', 'shortcut_hint', 'todo', 'general'
  code: string;             // Short badge code (e.g. 'T', 'NPC', 'Sk', 'TODO', 'NOTE')
  name: string;             // Display label
  badgeColor: string;       // Hex color for badges
  supportsResolved: boolean;
}

/**
 * User-definable custom field for CommentEntry items.
 * Allows players to add extra columns/inputs (e.g., "Mantra", "Required Item")
 * without modifying the core database schema.
 */
export interface CustomFieldDefinition {
  id: string;
  name: string;
  type: 'text' | 'select';
  options?: string[];       // Used when type === 'select'
  showInTable: boolean;     // Whether to render as a column in CommentsTableView
  filterable?: boolean;     // Whether to render a filter dropdown in CommentsTableView top bar
}

/**
 * Global project settings and customizable definitions stored in IndexedDB.
 */
export interface ProjectConfig {
  id: 'singleton';
  projectTitle: string;
  markerDefinitions: MarkerDefinition[];
  commentCategories: CommentCategoryDefinition[];
  /**
   * Starts empty by default to prevent spoilers for new playthroughs.
   * Players can add/edit room flags (e.g., "Save Point") inline as they discover them.
   */
  roomFlagOptions: string[];
  customCommentFields: CustomFieldDefinition[];
  updatedAt: number;
}

/**
 * Percentage-anchored pin marker placed on a room's 16:9 canvas.
 */
export interface PinMarker {
  id: string;
  xPercent: number;         // 0 to 100 relative to cell width
  yPercent: number;         // 0 to 100 relative to cell height
  typeId: string;           // References MarkerDefinition.id
  color: string;            // Hex color override
  shortLabel?: string;      // Rendered next to pin if present (e.g. "?", "Raijin / Fujin", "-> AcB $A$8")
  notes?: string;           // Detailed tooltip/inspector note
  linkedCommentId?: string; // Optional direct link to a CommentEntry.id (in this room or any room/map)
  targetMapId?: string;     // Optional target MapPage.id (for warps, transitions, or cross-room gates)
  targetCellId?: string;    // Optional stable target GridCell.id (survives row/col coordinate shifts)
  isBidirectionalWarp?: boolean; // Optional flag indicating a 2-way warp/connection
  resolved: boolean;        // Dims or checks off marker once completed/solved
}

/**
 * 2-click or multi-point vector arrow representing movement paths,
 * one-way drops, or hidden passages inside a room.
 */
export interface VectorArrow {
  id: string;
  points: { xPercent: number; yPercent: number }[];
  color: string;            // Hex color (e.g. '#06b6d4' cyan, '#22c55e' green, '#f97316' orange)
  bidirectional: boolean;
  dashed: boolean;
  hasArrowhead?: boolean;   // Defaults to true; when false, renders a plain solid/dashed vector line without arrowheads
  label?: string;
}

/**
 * Cardinal doorway / passage directions on a GridCell border.
 */
export type PassageDirection = 'top' | 'right' | 'bottom' | 'left';

export type CellPassages = Partial<Record<PassageDirection, boolean>>;

/**
 * Cross-cell vector arrow rendered on the Macro Map Grid between two cells
 * (e.g., long vertical drops, multi-room shafts, or hidden tunnels).
 */
export interface MapGridArrow {
  id: string;
  fromCellId: string;
  toCellId: string;
  color: string;
  bidirectional: boolean;
  dashed: boolean;
  label?: string;
}

/**
 * Represents a single coordinate cell (e.g. $C$2) on a MapPage grid.
 */
export interface GridCell {
  id: string;               // Stable UUID (persists even if grid rows/cols are shifted)
  mapId: string;            // Links to MapPage.id
  row: number;              // 0-indexed row
  col: number;              // 0-indexed col
  coord: string;            // Excel-style coordinate string (e.g. "$C$2")
  state: CellState;         // 'empty' | 'room' | 'blocked_x'
  roomName: string;         // e.g. "Room of Generations"
  isCompleted?: boolean;    // Optional visual completion status
  tags: string[];           // Room flags (e.g., "Save Point", "Grail Tablet", "Ankh Jewel")
  openPassages?: CellPassages; // Optional 1-click doorway toggles on cell borders
  screenshotBlobId?: string;// High-resolution 90% WebP image in IndexedDB
  thumbnailBlobId?: string; // Lightweight WebP thumbnail for fast macro-grid rendering
  markers: PinMarker[];
  arrows: VectorArrow[];
  updatedAt: number;
}

/**
 * Represents a single field / area map tab (e.g., "YgA Roots of Yggdrasil").
 */
export interface MapPage {
  id: string;
  codePrefix: string;       // Short prefix (e.g., "YgA", "DfA", "TsA", "AcB")
  name: string;             // Full area name (e.g., "Roots of Yggdrasil")
  rows: number;             // Number of grid rows (default 7)
  cols: number;             // Number of grid columns (default 8)
  order: number;            // Tab display order
  gridArrows?: MapGridArrow[]; // Cross-cell arrows drawn on the Macro Map Grid
  manualOutgoingMapIds?: string[]; // Optional manual map-level connections
  createdAt: number;
}

/**
 * Relational comment, tablet transcript, NPC dialogue, shortcut note, or TODO item.
 * Automatically inherits the Room Name from its linked GridCell.
 */
export interface CommentEntry {
  id: string;
  mapId: string;            // Links to MapPage.id
  cellId?: string;          // Stable reference to GridCell.id
  cellCoord: string;        // Excel coordinate (e.g., "$C$2")
  category: string;         // References CommentCategoryDefinition.id
  speakerOrTitle?: string;  // e.g., "NPC Thor (after Mjolnir)", "T2: The Alfr Seeress' Prophecy P1"
  content: string;          // Full transcript, riddle text, or TODO details
  customFields?: Record<string, string>; // Values for user-defined CustomFieldDefinitions (text or select)
  relatedCommentIds?: string[]; // Cross-references to other CommentEntry.id items (tablets, NPCs, TODOs)
  relatedCellIds?: string[];    // Cross-references to other GridCell.id rooms
  resolved: boolean;        // Completion flag (primarily for 'todo' entries)
  attachmentBlobIds: string[]; // Attached tablet symbol crops or freehand sketches
  createdAt: number;
  updatedAt: number;
}

/**
 * Freeform visual sketch or general puzzle board note (for global puzzles
 * like the Yggdrasil root map or mantra combinations).
 */
export interface SketchNote {
  id: string;
  title: string;
  description: string;
  mapId?: string;           // Optional association with a specific map
  imageBlobId?: string;     // WebP blob of the freehand canvas drawing or pasted image
  createdAt: number;
  updatedAt: number;
}

/**
 * Binary image record stored in the IndexedDB `blobs` table.
 */
export interface ImageBlobRecord {
  id: string;
  blob: Blob;
  mimeType: string;
  width: number;
  height: number;
  byteSize: number;
  createdAt: number;
}

/**
 * Layer visibility toggles for the Macro Map Grid View.
 */
export interface MapLayerVisibility {
  showPins: boolean;
  showArrows: boolean;
  showRoomNames: boolean;
  showCoordBadges: boolean;
  showResolvedMarkers: boolean;
}
