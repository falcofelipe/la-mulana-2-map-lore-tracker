/**
 * Default Project Definitions & Optional Sample Data
 * --------------------------------------------------
 * 1. Provides spoiler-free default marker categories, comment categories, and blank
 *    race/tribe options for new playthroughs and open-source sharing.
 * 2. Provides an optional "Starter / Sample Dataset" (based on the Excel workbook
 *    in initial_prompt.md) that users can load via Settings/Backup with one click.
 */

import {
  CommentCategoryDefinition,
  GridCell,
  MapPage,
  MarkerDefinition,
  ProjectConfig,
  SeamlessCaptureConfig,
  TabletScannerConfig,
} from '../types/models';
import { formatCellCoord } from '../utils/coordinates';

export const DEFAULT_TABLET_SCANNER_CONFIG: TabletScannerConfig = {
  headerTargetMode: 'speaker_or_title',
  targetCustomFieldId: undefined,
  autoHighlightColoredText: true,
  autoKeepAttachmentOnDrawing: true,
};

export const DEFAULT_SEAMLESS_CAPTURE_CONFIG: SeamlessCaptureConfig = {
  enabled: true,
  roomHotkey: 'Alt+1',
  tabletHotkey: 'Alt+2',
  roomGamepadCombo: 'Select+R1',
  tabletGamepadCombo: 'Select+L1',
  roomCropRect: null,
  tabletCropRect: null,
  promptCalibrationOnFirstCapture: true,
  tabletQuickSaveMode: 'auto_save',
  playSoundOnCapture: true,
  preferredWindowTitle: 'La-Mulana 2',
  steamWatchFolderPath: undefined,
  autoClassifyWatchedScreenshots: true,
};

export const DEFAULT_MARKER_DEFINITIONS: MarkerDefinition[] = [
  {
    id: 'item_chest',
    name: 'Chest / Item / Switch',
    description: 'Treasure chests, item pickups, or floor/weight switches.',
    iconKey: 'chest',
    defaultColor: '#f97316', // Orange
    showShortLabelOnMacro: false,
    isBuiltIn: true,
  },
  {
    id: 'tablet_npc',
    name: 'Tablet / NPC / Lore',
    description: 'Stone tablets, skeletons, readable murals, or NPC rooms.',
    iconKey: 'tablet',
    defaultColor: '#3b82f6', // Blue
    showShortLabelOnMacro: false,
    isBuiltIn: true,
  },
  {
    id: 'mystery_puzzle',
    name: 'Puzzle / Mystery (?)',
    description: 'Unsolved puzzles, sealed sigils, or suspicious mechanisms.',
    iconKey: 'mystery',
    defaultColor: '#22c55e', // Green
    defaultSymbol: '?',
    showShortLabelOnMacro: true,
    isBuiltIn: true,
  },
  {
    id: 'trap_hazard',
    name: 'Trap / Hazard (X)',
    description: 'Fake floors, crushers, instant-death traps, or spike triggers.',
    iconKey: 'trap',
    defaultColor: '#ef4444', // Red
    defaultSymbol: 'X',
    showShortLabelOnMacro: false,
    isBuiltIn: true,
  },
  {
    id: 'boss_enemy',
    name: 'Boss / Miniboss',
    description: 'Guardians, room bosses, or named encounters (e.g., Raijin / Fujin).',
    iconKey: 'boss',
    defaultColor: '#a855f7', // Purple
    showShortLabelOnMacro: true,
    isBuiltIn: true,
  },
  {
    id: 'warp_door',
    name: 'Warp / Transition',
    description: 'Teleport portals, doors, or cross-map transitions (e.g., -> AcB A8).',
    iconKey: 'warp',
    defaultColor: '#06b6d4', // Cyan
    showShortLabelOnMacro: true,
    isBuiltIn: true,
  },
];

export const DEFAULT_COMMENT_CATEGORIES: CommentCategoryDefinition[] = [
  {
    id: 'tablet',
    code: 'T',
    name: 'Tablet / Mural',
    badgeColor: '#3b82f6', // Blue
    supportsResolved: false,
  },
  {
    id: 'npc',
    code: 'NPC',
    name: 'NPC Dialogue',
    badgeColor: '#10b981', // Emerald
    supportsResolved: false,
  },
  {
    id: 'todo',
    code: 'TODO',
    name: 'Reminder / TODO',
    badgeColor: '#f59e0b', // Amber
    supportsResolved: true,
  },
  {
    id: 'shortcut_hint',
    code: 'Sk',
    name: 'Skeleton',
    badgeColor: '#06b6d4', // Cyan
    supportsResolved: false,
  },
  {
    id: 'general',
    code: 'NOTE',
    name: 'General Note',
    badgeColor: '#94a3b8', // Slate
    supportsResolved: false,
  },
];

/**
 * Creates a clean, spoiler-free ProjectConfig for fresh installations.
 * Notice `roomFlagOptions` and `customCommentFields` start completely empty
 * so new players can add flags and custom dropdowns organically as they play.
 */
export function createDefaultProjectConfig(): ProjectConfig {
  return {
    id: 'singleton',
    projectTitle: 'La-Mulana 2 Expedition Log',
    markerDefinitions: DEFAULT_MARKER_DEFINITIONS,
    commentCategories: DEFAULT_COMMENT_CATEGORIES,
    roomFlagOptions: [],
    customCommentFields: [],
    tabletScannerConfig: { ...DEFAULT_TABLET_SCANNER_CONFIG },
    seamlessCaptureConfig: { ...DEFAULT_SEAMLESS_CAPTURE_CONFIG },
    updatedAt: Date.now(),
  };
}

/**
 * Generates an initial blank map tab for a fresh spoiler-free playthrough.
 */
export function createBlankInitialMap(): { map: MapPage; cells: GridCell[] } {
  const now = Date.now();
  const map: MapPage = {
    id: 'map-initial-1',
    codePrefix: 'F01',
    name: 'Field 1',
    rows: 7,
    cols: 8,
    order: 0,
    createdAt: now,
  };

  const cells: GridCell[] = [];
  for (let r = 0; r < map.rows; r++) {
    for (let c = 0; c < map.cols; c++) {
      cells.push({
        id: `cell-${map.id}-${r}-${c}`,
        mapId: map.id,
        row: r,
        col: c,
        coord: formatCellCoord(r, c),
        state: 'empty',
        roomName: '',
        tags: [],
        markers: [],
        arrows: [],
        updatedAt: now,
      });
    }
  }

  return { map, cells };
}

