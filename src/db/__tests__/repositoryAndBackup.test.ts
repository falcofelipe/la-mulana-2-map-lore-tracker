import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../database';
import {
  addCustomFieldOption,
  addMapGridArrow,
  addPinMarkerToCell,
  addRoomFlagOption,
  createCommentEntry,
  createMapPage,
  createSketchNote,
  deleteColAt,
  deleteMapGridArrow,
  deleteRowAt,
  insertColAt,
  insertRowAt,
  resetToBlankPlaythrough,
  saveCustomCommentFields,
  swapOrMoveCells,
  toggleCellPassage,
  toggleManualMapConnection,
  updateCellMetadata,
  updateCommentEntry,
  updateCustomFieldOptions,
  updateRoomFlagOptions,
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

    // Find cell $B$2 (row=1, col=1) on map 1
    const cellB2 = await db.cells
      .where('[mapId+row+col]')
      .equals([initialMapId, 1, 1])
      .first();
    expect(cellB2).toBeDefined();
    expect(cellB2!.coord).toBe('$B$2');

    await updateCellMetadata(cellB2!.id, { roomName: 'Chamber of Birth' });

    // Attach a comment to $B$2
    const comm = await createCommentEntry({
      mapId: initialMapId,
      cellId: cellB2!.id,
      cellCoord: '$B$2',
      category: 'tablet',
      speakerOrTitle: 'T1',
      content: 'Speak the mantra of BIRTH.',
      resolved: false,
      attachmentBlobIds: [],
    });

    // Place a Warp Pin on map2 ($A$1) targeting cellB2 on map1
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
      shortLabel: '⇄ F01 $B$2',
      targetMapId: initialMapId,
      targetCellId: cellB2!.id,
      isBidirectionalWarp: true,
      resolved: false,
    });

    // 1. Insert a row at index 1 (above $B$2) -> cellB2 should shift to $B$3 (row=2, col=1)
    await insertRowAt(initialMapId, 1);

    const shiftedAfterRow = await db.cells.get(cellB2!.id);
    expect(shiftedAfterRow?.row).toBe(2);
    expect(shiftedAfterRow?.col).toBe(1);
    expect(shiftedAfterRow?.coord).toBe('$B$3');

    const commAfterRow = await db.comments.get(comm.id);
    expect(commAfterRow?.cellCoord).toBe('$B$3');

    const map2CellAfterRow = await db.cells.get(map2CellA1!.id);
    const pinAfterRow = map2CellAfterRow?.markers.find(
      (m) => m.id === warpPin.id
    );
    expect(pinAfterRow?.shortLabel).toBe('⇄ F01 $B$3');

    // 2. Insert a column at index 1 (left of $B$3) -> cellB2 should shift to $C$3 (row=2, col=2)
    await insertColAt(initialMapId, 1);

    const shiftedAfterCol = await db.cells.get(cellB2!.id);
    expect(shiftedAfterCol?.row).toBe(2);
    expect(shiftedAfterCol?.col).toBe(2);
    expect(shiftedAfterCol?.coord).toBe('$C$3');

    const commAfterCol = await db.comments.get(comm.id);
    expect(commAfterCol?.cellCoord).toBe('$C$3');

    const map2CellAfterCol = await db.cells.get(map2CellA1!.id);
    const pinAfterCol = map2CellAfterCol?.markers.find(
      (m) => m.id === warpPin.id
    );
    expect(pinAfterCol?.shortLabel).toBe('⇄ F01 $C$3');

    // 3. Delete the inserted row (index 1) and column (index 1) -> returns to $B$2
    await deleteRowAt(initialMapId, 1);
    await deleteColAt(initialMapId, 1);

    const restoredCell = await db.cells.get(cellB2!.id);
    expect(restoredCell?.coord).toBe('$B$2');

    const restoredComm = await db.comments.get(comm.id);
    expect(restoredComm?.cellCoord).toBe('$B$2');

    const map2CellRestored = await db.cells.get(map2CellA1!.id);
    const pinRestored = map2CellRestored?.markers.find(
      (m) => m.id === warpPin.id
    );
    expect(pinRestored?.shortLabel).toBe('⇄ F01 $B$2');
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

    // Toggle right passage on $A$1 -> should mirror left passage on $B$1
    await toggleCellPassage(cellA1!.id, 'right');
    const a1Updated = await db.cells.get(cellA1!.id);
    const b1Updated = await db.cells.get(cellB1!.id);
    expect(a1Updated?.openPassages?.right).toBe(true);
    expect(b1Updated?.openPassages?.left).toBe(true);

    // Add room name & comment to $A$1, then swap $A$1 with $D$4
    await updateCellMetadata(cellA1!.id, { roomName: 'Entrance Gate' });
    const comm = await createCommentEntry({
      mapId: initialMapId,
      cellId: cellA1!.id,
      cellCoord: '$A$1',
      category: 'npc',
      speakerOrTitle: 'NPC Xelpud',
      content: 'Welcome to Eg-Lana!',
      resolved: false,
      attachmentBlobIds: [],
    });

    await swapOrMoveCells(cellA1!.id, cellD4!.id);

    const movedCell = await db.cells.get(cellA1!.id);
    expect(movedCell?.coord).toBe('$D$4');
    expect(movedCell?.row).toBe(3);
    expect(movedCell?.col).toBe(3);
    expect(movedCell?.roomName).toBe('Entrance Gate');

    const movedComm = await db.comments.get(comm.id);
    expect(movedComm?.cellId).toBe(cellA1!.id);
    expect(movedComm?.cellCoord).toBe('$D$4');
  });

  it('migrates comments across maps/cells and atomically renames/deletes Room Flags & Custom Field Options', async () => {
    const map2 = await createMapPage('IdA', 'Immortal Battlefield', 5, 5);
    const map2CellC2 = await db.cells
      .where('[mapId+coord]')
      .equals([map2.id, '$C$2'])
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
      cellCoord: '$A$1',
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

    // 3. Migrate comment to map2 $C$2 via updateCommentEntry
    await updateCommentEntry(comm.id, {
      mapId: map2.id,
      cellCoord: 'c2',
    });

    const migratedComm = await db.comments.get(comm.id);
    expect(migratedComm?.mapId).toBe(map2.id);
    expect(migratedComm?.cellCoord).toBe('$C$2');
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
});
