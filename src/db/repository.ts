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
  MapPage,
  MarkerDefinition,
  PinMarker,
  SketchNote,
  VectorArrow,
} from '../types/models';
import {
  createBlankInitialMap,
  createDefaultProjectConfig,
} from '../config/defaultDefinitions';
import { formatCellCoord } from '../utils/coordinates';
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
 * Expands a map's grid by adding 1 row or column on the specified edge:
 * - 'bottom' / 'right': Appends new empty cells without shifting existing coordinates.
 * - 'top' / 'left': Shifts existing cells by +1 row or +1 col, recalculates their
 *   `$Col$Row` string, and automatically updates linked CommentEntry `cellCoord` values!
 */
export async function expandMapGrid(
  mapId: string,
  direction: 'top' | 'bottom' | 'left' | 'right'
): Promise<void> {
  const now = Date.now();
  await db.transaction('rw', [db.maps, db.cells, db.comments], async () => {
    const map = await db.maps.get(mapId);
    if (!map) return;

    const existingCells = await db.cells.where('mapId').equals(mapId).toArray();
    const mapComments = await db.comments.where('mapId').equals(mapId).toArray();

    const newRows = direction === 'top' || direction === 'bottom' ? map.rows + 1 : map.rows;
    const newCols = direction === 'left' || direction === 'right' ? map.cols + 1 : map.cols;

    const updatedCells: GridCell[] = [];
    const cellCoordMap = new Map<string, string>(); // cellId -> newCoord

    if (direction === 'top' || direction === 'left') {
      const rowDelta = direction === 'top' ? 1 : 0;
      const colDelta = direction === 'left' ? 1 : 0;

      for (const cell of existingCells) {
        const nextRow = cell.row + rowDelta;
        const nextCol = cell.col + colDelta;
        const nextCoord = formatCellCoord(nextRow, nextCol);
        cellCoordMap.set(cell.id, nextCoord);
        updatedCells.push({
          ...cell,
          row: nextRow,
          col: nextCol,
          coord: nextCoord,
          updatedAt: now,
        });
      }

      if (direction === 'top') {
        for (let c = 0; c < newCols; c++) {
          updatedCells.push({
            id: `cell-${mapId}-0-${c}-${Math.random().toString(36).slice(2, 7)}`,
            mapId,
            row: 0,
            col: c,
            coord: formatCellCoord(0, c),
            state: 'empty',
            roomName: '',
            tags: [],
            markers: [],
            arrows: [],
            updatedAt: now,
          });
        }
      } else {
        for (let r = 0; r < newRows; r++) {
          updatedCells.push({
            id: `cell-${mapId}-${r}-0-${Math.random().toString(36).slice(2, 7)}`,
            mapId,
            row: r,
            col: 0,
            coord: formatCellCoord(r, 0),
            state: 'empty',
            roomName: '',
            tags: [],
            markers: [],
            arrows: [],
            updatedAt: now,
          });
        }
      }

      await db.cells.bulkPut(updatedCells);

      // Update any comments linked to shifted cells
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
    } else if (direction === 'bottom') {
      const r = map.rows;
      for (let c = 0; c < newCols; c++) {
        updatedCells.push({
          id: `cell-${mapId}-${r}-${c}-${Math.random().toString(36).slice(2, 7)}`,
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
      await db.cells.bulkPut(updatedCells);
    } else if (direction === 'right') {
      const c = map.cols;
      for (let r = 0; r < newRows; r++) {
        updatedCells.push({
          id: `cell-${mapId}-${r}-${c}-${Math.random().toString(36).slice(2, 7)}`,
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
      await db.cells.bulkPut(updatedCells);
    }

    await db.maps.update(mapId, { rows: newRows, cols: newCols });
  });
}

/**
 * Removes the outer row or column on the specified edge (minimum 2x2 grid).
 */
export async function shrinkMapGrid(
  mapId: string,
  direction: 'top' | 'bottom' | 'left' | 'right'
): Promise<void> {
  const now = Date.now();
  await db.transaction('rw', [db.maps, db.cells, db.comments, db.blobs], async () => {
    const map = await db.maps.get(mapId);
    if (!map) return;
    if ((direction === 'top' || direction === 'bottom') && map.rows <= 2) return;
    if ((direction === 'left' || direction === 'right') && map.cols <= 2) return;

    const existingCells = await db.cells.where('mapId').equals(mapId).toArray();
    const mapComments = await db.comments.where('mapId').equals(mapId).toArray();

    let cellsToRemove: GridCell[] = [];
    let cellsToKeep: GridCell[] = [];

    if (direction === 'bottom') {
      cellsToRemove = existingCells.filter((c) => c.row === map.rows - 1);
      cellsToKeep = existingCells.filter((c) => c.row < map.rows - 1);
    } else if (direction === 'right') {
      cellsToRemove = existingCells.filter((c) => c.col === map.cols - 1);
      cellsToKeep = existingCells.filter((c) => c.col < map.cols - 1);
    } else if (direction === 'top') {
      cellsToRemove = existingCells.filter((c) => c.row === 0);
      cellsToKeep = existingCells
        .filter((c) => c.row > 0)
        .map((c) => ({
          ...c,
          row: c.row - 1,
          coord: formatCellCoord(c.row - 1, c.col),
          updatedAt: now,
        }));
    } else if (direction === 'left') {
      cellsToRemove = existingCells.filter((c) => c.col === 0);
      cellsToKeep = existingCells
        .filter((c) => c.col > 0)
        .map((c) => ({
          ...c,
          col: c.col - 1,
          coord: formatCellCoord(c.row, c.col - 1),
          updatedAt: now,
        }));
    }

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
    if (direction === 'top' || direction === 'left') {
      await db.cells.bulkPut(cellsToKeep);
      const coordMap = new Map(cellsToKeep.map((c) => [c.id, c.coord]));
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

    await db.maps.update(mapId, {
      rows: direction === 'top' || direction === 'bottom' ? map.rows - 1 : map.rows,
      cols: direction === 'left' || direction === 'right' ? map.cols - 1 : map.cols,
    });
  });
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
  // Resolve cellId automatically if not provided
  let resolvedCellId = input.cellId;
  if (!resolvedCellId && input.mapId && input.cellCoord) {
    const matchingCell = await db.cells
      .where('[mapId+coord]')
      .equals([input.mapId, input.cellCoord])
      .first();
    resolvedCellId = matchingCell?.id;
  }

  // If the user typed a new raceOrTribe, ensure it is saved in ProjectConfig.raceOrTribeOptions
  if (input.raceOrTribe?.trim()) {
    await addRaceOrTribeOption(input.raceOrTribe.trim());
  }

  const entry: CommentEntry = {
    ...input,
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
  if (updates.raceOrTribe?.trim()) {
    await addRaceOrTribeOption(updates.raceOrTribe.trim());
  }
  await db.comments.update(commentId, {
    ...updates,
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
// 6. PROJECT CUSTOMIZATION (MARKERS, RACE/TRIBES, CUSTOM COMMENT FIELDS)
// ============================================================================

export async function addRaceOrTribeOption(optionName: string): Promise<void> {
  const clean = optionName.trim();
  if (!clean) return;

  const config = await db.config.get('singleton');
  if (!config) return;

  const exists = config.raceOrTribeOptions.some(
    (opt) => opt.toLowerCase() === clean.toLowerCase()
  );
  if (!exists) {
    await db.config.update('singleton', {
      raceOrTribeOptions: [...config.raceOrTribeOptions, clean],
      updatedAt: Date.now(),
    });
  }
}

export async function updateRaceOrTribeOptions(
  nextOptions: string[],
  renamedFromTo?: { oldName: string; newName: string }
): Promise<void> {
  await db.transaction('rw', [db.config, db.comments], async () => {
    await db.config.update('singleton', {
      raceOrTribeOptions: nextOptions,
      updatedAt: Date.now(),
    });

    if (renamedFromTo && renamedFromTo.oldName !== renamedFromTo.newName) {
      const matching = await db.comments
        .where('raceOrTribe')
        .equals(renamedFromTo.oldName)
        .toArray();
      if (matching.length > 0) {
        await db.comments.bulkPut(
          matching.map((c) => ({
            ...c,
            raceOrTribe: renamedFromTo.newName || undefined,
            updatedAt: Date.now(),
          }))
        );
      }
    }
  });
}

export async function saveMarkerDefinitions(
  definitions: MarkerDefinition[]
): Promise<void> {
  await db.config.update('singleton', {
    markerDefinitions: definitions,
    updatedAt: Date.now(),
  });
}

export async function saveCommentCategories(
  categories: CommentCategoryDefinition[]
): Promise<void> {
  await db.config.update('singleton', {
    commentCategories: categories,
    updatedAt: Date.now(),
  });
}

export async function saveCustomCommentFields(
  fields: CustomFieldDefinition[]
): Promise<void> {
  await db.config.update('singleton', {
    customCommentFields: fields,
    updatedAt: Date.now(),
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
