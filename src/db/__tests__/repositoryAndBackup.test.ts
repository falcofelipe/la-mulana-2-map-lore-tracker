import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../database';
import * as imageProcessor from '../imageProcessor';
import {
  addCustomFieldOption,
  addMapGridArrow,
  addPinMarkerToCell,
  addRoomFlagOption,
  addVectorArrowToCell,
  assignCellScreenshot,
  attachImageToComment,
  clearCellScreenshot,
  createCommentEntry,
  createMapPage,
  createSketchNote,
  deleteColAt,
  deleteCommentEntry,
  deleteMapGridArrow,
  deleteMapPage,
  deletePinMarkerFromCell,
  deleteRowAt,
  deleteSketchNote,
  deleteVectorArrowFromCell,
  expandMapGrid,
  insertColAt,
  insertRowAt,
  removeAttachmentFromComment,
  reorderMapPages,
  resetToBlankPlaythrough,
  saveCommentCategories,
  saveCustomCommentFields,
  saveMarkerDefinitions,
  saveSeamlessCaptureConfig,
  saveTabletScannerConfig,
  shrinkMapGrid,
  swapOrMoveCells,
  toggleCellBlockedState,
  toggleCellPassage,
  toggleManualMapConnection,
  updateCellMetadata,
  updateCommentEntry,
  updateCustomFieldOptions,
  updateMapGridArrow,
  updateMapPageMetadata,
  updatePinMarkerOnCell,
  updateRoomFlagOptions,
  updateSketchNote,
  updateVectorArrowOnCell,
} from '../repository';
import { buildBackupZipBlob, importFullBackupZip } from '../backupService';

