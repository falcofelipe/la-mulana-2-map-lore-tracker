import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../database';
import {
  addPinMarkerToCell,
  createCommentEntry,
  createMapPage,
  deleteColAt,
  deleteCommentEntry,
  deleteMapPage,
  deleteRowAt,
  expandMapGrid,
  resetToBlankPlaythrough,
  shrinkMapGrid,
  toggleManualMapConnection,
} from '../repository';
import type { CommentEntry, GridCell, PinMarker } from '../../types/models';

/**
 * Referential integrity across deletion paths.
 *
 * Deleting a comment, a grid row/column (directly or via the edge shrink
 * buttons) or a whole map tab must scrub every reference to the removed
 * entities from the rest of the project, while leaving references to surviving
 * entities - and records that are not affected - untouched.
 */

const SENTINEL = 1000;

async function cellAt(mapId: string, coord: string): Promise<GridCell> {
  const cell = await db.cells.where('[mapId+coord]').equals([mapId, coord]).first();
  if (!cell) throw new Error(`Test setup: no cell ${coord} on map ${mapId}`);
  return cell;
}

async function makeComment(
  input: Partial<Omit<CommentEntry, 'id' | 'createdAt' | 'updatedAt'>> &
    Pick<CommentEntry, 'mapId' | 'cellCoord'>
): Promise<CommentEntry> {
  return createCommentEntry({
    category: 'general',
    content: 'note',
    resolved: false,
    attachmentBlobIds: [],
    ...input,
  });
}

async function makePin(
  cellId: string,
  extra: Partial<Omit<PinMarker, 'id'>> = {}
): Promise<PinMarker> {
  return addPinMarkerToCell(cellId, {
    xPercent: 50,
    yPercent: 50,
    typeId: 'warp_door',
    color: '#06b6d4',
    resolved: false,
    ...extra,
  });
}

async function pinOn(cellId: string, pinId: string): Promise<PinMarker> {
  const cell = await db.cells.get(cellId);
  const pin = cell?.markers.find((m) => m.id === pinId);
  if (!pin) throw new Error(`Pin ${pinId} missing from cell ${cellId}`);
  return pin;
}

/** Marks records with an old timestamp so later rewrites can be detected. */
async function stampCells(...ids: string[]) {
  for (const id of ids) await db.cells.update(id, { updatedAt: SENTINEL });
}
async function stampComments(...ids: string[]) {
  for (const id of ids) await db.comments.update(id, { updatedAt: SENTINEL });
}

