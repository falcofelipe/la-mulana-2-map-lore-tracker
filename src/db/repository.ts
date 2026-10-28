/**
 * Database Repository Layer
 * -------------------------
 * Provides clean, atomic functions for all Map, Cell, Marker, Arrow, Comment,
 * Sketch, and ProjectConfig mutations. Isolating DB access here makes the
 * codebase easy to read, test, and extend in the future.
 */

import {
  CommentCategoryDefinition,
  CommentEntry,
  CustomFieldDefinition,
  GridCell,
  MapGridArrow,
  MapPage,
  MarkerDefinition,
  PassageDirection,
  PinMarker,
  SeamlessCaptureConfig,
  SketchNote,
  TabletScannerConfig,
  VectorArrow,
} from '../types/models';
import {
  createBlankInitialMap,
  createDefaultProjectConfig,
} from '../config/defaultDefinitions';
import {
  formatCellCoord,
  normalizeCellCoord,
} from '../utils/coordinates';
import { db } from './database';
import {
  processAndStoreAttachmentImage,
  processAndStoreRoomScreenshot,
} from './imageProcessor';

// ============================================================================
// 1. MAP TAB OPERATIONS & DYNAMIC GRID EXPANSION
// ============================================================================

export async function createMapPage(
  codePrefix: string,
  name: string,
  rows = 7,
  cols = 8
): Promise<MapPage> {
  const now = Date.now();
  const count = await db.maps.count();
  const mapId = `map-${now}-${Math.random().toString(36).slice(2, 7)}`;

  const newMap: MapPage = {
    id: mapId,
    codePrefix: codePrefix.trim() || `F0${count + 1}`,
    name: name.trim() || `New Field ${count + 1}`,
    rows: Math.max(1, rows),
    cols: Math.max(1, cols),
    order: count,
    createdAt: now,
  };

  const cells: GridCell[] = [];
  for (let r = 0; r < newMap.rows; r++) {
    for (let c = 0; c < newMap.cols; c++) {
      cells.push({
        id: `cell-${mapId}-${r}-${c}-${Math.random().toString(36).slice(2, 6)}`,
        mapId,
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

  await db.transaction('rw', [db.maps, db.cells], async () => {
    await db.maps.put(newMap);
    await db.cells.bulkPut(cells);
  });

  return newMap;
}

export async function updateMapPageMetadata(
  mapId: string,
  updates: Partial<Pick<MapPage, 'codePrefix' | 'name' | 'order'>>
): Promise<void> {
  await db.maps.update(mapId, updates);
}

export async function reorderMapPages(orderedMapIds: string[]): Promise<void> {
  await db.transaction('rw', db.maps, async () => {
    for (let i = 0; i < orderedMapIds.length; i++) {
      await db.maps.update(orderedMapIds[i], { order: i });
    }
  });
}

export async function deleteMapPage(mapId: string): Promise<string | null> {
  return db.transaction(
    'rw',
    [db.maps, db.cells, db.comments, db.sketches, db.blobs],
    async () => {
      const cells = await db.cells.where('mapId').equals(mapId).toArray();
      const comments = await db.comments.where('mapId').equals(mapId).toArray();

      // Collect associated blob IDs to clean up disk space
      const blobIdsToDelete: string[] = [];
      for (const cell of cells) {
        if (cell.screenshotBlobId) blobIdsToDelete.push(cell.screenshotBlobId);
        if (cell.thumbnailBlobId) blobIdsToDelete.push(cell.thumbnailBlobId);
      }
      for (const comm of comments) {
        blobIdsToDelete.push(...comm.attachmentBlobIds);
      }

      if (blobIdsToDelete.length > 0) {
        await db.blobs.bulkDelete(blobIdsToDelete);
      }

      await db.cells.where('mapId').equals(mapId).delete();
      await db.comments.where('mapId').equals(mapId).delete();
      await db.maps.delete(mapId);

      const remaining = await db.maps.orderBy('order').toArray();
      if (remaining.length === 0) {
        const { map, cells: blankCells } = createBlankInitialMap();
        await db.maps.put(map);
        await db.cells.bulkPut(blankCells);
        return map.id;
      }
      return remaining[0].id;
    }
  );
}

/**
 * Helper to update `shortLabel` on any pin across the entire database that
 * points via `targetCellId` to a cell whose coordinate shifted (e.g., `-> AcB $A$8` -> `-> AcB $B$8`).
 */
async function syncShiftedTargetPinLabels(
  shiftedCells: Map<string, { oldCoord: string; newCoord: string }>,
  now: number
): Promise<void> {
  if (shiftedCells.size === 0) return;
  const allCells = await db.cells.toArray();
  const cellsWithUpdatedPins: GridCell[] = [];

  for (const cell of allCells) {
    if (cell.markers.length === 0) continue;
    let changed = false;
    const nextMarkers = cell.markers.map((pin) => {
      if (!pin.targetCellId || !pin.shortLabel) return pin;
      const shift = shiftedCells.get(pin.targetCellId);
      if (!shift || !pin.shortLabel.includes(shift.oldCoord)) return pin;
      changed = true;
      return {
        ...pin,
        shortLabel: pin.shortLabel.replace(shift.oldCoord, shift.newCoord),
      };
    });

    if (changed) {
      cellsWithUpdatedPins.push({
        ...cell,
        markers: nextMarkers,
        updatedAt: now,
      });
    }
  }

  if (cellsWithUpdatedPins.length > 0) {
    await db.cells.bulkPut(cellsWithUpdatedPins);
  }
}

/**
 * Inserts a new blank row at `insertRowIndex` (`0 <= insertRowIndex <= map.rows`),
 * shifting all existing cells with `row >= insertRowIndex` down by +1 row,
 * recalculating their `$Col$Row` coordinates, and syncing linked comments & warp pins.
 */
export async function insertRowAt(
  mapId: string,
  insertRowIndex: number
): Promise<void> {
  const now = Date.now();
  await db.transaction('rw', [db.maps, db.cells, db.comments], async () => {
    const map = await db.maps.get(mapId);
    if (!map) return;

    const targetRow = Math.max(0, Math.min(map.rows, insertRowIndex));
    const existingCells = await db.cells.where('mapId').equals(mapId).toArray();
    const mapComments = await db.comments.where('mapId').equals(mapId).toArray();

    const newRows = map.rows + 1;
    const updatedCells: GridCell[] = [];
    const cellCoordMap = new Map<string, string>();
    const shiftedCoordPairs = new Map<
      string,
      { oldCoord: string; newCoord: string }
    >();

    for (const cell of existingCells) {
      if (cell.row >= targetRow) {
        const nextRow = cell.row + 1;
        const nextCoord = formatCellCoord(nextRow, cell.col);
        cellCoordMap.set(cell.id, nextCoord);
        shiftedCoordPairs.set(cell.id, {
          oldCoord: cell.coord,
          newCoord: nextCoord,
        });
        updatedCells.push({
          ...cell,
          row: nextRow,
          coord: nextCoord,
          updatedAt: now,
        });
      }
    }

    // Create the new blank row at `targetRow`
    for (let c = 0; c < map.cols; c++) {
      updatedCells.push({
        id: `cell-${mapId}-${targetRow}-${c}-${Math.random()
          .toString(36)
          .slice(2, 7)}`,
        mapId,
        row: targetRow,
        col: c,
        coord: formatCellCoord(targetRow, c),
        state: 'empty',
        roomName: '',
        tags: [],
        markers: [],
        arrows: [],
        updatedAt: now,
      });
    }

    await db.cells.bulkPut(updatedCells);
    await syncShiftedTargetPinLabels(shiftedCoordPairs, now);

    if (cellCoordMap.size > 0) {
      const updatedComments: CommentEntry[] = [];
      for (const comm of mapComments) {
        if (comm.cellId && cellCoordMap.has(comm.cellId)) {
          updatedComments.push({
            ...comm,
            cellCoord: cellCoordMap.get(comm.cellId)!,
            updatedAt: now,
          });
        }
      }
      if (updatedComments.length > 0) {
        await db.comments.bulkPut(updatedComments);
      }
    }

    await db.maps.update(mapId, { rows: newRows });
  });
}

/**
 * Inserts a new blank column at `insertColIndex` (`0 <= insertColIndex <= map.cols`),
 * shifting all existing cells with `col >= insertColIndex` right by +1 column,
 * recalculating their `$Col$Row` coordinates, and syncing linked comments & warp pins.
 */
export async function insertColAt(
  mapId: string,
  insertColIndex: number
): Promise<void> {
  const now = Date.now();
  await db.transaction('rw', [db.maps, db.cells, db.comments], async () => {
    const map = await db.maps.get(mapId);
    if (!map) return;

    const targetCol = Math.max(0, Math.min(map.cols, insertColIndex));
    const existingCells = await db.cells.where('mapId').equals(mapId).toArray();
    const mapComments = await db.comments.where('mapId').equals(mapId).toArray();

    const newCols = map.cols + 1;
    const updatedCells: GridCell[] = [];
    const cellCoordMap = new Map<string, string>();
    const shiftedCoordPairs = new Map<
      string,
      { oldCoord: string; newCoord: string }
    >();

    for (const cell of existingCells) {
      if (cell.col >= targetCol) {
        const nextCol = cell.col + 1;
        const nextCoord = formatCellCoord(cell.row, nextCol);
        cellCoordMap.set(cell.id, nextCoord);
        shiftedCoordPairs.set(cell.id, {
          oldCoord: cell.coord,
          newCoord: nextCoord,
        });
        updatedCells.push({
          ...cell,
          col: nextCol,
          coord: nextCoord,
          updatedAt: now,
        });
      }
    }

    // Create the new blank column at `targetCol`
    for (let r = 0; r < map.rows; r++) {
      updatedCells.push({
        id: `cell-${mapId}-${r}-${targetCol}-${Math.random()
          .toString(36)
          .slice(2, 7)}`,
        mapId,
        row: r,
        col: targetCol,
        coord: formatCellCoord(r, targetCol),
        state: 'empty',
        roomName: '',
        tags: [],
        markers: [],
        arrows: [],
        updatedAt: now,
      });
    }

    await db.cells.bulkPut(updatedCells);
    await syncShiftedTargetPinLabels(shiftedCoordPairs, now);

    if (cellCoordMap.size > 0) {
      const updatedComments: CommentEntry[] = [];
      for (const comm of mapComments) {
        if (comm.cellId && cellCoordMap.has(comm.cellId)) {
          updatedComments.push({
            ...comm,
            cellCoord: cellCoordMap.get(comm.cellId)!,
            updatedAt: now,
          });
        }
      }
      if (updatedComments.length > 0) {
        await db.comments.bulkPut(updatedComments);
      }
    }

    await db.maps.update(mapId, { cols: newCols });
  });
}

/**
 * Deletes the row at `deleteRowIndex` (minimum 2 rows remaining), cleaning up
 * removed cell blobs/arrows and shifting any cells with `row > deleteRowIndex` up by -1.
 */
export async function deleteRowAt(
  mapId: string,
  deleteRowIndex: number
): Promise<void> {
  const now = Date.now();
  await db.transaction(
    'rw',
    [db.maps, db.cells, db.comments, db.blobs],
    async () => {
      const map = await db.maps.get(mapId);
      if (!map || map.rows <= 2) return;
      if (deleteRowIndex < 0 || deleteRowIndex >= map.rows) return;

      const existingCells = await db.cells.where('mapId').equals(mapId).toArray();
      const mapComments = await db.comments.where('mapId').equals(mapId).toArray();

      const cellsToRemove = existingCells.filter(
        (c) => c.row === deleteRowIndex
      );
      const cellsToShift = existingCells.filter((c) => c.row > deleteRowIndex);

      const removedIds = new Set(cellsToRemove.map((c) => c.id));
      const blobIdsToDelete: string[] = [];
      for (const c of cellsToRemove) {
        if (c.screenshotBlobId) blobIdsToDelete.push(c.screenshotBlobId);
        if (c.thumbnailBlobId) blobIdsToDelete.push(c.thumbnailBlobId);
      }
      if (blobIdsToDelete.length > 0) {
        await db.blobs.bulkDelete(blobIdsToDelete);
      }

      await db.cells.bulkDelete(Array.from(removedIds));

      if (cellsToShift.length > 0) {
        const shiftedCoordPairs = new Map<
          string,
          { oldCoord: string; newCoord: string }
        >();
        const coordMap = new Map<string, string>();
        const updatedCells = cellsToShift.map((c) => {
          const nextRow = c.row - 1;
          const nextCoord = formatCellCoord(nextRow, c.col);
          shiftedCoordPairs.set(c.id, {
            oldCoord: c.coord,
            newCoord: nextCoord,
          });
          coordMap.set(c.id, nextCoord);
          return {
            ...c,
            row: nextRow,
            coord: nextCoord,
            updatedAt: now,
          };
        });

        await db.cells.bulkPut(updatedCells);
        await syncShiftedTargetPinLabels(shiftedCoordPairs, now);

        const updatedComments: CommentEntry[] = [];
        for (const comm of mapComments) {
          if (comm.cellId && coordMap.has(comm.cellId)) {
            updatedComments.push({
              ...comm,
              cellCoord: coordMap.get(comm.cellId)!,
              updatedAt: now,
            });
          }
        }
        if (updatedComments.length > 0) {
          await db.comments.bulkPut(updatedComments);
        }
      }

      const nextGridArrows = (map.gridArrows || []).filter(
        (a) => !removedIds.has(a.fromCellId) && !removedIds.has(a.toCellId)
      );

      await db.maps.update(mapId, {
        rows: map.rows - 1,
        gridArrows: nextGridArrows,
      });
    }
  );
}

/**
 * Deletes the column at `deleteColIndex` (minimum 2 columns remaining), cleaning up
 * removed cell blobs/arrows and shifting any cells with `col > deleteColIndex` left by -1.
 */
export async function deleteColAt(
  mapId: string,
  deleteColIndex: number
): Promise<void> {
  const now = Date.now();
  await db.transaction(
    'rw',
    [db.maps, db.cells, db.comments, db.blobs],
    async () => {
      const map = await db.maps.get(mapId);
      if (!map || map.cols <= 2) return;
      if (deleteColIndex < 0 || deleteColIndex >= map.cols) return;

      const existingCells = await db.cells.where('mapId').equals(mapId).toArray();
      const mapComments = await db.comments.where('mapId').equals(mapId).toArray();

      const cellsToRemove = existingCells.filter(
        (c) => c.col === deleteColIndex
      );
      const cellsToShift = existingCells.filter((c) => c.col > deleteColIndex);

      const removedIds = new Set(cellsToRemove.map((c) => c.id));
      const blobIdsToDelete: string[] = [];
      for (const c of cellsToRemove) {
        if (c.screenshotBlobId) blobIdsToDelete.push(c.screenshotBlobId);
        if (c.thumbnailBlobId) blobIdsToDelete.push(c.thumbnailBlobId);
      }
      if (blobIdsToDelete.length > 0) {
        await db.blobs.bulkDelete(blobIdsToDelete);
      }

      await db.cells.bulkDelete(Array.from(removedIds));

      if (cellsToShift.length > 0) {
        const shiftedCoordPairs = new Map<
          string,
          { oldCoord: string; newCoord: string }
        >();
        const coordMap = new Map<string, string>();
        const updatedCells = cellsToShift.map((c) => {
          const nextCol = c.col - 1;
          const nextCoord = formatCellCoord(c.row, nextCol);
          shiftedCoordPairs.set(c.id, {
            oldCoord: c.coord,
            newCoord: nextCoord,
          });
          coordMap.set(c.id, nextCoord);
          return {
            ...c,
            col: nextCol,
            coord: nextCoord,
            updatedAt: now,
          };
        });

        await db.cells.bulkPut(updatedCells);
        await syncShiftedTargetPinLabels(shiftedCoordPairs, now);

        const updatedComments: CommentEntry[] = [];
        for (const comm of mapComments) {
          if (comm.cellId && coordMap.has(comm.cellId)) {
            updatedComments.push({
              ...comm,
              cellCoord: coordMap.get(comm.cellId)!,
              updatedAt: now,
            });
          }
        }
        if (updatedComments.length > 0) {
          await db.comments.bulkPut(updatedComments);
        }
      }

      const nextGridArrows = (map.gridArrows || []).filter(
        (a) => !removedIds.has(a.fromCellId) && !removedIds.has(a.toCellId)
      );

      await db.maps.update(mapId, {
        cols: map.cols - 1,
        gridArrows: nextGridArrows,
      });
    }
  );
}

/**
 * Expands a map's grid by adding 1 row or column on the specified outer edge.
 */
export async function expandMapGrid(
  mapId: string,
  direction: 'top' | 'bottom' | 'left' | 'right'
): Promise<void> {
  const map = await db.maps.get(mapId);
  if (!map) return;

  if (direction === 'top') {
    await insertRowAt(mapId, 0);
  } else if (direction === 'bottom') {
    await insertRowAt(mapId, map.rows);
  } else if (direction === 'left') {
    await insertColAt(mapId, 0);
  } else if (direction === 'right') {
    await insertColAt(mapId, map.cols);
  }
}

/**
 * Removes the outer row or column on the specified edge (minimum 2x2 grid).
 */
export async function shrinkMapGrid(
  mapId: string,
  direction: 'top' | 'bottom' | 'left' | 'right'
): Promise<void> {
  const map = await db.maps.get(mapId);
  if (!map) return;

  if (direction === 'top') {
    await deleteRowAt(mapId, 0);
  } else if (direction === 'bottom') {
    await deleteRowAt(mapId, map.rows - 1);
  } else if (direction === 'left') {
    await deleteColAt(mapId, 0);
  } else if (direction === 'right') {
    await deleteColAt(mapId, map.cols - 1);
  }
}

/**
 * Moves or swaps two cells (`cellIdA` and `cellIdB`) on a map grid by exchanging
 * their `(row, col, coord)` positions while keeping their UUIDs (`cell.id`) intact.
 * Automatically updates `cellCoord` on all linked comments and warp pin labels!
 */
export async function swapOrMoveCells(
  cellIdA: string,
  cellIdB: string
): Promise<void> {
  if (cellIdA === cellIdB) return;
  const now = Date.now();

  await db.transaction('rw', [db.cells, db.comments], async () => {
    const [cellA, cellB] = await Promise.all([
      db.cells.get(cellIdA),
      db.cells.get(cellIdB),
    ]);
    if (!cellA || !cellB || cellA.mapId !== cellB.mapId) return;

    const updatedA: GridCell = {
      ...cellA,
      row: cellB.row,
      col: cellB.col,
      coord: cellB.coord,
      updatedAt: now,
    };

    const updatedB: GridCell = {
      ...cellB,
      row: cellA.row,
      col: cellA.col,
      coord: cellA.coord,
      updatedAt: now,
    };

    await db.cells.bulkPut([updatedA, updatedB]);

    const shiftedCoordPairs = new Map<
      string,
      { oldCoord: string; newCoord: string }
    >([
      [cellA.id, { oldCoord: cellA.coord, newCoord: cellB.coord }],
      [cellB.id, { oldCoord: cellB.coord, newCoord: cellA.coord }],
    ]);

    await syncShiftedTargetPinLabels(shiftedCoordPairs, now);

    // Sync any comments on this map linked to cellA or cellB
    const mapComments = await db.comments
      .where('mapId')
      .equals(cellA.mapId)
      .toArray();
    const updatedComments: CommentEntry[] = [];

    for (const comm of mapComments) {
      if (comm.cellId === cellA.id || (!comm.cellId && comm.cellCoord === cellA.coord)) {
        updatedComments.push({
          ...comm,
          cellId: cellA.id,
          cellCoord: cellB.coord,
          updatedAt: now,
        });
      } else if (
        comm.cellId === cellB.id ||
        (!comm.cellId && comm.cellCoord === cellB.coord)
      ) {
        updatedComments.push({
          ...comm,
          cellId: cellB.id,
          cellCoord: cellA.coord,
          updatedAt: now,
        });
      }
    }

    if (updatedComments.length > 0) {
      await db.comments.bulkPut(updatedComments);
    }
  });
}

/**
 * Toggles a cardinal doorway / passage indicator on `cellId` (`top`, `right`, `bottom`, `left`)
 * and mirrors the opposite border on the adjacent neighbor cell if present.
 */
export async function toggleCellPassage(
  cellId: string,
  direction: PassageDirection
): Promise<void> {
  const now = Date.now();
  await db.transaction('rw', db.cells, async () => {
    const cell = await db.cells.get(cellId);
    if (!cell) return;

    const currentOpen = Boolean(cell.openPassages?.[direction]);
    const nextOpen = !currentOpen;

    await db.cells.update(cellId, {
      openPassages: {
        ...(cell.openPassages || {}),
        [direction]: nextOpen,
      },
      updatedAt: now,
    });

    const neighborRow =
      direction === 'top'
        ? cell.row - 1
        : direction === 'bottom'
        ? cell.row + 1
        : cell.row;
    const neighborCol =
      direction === 'left'
        ? cell.col - 1
        : direction === 'right'
        ? cell.col + 1
        : cell.col;

    const oppositeDir: PassageDirection =
      direction === 'top'
        ? 'bottom'
        : direction === 'bottom'
        ? 'top'
        : direction === 'left'
        ? 'right'
        : 'left';

    const neighbor = await db.cells
      .where('[mapId+row+col]')
      .equals([cell.mapId, neighborRow, neighborCol])
      .first();

    if (neighbor) {
      await db.cells.update(neighbor.id, {
        openPassages: {
          ...(neighbor.openPassages || {}),
          [oppositeDir]: nextOpen,
        },
        updatedAt: now,
      });
    }
  });
}

/**
 * Adds a cross-cell arrow to the active map's Macro Map Grid overlay.
 */
export async function addMapGridArrow(
  mapId: string,
  arrow: Omit<MapGridArrow, 'id'>
): Promise<MapGridArrow> {
  const map = await db.maps.get(mapId);
  if (!map) throw new Error('Map not found');

  const newArrow: MapGridArrow = {
    ...arrow,
    id: `marr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  };

  await db.maps.update(mapId, {
    gridArrows: [...(map.gridArrows || []), newArrow],
  });

  return newArrow;
}

export async function updateMapGridArrow(
  mapId: string,
  arrowId: string,
  updates: Partial<MapGridArrow>
): Promise<void> {
  const map = await db.maps.get(mapId);
  if (!map) return;

  await db.maps.update(mapId, {
    gridArrows: (map.gridArrows || []).map((a) =>
      a.id === arrowId ? { ...a, ...updates } : a
    ),
  });
}

export async function deleteMapGridArrow(
  mapId: string,
  arrowId: string
): Promise<void> {
  const map = await db.maps.get(mapId);
  if (!map) return;

  await db.maps.update(mapId, {
    gridArrows: (map.gridArrows || []).filter((a) => a.id !== arrowId),
  });
}

/**
 * Toggles a manual map-level outgoing connection (`manualOutgoingMapIds`) on `mapId`.
 */
export async function toggleManualMapConnection(
  mapId: string,
  targetMapId: string
): Promise<void> {
  if (!mapId || !targetMapId || mapId === targetMapId) return;
  const map = await db.maps.get(mapId);
  if (!map) return;

  const existing = map.manualOutgoingMapIds || [];
  const next = existing.includes(targetMapId)
    ? existing.filter((id) => id !== targetMapId)
    : [...existing, targetMapId];

  await db.maps.update(mapId, { manualOutgoingMapIds: next });
}

// ============================================================================
// 2. GRID CELL & SCREENSHOT OPERATIONS
// ============================================================================

/**
 * Assigns a pasted or uploaded screenshot to a cell, converting it to 90% WebP
 * plus a thumbnail, and cleaning up any old screenshot blobs for that cell.
 */
export async function assignCellScreenshot(
  cellId: string,
  imageBlob: Blob
): Promise<void> {
  const cell = await db.cells.get(cellId);
  if (!cell) return;

  const processed = await processAndStoreRoomScreenshot(imageBlob);

  const oldBlobs: string[] = [];
  if (cell.screenshotBlobId) oldBlobs.push(cell.screenshotBlobId);
  if (cell.thumbnailBlobId) oldBlobs.push(cell.thumbnailBlobId);
  if (oldBlobs.length > 0) {
    await db.blobs.bulkDelete(oldBlobs);
  }

  await db.cells.update(cellId, {
    state: 'room',
    screenshotBlobId: processed.fullBlobId,
    thumbnailBlobId: processed.thumbBlobId,
    updatedAt: Date.now(),
  });
}

/**
 * Clears ONLY the background screenshot of a cell while preserving all
 * room metadata, markers, arrows, and linked comments.
 */
export async function clearCellScreenshot(cellId: string): Promise<void> {
  const cell = await db.cells.get(cellId);
  if (!cell) return;

  const oldBlobs: string[] = [];
  if (cell.screenshotBlobId) oldBlobs.push(cell.screenshotBlobId);
  if (cell.thumbnailBlobId) oldBlobs.push(cell.thumbnailBlobId);
  if (oldBlobs.length > 0) {
    await db.blobs.bulkDelete(oldBlobs);
  }

  const hasContent =
    Boolean(cell.roomName.trim()) || cell.markers.length > 0 || cell.arrows.length > 0;

  await db.cells.update(cellId, {
    screenshotBlobId: undefined,
    thumbnailBlobId: undefined,
    state: hasContent ? 'room' : 'empty',
    updatedAt: Date.now(),
  });
}

/**
 * Toggles the Blocked / Out-of-Bounds ('blocked_x') state on a cell.
 */
export async function toggleCellBlockedState(cellId: string): Promise<void> {
  const cell = await db.cells.get(cellId);
  if (!cell) return;

  const nextState =
    cell.state === 'blocked_x'
      ? cell.screenshotBlobId || cell.roomName.trim() || cell.markers.length > 0
        ? 'room'
        : 'empty'
      : 'blocked_x';

  await db.cells.update(cellId, {
    state: nextState,
    updatedAt: Date.now(),
  });
}

/**
 * Updates a cell's Room Name, Completion Status, or Tags.
 */
export async function updateCellMetadata(
  cellId: string,
  updates: Partial<Pick<GridCell, 'roomName' | 'isCompleted' | 'tags' | 'state'>>
): Promise<void> {
  const cell = await db.cells.get(cellId);
  if (!cell) return;

  const nextRoomName =
    updates.roomName !== undefined ? updates.roomName : cell.roomName;
  const shouldBeRoom =
    cell.state === 'empty' &&
    (Boolean(nextRoomName.trim()) ||
      (updates.tags && updates.tags.length > 0) ||
      Boolean(updates.isCompleted));

  await db.cells.update(cellId, {
    ...updates,
    state: updates.state ?? (shouldBeRoom ? 'room' : cell.state),
    updatedAt: Date.now(),
  });
}

// ============================================================================
// 3. PIN MARKERS & VECTOR ARROWS
// ============================================================================

export async function addPinMarkerToCell(
  cellId: string,
  marker: Omit<PinMarker, 'id'>
): Promise<PinMarker> {
  const cell = await db.cells.get(cellId);
  if (!cell) throw new Error('Cell not found');

  const newPin: PinMarker = {
    ...marker,
    id: `pin-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  };

  await db.cells.update(cellId, {
    state: cell.state === 'empty' ? 'room' : cell.state,
    markers: [...cell.markers, newPin],
    updatedAt: Date.now(),
  });

  return newPin;
}

export async function updatePinMarkerOnCell(
  cellId: string,
  markerId: string,
  updates: Partial<PinMarker>
): Promise<void> {
  const cell = await db.cells.get(cellId);
  if (!cell) return;

  const nextMarkers = cell.markers.map((m) =>
    m.id === markerId ? { ...m, ...updates } : m
  );

  await db.cells.update(cellId, {
    markers: nextMarkers,
    updatedAt: Date.now(),
  });
}

export async function deletePinMarkerFromCell(
  cellId: string,
  markerId: string
): Promise<void> {
  const cell = await db.cells.get(cellId);
  if (!cell) return;

  await db.cells.update(cellId, {
    markers: cell.markers.filter((m) => m.id !== markerId),
    updatedAt: Date.now(),
  });
}

export async function addVectorArrowToCell(
  cellId: string,
  arrow: Omit<VectorArrow, 'id'>
): Promise<VectorArrow> {
  const cell = await db.cells.get(cellId);
  if (!cell) throw new Error('Cell not found');

  const newArrow: VectorArrow = {
    ...arrow,
    id: `arr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  };

  await db.cells.update(cellId, {
    state: cell.state === 'empty' ? 'room' : cell.state,
    arrows: [...cell.arrows, newArrow],
    updatedAt: Date.now(),
  });

  return newArrow;
}

export async function updateVectorArrowOnCell(
  cellId: string,
  arrowId: string,
  updates: Partial<VectorArrow>
): Promise<void> {
  const cell = await db.cells.get(cellId);
  if (!cell) return;

  await db.cells.update(cellId, {
    arrows: cell.arrows.map((a) => (a.id === arrowId ? { ...a, ...updates } : a)),
    updatedAt: Date.now(),
  });
}

export async function deleteVectorArrowFromCell(
  cellId: string,
  arrowId: string
): Promise<void> {
  const cell = await db.cells.get(cellId);
  if (!cell) return;

  await db.cells.update(cellId, {
    arrows: cell.arrows.filter((a) => a.id !== arrowId),
    updatedAt: Date.now(),
  });
}

// ============================================================================
// 4. RELATIONAL COMMENTS, TABLETS & NPC DIALOGUE
// ============================================================================

export async function createCommentEntry(
  input: Omit<CommentEntry, 'id' | 'createdAt' | 'updatedAt'>
): Promise<CommentEntry> {
  const now = Date.now();
  const isGlobal = input.mapId === 'global';
  const normalizedCoord = isGlobal ? '' : normalizeCellCoord(input.cellCoord);

  // Resolve cellId automatically if not provided
  let resolvedCellId = isGlobal ? undefined : input.cellId;
  if (!isGlobal && !resolvedCellId && input.mapId && normalizedCoord) {
    const matchingCell = await db.cells
      .where('[mapId+coord]')
      .equals([input.mapId, normalizedCoord])
      .first();
    resolvedCellId = matchingCell?.id;
  }

  const entry: CommentEntry = {
    ...input,
    cellCoord: normalizedCoord,
    cellId: resolvedCellId,
    id: `comm-${now}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: now,
    updatedAt: now,
  };

  await db.comments.put(entry);
  return entry;
}

export async function updateCommentEntry(
  commentId: string,
  updates: Partial<Omit<CommentEntry, 'id' | 'createdAt'>>
): Promise<void> {
  const existing = await db.comments.get(commentId);
  if (!existing) return;

  const nextUpdates: Partial<Omit<CommentEntry, 'id' | 'createdAt'>> = {
    ...updates,
  };

  const targetMapId = nextUpdates.mapId ?? existing.mapId;
  if (targetMapId === 'global') {
    nextUpdates.cellCoord = '';
    nextUpdates.cellId = undefined;
  } else {
    if (nextUpdates.cellCoord !== undefined) {
      nextUpdates.cellCoord = normalizeCellCoord(nextUpdates.cellCoord);
    }

    const targetCoord = nextUpdates.cellCoord ?? existing.cellCoord;

    // Automatically resolve and migrate cellId when Map or Cell Coordinate changes
    if (
      (nextUpdates.mapId !== undefined && nextUpdates.mapId !== existing.mapId) ||
      (nextUpdates.cellCoord !== undefined &&
        nextUpdates.cellCoord !== existing.cellCoord)
    ) {
      const matchingCell = await db.cells
        .where('[mapId+coord]')
        .equals([targetMapId, targetCoord])
        .first();
      nextUpdates.cellId = matchingCell?.id;
    }
  }

  await db.comments.update(commentId, {
    ...nextUpdates,
    updatedAt: Date.now(),
  });
}

export async function deleteCommentEntry(commentId: string): Promise<void> {
  const comm = await db.comments.get(commentId);
  if (!comm) return;

  if (comm.attachmentBlobIds.length > 0) {
    await db.blobs.bulkDelete(comm.attachmentBlobIds);
  }
  await db.comments.delete(commentId);
}

export async function attachImageToComment(
  commentId: string,
  imageBlob: Blob
): Promise<string> {
  const comm = await db.comments.get(commentId);
  if (!comm) throw new Error('Comment not found');

  const blobId = await processAndStoreAttachmentImage(imageBlob);
  await db.comments.update(commentId, {
    attachmentBlobIds: [...comm.attachmentBlobIds, blobId],
    updatedAt: Date.now(),
  });
  return blobId;
}

export async function removeAttachmentFromComment(
  commentId: string,
  blobId: string
): Promise<void> {
  const comm = await db.comments.get(commentId);
  if (!comm) return;

  await db.blobs.delete(blobId);
  await db.comments.update(commentId, {
    attachmentBlobIds: comm.attachmentBlobIds.filter((id) => id !== blobId),
    updatedAt: Date.now(),
  });
}

// ============================================================================
// 5. SKETCHES & GENERAL NOTES
// ============================================================================

export async function createSketchNote(
  title: string,
  description: string,
  mapId?: string,
  imageBlob?: Blob
): Promise<SketchNote> {
  const now = Date.now();
  let imageBlobId: string | undefined;
  if (imageBlob) {
    imageBlobId = await processAndStoreAttachmentImage(imageBlob);
  }

  const sketch: SketchNote = {
    id: `sketch-${now}-${Math.random().toString(36).slice(2, 7)}`,
    title: title.trim() || 'Untitled Sketch',
    description,
    mapId,
    imageBlobId,
    createdAt: now,
    updatedAt: now,
  };

  await db.sketches.put(sketch);
  return sketch;
}

export async function updateSketchNote(
  sketchId: string,
  updates: Partial<Pick<SketchNote, 'title' | 'description' | 'mapId'>>,
  newImageBlob?: Blob
): Promise<void> {
  const existing = await db.sketches.get(sketchId);
  if (!existing) return;

  let imageBlobId = existing.imageBlobId;
  if (newImageBlob) {
    if (existing.imageBlobId) {
      await db.blobs.delete(existing.imageBlobId);
    }
    imageBlobId = await processAndStoreAttachmentImage(newImageBlob);
  }

  await db.sketches.update(sketchId, {
    ...updates,
    imageBlobId,
    updatedAt: Date.now(),
  });
}

export async function deleteSketchNote(sketchId: string): Promise<void> {
  const existing = await db.sketches.get(sketchId);
  if (!existing) return;
  if (existing.imageBlobId) {
    await db.blobs.delete(existing.imageBlobId);
  }
  await db.sketches.delete(sketchId);
}

// ============================================================================
// 6. PROJECT CUSTOMIZATION (MARKERS, ROOM FLAGS, CUSTOM COMMENT FIELDS)
// ============================================================================

export async function addRoomFlagOption(flagName: string): Promise<void> {
  const clean = flagName.trim();
  if (!clean) return;

  const config = await db.config.get('singleton');
  if (!config) return;

  const existing = config.roomFlagOptions || [];
  const exists = existing.some(
    (opt) => opt.toLowerCase() === clean.toLowerCase()
  );
  if (!exists) {
    await db.config.update('singleton', {
      roomFlagOptions: [...existing, clean],
      updatedAt: Date.now(),
    });
  }
}

export async function updateRoomFlagOptions(
  nextOptions: string[],
  renamedOrDeleted?: { oldName: string; newName: string }
): Promise<void> {
  const now = Date.now();
  await db.transaction('rw', [db.config, db.cells], async () => {
    await db.config.update('singleton', {
      roomFlagOptions: nextOptions,
      updatedAt: now,
    });

    if (renamedOrDeleted && renamedOrDeleted.oldName !== renamedOrDeleted.newName) {
      const allCells = await db.cells.toArray();
      const affectedCells = allCells.filter((c) =>
        c.tags.includes(renamedOrDeleted.oldName)
      );
      if (affectedCells.length > 0) {
        await db.cells.bulkPut(
          affectedCells.map((c) => {
            const nextTags = renamedOrDeleted.newName
              ? Array.from(
                  new Set(
                    c.tags.map((t) =>
                      t === renamedOrDeleted.oldName ? renamedOrDeleted.newName : t
                    )
                  )
                )
              : c.tags.filter((t) => t !== renamedOrDeleted.oldName);
            return {
              ...c,
              tags: nextTags,
              updatedAt: now,
            };
          })
        );
      }
    }
  });
}

export async function saveMarkerDefinitions(
  definitions: MarkerDefinition[]
): Promise<void> {
  const now = Date.now();
  await db.transaction('rw', [db.config, db.cells], async () => {
    await db.config.update('singleton', {
      markerDefinitions: definitions,
      updatedAt: now,
    });

    // Convert any PinMarkers whose typeId was deleted into a red "BROKEN" marker
    const validTypeIds = new Set(definitions.map((d) => d.id));
    const allCells = await db.cells.toArray();
    const cellsToUpdate: GridCell[] = [];

    for (const cell of allCells) {
      if (cell.markers.length === 0) continue;
      let changed = false;
      const nextMarkers = cell.markers.map((pin) => {
        if (validTypeIds.has(pin.typeId) || pin.typeId === 'broken') {
          return pin;
        }
        changed = true;
        const prevLabel = pin.shortLabel?.trim() || '';
        const nextLabel = prevLabel
          ? prevLabel.toUpperCase().includes('BROKEN')
            ? prevLabel
            : `BROKEN (${prevLabel})`
          : 'BROKEN';
        return {
          ...pin,
          typeId: 'broken',
          color: '#ef4444',
          shortLabel: nextLabel,
        };
      });

      if (changed) {
        cellsToUpdate.push({
          ...cell,
          markers: nextMarkers,
          updatedAt: now,
        });
      }
    }

    if (cellsToUpdate.length > 0) {
      await db.cells.bulkPut(cellsToUpdate);
    }
  });
}

export async function saveCommentCategories(
  categories: CommentCategoryDefinition[]
): Promise<void> {
  const now = Date.now();
  await db.transaction('rw', [db.config, db.comments], async () => {
    await db.config.update('singleton', {
      commentCategories: categories,
      updatedAt: now,
    });

    const validIds = new Set(categories.map((c) => c.id));
    const fallbackId = categories[0]?.id || 'general';
    const allComments = await db.comments.toArray();
    const orphaned = allComments.filter((c) => !validIds.has(c.category));
    if (orphaned.length > 0) {
      await db.comments.bulkPut(
        orphaned.map((c) => ({
          ...c,
          category: fallbackId,
          updatedAt: now,
        }))
      );
    }
  });
}

export async function saveCustomCommentFields(
  fields: CustomFieldDefinition[]
): Promise<void> {
  const config = await db.config.get('singleton');
  const validIds = new Set(fields.map((f) => f.id));
  const currentScanner = config?.tabletScannerConfig;
  const nextScanner =
    currentScanner &&
    currentScanner.headerTargetMode === 'custom_field' &&
    currentScanner.targetCustomFieldId &&
    !validIds.has(currentScanner.targetCustomFieldId)
      ? {
          ...currentScanner,
          headerTargetMode: 'speaker_or_title' as const,
          targetCustomFieldId: undefined,
        }
      : currentScanner;

  await db.config.update('singleton', {
    customCommentFields: fields,
    ...(nextScanner ? { tabletScannerConfig: nextScanner } : {}),
    updatedAt: Date.now(),
  });
}

export async function saveTabletScannerConfig(
  tabletScannerConfig: TabletScannerConfig
): Promise<void> {
  await db.config.update('singleton', {
    tabletScannerConfig,
    updatedAt: Date.now(),
  });
}

export async function saveSeamlessCaptureConfig(
  seamlessCaptureConfig: SeamlessCaptureConfig
): Promise<void> {
  await db.config.update('singleton', {
    seamlessCaptureConfig,
    updatedAt: Date.now(),
  });
}

export async function addCustomFieldOption(
  fieldId: string,
  optionValue: string
): Promise<void> {
  const clean = optionValue.trim();
  if (!clean) return;

  const config = await db.config.get('singleton');
  if (!config) return;

  const updatedFields = config.customCommentFields.map((field) => {
    if (field.id !== fieldId) return field;
    const existingOptions = field.options || [];
    const alreadyExists = existingOptions.some(
      (opt) => opt.toLowerCase() === clean.toLowerCase()
    );
    if (alreadyExists) return field;
    return {
      ...field,
      options: [...existingOptions, clean],
    };
  });

  await db.config.update('singleton', {
    customCommentFields: updatedFields,
    updatedAt: Date.now(),
  });
}

export async function updateCustomFieldOptions(
  fieldId: string,
  nextOptions: string[],
  renamedOrDeleted?: { oldName: string; newName: string }
): Promise<void> {
  const now = Date.now();
  await db.transaction('rw', [db.config, db.comments], async () => {
    const config = await db.config.get('singleton');
    if (!config) return;

    const updatedFields = config.customCommentFields.map((field) =>
      field.id === fieldId ? { ...field, options: nextOptions } : field
    );

    await db.config.update('singleton', {
      customCommentFields: updatedFields,
      updatedAt: now,
    });

    if (renamedOrDeleted && renamedOrDeleted.oldName !== renamedOrDeleted.newName) {
      const allComments = await db.comments.toArray();
      const affected = allComments.filter(
        (c) => c.customFields?.[fieldId] === renamedOrDeleted.oldName
      );
      if (affected.length > 0) {
        await db.comments.bulkPut(
          affected.map((c) => {
            const nextCustom = { ...(c.customFields || {}) };
            if (renamedOrDeleted.newName) {
              nextCustom[fieldId] = renamedOrDeleted.newName;
            } else {
              delete nextCustom[fieldId];
            }
            return {
              ...c,
              customFields: nextCustom,
              updatedAt: now,
            };
          })
        );
      }
    }
  });
}

// ============================================================================
// 7. DATABASE RESET
// ============================================================================

/**
 * Resets the entire database back to a clean, spoiler-free blank playthrough.
 */
export async function resetToBlankPlaythrough(): Promise<string> {
  const { map, cells } = createBlankInitialMap();
  const config = createDefaultProjectConfig();

  await db.transaction(
    'rw',
    [db.config, db.maps, db.cells, db.comments, db.sketches, db.blobs],
    async () => {
      await db.maps.clear();
      await db.cells.clear();
      await db.comments.clear();
      await db.sketches.clear();
      await db.blobs.clear();

      await db.config.put(config);
      await db.maps.put(map);
      await db.cells.bulkPut(cells);
    }
  );

  return map.id;
}
