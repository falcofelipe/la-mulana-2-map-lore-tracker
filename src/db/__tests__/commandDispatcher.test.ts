import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../database';
import * as imageProcessor from '../imageProcessor';
import defaultDispatcher, {
  CommandDispatcher,
  addCustomFieldOption,
  addMapGridArrow,
  addPinMarkerToCell,
  addRoomFlagOption,
  addVectorArrowToCell,
  assignCellScreenshot,
  attachImageToComment,
  clearCellScreenshot,
  commandDispatcher,
  createCommentEntry,
  createMapPage,
  createSketchNote,
  deleteColAt,
  deleteCommentEntry,
  deleteMapPage,
  deleteRowAt,
  deleteSketchNote,
  expandMapGrid,
  insertColAt,
  insertRowAt,
  removeAttachmentFromComment,
  reorderMapPages,
  resetToBlankPlaythrough,
  saveCommentCategories,
  saveCustomCommentFields,
  saveMarkerDefinitions,
  shrinkMapGrid,
  swapOrMoveCells,
  toggleCellBlockedState,
  toggleCellPassage,
  toggleManualMapConnection,
  updateCellMetadata,
  updateCommentEntry,
  updateCustomFieldOptions,
  updateRoomFlagOptions,
  updateSketchNote,
} from '../repository';
import { buildBackupZipBlob, importFullBackupZip } from '../backupService';

async function normalize(value: unknown): Promise<unknown> {
  if (value instanceof Blob) {
    return {
      __blob: Array.from(new Uint8Array(await value.arrayBuffer())),
      type: value.type,
    };
  }
  if (Array.isArray(value)) return Promise.all(value.map(normalize));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v !== undefined) out[key] = await normalize(v);
    }
    return out;
  }
  return value;
}

async function snapshot() {
  const tables = {
    config: await db.config.toArray(),
    maps: await db.maps.toArray(),
    cells: await db.cells.toArray(),
    comments: await db.comments.toArray(),
    sketches: await db.sketches.toArray(),
    blobs: await db.blobs.toArray(),
  };
  return normalize(tables);
}

async function expectReversible(mutate: () => Promise<unknown>) {
  const before = await snapshot();
  await mutate();
  const after = await snapshot();
  expect(after).not.toEqual(before);
  expect(commandDispatcher.canUndo()).toBe(true);

  expect(await commandDispatcher.undo()).toBe(true);
  expect(await snapshot()).toEqual(before);
  expect(commandDispatcher.canRedo()).toBe(true);

  expect(await commandDispatcher.redo()).toBe(true);
  expect(await snapshot()).toEqual(after);

  expect(await commandDispatcher.undo()).toBe(true);
  expect(await snapshot()).toEqual(before);
  expect(await commandDispatcher.redo()).toBe(true);
  expect(await snapshot()).toEqual(after);
}

