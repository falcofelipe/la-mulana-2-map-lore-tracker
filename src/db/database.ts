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
 * Ensures the database is initialized with spoiler-free defaults on first launch
 * and gracefully upgrades any legacy config fields.
 * Idempotent and safe to call on application startup.
 */
export async function ensureDatabaseInitialized(): Promise<void> {
  await db.transaction(
    'rw',
    [db.config, db.maps, db.cells, db.comments],
    async () => {
      const existingConfig = (await db.config.get('singleton')) as
        | (ProjectConfig & { raceOrTribeOptions?: string[] })
        | undefined;

      if (!existingConfig) {
        await db.config.put(createDefaultProjectConfig());
      } else {
        let needsConfigUpdate = false;
        const nextRoomFlags = Array.isArray(existingConfig.roomFlagOptions)
          ? existingConfig.roomFlagOptions
          : [];
        if (!Array.isArray(existingConfig.roomFlagOptions)) {
          needsConfigUpdate = true;
        }

        const nextCustomFields = [...(existingConfig.customCommentFields || [])];

        // If an older local DB had legacy raceOrTribeOptions or comment.raceOrTribe values,
        // migrate them into a filterable Custom Select Field so no user data is lost.
        const legacyOptions = existingConfig.raceOrTribeOptions || [];
        const allComments = (await db.comments.toArray()) as (CommentEntry & {
          raceOrTribe?: string;
        })[];
        const commentsWithLegacyRace = allComments.filter((c) =>
          Boolean(c.raceOrTribe?.trim())
        );

        if (legacyOptions.length > 0 || commentsWithLegacyRace.length > 0) {
          const mergedOptions = Array.from(
            new Set([
              ...legacyOptions,
              ...commentsWithLegacyRace.map((c) => c.raceOrTribe!.trim()),
            ])
          );
          let targetField = nextCustomFields.find(
            (f) => f.id === 'cf-race-tribe' || f.name.toLowerCase() === 'race / tribe'
          );
          if (!targetField) {
            targetField = {
              id: 'cf-race-tribe',
              name: 'Race / Tribe',
              type: 'select',
              options: mergedOptions,
              showInTable: true,
              filterable: true,
            };
            nextCustomFields.push(targetField);
          } else {
            targetField.options = Array.from(
              new Set([...(targetField.options || []), ...mergedOptions])
            );
            targetField.filterable = true;
          }

          if (commentsWithLegacyRace.length > 0) {
            const fieldId = targetField.id;
            await db.comments.bulkPut(
              commentsWithLegacyRace.map(({ raceOrTribe, ...rest }) => ({
                ...rest,
                customFields: {
                  ...(rest.customFields || {}),
                  [fieldId]: rest.customFields?.[fieldId] || raceOrTribe!.trim(),
                },
              }))
            );
          }
          needsConfigUpdate = true;
        } else if ('raceOrTribeOptions' in existingConfig) {
          needsConfigUpdate = true;
        }

        if (needsConfigUpdate) {
          const { raceOrTribeOptions: _removed, ...cleanConfig } = existingConfig;
          await db.config.put({
            ...cleanConfig,
            roomFlagOptions: nextRoomFlags,
            customCommentFields: nextCustomFields,
          });
        }
      }

      const mapCount = await db.maps.count();
      if (mapCount === 0) {
        const { map, cells } = createBlankInitialMap();
        await db.maps.put(map);
        await db.cells.bulkPut(cells);
      }
    }
  );
}