describe('IndexedDB Repository & Backup Integration Suite', () => {
  let initialMapId: string;

  beforeEach(async () => {
    initialMapId = await resetToBlankPlaythrough();
  });

  it('initializes a 100% spoiler-free blank playthrough', async () => {
    const config = await db.config.get('singleton');
    expect(config).toBeDefined();
    expect(config?.roomFlagOptions).toEqual([]);
    expect(config?.customCommentFields).toEqual([]);

    const maps = await db.maps.toArray();
    expect(maps).toHaveLength(1);
    expect(maps[0].id).toBe(initialMapId);
    expect(maps[0].rows).toBe(7);
    expect(maps[0].cols).toBe(8);

    const cells = await db.cells.where('mapId').equals(initialMapId).toArray();
    expect(cells).toHaveLength(56);
  });

  it('inserts and deletes rows/columns at arbitrary indices while shifting cell coords, comments, and cross-map warp pin labels', async () => {
    const map2 = await createMapPage('AcB', 'Ancient Chaos', 4, 4);

    // Find cell B2 (row=1, col=1) on map 1
    const cellB2 = await db.cells
      .where('[mapId+row+col]')
      .equals([initialMapId, 1, 1])
      .first();
    expect(cellB2).toBeDefined();
    expect(cellB2!.coord).toBe('B2');

    await updateCellMetadata(cellB2!.id, { roomName: 'Chamber of Birth' });

    // Attach a comment to B2
    const comm = await createCommentEntry({
      mapId: initialMapId,
      cellId: cellB2!.id,
      cellCoord: 'B2',
      category: 'tablet',
      speakerOrTitle: 'T1',
      content: 'Speak the mantra of BIRTH.',
      resolved: false,
      attachmentBlobIds: [],
    });

    // Place a Warp Pin on map2 (A1) targeting cellB2 on map1
    const map2CellA1 = await db.cells
      .where('[mapId+row+col]')
      .equals([map2.id, 0, 0])
      .first();
    expect(map2CellA1).toBeDefined();

    const warpPin = await addPinMarkerToCell(map2CellA1!.id, {
      xPercent: 50,
      yPercent: 50,
      typeId: 'warp_transition',
      color: '#a855f7',
      shortLabel: '⇄ F01 B2',
      targetMapId: initialMapId,
      targetCellId: cellB2!.id,
      isBidirectionalWarp: true,
      resolved: false,
    });

    // 1. Insert a row at index 1 (above B2) -> cellB2 should shift to B3 (row=2, col=1)
    await insertRowAt(initialMapId, 1);

    const shiftedAfterRow = await db.cells.get(cellB2!.id);
    expect(shiftedAfterRow?.row).toBe(2);
    expect(shiftedAfterRow?.col).toBe(1);
    expect(shiftedAfterRow?.coord).toBe('B3');

    const commAfterRow = await db.comments.get(comm.id);
    expect(commAfterRow?.cellCoord).toBe('B3');

    const map2CellAfterRow = await db.cells.get(map2CellA1!.id);
    const pinAfterRow = map2CellAfterRow?.markers.find(
      (m) => m.id === warpPin.id
    );
    expect(pinAfterRow?.shortLabel).toBe('⇄ F01 B3');

    // 2. Insert a column at index 1 (left of B3) -> cellB2 should shift to C3 (row=2, col=2)
    await insertColAt(initialMapId, 1);

    const shiftedAfterCol = await db.cells.get(cellB2!.id);
    expect(shiftedAfterCol?.row).toBe(2);
    expect(shiftedAfterCol?.col).toBe(2);
    expect(shiftedAfterCol?.coord).toBe('C3');

    const commAfterCol = await db.comments.get(comm.id);
    expect(commAfterCol?.cellCoord).toBe('C3');

    const map2CellAfterCol = await db.cells.get(map2CellA1!.id);
    const pinAfterCol = map2CellAfterCol?.markers.find(
      (m) => m.id === warpPin.id
    );
    expect(pinAfterCol?.shortLabel).toBe('⇄ F01 C3');

    // 3. Delete the inserted row (index 1) and column (index 1) -> returns to B2
    await deleteRowAt(initialMapId, 1);
    await deleteColAt(initialMapId, 1);

    const restoredCell = await db.cells.get(cellB2!.id);
    expect(restoredCell?.coord).toBe('B2');

    const restoredComm = await db.comments.get(comm.id);
    expect(restoredComm?.cellCoord).toBe('B2');

    const map2CellRestored = await db.cells.get(map2CellA1!.id);
    const pinRestored = map2CellRestored?.markers.find(
      (m) => m.id === warpPin.id
    );
    expect(pinRestored?.shortLabel).toBe('⇄ F01 B2');
  });

  it('swaps/moves cells while preserving UUIDs and syncing comments & doorway passages', async () => {
    const cellA1 = await db.cells
      .where('[mapId+row+col]')
      .equals([initialMapId, 0, 0])
      .first();
    const cellB1 = await db.cells
      .where('[mapId+row+col]')
      .equals([initialMapId, 0, 1])
      .first();
    const cellD4 = await db.cells
      .where('[mapId+row+col]')
      .equals([initialMapId, 3, 3])
      .first();

    expect(cellA1 && cellB1 && cellD4).toBeDefined();

    // Toggle right passage on A1 -> should mirror left passage on B1
    await toggleCellPassage(cellA1!.id, 'right');
    const a1Updated = await db.cells.get(cellA1!.id);
    const b1Updated = await db.cells.get(cellB1!.id);
    expect(a1Updated?.openPassages?.right).toBe(true);
    expect(b1Updated?.openPassages?.left).toBe(true);

    // Add room name & comment to A1, then swap A1 with D4
    await updateCellMetadata(cellA1!.id, { roomName: 'Entrance Gate' });
    const comm = await createCommentEntry({
      mapId: initialMapId,
      cellId: cellA1!.id,
      cellCoord: 'A1',
      category: 'npc',
      speakerOrTitle: 'NPC Xelpud',
      content: 'Welcome to Eg-Lana!',
      resolved: false,
      attachmentBlobIds: [],
    });

    await swapOrMoveCells(cellA1!.id, cellD4!.id);

    const movedCell = await db.cells.get(cellA1!.id);
    expect(movedCell?.coord).toBe('D4');
    expect(movedCell?.row).toBe(3);
    expect(movedCell?.col).toBe(3);
    expect(movedCell?.roomName).toBe('Entrance Gate');

    const movedComm = await db.comments.get(comm.id);
    expect(movedComm?.cellId).toBe(cellA1!.id);
    expect(movedComm?.cellCoord).toBe('D4');
  });

  it('migrates comments across maps/cells and atomically renames/deletes Room Flags & Custom Field Options', async () => {
    const map2 = await createMapPage('IdA', 'Immortal Battlefield', 5, 5);
    const map2CellC2 = await db.cells
      .where('[mapId+coord]')
      .equals([map2.id, 'C2'])
      .first();
    expect(map2CellC2).toBeDefined();

    // 1. Room Flags atomic rename & delete
    await addRoomFlagOption('Grail Point');
    await updateCellMetadata(map2CellC2!.id, { tags: ['Grail Point'] });

    await updateRoomFlagOptions(['Holy Grail Tablet'], {
      oldName: 'Grail Point',
      newName: 'Holy Grail Tablet',
    });

    const cellAfterFlagRename = await db.cells.get(map2CellC2!.id);
    expect(cellAfterFlagRename?.tags).toEqual(['Holy Grail Tablet']);

    await updateRoomFlagOptions([], {
      oldName: 'Holy Grail Tablet',
      newName: '',
    });
    const cellAfterFlagDelete = await db.cells.get(map2CellC2!.id);
    expect(cellAfterFlagDelete?.tags).toEqual([]);

    // 2. Custom Dropdown Field creation & atomic option rename
    await saveCustomCommentFields([
      {
        id: 'field-tribe',
        name: 'Tribe',
        type: 'select',
        options: ['Alfr'],
        showInTable: true,
        filterable: true,
      },
    ]);
    await addCustomFieldOption('field-tribe', 'Jotunn');

    const comm = await createCommentEntry({
      mapId: initialMapId,
      cellCoord: 'A1',
      category: 'tablet',
      content: 'The giants built this tower.',
      customFields: { 'field-tribe': 'Jotunn' },
      resolved: false,
      attachmentBlobIds: [],
    });

    // Rename 'Jotunn' -> 'Jotnar'
    await updateCustomFieldOptions('field-tribe', ['Alfr', 'Jotnar'], {
      oldName: 'Jotunn',
      newName: 'Jotnar',
    });

    const commAfterOptionRename = await db.comments.get(comm.id);
    expect(commAfterOptionRename?.customFields?.['field-tribe']).toBe('Jotnar');

    // 3. Migrate comment to map2 C2 via updateCommentEntry
    await updateCommentEntry(comm.id, {
      mapId: map2.id,
      cellCoord: 'c2',
    });

    const migratedComm = await db.comments.get(comm.id);
    expect(migratedComm?.mapId).toBe(map2.id);
    expect(migratedComm?.cellCoord).toBe('C2');
    expect(migratedComm?.cellId).toBe(map2CellC2!.id);
  });

  it('exports and imports a complete .ZIP backup archive with 100% fidelity', async () => {
    const map2 = await createMapPage('TsA', 'Takamagahara Shrine', 4, 4);
    await toggleManualMapConnection(initialMapId, map2.id);

    const cells = await db.cells.where('mapId').equals(initialMapId).toArray();
    const cell0 = cells[0];
    const cell1 = cells[1];

    await updateCellMetadata(cell0.id, {
      roomName: 'Grail Room',
      isCompleted: true,
    });
    const gridArrow = await addMapGridArrow(initialMapId, {
      fromCellId: cell0.id,
      toCellId: cell1.id,
      color: '#06b6d4',
      bidirectional: true,
      dashed: false,
    });
    expect(gridArrow.id).toBeDefined();

    const comm = await createCommentEntry({
      mapId: initialMapId,
      cellId: cell0.id,
      cellCoord: cell0.coord,
      category: 'todo',
      speakerOrTitle: 'Locked Chest',
      content: 'Find the hidden weight.',
      relatedCellIds: [cell1.id],
      resolved: false,
      attachmentBlobIds: [],
    });

    const sketch = await createSketchNote(
      'Root Map',
      'Connects 3 knots',
      initialMapId
    );

    // Store a synthetic binary image record in db.blobs
    const sampleBytes = new Uint8Array([82, 73, 70, 70, 1, 2, 3, 4]);
    await db.blobs.put({
      id: 'blob-test-1',
      blob: new Blob([sampleBytes], { type: 'image/webp' }),
      mimeType: 'image/webp',
      width: 320,
      height: 180,
      byteSize: sampleBytes.byteLength,
      createdAt: Date.now(),
    });

    // Export full backup .zip blob
    const zipBlob = await buildBackupZipBlob();
    const zipArrayBuffer = await zipBlob.arrayBuffer();

    // Wipe database back to blank playthrough
    await resetToBlankPlaythrough();
    expect(await db.maps.count()).toBe(1);
    expect(await db.comments.count()).toBe(0);

    // Import from the .zip archive
    const restoredFirstMapId = await importFullBackupZip(zipArrayBuffer);
    expect(restoredFirstMapId).toBe(initialMapId);

    const restoredMaps = await db.maps.orderBy('order').toArray();
    expect(restoredMaps).toHaveLength(2);
    expect(restoredMaps[0].manualOutgoingMapIds).toEqual([map2.id]);
    expect(restoredMaps[0].gridArrows).toHaveLength(1);

    const restoredCell0 = await db.cells.get(cell0.id);
    expect(restoredCell0?.roomName).toBe('Grail Room');
    expect(restoredCell0?.isCompleted).toBe(true);

    const restoredComm = await db.comments.get(comm.id);
    expect(restoredComm?.speakerOrTitle).toBe('Locked Chest');
    expect(restoredComm?.relatedCellIds).toEqual([cell1.id]);

    const restoredSketch = await db.sketches.get(sketch.id);
    expect(restoredSketch?.title).toBe('Root Map');
    expect(restoredSketch?.mapId).toBe(initialMapId);

    const restoredBlob = await db.blobs.get('blob-test-1');
    expect(restoredBlob).toBeDefined();
    expect(restoredBlob?.width).toBe(320);

    // Also test deleteMapGridArrow cleanup
    await deleteMapGridArrow(initialMapId, gridArrow.id);
    const mapAfterArrowDelete = await db.maps.get(initialMapId);
    expect(mapAfterArrowDelete?.gridArrows).toEqual([]);
  });

  it('cascades map deletion across cells, comments, sketches, and binary blobs, and recreates a blank map if the last map is deleted', async () => {
    let blobSeq = 0;
    vi.spyOn(imageProcessor, 'processAndStoreRoomScreenshot').mockImplementation(
      async (sourceBlob: Blob) => {
        const fullId = `mock-full-${++blobSeq}`;
        const thumbId = `mock-thumb-${blobSeq}`;
        await db.blobs.bulkPut([
          {
            id: fullId,
            blob: sourceBlob,
            mimeType: 'image/webp',
            width: 1920,
            height: 1080,
            byteSize: sourceBlob.size,
            createdAt: Date.now(),
          },
          {
            id: thumbId,
            blob: sourceBlob,
            mimeType: 'image/webp',
            width: 480,
            height: 270,
            byteSize: sourceBlob.size,
            createdAt: Date.now(),
          },
        ]);
        return { fullBlobId: fullId, thumbBlobId: thumbId, width: 1920, height: 1080 };
      }
    );

    vi.spyOn(imageProcessor, 'processAndStoreAttachmentImage').mockImplementation(
      async (sourceBlob: Blob) => {
        const attId = `mock-att-${++blobSeq}`;
        await db.blobs.put({
          id: attId,
          blob: sourceBlob,
          mimeType: 'image/webp',
          width: 800,
          height: 600,
          byteSize: sourceBlob.size,
          createdAt: Date.now(),
        });
        return attId;
      }
    );

    const map2 = await createMapPage('DfA', 'Divine Fortress', 3, 3);
    const map3 = await createMapPage('hmB', 'Heaven Labyrinth', 3, 3);

    // Reorder maps and update metadata
    await updateMapPageMetadata(map3.id, { codePrefix: 'HmB', name: 'Heaven' });
    await reorderMapPages([map3.id, map2.id, initialMapId]);
    const reordered = await db.maps.orderBy('order').toArray();
    expect(reordered.map((m) => m.id)).toEqual([map3.id, map2.id, initialMapId]);

    // Populate map2 with a cell screenshot, a comment with attachment, and a map-scoped sketch with image
    const map2Cells = await db.cells.where('mapId').equals(map2.id).toArray();
    const dummyBlob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/webp' });

    await assignCellScreenshot(map2Cells[0].id, dummyBlob);
    const cellWithShot = await db.cells.get(map2Cells[0].id);
    expect(cellWithShot?.screenshotBlobId).toBeDefined();
    expect(cellWithShot?.thumbnailBlobId).toBeDefined();

    const map2Comment = await createCommentEntry({
      mapId: map2.id,
      cellId: map2Cells[0].id,
      cellCoord: map2Cells[0].coord,
      category: 'tablet',
      content: 'Fortress tablet.',
      resolved: false,
      attachmentBlobIds: [],
    });
    const commBlobId = await attachImageToComment(map2Comment.id, dummyBlob);

    const map2Sketch = await createSketchNote(
      'Fortress Puzzle',
      'Diagram',
      map2.id,
      dummyBlob
    );
    expect(map2Sketch.imageBlobId).toBeDefined();

    // Global sketch (no mapId) should survive deleting map2
    const globalSketch = await createSketchNote(
      'Global Mantra Note',
      'Keep across maps',
      undefined,
      dummyBlob
    );

    expect(await db.blobs.count()).toBe(5); // 2 room + 1 comment + 1 map2Sketch + 1 globalSketch

    // Delete map2 -> should remove its cells, comments, sketches, and all 4 of its blobs
    const nextMapId = await deleteMapPage(map2.id);
    expect(nextMapId).toBe(map3.id);

    expect(await db.maps.get(map2.id)).toBeUndefined();
    expect(await db.cells.where('mapId').equals(map2.id).count()).toBe(0);
    expect(await db.comments.where('mapId').equals(map2.id).count()).toBe(0);
    expect(await db.sketches.where('mapId').equals(map2.id).count()).toBe(0);

    expect(await db.blobs.get(cellWithShot!.screenshotBlobId!)).toBeUndefined();
    expect(await db.blobs.get(cellWithShot!.thumbnailBlobId!)).toBeUndefined();
    expect(await db.blobs.get(commBlobId)).toBeUndefined();
    expect(await db.blobs.get(map2Sketch.imageBlobId!)).toBeUndefined();

    // Global sketch and its blob remain intact
    expect(await db.sketches.get(globalSketch.id)).toBeDefined();
    expect(await db.blobs.get(globalSketch.imageBlobId!)).toBeDefined();

    // Delete remaining maps down to 0 -> should automatically recreate a blank initial map
    await deleteMapPage(map3.id);
    const recreatedMapId = await deleteMapPage(initialMapId);
    expect(recreatedMapId).toBeDefined();

    const remainingMaps = await db.maps.toArray();
    expect(remainingMaps).toHaveLength(1);
    expect(remainingMaps[0].id).toBe(recreatedMapId);
    expect(await db.cells.where('mapId').equals(recreatedMapId!).count()).toBe(56);

    vi.restoreAllMocks();
  });

  it('cleans up comments, attachments, cell screenshots, and grid arrows when deleting rows or columns, and enforces the 2x2 minimum grid guard', async () => {
    let blobSeq = 0;
    vi.spyOn(imageProcessor, 'processAndStoreRoomScreenshot').mockImplementation(
      async (sourceBlob: Blob) => {
        const fullId = `rowdel-full-${++blobSeq}`;
        const thumbId = `rowdel-thumb-${blobSeq}`;
        await db.blobs.bulkPut([
          {
            id: fullId,
            blob: sourceBlob,
            mimeType: 'image/webp',
            width: 1920,
            height: 1080,
            byteSize: sourceBlob.size,
            createdAt: Date.now(),
          },
          {
            id: thumbId,
            blob: sourceBlob,
            mimeType: 'image/webp',
            width: 480,
            height: 270,
            byteSize: sourceBlob.size,
            createdAt: Date.now(),
          },
        ]);
        return { fullBlobId: fullId, thumbBlobId: thumbId, width: 1920, height: 1080 };
      }
    );

    vi.spyOn(imageProcessor, 'processAndStoreAttachmentImage').mockImplementation(
      async (sourceBlob: Blob) => {
        const attId = `rowdel-att-${++blobSeq}`;
        await db.blobs.put({
          id: attId,
          blob: sourceBlob,
          mimeType: 'image/webp',
          width: 800,
          height: 600,
          byteSize: sourceBlob.size,
          createdAt: Date.now(),
        });
        return attId;
      }
    );

    // Create a 2x2 map and expand it to 3x3 using expandMapGrid
    const smallMap = await createMapPage('SmA', 'Small Shrine', 2, 2);
    await expandMapGrid(smallMap.id, 'bottom'); // 3x2
    await expandMapGrid(smallMap.id, 'right'); // 3x3

    const mapAfterExpand = await db.maps.get(smallMap.id);
    expect(mapAfterExpand?.rows).toBe(3);
    expect(mapAfterExpand?.cols).toBe(3);

    const cellA1 = (await db.cells
      .where('[mapId+coord]')
      .equals([smallMap.id, 'A1'])
      .first())!;
    const cellB2 = (await db.cells
      .where('[mapId+coord]')
      .equals([smallMap.id, 'B2'])
      .first())!;
    const cellC3 = (await db.cells
      .where('[mapId+coord]')
      .equals([smallMap.id, 'C3'])
      .first())!;

    const dummyBlob = new Blob([new Uint8Array([9, 8, 7])], { type: 'image/webp' });
    await assignCellScreenshot(cellA1.id, dummyBlob);

    const commOnA1 = await createCommentEntry({
      mapId: smallMap.id,
      cellId: cellA1.id,
      cellCoord: 'A1',
      category: 'npc',
      content: 'Comment in row 0 to be deleted.',
      resolved: false,
      attachmentBlobIds: [],
    });
    const commA1AttId = await attachImageToComment(commOnA1.id, dummyBlob);

    const commOnB2 = await createCommentEntry({
      mapId: smallMap.id,
      cellId: cellB2.id,
      cellCoord: 'B2',
      category: 'tablet',
      content: 'Comment in B2 that shifts to B1.',
      resolved: false,
      attachmentBlobIds: [],
    });

    // Add two grid arrows: one linked to A1 (should be deleted) and one between B2 and C3 (should survive)
    const arrowTouchingA1 = await addMapGridArrow(smallMap.id, {
      fromCellId: cellA1.id,
      toCellId: cellB2.id,
      color: '#22c55e',
      bidirectional: false,
      dashed: false,
    });
    const arrowSurviving = await addMapGridArrow(smallMap.id, {
      fromCellId: cellB2.id,
      toCellId: cellC3.id,
      color: '#06b6d4',
      bidirectional: true,
      dashed: true,
    });

    // Shrink top row (deletes row 0 containing A1)
    await shrinkMapGrid(smallMap.id, 'top');

    // A1's comment, attachment blob, screenshot blobs, and grid arrow should all be gone
    expect(await db.comments.get(commOnA1.id)).toBeUndefined();
    expect(await db.blobs.get(commA1AttId)).toBeUndefined();
    expect(await db.blobs.count()).toBe(0);

    // B2 should now be at B1, and its comment should have shifted to B1
    const shiftedB2 = await db.cells.get(cellB2.id);
    expect(shiftedB2?.coord).toBe('B1');
    const shiftedCommB2 = await db.comments.get(commOnB2.id);
    expect(shiftedCommB2?.cellCoord).toBe('B1');

    const mapAfterTopShrink = await db.maps.get(smallMap.id);
    expect(mapAfterTopShrink?.rows).toBe(2);
    expect(mapAfterTopShrink?.gridArrows?.map((a) => a.id)).toEqual([
      arrowSurviving.id,
    ]);
    expect(
      mapAfterTopShrink?.gridArrows?.some((a) => a.id === arrowTouchingA1.id)
    ).toBe(false);

    // Shrink right column (deletes col 2 containing C3)
    await shrinkMapGrid(smallMap.id, 'right');
    const mapAt2x2 = await db.maps.get(smallMap.id);
    expect(mapAt2x2?.rows).toBe(2);
    expect(mapAt2x2?.cols).toBe(2);
    expect(mapAt2x2?.gridArrows).toEqual([]); // arrowSurviving touched C3 so it was cleaned up too

    // Attempting to delete another row or col on a 2x2 grid must be a no-op
    await deleteRowAt(smallMap.id, 0);
    await deleteColAt(smallMap.id, 0);
    const mapStill2x2 = await db.maps.get(smallMap.id);
    expect(mapStill2x2?.rows).toBe(2);
    expect(mapStill2x2?.cols).toBe(2);
    expect(await db.cells.where('mapId').equals(smallMap.id).count()).toBe(4);

    vi.restoreAllMocks();
  });

  it('manages cell state transitions, screenshots, pins, vector arrows, and sketch/comment attachments', async () => {
    let blobSeq = 0;
    vi.spyOn(imageProcessor, 'processAndStoreRoomScreenshot').mockImplementation(
      async (sourceBlob: Blob) => {
        const fullId = `cell-full-${++blobSeq}`;
        const thumbId = `cell-thumb-${blobSeq}`;
        await db.blobs.bulkPut([
          {
            id: fullId,
            blob: sourceBlob,
            mimeType: 'image/webp',
            width: 1920,
            height: 1080,
            byteSize: sourceBlob.size,
            createdAt: Date.now(),
          },
          {
            id: thumbId,
            blob: sourceBlob,
            mimeType: 'image/webp',
            width: 480,
            height: 270,
            byteSize: sourceBlob.size,
            createdAt: Date.now(),
          },
        ]);
        return { fullBlobId: fullId, thumbBlobId: thumbId, width: 1920, height: 1080 };
      }
    );

    vi.spyOn(imageProcessor, 'processAndStoreAttachmentImage').mockImplementation(
      async (sourceBlob: Blob) => {
        const attId = `att-blob-${++blobSeq}`;
        await db.blobs.put({
          id: attId,
          blob: sourceBlob,
          mimeType: 'image/webp',
          width: 800,
          height: 600,
          byteSize: sourceBlob.size,
          createdAt: Date.now(),
        });
        return attId;
      }
    );

    const cellA1 = (await db.cells
      .where('[mapId+coord]')
      .equals([initialMapId, 'A1'])
      .first())!;
    expect(cellA1.state).toBe('empty');

    // 1. Toggle blocked state on empty cell: empty -> blocked_x -> empty
    await toggleCellBlockedState(cellA1.id);
    expect((await db.cells.get(cellA1.id))?.state).toBe('blocked_x');
    await toggleCellBlockedState(cellA1.id);
    expect((await db.cells.get(cellA1.id))?.state).toBe('empty');

    // 2. Assign screenshot -> transitions to 'room', replacing screenshot cleans up old blobs
    const dummyBlob = new Blob([new Uint8Array([1, 2, 3, 4])], {
      type: 'image/webp',
    });
    await assignCellScreenshot(cellA1.id, dummyBlob);
    const afterShot1 = (await db.cells.get(cellA1.id))!;
    expect(afterShot1.state).toBe('room');
    const firstFullId = afterShot1.screenshotBlobId!;
    const firstThumbId = afterShot1.thumbnailBlobId!;
    expect(await db.blobs.get(firstFullId)).toBeDefined();

    await assignCellScreenshot(cellA1.id, dummyBlob);
    const afterShot2 = (await db.cells.get(cellA1.id))!;
    expect(afterShot2.screenshotBlobId).not.toBe(firstFullId);
    // Old blobs must be deleted
    expect(await db.blobs.get(firstFullId)).toBeUndefined();
    expect(await db.blobs.get(firstThumbId)).toBeUndefined();

    // Clear screenshot when cell has no roomName/markers/arrows -> reverts state to 'empty'
    await clearCellScreenshot(cellA1.id);
    const afterClearEmpty = (await db.cells.get(cellA1.id))!;
    expect(afterClearEmpty.state).toBe('empty');
    expect(afterClearEmpty.screenshotBlobId).toBeUndefined();
    expect(await db.blobs.count()).toBe(0);

    // 3. Pin Marker & Vector Arrow CRUD + state preservation on clearCellScreenshot
    const pin = await addPinMarkerToCell(cellA1.id, {
      xPercent: 25,
      yPercent: 75,
      typeId: 'item_chest',
      color: '#f97316',
      shortLabel: 'Sacred Orb',
      resolved: false,
    });
    expect((await db.cells.get(cellA1.id))?.state).toBe('room');

    await updatePinMarkerOnCell(cellA1.id, pin.id, {
      resolved: true,
      shortLabel: 'Sacred Orb (Taken)',
    });
    expect((await db.cells.get(cellA1.id))?.markers[0].resolved).toBe(true);

    const vecArrow = await addVectorArrowToCell(cellA1.id, {
      points: [
        { xPercent: 10, yPercent: 10 },
        { xPercent: 90, yPercent: 90 },
      ],
      color: '#06b6d4',
      bidirectional: false,
      dashed: false,
    });
    await updateVectorArrowOnCell(cellA1.id, vecArrow.id, {
      dashed: true,
      label: 'Trap Drop',
    });
    expect((await db.cells.get(cellA1.id))?.arrows[0].dashed).toBe(true);

    // Assign & clear screenshot while pin/arrow exist -> state stays 'room'
    await assignCellScreenshot(cellA1.id, dummyBlob);
    await clearCellScreenshot(cellA1.id);
    expect((await db.cells.get(cellA1.id))?.state).toBe('room');

    // Toggle blocked state when cell has content: room -> blocked_x -> room
    await toggleCellBlockedState(cellA1.id);
    expect((await db.cells.get(cellA1.id))?.state).toBe('blocked_x');
    await toggleCellBlockedState(cellA1.id);
    expect((await db.cells.get(cellA1.id))?.state).toBe('room');

    await deletePinMarkerFromCell(cellA1.id, pin.id);
    await deleteVectorArrowFromCell(cellA1.id, vecArrow.id);
    expect((await db.cells.get(cellA1.id))?.markers).toHaveLength(0);
    expect((await db.cells.get(cellA1.id))?.arrows).toHaveLength(0);

    // 4. Global vs Map-scoped comments & attachment lifecycle
    const globalComm = await createCommentEntry({
      mapId: 'global',
      cellCoord: 'C3', // Should be normalized to '' for global
      category: 'general',
      content: 'Floating puzzle note.',
      resolved: false,
      attachmentBlobIds: [],
    });
    expect(globalComm.cellCoord).toBe('');
    expect(globalComm.cellId).toBeUndefined();

    // Migrate global comment to initialMapId A1 -> resolves cellId
    await updateCommentEntry(globalComm.id, {
      mapId: initialMapId,
      cellCoord: 'a1',
    });
    const linkedComm = (await db.comments.get(globalComm.id))!;
    expect(linkedComm.cellCoord).toBe('A1');
    expect(linkedComm.cellId).toBe(cellA1.id);

    // Migrate back to global -> clears cellCoord and cellId
    await updateCommentEntry(globalComm.id, { mapId: 'global' });
    const backToGlobal = (await db.comments.get(globalComm.id))!;
    expect(backToGlobal.cellCoord).toBe('');
    expect(backToGlobal.cellId).toBeUndefined();

    // Attach two images to comment, remove one, then delete comment -> all blobs cleaned up
    const att1 = await attachImageToComment(globalComm.id, dummyBlob);
    const att2 = await attachImageToComment(globalComm.id, dummyBlob);
    expect((await db.comments.get(globalComm.id))?.attachmentBlobIds).toEqual([
      att1,
      att2,
    ]);

    await removeAttachmentFromComment(globalComm.id, att1);
    expect(await db.blobs.get(att1)).toBeUndefined();
    expect((await db.comments.get(globalComm.id))?.attachmentBlobIds).toEqual([
      att2,
    ]);

    await deleteCommentEntry(globalComm.id);
    expect(await db.comments.get(globalComm.id)).toBeUndefined();
    expect(await db.blobs.get(att2)).toBeUndefined();

    // 5. Sketch image replacement & deletion cleanup
    const sketch = await createSketchNote(
      'Mantra Grid',
      'Initial draft',
      initialMapId,
      dummyBlob
    );
    const firstSketchBlobId = sketch.imageBlobId!;
    expect(await db.blobs.get(firstSketchBlobId)).toBeDefined();

    await updateSketchNote(
      sketch.id,
      { title: 'Mantra Grid v2' },
      dummyBlob
    );
    const updatedSketch = (await db.sketches.get(sketch.id))!;
    expect(updatedSketch.title).toBe('Mantra Grid v2');
    expect(updatedSketch.imageBlobId).not.toBe(firstSketchBlobId);
    expect(await db.blobs.get(firstSketchBlobId)).toBeUndefined();

    await deleteSketchNote(sketch.id);
    expect(await db.sketches.get(sketch.id)).toBeUndefined();
    expect(await db.blobs.get(updatedSketch.imageBlobId!)).toBeUndefined();

    vi.restoreAllMocks();
  });

  it('handles orphan fallbacks when deleting Marker Definitions, Comment Categories, or Custom Fields linked to Tablet Scanner', async () => {
    const cellA1 = (await db.cells
      .where('[mapId+coord]')
      .equals([initialMapId, 'A1'])
      .first())!;

    // 1. Place two pins: one with 'item_chest' (will be kept) and one with 'boss_enemy' (will be deleted)
    await addPinMarkerToCell(cellA1.id, {
      xPercent: 20,
      yPercent: 20,
      typeId: 'item_chest',
      color: '#f97316',
      shortLabel: 'Weight Chest',
      resolved: false,
    });
    const bossPin = await addPinMarkerToCell(cellA1.id, {
      xPercent: 80,
      yPercent: 80,
      typeId: 'boss_enemy',
      color: '#a855f7',
      shortLabel: 'Fafnir',
      resolved: false,
    });

    // Save marker definitions with ONLY 'item_chest' -> 'boss_enemy' pin should become 'broken'
    await saveMarkerDefinitions([
      {
        id: 'item_chest',
        name: 'Chest',
        description: 'Chests',
        iconKey: 'chest',
        defaultColor: '#f97316',
        showShortLabelOnMacro: false,
      },
    ]);

    const cellAfterMarkerSave = (await db.cells.get(cellA1.id))!;
    const brokenPin = cellAfterMarkerSave.markers.find(
      (m) => m.id === bossPin.id
    )!;
    expect(brokenPin.typeId).toBe('broken');
    expect(brokenPin.color).toBe('#ef4444');
    expect(brokenPin.shortLabel).toBe('BROKEN (Fafnir)');

    // 2. Delete a comment category -> orphaned comments fall back to the first remaining category
    const npcComm = await createCommentEntry({
      mapId: initialMapId,
      cellId: cellA1.id,
      cellCoord: 'A1',
      category: 'npc',
      content: 'Hello explorer!',
      resolved: false,
      attachmentBlobIds: [],
    });

    await saveCommentCategories([
      {
        id: 'tablet',
        code: 'T',
        name: 'Tablet',
        badgeColor: '#3b82f6',
        supportsResolved: false,
      },
    ]);

    const commAfterCatSave = await db.comments.get(npcComm.id);
    expect(commAfterCatSave?.category).toBe('tablet');

    // 3. Configure TabletScannerConfig to route headers to a custom field, then delete that custom field
    await saveCustomCommentFields([
      {
        id: 'cf-speaker-race',
        name: 'Race',
        type: 'select',
        options: ['Aesir'],
        showInTable: true,
        filterable: true,
      },
    ]);

    await saveTabletScannerConfig({
      headerTargetMode: 'custom_field',
      targetCustomFieldId: 'cf-speaker-race',
      autoHighlightColoredText: true,
      autoKeepAttachmentOnDrawing: true,
    });

    // Delete 'cf-speaker-race' by saving an empty customCommentFields array
    await saveCustomCommentFields([]);

    const configAfterFieldDelete = await db.config.get('singleton');
    expect(configAfterFieldDelete?.tabletScannerConfig?.headerTargetMode).toBe(
      'speaker_or_title'
    );
    expect(
      configAfterFieldDelete?.tabletScannerConfig?.targetCustomFieldId
    ).toBeUndefined();

    // 4. Test saveSeamlessCaptureConfig and updateMapGridArrow
    const cellB1 = (await db.cells
      .where('[mapId+coord]')
      .equals([initialMapId, 'B1'])
      .first())!;
    const gridArr = await addMapGridArrow(initialMapId, {
      fromCellId: cellA1.id,
      toCellId: cellB1.id,
      color: '#06b6d4',
      bidirectional: false,
      dashed: false,
    });
    await updateMapGridArrow(initialMapId, gridArr.id, {
      bidirectional: true,
      label: 'Warp Shaft',
    });
    const updatedMap = await db.maps.get(initialMapId);
    expect(updatedMap?.gridArrows?.[0].bidirectional).toBe(true);
    expect(updatedMap?.gridArrows?.[0].label).toBe('Warp Shaft');

    await saveSeamlessCaptureConfig({
      enabled: false,
      roomHotkey: 'Alt+5',
      tabletHotkey: 'Alt+6',
      roomGamepadCombo: '',
      tabletGamepadCombo: '',
      promptCalibrationOnFirstCapture: false,
      tabletQuickSaveMode: 'open_drawer',
      playSoundOnCapture: false,
      preferredWindowTitle: 'La-Mulana 2',
      autoClassifyWatchedScreenshots: false,
    });
    const finalConfig = await db.config.get('singleton');
    expect(finalConfig?.seamlessCaptureConfig?.roomHotkey).toBe('Alt+5');
    expect(finalConfig?.seamlessCaptureConfig?.tabletQuickSaveMode).toBe(
      'open_drawer'
    );
  });
});
