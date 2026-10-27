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
  CommentEntry,
  GridCell,
  MapPage,
  MarkerDefinition,
  ProjectConfig,
  SketchNote,
} from '../types/models';
import { formatCellCoord } from '../utils/coordinates';

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
    description: 'Teleport portals, doors, or cross-map transitions (e.g., -> AcB $A$8).',
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
    name: 'Shortcut / Hint',
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

export const ROOM_TAG_SUGGESTIONS: string[] = [
  'Save Point',
  'Grail Tablet',
  'Ankh Jewel',
  'Boss Room',
  'Shop',
  'Blood Corridor',
  'Dissonance',
  'Gate / Portal',
];

/**
 * Creates a clean, spoiler-free ProjectConfig for fresh installations.
 * Notice `raceOrTribeOptions` starts completely empty so new players can
 * add races/tribes organically as they discover them in-game.
 */
export function createDefaultProjectConfig(): ProjectConfig {
  return {
    id: 'singleton',
    projectTitle: 'La-Mulana 2 Expedition Log',
    markerDefinitions: DEFAULT_MARKER_DEFINITIONS,
    commentCategories: DEFAULT_COMMENT_CATEGORIES,
    raceOrTribeOptions: [],
    customCommentFields: [],
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

/**
 * Optional Sample / Starter Dataset based on the user's Excel workbook
 * (`YgA Roots of Yggdrasil`, `DfA Divine Fortress`, etc.).
 * Triggered only when the user clicks "Load Sample Data" in Settings/Backup.
 */
export function generateSampleDataset(): {
  config: ProjectConfig;
  maps: MapPage[];
  cells: GridCell[];
  comments: CommentEntry[];
  sketches: SketchNote[];
} {
  const now = Date.now();
  const config = createDefaultProjectConfig();
  config.raceOrTribeOptions = ['6 AESIR', '6 VANIR', 'Underworld', 'Alfr', 'Dwarf', 'Giants'];

  const maps: MapPage[] = [
    {
      id: 'map-yga',
      codePrefix: 'YgA',
      name: 'Roots of Yggdrasil',
      rows: 7,
      cols: 8,
      order: 0,
      createdAt: now,
    },
    {
      id: 'map-dfa',
      codePrefix: 'DfA',
      name: 'Divine Fortress',
      rows: 7,
      cols: 8,
      order: 1,
      createdAt: now + 1,
    },
    {
      id: 'map-tsa',
      codePrefix: 'TsA',
      name: 'Takamagahara Shrine',
      rows: 7,
      cols: 8,
      order: 2,
      createdAt: now + 2,
    },
    {
      id: 'map-acb',
      codePrefix: 'AcB',
      name: 'Ancient Chaos',
      rows: 7,
      cols: 8,
      order: 3,
      createdAt: now + 3,
    },
  ];

  const cells: GridCell[] = [];
  for (const map of maps) {
    for (let r = 0; r < map.rows; r++) {
      for (let c = 0; c < map.cols; c++) {
        const coord = formatCellCoord(r, c);
        cells.push({
          id: `cell-${map.id}-${r}-${c}`,
          mapId: map.id,
          row: r,
          col: c,
          coord,
          state: 'empty',
          roomName: '',
          tags: [],
          markers: [],
          arrows: [],
          updatedAt: now,
        });
      }
    }
  }

  // Populate sample rooms on YgA (Roots of Yggdrasil)
  const setCell = (
    mapId: string,
    coord: string,
    updates: Partial<GridCell>
  ): GridCell | undefined => {
    const target = cells.find((c) => c.mapId === mapId && c.coord === coord);
    if (target) {
      Object.assign(target, updates);
    }
    return target;
  };

  // Mark unreachable boundary cells on YgA with 'blocked_x'
  ['$A$1', '$B$1', '$F$1', '$G$1', '$H$1', '$A$2', '$H$2'].forEach((coord) => {
    setCell('map-yga', coord, { state: 'blocked_x' });
  });

  const ygaC1 = setCell('map-yga', '$C$1', {
    state: 'room',
    roomName: "Verdandi's Root",
    tags: ['Grail Tablet'],
    markers: [
      {
        id: 'pin-yga-c1-1',
        xPercent: 32,
        yPercent: 58,
        typeId: 'tablet_npc',
        color: '#3b82f6',
        shortLabel: 'T1',
        notes: 'Prophecy tablet near the upper platform.',
        resolved: false,
      },
      {
        id: 'pin-yga-c1-2',
        xPercent: 74,
        yPercent: 42,
        typeId: 'item_chest',
        color: '#f97316',
        shortLabel: 'Weight Switch',
        notes: 'Requires weight to unlock lower shortcut.',
        resolved: true,
      },
    ],
    arrows: [
      {
        id: 'arr-yga-c1-1',
        points: [
          { xPercent: 50, yPercent: 75 },
          { xPercent: 50, yPercent: 95 },
        ],
        color: '#06b6d4',
        bidirectional: true,
        dashed: false,
        label: 'To $C$2',
      },
    ],
  });

  const ygaC2 = setCell('map-yga', '$C$2', {
    state: 'room',
    roomName: 'Gate of Yggdrasil',
    tags: ['Gate / Portal'],
    markers: [
      {
        id: 'pin-yga-c2-1',
        xPercent: 48,
        yPercent: 50,
        typeId: 'mystery_puzzle',
        color: '#22c55e',
        shortLabel: '?',
        notes: 'Yuga switch triggers spikes unless disarmed.',
        resolved: false,
      },
      {
        id: 'pin-yga-c2-2',
        xPercent: 82,
        yPercent: 64,
        typeId: 'boss_enemy',
        color: '#a855f7',
        shortLabel: 'Raijin / Fujin',
        notes: 'Dual miniboss encounter guarding the right passage.',
        resolved: false,
      },
    ],
  });

  const dfaC2 = setCell('map-dfa', '$C$2', {
    state: 'room',
    roomName: 'Room of Generations',
    tags: ['Grail Tablet', 'Save Point'],
    markers: [
      {
        id: 'pin-dfa-c2-1',
        xPercent: 25,
        yPercent: 60,
        typeId: 'tablet_npc',
        color: '#3b82f6',
        shortLabel: 'NPC Thor',
        notes: 'Speak again after obtaining Mjolnir.',
        resolved: false,
      },
      {
        id: 'pin-dfa-c2-2',
        xPercent: 80,
        yPercent: 35,
        typeId: 'warp_door',
        color: '#06b6d4',
        shortLabel: '-> AcB $A$8 (wB)',
        notes: 'Backside warp door leading to Ancient Chaos.',
        resolved: false,
      },
    ],
  });

  const comments: CommentEntry[] = [
    {
      id: 'comm-sample-1',
      mapId: 'map-yga',
      cellId: ygaC1?.id,
      cellCoord: '$C$1',
      category: 'tablet',
      speakerOrTitle: "T1: The Alfr Seeress' Prophecy P1",
      content:
        'Those who seek the GOLDEN WINGS must first commune with the roots of FIRE and EARTH before descending into the UNDERWORLD.',
      raceOrTribe: 'Alfr',
      resolved: false,
      attachmentBlobIds: [],
      createdAt: now - 30000,
      updatedAt: now - 30000,
    },
    {
      id: 'comm-sample-2',
      mapId: 'map-yga',
      cellId: ygaC2?.id,
      cellCoord: '$C$2',
      category: 'todo',
      speakerOrTitle: 'Yuga Switch Trap',
      content:
        'TODO: Find what is needed to press the Yuga switch without the spikes appearing.',
      raceOrTribe: '6 AESIR',
      resolved: false,
      attachmentBlobIds: [],
      createdAt: now - 20000,
      updatedAt: now - 20000,
    },
    {
      id: 'comm-sample-3',
      mapId: 'map-dfa',
      cellId: dfaC2?.id,
      cellCoord: '$C$2',
      category: 'npc',
      speakerOrTitle: 'NPC Thor (after Mjolnir)',
      content:
        'With the GLOVE OF POWER and Mjolnir charged, strike the pillar where the 6 VANIR once stood.',
      raceOrTribe: '6 AESIR',
      resolved: false,
      attachmentBlobIds: [],
      createdAt: now - 10000,
      updatedAt: now - 10000,
    },
  ];

  const sketches: SketchNote[] = [
    {
      id: 'sketch-sample-1',
      title: 'Yggdrasil Root Connections & Medallions',
      description:
        'Diagram of the 3 knots with medallions connecting YgA, DfA, and the Underworld gates.',
      mapId: 'map-yga',
      createdAt: now,
      updatedAt: now,
    },
  ];

  return { config, maps, cells, comments, sketches };
}