describe('Referential integrity on deletion', () => {
  let m1: string;

  beforeEach(async () => {
    m1 = await resetToBlankPlaythrough();
  });

  it('deleteCommentEntry unlinks pins in any room/map and scrubs relatedCommentIds, leaving everything else untouched', async () => {
    const m2 = await createMapPage('AcB', 'Ancient Chaos', 3, 3);
    const a1 = await cellAt(m1, 'A1');
    const b2 = await cellAt(m1, 'B2');
    const m2c1 = await cellAt(m2.id, 'C1');
    const m2a2 = await cellAt(m2.id, 'A2');
    const m2b3 = await cellAt(m2.id, 'B3');

    const doomed = await makeComment({ mapId: m1, cellCoord: 'B2', content: 'doomed' });
    const keeper = await makeComment({ mapId: m1, cellCoord: 'A1', content: 'keeper' });

    const sameRoomPin = await makePin(b2.id, {
      typeId: 'mystery_puzzle',
      shortLabel: 'Hint',
      linkedCommentId: doomed.id,
    });
    const crossMapPin = await makePin(m2c1.id, {
      shortLabel: '-> F01 B2',
      linkedCommentId: doomed.id,
      targetMapId: m1,
      targetCellId: b2.id,
    });
    const keeperPin = await makePin(m2b3.id, { linkedCommentId: keeper.id });

    const referrer = await makeComment({
      mapId: m2.id,
      cellCoord: 'A2',
      relatedCommentIds: [keeper.id, doomed.id],
      relatedCellIds: [b2.id],
    });
    const globalReferrer = await makeComment({
      mapId: 'global',
      cellCoord: '',
      relatedCommentIds: [doomed.id],
    });
    const bystander = await makeComment({
      mapId: m2.id,
      cellCoord: 'A2',
      relatedCommentIds: [keeper.id],
    });

    await stampCells(a1.id, m2a2.id, m2b3.id);
    await stampComments(keeper.id, bystander.id);

    await deleteCommentEntry(doomed.id);

    expect(await db.comments.get(doomed.id)).toBeUndefined();

    const sameRoomAfter = await pinOn(b2.id, sameRoomPin.id);
    expect(sameRoomAfter.linkedCommentId).toBeUndefined();
    expect(sameRoomAfter.shortLabel).toBe('Hint');
    expect(sameRoomAfter.typeId).toBe('mystery_puzzle');

    // The warp target (B2) still exists, so only the comment link goes away
    const crossMapAfter = await pinOn(m2c1.id, crossMapPin.id);
    expect(crossMapAfter.linkedCommentId).toBeUndefined();
    expect(crossMapAfter.targetMapId).toBe(m1);
    expect(crossMapAfter.targetCellId).toBe(b2.id);
    expect(crossMapAfter.shortLabel).toBe('-> F01 B2');

    expect((await pinOn(m2b3.id, keeperPin.id)).linkedCommentId).toBe(keeper.id);

    const referrerAfter = (await db.comments.get(referrer.id))!;
    expect(referrerAfter.relatedCommentIds).toEqual([keeper.id]);
    expect(referrerAfter.relatedCellIds).toEqual([b2.id]);

    const globalAfter = (await db.comments.get(globalReferrer.id))!;
    expect(globalAfter.relatedCommentIds ?? []).toEqual([]);

    // Unaffected records are not rewritten
    expect((await db.comments.get(keeper.id))!.updatedAt).toBe(SENTINEL);
    expect((await db.comments.get(bystander.id))!.updatedAt).toBe(SENTINEL);
    expect((await db.cells.get(a1.id))!.updatedAt).toBe(SENTINEL);
    expect((await db.cells.get(m2a2.id))!.updatedAt).toBe(SENTINEL);
    expect((await db.cells.get(m2b3.id))!.updatedAt).toBe(SENTINEL);
  });

  it('deleteRowAt scrubs references to removed cells and comments (including coordinate-only comments) without undoing the row shift', async () => {
    const m2 = await createMapPage('AcB', 'Ancient Chaos', 3, 3);

    // A comment typed for a coordinate that doesn't exist yet stays coordinate-only
    const coordOnly = await makeComment({ mapId: m1, cellCoord: 'C8', content: 'typed early' });
    expect(coordOnly.cellId).toBeUndefined();

    await expandMapGrid(m1, 'bottom'); // 8 rows
    await expandMapGrid(m1, 'bottom'); // 9 rows
    expect((await db.comments.get(coordOnly.id))!.cellId).toBeUndefined();

    const a1 = await cellAt(m1, 'A1');
    const b8 = await cellAt(m1, 'B8');
    const c8 = await cellAt(m1, 'C8');
    const d8 = await cellAt(m1, 'D8');
    const b9 = await cellAt(m1, 'B9');
    const e9 = await cellAt(m1, 'E9');
    const m2a1 = await cellAt(m2.id, 'A1');
    const m2c3 = await cellAt(m2.id, 'C3');

    const removedComment = await makeComment({
      mapId: m1,
      cellCoord: 'B8',
      content: 'in the removed row',
      relatedCommentIds: [coordOnly.id],
    });
    expect(removedComment.cellId).toBe(b8.id);
    const keeper = await makeComment({ mapId: m1, cellCoord: 'A1', content: 'keeper' });

    // Comment on a cell that shifts up (B9 -> B8) referencing removed + surviving entities
    const shiftedComment = await makeComment({
      mapId: m1,
      cellCoord: 'B9',
      relatedCommentIds: [removedComment.id, coordOnly.id, keeper.id],
      relatedCellIds: [d8.id, a1.id],
    });

    // A removed cell holding a pin that targets another removed cell
    await makePin(d8.id, { targetMapId: m1, targetCellId: c8.id });

    // Pins on a shifted cell: one targets a removed cell, one targets a shifted cell
    const pinToRemoved = await makePin(e9.id, {
      shortLabel: '-> F01 D8',
      targetMapId: m1,
      targetCellId: d8.id,
    });
    const pinToShifted = await makePin(e9.id, {
      shortLabel: '-> F01 B9',
      targetMapId: m1,
      targetCellId: b9.id,
    });

    // Cross-map pin targeting a removed cell and linked to the coordinate-only comment
    const crossMapPin = await makePin(m2a1.id, {
      shortLabel: '-> F01 D8',
      targetMapId: m1,
      targetCellId: d8.id,
      linkedCommentId: coordOnly.id,
    });

    const globalReferrer = await makeComment({
      mapId: 'global',
      cellCoord: '',
      relatedCellIds: [c8.id],
    });

    await stampCells(a1.id, m2c3.id);
    await stampComments(keeper.id);

    await deleteRowAt(m1, 7);

    // Row removal itself: removed cells and their comments stay deleted
    expect((await db.maps.get(m1))!.rows).toBe(8);
    expect(await db.cells.where('mapId').equals(m1).count()).toBe(64);
    expect(await db.cells.get(b8.id)).toBeUndefined();
    expect(await db.cells.get(c8.id)).toBeUndefined();
    expect(await db.cells.get(d8.id)).toBeUndefined();
    expect(await db.comments.get(removedComment.id)).toBeUndefined();
    expect(await db.comments.get(coordOnly.id)).toBeUndefined();

    // Shifted cell keeps its new coordinate AND gets its pins cleaned/synced
    const e9After = (await db.cells.get(e9.id))!;
    expect(e9After.row).toBe(7);
    expect(e9After.coord).toBe('E8');
    const pinToRemovedAfter = e9After.markers.find((m) => m.id === pinToRemoved.id)!;
    expect(pinToRemovedAfter.targetCellId).toBeUndefined();
    expect(pinToRemovedAfter.targetMapId).toBe(m1);
    const pinToShiftedAfter = e9After.markers.find((m) => m.id === pinToShifted.id)!;
    expect(pinToShiftedAfter.targetCellId).toBe(b9.id);
    expect(pinToShiftedAfter.shortLabel).toBe('-> F01 B8');

    // Shifted comment keeps its new coordinate AND gets its references cleaned
    const shiftedCommentAfter = (await db.comments.get(shiftedComment.id))!;
    expect(shiftedCommentAfter.cellId).toBe(b9.id);
    expect(shiftedCommentAfter.cellCoord).toBe('B8');
    expect(shiftedCommentAfter.relatedCommentIds).toEqual([keeper.id]);
    expect(shiftedCommentAfter.relatedCellIds).toEqual([a1.id]);

    const crossMapAfter = await pinOn(m2a1.id, crossMapPin.id);
    expect(crossMapAfter.targetCellId).toBeUndefined();
    expect(crossMapAfter.targetMapId).toBe(m1);
    expect(crossMapAfter.linkedCommentId).toBeUndefined();

    expect((await db.comments.get(globalReferrer.id))!.relatedCellIds ?? []).toEqual([]);

    // Unaffected records are not rewritten
    expect((await db.cells.get(a1.id))!.updatedAt).toBe(SENTINEL);
    expect((await db.cells.get(m2c3.id))!.updatedAt).toBe(SENTINEL);
    expect((await db.comments.get(keeper.id))!.updatedAt).toBe(SENTINEL);
  });

  it('deleteColAt (via shrinkMapGrid) scrubs references to removed cells and comments without undoing the column shift', async () => {
    const m2 = await createMapPage('AcB', 'Ancient Chaos', 3, 3);
    const a2 = await cellAt(m2.id, 'A2');
    const a3 = await cellAt(m2.id, 'A3');
    const a1 = await cellAt(m2.id, 'A1');
    const b2 = await cellAt(m2.id, 'B2');
    const c3 = await cellAt(m2.id, 'C3');
    const m1a1 = await cellAt(m1, 'A1');
    const m1h7 = await cellAt(m1, 'H7');

    const removedComment = await makeComment({ mapId: m2.id, cellCoord: 'A2', content: 'gone' });

    const shiftedComment = await makeComment({
      mapId: m2.id,
      cellCoord: 'B2',
      relatedCellIds: [a3.id, c3.id],
      relatedCommentIds: [removedComment.id],
    });

    const pinToRemoved = await makePin(c3.id, {
      shortLabel: '-> AcB A1',
      targetMapId: m2.id,
      targetCellId: a1.id,
    });
    const pinToShifted = await makePin(c3.id, {
      shortLabel: '-> AcB B2',
      targetMapId: m2.id,
      targetCellId: b2.id,
    });
    const otherMapPin = await makePin(m1a1.id, { linkedCommentId: removedComment.id });

    await stampCells(m1h7.id);

    await shrinkMapGrid(m2.id, 'left');

    expect((await db.maps.get(m2.id))!.cols).toBe(2);
    expect(await db.cells.get(a2.id)).toBeUndefined();
    expect(await db.comments.get(removedComment.id)).toBeUndefined();

    const c3After = (await db.cells.get(c3.id))!;
    expect(c3After.coord).toBe('B3');
    expect(c3After.col).toBe(1);
    const toRemoved = c3After.markers.find((m) => m.id === pinToRemoved.id)!;
    expect(toRemoved.targetCellId).toBeUndefined();
    expect(toRemoved.targetMapId).toBe(m2.id);
    const toShifted = c3After.markers.find((m) => m.id === pinToShifted.id)!;
    expect(toShifted.targetCellId).toBe(b2.id);
    expect(toShifted.shortLabel).toBe('-> AcB A2');

    const shiftedCommentAfter = (await db.comments.get(shiftedComment.id))!;
    expect(shiftedCommentAfter.cellCoord).toBe('A2');
    expect(shiftedCommentAfter.relatedCellIds).toEqual([c3.id]);
    expect(shiftedCommentAfter.relatedCommentIds ?? []).toEqual([]);

    expect((await pinOn(m1a1.id, otherMapPin.id)).linkedCommentId).toBeUndefined();
    expect((await db.cells.get(m1h7.id))!.updatedAt).toBe(SENTINEL);
  });

  it('deleteMapPage scrubs manual map connections, warp targets, pin links and comment cross-references into the deleted map', async () => {
    const m2 = await createMapPage('DfA', 'Divine Fortress', 3, 3);
    const m3 = await createMapPage('HmB', 'Heaven Labyrinth', 3, 3);

    await toggleManualMapConnection(m1, m2.id);
    await toggleManualMapConnection(m1, m3.id);
    await toggleManualMapConnection(m3.id, m2.id);
    await toggleManualMapConnection(m2.id, m1);

    const m1a1 = await cellAt(m1, 'A1');
    const m1b2 = await cellAt(m1, 'B2');
    const m2a1 = await cellAt(m2.id, 'A1');
    const m2b2 = await cellAt(m2.id, 'B2');
    const m3a1 = await cellAt(m3.id, 'A1');
    const m3b2 = await cellAt(m3.id, 'B2');
    const m3c3 = await cellAt(m3.id, 'C3');

    const k1 = await makeComment({ mapId: m1, cellCoord: 'A1', content: 'm1 keeper' });
    const c2a = await makeComment({ mapId: m2.id, cellCoord: 'A1', content: 'm2 a' });
    const c2b = await makeComment({
      mapId: m2.id,
      cellCoord: 'B2',
      content: 'm2 b',
      relatedCommentIds: [c2a.id, k1.id],
    });
    // Deleted-map comments referencing each other must not come back
    await db.comments.update(c2a.id, { relatedCommentIds: [c2b.id] });
    await makePin(m2a1.id, { targetMapId: m1, targetCellId: m1b2.id });

    const k3 = await makeComment({
      mapId: m3.id,
      cellCoord: 'C3',
      content: 'm3 keeper',
      relatedCellIds: [m2b2.id, m1b2.id],
      relatedCommentIds: [c2b.id, k1.id],
    });

    const p1 = await makePin(m1b2.id, {
      typeId: 'warp_door',
      shortLabel: '-> DfA B2',
      targetMapId: m2.id,
      targetCellId: m2b2.id,
      linkedCommentId: c2a.id,
    });
    const p2 = await makePin(m1b2.id, { shortLabel: '-> DfA', targetMapId: m2.id });
    const p3 = await makePin(m1b2.id, {
      shortLabel: '-> HmB C3',
      targetMapId: m3.id,
      targetCellId: m3c3.id,
      linkedCommentId: k3.id,
    });
    // Pin that only stores the target cell (no targetMapId)
    const p4 = await makePin(m3a1.id, { targetCellId: m2a1.id });

    const g = await makeComment({
      mapId: 'global',
      cellCoord: '',
      relatedCellIds: [m2a1.id],
      relatedCommentIds: [c2a.id, k3.id],
    });

    await stampCells(m1a1.id, m3b2.id, m3c3.id);
    await stampComments(k1.id);

    const nextMapId = await deleteMapPage(m2.id);
    expect(nextMapId).toBe(m1);

    expect(await db.maps.get(m2.id)).toBeUndefined();
    expect(await db.cells.where('mapId').equals(m2.id).count()).toBe(0);
    expect(await db.comments.get(c2a.id)).toBeUndefined();
    expect(await db.comments.get(c2b.id)).toBeUndefined();

    expect((await db.maps.get(m1))!.manualOutgoingMapIds).toEqual([m3.id]);
    expect((await db.maps.get(m3.id))!.manualOutgoingMapIds ?? []).toEqual([]);

    const p1After = await pinOn(m1b2.id, p1.id);
    expect(p1After.targetMapId).toBeUndefined();
    expect(p1After.targetCellId).toBeUndefined();
    expect(p1After.linkedCommentId).toBeUndefined();
    expect(p1After.typeId).toBe('warp_door');

    expect((await pinOn(m1b2.id, p2.id)).targetMapId).toBeUndefined();
    expect(await pinOn(m1b2.id, p3.id)).toEqual(p3);
    expect((await pinOn(m3a1.id, p4.id)).targetCellId).toBeUndefined();

    const k3After = (await db.comments.get(k3.id))!;
    expect(k3After.relatedCellIds).toEqual([m1b2.id]);
    expect(k3After.relatedCommentIds).toEqual([k1.id]);

    const gAfter = (await db.comments.get(g.id))!;
    expect(gAfter.relatedCellIds ?? []).toEqual([]);
    expect(gAfter.relatedCommentIds).toEqual([k3.id]);

    expect((await db.cells.get(m1a1.id))!.updatedAt).toBe(SENTINEL);
    expect((await db.cells.get(m3b2.id))!.updatedAt).toBe(SENTINEL);
    expect((await db.cells.get(m3c3.id))!.updatedAt).toBe(SENTINEL);
    expect((await db.comments.get(k1.id))!.updatedAt).toBe(SENTINEL);
  });

  it('deleting the last map does not leave surviving global comments pointing at the recreated blank map', async () => {
    const b2 = await cellAt(m1, 'B2');
    const k1 = await makeComment({ mapId: m1, cellCoord: 'B2', content: 'room note' });
    const g2 = await makeComment({ mapId: 'global', cellCoord: '', content: 'standalone' });
    const g = await makeComment({
      mapId: 'global',
      cellCoord: '',
      relatedCellIds: [b2.id],
      relatedCommentIds: [k1.id, g2.id],
    });
    await stampComments(g2.id);

    const recreatedId = await deleteMapPage(m1);

    const maps = await db.maps.toArray();
    expect(maps).toHaveLength(1);
    expect(maps[0].id).toBe(recreatedId);
    expect(await db.comments.get(k1.id)).toBeUndefined();

    const gAfter = (await db.comments.get(g.id))!;
    expect(gAfter.relatedCellIds ?? []).toEqual([]);
    expect(gAfter.relatedCommentIds).toEqual([g2.id]);
    expect((await db.comments.get(g2.id))!.updatedAt).toBe(SENTINEL);
  });

  it('guarded no-op deletions leave every record untouched', async () => {
    const m2 = await createMapPage('SmA', 'Small Shrine', 2, 2);
    const m2a1 = await cellAt(m2.id, 'A1');
    const b2 = await cellAt(m1, 'B2');
    const comm = await makeComment({ mapId: m2.id, cellCoord: 'A1', relatedCellIds: [b2.id] });
    await makePin(b2.id, { targetMapId: m2.id, targetCellId: m2a1.id, linkedCommentId: comm.id });
    await db.cells.toCollection().modify({ updatedAt: SENTINEL });
    await db.comments.toCollection().modify({ updatedAt: SENTINEL });

    const snapshot = async () => ({
      maps: await db.maps.orderBy('id').toArray(),
      cells: await db.cells.orderBy('id').toArray(),
      comments: await db.comments.orderBy('id').toArray(),
    });
    const before = await snapshot();

    await deleteRowAt(m2.id, 0); // 2x2 minimum guard
    await deleteColAt(m2.id, 1); // 2x2 minimum guard
    await deleteRowAt(m1, 99); // out of range
    await deleteColAt(m1, -1); // out of range
    await deleteCommentEntry('comm-does-not-exist');

    expect(await snapshot()).toEqual(before);
  });
});