describe('CommandDispatcher undo/redo', () => {
  let mapId: string;
  let blobSeq = 0;

  beforeEach(async () => {
    mapId = await resetToBlankPlaythrough();
    vi.spyOn(imageProcessor, 'processAndStoreRoomScreenshot').mockImplementation(
      async (sourceBlob: Blob) => {
        const fullId = `u-full-${++blobSeq}`;
        const thumbId = `u-thumb-${blobSeq}`;
        await db.blobs.bulkPut([
          { id: fullId, blob: sourceBlob, mimeType: 'image/webp', width: 1, height: 1, byteSize: sourceBlob.size, createdAt: 1000 + blobSeq },
          { id: thumbId, blob: sourceBlob, mimeType: 'image/webp', width: 1, height: 1, byteSize: sourceBlob.size, createdAt: 1000 + blobSeq },
        ]);
        return { fullBlobId: fullId, thumbBlobId: thumbId, width: 1, height: 1 };
      }
    );
    vi.spyOn(imageProcessor, 'processAndStoreAttachmentImage').mockImplementation(
      async (sourceBlob: Blob) => {
        const id = `u-att-${++blobSeq}`;
        await db.blobs.put({ id, blob: sourceBlob, mimeType: 'image/webp', width: 1, height: 1, byteSize: sourceBlob.size, createdAt: 2000 + blobSeq });
        return id;
      }
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const bytes = (...n: number[]) =>
    new Blob([new Uint8Array(n)], { type: 'image/webp' });

  const cellAt = async (coord: string, onMap = mapId) =>
    (await db.cells.where('[mapId+coord]').equals([onMap, coord]).first())!;

  it('exports the class and a default singleton', () => {
    expect(commandDispatcher).toBeInstanceOf(CommandDispatcher);
    expect(defaultDispatcher).toBe(commandDispatcher);
  });

  it('starts with empty history after a reset and returns false on empty undo/redo', async () => {
    expect(commandDispatcher.canUndo()).toBe(false);
    expect(commandDispatcher.canRedo()).toBe(false);
    expect(await commandDispatcher.undo()).toBe(false);
    expect(await commandDispatcher.redo()).toBe(false);
  });

  it('ignores no-op and failed calls without touching history', async () => {
    await updateCellMetadata((await cellAt('A1')).id, { roomName: 'X' });
    expect(commandDispatcher.canUndo()).toBe(true);
    const before = await snapshot();

    await toggleManualMapConnection(mapId, mapId);
    await deleteRowAt('missing', 0);
    await updateCellMetadata('missing', { roomName: 'Y' });
    await addRoomFlagOption('   ');
    await expect(addMapGridArrow('missing', {
      fromCellId: 'a', toCellId: 'b', color: '#000', bidirectional: false, dashed: false,
    })).rejects.toThrow('Map not found');
    await expect(addPinMarkerToCell('missing', {
      xPercent: 0, yPercent: 0, typeId: 'x', color: '#000', resolved: false,
    })).rejects.toThrow('Cell not found');
    await expect(attachImageToComment('missing', bytes(1))).rejects.toThrow('Comment not found');

    expect(await snapshot()).toEqual(before);
    expect(await commandDispatcher.undo()).toBe(true);
    expect(commandDispatcher.canUndo()).toBe(false);
    expect((await cellAt('A1')).roomName).toBe('');
  });

  it('clears redo history when a new command is executed', async () => {
    const a1 = await cellAt('A1');
    await toggleCellBlockedState(a1.id);
    await commandDispatcher.undo();
    expect(commandDispatcher.canRedo()).toBe(true);
    await updateCellMetadata(a1.id, { roomName: 'New' });
    expect(commandDispatcher.canRedo()).toBe(false);
  });

  it('clears history on reset and backup import, and via clear()', async () => {
    await createMapPage('X', 'X');
    expect(commandDispatcher.canUndo()).toBe(true);
    await resetToBlankPlaythrough();
    expect(commandDispatcher.canUndo()).toBe(false);

    await createMapPage('Y', 'Y');
    const zip = await (await buildBackupZipBlob()).arrayBuffer();
    await toggleCellBlockedState((await db.cells.toCollection().first())!.id);
    await commandDispatcher.undo();
    expect(commandDispatcher.canUndo()).toBe(true);
    expect(commandDispatcher.canRedo()).toBe(true);
    await importFullBackupZip(zip);
    expect(commandDispatcher.canUndo()).toBe(false);
    expect(commandDispatcher.canRedo()).toBe(false);

    await createMapPage('Z', 'Z');
    commandDispatcher.clear();
    expect(commandDispatcher.canUndo()).toBe(false);
  });

  it('reverses map creation, metadata, reordering and deletion with cascaded blobs', async () => {
    let map2Id = '';
    await expectReversible(async () => {
      map2Id = (await createMapPage('B', 'Second', 3, 3)).id;
    });
    await expectReversible(() => reorderMapPages([map2Id, mapId]));
    await expectReversible(() => toggleManualMapConnection(mapId, map2Id));

    const c = await cellAt('A1', map2Id);
    await assignCellScreenshot(c.id, bytes(1, 2, 3));
    const comm = await createCommentEntry({
      mapId: map2Id, cellCoord: 'A1', category: 'tablet', content: 'x', resolved: false, attachmentBlobIds: [],
    });
    await attachImageToComment(comm.id, bytes(4, 5));
    await createSketchNote('S', 'd', map2Id, bytes(6));

    await expectReversible(() => deleteMapPage(map2Id));
  });

  it('reverses deleting the last map (which recreates a blank map)', async () => {
    await expectReversible(() => deleteMapPage(mapId));
  });

  it('reverses grid insertions, deletions, expansion and shrinking including pin label sync', async () => {
    const map2 = await createMapPage('AcB', 'Other', 3, 3);
    const b2 = await cellAt('B2');
    await createCommentEntry({
      mapId, cellId: b2.id, cellCoord: 'B2', category: 'tablet', content: 'c', resolved: false, attachmentBlobIds: [],
    });
    await addPinMarkerToCell((await cellAt('A1', map2.id)).id, {
      xPercent: 1, yPercent: 1, typeId: 'warp', color: '#fff', shortLabel: 'F01 B2', targetCellId: b2.id, resolved: false,
    });
    await assignCellScreenshot((await cellAt('A1')).id, bytes(9, 9));
    await addMapGridArrow(mapId, {
      fromCellId: (await cellAt('A1')).id, toCellId: b2.id, color: '#000', bidirectional: false, dashed: false,
    });

    await expectReversible(() => insertRowAt(mapId, 1));
    await expectReversible(() => insertColAt(mapId, 1));
    await expectReversible(() => deleteRowAt(mapId, 0));
    await expectReversible(() => deleteColAt(mapId, 0));
    await expectReversible(() => expandMapGrid(mapId, 'top'));
    await expectReversible(() => shrinkMapGrid(mapId, 'left'));
    await expectReversible(async () => swapOrMoveCells(b2.id, (await cellAt('D4')).id));
    await expectReversible(() => toggleCellPassage(b2.id, 'right'));
  });

  it('reverses screenshot, cell, pin and arrow operations including binary blobs', async () => {
    const a1 = await cellAt('A1');
    await expectReversible(() => assignCellScreenshot(a1.id, bytes(1, 2)));
    await expectReversible(() => assignCellScreenshot(a1.id, bytes(3, 4)));
    await expectReversible(() => clearCellScreenshot(a1.id));
    await expectReversible(() => toggleCellBlockedState(a1.id));
    await expectReversible(() => updateCellMetadata(a1.id, { roomName: 'Room', tags: ['t'] }));
    await expectReversible(() =>
      addVectorArrowToCell(a1.id, { points: [], color: '#000', bidirectional: false, dashed: false })
    );
  });

  it('reverses comment, attachment and sketch operations', async () => {
    let commentId = '';
    await expectReversible(async () => {
      commentId = (await createCommentEntry({
        mapId, cellCoord: 'a1', category: 'npc', content: 'hi', resolved: false, attachmentBlobIds: [],
      })).id;
    });
    await expectReversible(() => updateCommentEntry(commentId, { mapId: 'global' }));
    let att = '';
    await expectReversible(async () => {
      att = await attachImageToComment(commentId, bytes(7, 7, 7));
    });
    await expectReversible(() => removeAttachmentFromComment(commentId, att));
    await attachImageToComment(commentId, bytes(8));
    await expectReversible(() => deleteCommentEntry(commentId));

    let sketchId = '';
    await expectReversible(async () => {
      sketchId = (await createSketchNote('S', 'd', mapId, bytes(1))).id;
    });
    await expectReversible(() => updateSketchNote(sketchId, { title: 'S2' }, bytes(2)));
    await expectReversible(() => deleteSketchNote(sketchId));
  });

  it('reverses config operations and their cascades', async () => {
    const a1 = await cellAt('A1');
    await expectReversible(() => addRoomFlagOption('Flag'));
    await updateCellMetadata(a1.id, { tags: ['Flag'] });
    await expectReversible(() => updateRoomFlagOptions(['Flag2'], { oldName: 'Flag', newName: 'Flag2' }));
    await addPinMarkerToCell(a1.id, { xPercent: 0, yPercent: 0, typeId: 'gone', color: '#000', shortLabel: 'P', resolved: false });
    await expectReversible(() => saveMarkerDefinitions([]));
    await createCommentEntry({ mapId, cellCoord: 'A1', category: 'npc', content: 'x', resolved: false, attachmentBlobIds: [], customFields: { f: 'a' } });
    await expectReversible(() =>
      saveCommentCategories([{ id: 'tablet', code: 'T', name: 'T', badgeColor: '#000', supportsResolved: false }])
    );
    await expectReversible(() =>
      saveCustomCommentFields([{ id: 'f', name: 'F', type: 'select', options: ['a'], showInTable: true, filterable: true }])
    );
    await expectReversible(() => addCustomFieldOption('f', 'b'));
    await expectReversible(() => updateCustomFieldOptions('f', ['c', 'b'], { oldName: 'a', newName: 'c' }));
  });

  it('undoes and redoes a sequence of commands in order', async () => {
    const s0 = await snapshot();
    const a1 = await cellAt('A1');
    await updateCellMetadata(a1.id, { roomName: 'One' });
    const s1 = await snapshot();
    await insertRowAt(mapId, 0);
    const s2 = await snapshot();
    await assignCellScreenshot(a1.id, bytes(5));
    const s3 = await snapshot();

    await commandDispatcher.undo();
    expect(await snapshot()).toEqual(s2);
    await commandDispatcher.undo();
    expect(await snapshot()).toEqual(s1);
    await commandDispatcher.undo();
    expect(await snapshot()).toEqual(s0);
    expect(await commandDispatcher.undo()).toBe(false);

    await commandDispatcher.redo();
    await commandDispatcher.redo();
    await commandDispatcher.redo();
    expect(await snapshot()).toEqual(s3);
    expect(await commandDispatcher.redo()).toBe(false);
  });
});
