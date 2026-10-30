/**
 * IndexedDB Database Setup (Dexie.js)
 * -----------------------------------
 * Stores relational map grids, markers, comments, customizable definitions,
 * and binary WebP screenshot blobs locally in the browser with no size limits.
 */

import Dexie, { type Table } from 'dexie';
import {
  CommentEntry,
  GridCell,
  ImageBlobRecord,
  MapPage,
  ProjectConfig,
  SketchNote,
} from '../types/models';
import {
  createBlankInitialMap,
  createDefaultProjectConfig,
} from '../config/defaultDefinitions';

export class LaMulanaDatabase extends Dexie {
  config!: Table<ProjectConfig, string>;
  maps!: Table<MapPage, string>;
  cells!: Table<GridCell, string>;
  comments!: Table<CommentEntry, string>;
  sketches!: Table<SketchNote, string>;
  blobs!: Table<ImageBlobRecord, string>;

  constructor() {
    super('LaMulana2TrackerDB');

    this.version(1).stores({
      config: 'id',
      maps: 'id, order, codePrefix',
      cells: 'id, mapId, [mapId+coord], [mapId+row+col], state',
      comments: 'id, mapId, cellId, [mapId+cellCoord], category, raceOrTribe, resolved, createdAt',
      sketches: 'id, mapId, createdAt',
      blobs: 'id, createdAt',
    });

    this.version(2).stores({
      config: 'id',
      maps: 'id, order, codePrefix',
      cells: 'id, mapId, [mapId+coord], [mapId+row+col], state',
      comments: 'id, mapId, cellId, [mapId+cellCoord], category, resolved, createdAt',
      sketches: 'id, mapId, createdAt',
      blobs: 'id, createdAt',
    });
  }
}

export const db = new LaMulanaDatabase();

/**
 * Ensures the database is initialized with spoiler-free defaults on first launch.
 * Idempotent and safe to call on application startup.
 */
export async function ensureDatabaseInitialized(): Promise<void> {
  await db.transaction('rw', [db.config, db.maps, db.cells], async () => {
    const existingConfig = await db.config.get('singleton');
    if (!existingConfig) {
      await db.config.put(createDefaultProjectConfig());
    }

    const mapCount = await db.maps.count();
    if (mapCount === 0) {
      const { map, cells } = createBlankInitialMap();
      await db.maps.put(map);
      await db.cells.bulkPut(cells);
    }
  });
}
