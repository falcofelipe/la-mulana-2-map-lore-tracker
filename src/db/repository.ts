/**
 * Database Repository Layer
 * -------------------------
 * Provides clean, atomic functions for all Map, Cell, Marker, Arrow, Comment,
 * Sketch, and ProjectConfig mutations. Isolating DB access here makes the
 * codebase easy to read, test, and extend in the future.
 *
 * Every mutation is executed as a labeled, reversible command through the
 * shared `commandDispatcher`, which records exact before/after images of every
 * touched record (across config, maps, cells, comments, sketches and blobs) so
 * that it can be undone and redone deterministically.
 */

import type { Table, UpdateSpec } from 'dexie';
import {
  CommentCategoryDefinition,
  CommentEntry,
  CustomFieldDefinition,
  GridCell,
  ImageBlobRecord,
  MapGridArrow,
  MapPage,
  MarkerDefinition,
  PassageDirection,
  PinMarker,
  ProjectConfig,
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
// 0. REVERSIBLE COMMAND DISPATCHER (UNDO / REDO)
// ============================================================================

export interface TableRecordMap {
  config: ProjectConfig;
  maps: MapPage;
  cells: GridCell;
  comments: CommentEntry;
  sketches: SketchNote;
  blobs: ImageBlobRecord;
}

export type TableName = keyof TableRecordMap;

/** Deterministic table order used for recording and applying change sets. */
export const TABLE_NAMES: readonly TableName[] = [
  'config',
  'maps',
  'cells',
  'comments',
  'sketches',
  'blobs',
];

/**
 * A single record transition. `before === undefined` means the record did not
 * exist prior to the command; `after === undefined` means it was deleted.
 */
export interface RecordChange<T> {
  key: string;
  before?: T;
  after?: T;
}

export type ChangeSet = {
  [K in TableName]?: RecordChange<TableRecordMap[K]>[];
};

/** Keys of records that were created outside the command's transaction (e.g. processed images). */
export type AdoptedRecordKeys = { [K in TableName]?: string[] };

export interface ReversibleCommand {
  readonly id: number;
  readonly label: string;
  readonly executedAt: number;
  readonly changes: ChangeSet;
}

export interface ExecuteOptions {
  /**
   * Records already written to the database just before the command ran.
   * They are treated as newly created by the command (no prior state), and
   * are removed again if the command fails.
   */
  adopted?: AdoptedRecordKeys;
}

function getTable<K extends TableName>(name: K): Table<TableRecordMap[K], string> {
  return db[name] as unknown as Table<TableRecordMap[K], string>;
}

function allTables(): Table<unknown, string>[] {
  return TABLE_NAMES.map((name) => getTable(name) as unknown as Table<unknown, string>);
}

/**
 * Tracks every write performed by a command inside its transaction, capturing
 * the pre-mutation image of each touched record the first time it is written.
 */
export class MutationRecorder {
  private readonly touched = new Map<TableName, Map<string, unknown>>();

  constructor(adopted?: AdoptedRecordKeys) {
    if (!adopted) return;
    for (const name of TABLE_NAMES) {
      const slot = this.slot(name);
      for (const key of adopted[name] || []) {
        if (!slot.has(key)) slot.set(key, undefined);
      }
    }
  }

  private slot(name: TableName): Map<string, unknown> {
    let slot = this.touched.get(name);
    if (!slot) {
      slot = new Map();
      this.touched.set(name, slot);
    }
    return slot;
  }

  private async capture(name: TableName, keys: string[]): Promise<void> {
    const slot = this.slot(name);
    const missing = Array.from(new Set(keys)).filter((k) => !slot.has(k));
    if (missing.length === 0) return;
    const existing = await getTable(name).bulkGet(missing);
    missing.forEach((key, i) => slot.set(key, existing[i]));
  }

  async put<K extends TableName>(name: K, record: TableRecordMap[K]): Promise<void> {
    await this.capture(name, [record.id]);
    await getTable(name).put(record);
  }

  async bulkPut<K extends TableName>(
    name: K,
    records: TableRecordMap[K][]
  ): Promise<void> {
    if (records.length === 0) return;
    await this.capture(
      name,
      records.map((r) => r.id)
    );
    await getTable(name).bulkPut(records);
  }

  async update<K extends TableName>(
    name: K,
    key: string,
    changes: Partial<TableRecordMap[K]>
  ): Promise<number> {
    await this.capture(name, [key]);
    return getTable(name).update(
      key,
      changes as unknown as UpdateSpec<TableRecordMap[K]>
    );
  }

  async delete(name: TableName, key: string): Promise<void> {
    await this.capture(name, [key]);
    await getTable(name).delete(key);
  }

  async bulkDelete(name: TableName, keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    await this.capture(name, keys);
    await getTable(name).bulkDelete(keys);
  }

  /** Reads post-mutation images of every touched record (must run inside the transaction). */
  async collect(): Promise<ChangeSet> {
    const changes: ChangeSet = {};
    for (const name of TABLE_NAMES) {
      const slot = this.touched.get(name);
      if (!slot || slot.size === 0) continue;
      const keys = Array.from(slot.keys());
      const after = await getTable(name).bulkGet(keys);
      (changes as Record<TableName, RecordChange<unknown>[]>)[name] = keys.map(
        (key, i) => ({ key, before: slot.get(key), after: after[i] })
      );
    }
    return changes;
  }
}

async function blobsEqual(a: Blob, b: Blob): Promise<boolean> {
  if (a === b) return true;
  if (a.size !== b.size || a.type !== b.type) return false;
  const [bytesA, bytesB] = await Promise.all([
    a.arrayBuffer().then((buf) => new Uint8Array(buf)),
    b.arrayBuffer().then((buf) => new Uint8Array(buf)),
  ]);
  for (let i = 0; i < bytesA.length; i++) {
    if (bytesA[i] !== bytesB[i]) return false;
  }
  return true;
}

async function valuesEqual(a: unknown, b: unknown): Promise<boolean> {
  if (Object.is(a, b)) return true;
  if (typeof Blob !== 'undefined' && (a instanceof Blob || b instanceof Blob)) {
    return a instanceof Blob && b instanceof Blob && blobsEqual(a, b);
  }
  if (
    typeof a !== 'object' ||
    typeof b !== 'object' ||
    a === null ||
    b === null
  ) {
    return false;
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!(await valuesEqual(a[i], b[i]))) return false;
    }
    return true;
  }
  if (a instanceof Date || b instanceof Date) {
    return (
      a instanceof Date && b instanceof Date && a.getTime() === b.getTime()
    );
  }
  const objA = a as Record<string, unknown>;
  const objB = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(objA), ...Object.keys(objB)]);
  for (const key of keys) {
    if (!(await valuesEqual(objA[key], objB[key]))) return false;
  }
  return true;
}

async function pruneUnchanged(raw: ChangeSet): Promise<ChangeSet> {
  const pruned: ChangeSet = {};
  for (const name of TABLE_NAMES) {
    const list = raw[name] as RecordChange<unknown>[] | undefined;
    if (!list) continue;
    const kept: RecordChange<unknown>[] = [];
    for (const change of list) {
      if (!(await valuesEqual(change.before, change.after))) kept.push(change);
    }
    if (kept.length > 0) {
      (pruned as Record<TableName, RecordChange<unknown>[]>)[name] = kept;
    }
  }
  return pruned;
}

function hasChanges(changes: ChangeSet): boolean {
  return TABLE_NAMES.some((name) => (changes[name]?.length ?? 0) > 0);
}

async function applyChangeSet(
  changes: ChangeSet,
  side: 'before' | 'after'
): Promise<void> {
  await db.transaction('rw', allTables(), async () => {
    for (const name of TABLE_NAMES) {
      const list = changes[name] as RecordChange<{ id: string }>[] | undefined;
      if (!list || list.length === 0) continue;
      const table = getTable(name) as unknown as Table<{ id: string }, string>;
      const toDelete = list
        .filter((c) => c[side] === undefined)
        .map((c) => c.key);
      const toPut = list
        .map((c) => c[side])
        .filter((r): r is { id: string } => r !== undefined);
      if (toDelete.length > 0) await table.bulkDelete(toDelete);
      if (toPut.length > 0) await table.bulkPut(toPut);
    }
  });
}

/**
 * Serializes all database mutations into labeled, reversible commands and
 * maintains linear undo/redo history.
 */
export class CommandDispatcher {
  private undoStack: ReversibleCommand[] = [];
  private redoStack: ReversibleCommand[] = [];
  private queue: Promise<unknown> = Promise.resolve();
  private generation = 0;
  private nextId = 1;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly maxHistory = 200) {}

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = this.queue.then(task, task);
    this.queue = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        // listeners must never break the dispatcher
      }
    }
  }

  /** Subscribes to history changes. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Runs `run` inside a single read-write transaction spanning every table,
   * records all affected records, and pushes the resulting command onto the
   * undo history. Calls that change nothing (or that fail) leave history intact.
   */
  execute<T>(
    label: string,
    run: (recorder: MutationRecorder) => Promise<T>,
    options: ExecuteOptions = {}
  ): Promise<T> {
    return this.enqueue(async () => {
      const generation = this.generation;
      const recorder = new MutationRecorder(options.adopted);
      let result: T;
      let raw: ChangeSet;
      try {
        ({ result, raw } = await db.transaction('rw', allTables(), async () => {
          const value = await run(recorder);
          return { result: value, raw: await recorder.collect() };
        }));
      } catch (err) {
        await this.discardAdopted(options.adopted);
        throw err;
      }

      const changes = await pruneUnchanged(raw);
      if (hasChanges(changes) && generation === this.generation) {
        this.undoStack.push({
          id: this.nextId++,
          label,
          executedAt: Date.now(),
          changes,
        });
        if (this.undoStack.length > this.maxHistory) {
          this.undoStack.splice(0, this.undoStack.length - this.maxHistory);
        }
        this.redoStack = [];
        this.notify();
      }
      return result;
    });
  }

  /**
   * Runs a whole-database replacement (reset/import). It is not undoable and
   * clears all history once it succeeds.
   */
  replaceDatabase<T>(run: () => Promise<T>): Promise<T> {
    return this.enqueue(async () => {
      const result = await run();
      this.clear();
      return result;
    });
  }

  private async discardAdopted(adopted?: AdoptedRecordKeys): Promise<void> {
    if (!adopted) return;
    try {
      await db.transaction('rw', allTables(), async () => {
        for (const name of TABLE_NAMES) {
          const keys = adopted[name];
          if (keys && keys.length > 0) await getTable(name).bulkDelete(keys);
        }
      });
    } catch {
      // best-effort cleanup of records created before a failed command
    }
  }

  /** Reverts the most recent command. Resolves `true` if a command was undone. */
  undo(): Promise<boolean> {
    return this.enqueue(async () => {
      const command = this.undoStack[this.undoStack.length - 1];
      if (!command) return false;
      await applyChangeSet(command.changes, 'before');
      this.undoStack.pop();
      this.redoStack.push(command);
      this.notify();
      return true;
    });
  }

  /** Re-applies the most recently undone command. Resolves `true` if a command was redone. */
  redo(): Promise<boolean> {
    return this.enqueue(async () => {
      const command = this.redoStack[this.redoStack.length - 1];
      if (!command) return false;
      await applyChangeSet(command.changes, 'after');
      this.redoStack.pop();
      this.undoStack.push(command);
      this.notify();
      return true;
    });
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  get undoLabel(): string | undefined {
    return this.undoStack[this.undoStack.length - 1]?.label;
  }

  get redoLabel(): string | undefined {
    return this.redoStack[this.redoStack.length - 1]?.label;
  }

  /** Drops all undo/redo history. */
  clear(): void {
    const hadHistory = this.undoStack.length > 0 || this.redoStack.length > 0;
    this.undoStack = [];
    this.redoStack = [];
    this.generation++;
    if (hadHistory) this.notify();
  }
}

export const commandDispatcher = new CommandDispatcher();
export default commandDispatcher;

db.on('close', () => commandDispatcher.clear());

// ============================================================================
// 1. MAP TAB OPERATIONS & DYNAMIC GRID EXPANSION
// ============================================================================

export async function createMapPage(
  codePrefix: string,
  name: string,
  rows = 7,
  cols = 8
): Promise<MapPage> {
  return commandDispatcher.execute('Create map page', async (rec) => {
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

    await rec.put('maps', newMap);
    await rec.bulkPut('cells', cells);
    return newMap;
  });
}

export async function updateMapPageMetadata(
  mapId: string,
  updates: Partial<Pick<MapPage, 'codePrefix' | 'name' | 'order'>>
): Promise<void> {
  await commandDispatcher.execute('Update map page', async (rec) => {
    await rec.update('maps', mapId, updates);
  });
}

export async function reorderMapPages(orderedMapIds: string[]): Promise<void> {
  await commandDispatcher.execute('Reorder map pages', async (rec) => {
    for (let i = 0; i < orderedMapIds.length; i++) {
      await rec.update('maps', orderedMapIds[i], { order: i });
    }
  });
}

export async function deleteMapPage(mapId: string): Promise<string | null> {
  return commandDispatcher.execute('Delete map page', async (rec) => {
    const cells = await db.cells.where('mapId').equals(mapId).toArray();
    const comments = await db.comments.where('mapId').equals(mapId).toArray();
    const sketches = await db.sketches.where('mapId').equals(mapId).toArray();

    // Collect associated blob IDs to clean up disk space
    const blobIdsToDelete: string[] = [];
    for (const cell of cells) {
      if (cell.screenshotBlobId) blobIdsToDelete.push(cell.screenshotBlobId);
      if (cell.thumbnailBlobId) blobIdsToDelete.push(cell.thumbnailBlobId);
    }
    for (const comm of comments) {
      blobIdsToDelete.push(...comm.attachmentBlobIds);
    }
    for (const sketch of sketches) {
      if (sketch.imageBlobId) blobIdsToDelete.push(sketch.imageBlobId);
    }

    await rec.bulkDelete('blobs', blobIdsToDelete);
    await rec.bulkDelete(
      'cells',
      cells.map((c) => c.id)
    );
    await rec.bulkDelete(
      'comments',
      comments.map((c) => c.id)
    );
    await rec.bulkDelete(
      'sketches',
      sketches.map((s) => s.id)
    );
    await rec.delete('maps', mapId);

    const remaining = await db.maps.orderBy('order').toArray();
    if (remaining.length === 0) {
      const { map, cells: blankCells } = createBlankInitialMap();
      await rec.put('maps', map);
      await rec.bulkPut('cells', blankCells);
      return map.id;
    }
    return remaining[0].id;
  });
}

/**
 * Helper to update `shortLabel` on any pin across the entire database that
 * points via `targetCellId` to a cell whose coordinate shifted (e.g., `-> AcB $A$8` -> `-> AcB $B$8`).
 */
async function syncShiftedTargetPinLabels(
  rec: MutationRecorder,
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

  await rec.bulkPut('cells', cellsWithUpdatedPins);
}

async function insertRowWith(
  rec: MutationRecorder,
  mapId: string,
  insertRowIndex: number,
  now: number
): Promise<void> {
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

  await rec.bulkPut('cells', updatedCells);
  await syncShiftedTargetPinLabels(rec, shiftedCoordPairs, now);

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
    await rec.bulkPut('comments', updatedComments);
  }

  await rec.update('maps', mapId, { rows: newRows });
}

async function insertColWith(
  rec: MutationRecorder,
  mapId: string,
  insertColIndex: number,
  now: number
): Promise<void> {
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

  await rec.bulkPut('cells', updatedCells);
  await syncShiftedTargetPinLabels(rec, shiftedCoordPairs, now);

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
    await rec.bulkPut('comments', updatedComments);
  }

  await rec.update('maps', mapId, { cols: newCols });
}

async function deleteRowWith(
  rec: MutationRecorder,
  mapId: string,
  deleteRowIndex: number,
  now: number
): Promise<void> {
  const map = await db.maps.get(mapId);
  if (!map || map.rows <= 2) return;
  if (deleteRowIndex < 0 || deleteRowIndex >= map.rows) return;

  const existingCells = await db.cells.where('mapId').equals(mapId).toArray();
  const mapComments = await db.comments.where('mapId').equals(mapId).toArray();

  const cellsToRemove = existingCells.filter((c) => c.row === deleteRowIndex);
  const cellsToShift = existingCells.filter((c) => c.row > deleteRowIndex);

  const removedIds = new Set(cellsToRemove.map((c) => c.id));
  const removedCoords = new Set(cellsToRemove.map((c) => c.coord));
  const commentsToRemove = mapComments.filter(
    (comm) =>
      (comm.cellId && removedIds.has(comm.cellId)) ||
      (!comm.cellId && removedCoords.has(comm.cellCoord))
  );

  const blobIdsToDelete: string[] = [];
  for (const c of cellsToRemove) {
    if (c.screenshotBlobId) blobIdsToDelete.push(c.screenshotBlobId);
    if (c.thumbnailBlobId) blobIdsToDelete.push(c.thumbnailBlobId);
  }
  for (const comm of commentsToRemove) {
    blobIdsToDelete.push(...comm.attachmentBlobIds);
  }
  await rec.bulkDelete('blobs', blobIdsToDelete);
  await rec.bulkDelete(
    'comments',
    commentsToRemove.map((c) => c.id)
  );
  await rec.bulkDelete('cells', Array.from(removedIds));

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

    await rec.bulkPut('cells', updatedCells);
    await syncShiftedTargetPinLabels(rec, shiftedCoordPairs, now);

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
    await rec.bulkPut('comments', updatedComments);
  }

  const nextGridArrows = (map.gridArrows || []).filter(
    (a) => !removedIds.has(a.fromCellId) && !removedIds.has(a.toCellId)
  );

  await rec.update('maps', mapId, {
    rows: map.rows - 1,
    gridArrows: nextGridArrows,
  });
}

async function deleteColWith(
  rec: MutationRecorder,
  mapId: string,
  deleteColIndex: number,
  now: number
): Promise<void> {
  const map = await db.maps.get(mapId);
  if (!map || map.cols <= 2) return;
  if (deleteColIndex < 0 || deleteColIndex >= map.cols) return;

  const existingCells = await db.cells.where('mapId').equals(mapId).toArray();
  const mapComments = await db.comments.where('mapId').equals(mapId).toArray();

  const cellsToRemove = existingCells.filter((c) => c.col === deleteColIndex);
  const cellsToShift = existingCells.filter((c) => c.col > deleteColIndex);

  const removedIds = new Set(cellsToRemove.map((c) => c.id));
  const removedCoords = new Set(cellsToRemove.map((c) => c.coord));
  const commentsToRemove = mapComments.filter(
    (comm) =>
      (comm.cellId && removedIds.has(comm.cellId)) ||
      (!comm.cellId && removedCoords.has(comm.cellCoord))
  );

  const blobIdsToDelete: string[] = [];
  for (const c of cellsToRemove) {
    if (c.screenshotBlobId) blobIdsToDelete.push(c.screenshotBlobId);
    if (c.thumbnailBlobId) blobIdsToDelete.push(c.thumbnailBlobId);
  }
  for (const comm of commentsToRemove) {
    blobIdsToDelete.push(...comm.attachmentBlobIds);
  }
  await rec.bulkDelete('blobs', blobIdsToDelete);
  await rec.bulkDelete(
    'comments',
    commentsToRemove.map((c) => c.id)
  );
  await rec.bulkDelete('cells', Array.from(removedIds));

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

    await rec.bulkPut('cells', updatedCells);
    await syncShiftedTargetPinLabels(rec, shiftedCoordPairs, now);

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
    await rec.bulkPut('comments', updatedComments);
  }

  const nextGridArrows = (map.gridArrows || []).filter(
    (a) => !removedIds.has(a.fromCellId) && !removedIds.has(a.toCellId)
  );

  await rec.update('maps', mapId, {
    cols: map.cols - 1,
    gridArrows: nextGridArrows,
  });
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
  await commandDispatcher.execute('Insert row', (rec) =>
    insertRowWith(rec, mapId, insertRowIndex, now)
  );
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
  await commandDispatcher.execute('Insert column', (rec) =>
    insertColWith(rec, mapId, insertColIndex, now)
  );
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
  await commandDispatcher.execute('Delete row', (rec) =>
    deleteRowWith(rec, mapId, deleteRowIndex, now)
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
  await commandDispatcher.execute('Delete column', (rec) =>
    deleteColWith(rec, mapId, deleteColIndex, now)
  );
}

/**
 * Expands a map's grid by adding 1 row or column on the specified outer edge.
 */
export async function expandMapGrid(
  mapId: string,
  direction: 'top' | 'bottom' | 'left' | 'right'
): Promise<void> {
  await commandDispatcher.execute(`Expand map grid (${direction})`, async (rec) => {
    const map = await db.maps.get(mapId);
    if (!map) return;
    const now = Date.now();

    if (direction === 'top') {
      await insertRowWith(rec, mapId, 0, now);
    } else if (direction === 'bottom') {
      await insertRowWith(rec, mapId, map.rows, now);
    } else if (direction === 'left') {
      await insertColWith(rec, mapId, 0, now);
    } else if (direction === 'right') {
      await insertColWith(rec, mapId, map.cols, now);
    }
  });
}

/**
 * Removes the outer row or column on the specified edge (minimum 2x2 grid).
 */
export async function shrinkMapGrid(
  mapId: string,
  direction: 'top' | 'bottom' | 'left' | 'right'
): Promise<void> {
  await commandDispatcher.execute(`Shrink map grid (${direction})`, async (rec) => {
    const map = await db.maps.get(mapId);
    if (!map) return;
    const now = Date.now();

    if (direction === 'top') {
      await deleteRowWith(rec, mapId, 0, now);
    } else if (direction === 'bottom') {
      await deleteRowWith(rec, mapId, map.rows - 1, now);
    } else if (direction === 'left') {
      await deleteColWith(rec, mapId, 0, now);
    } else if (direction === 'right') {
      await deleteColWith(rec, mapId, map.cols - 1, now);
    }
  });
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

  await commandDispatcher.execute('Swap cells', async (rec) => {
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

    await rec.bulkPut('cells', [updatedA, updatedB]);

    const shiftedCoordPairs = new Map<
      string,
      { oldCoord: string; newCoord: string }
    >([
      [cellA.id, { oldCoord: cellA.coord, newCoord: cellB.coord }],
      [cellB.id, { oldCoord: cellB.coord, newCoord: cellA.coord }],
    ]);

    await syncShiftedTargetPinLabels(rec, shiftedCoordPairs, now);

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

    await rec.bulkPut('comments', updatedComments);
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
  await commandDispatcher.execute('Toggle cell passage', async (rec) => {
    const cell = await db.cells.get(cellId);
    if (!cell) return;

    const currentOpen = Boolean(cell.openPassages?.[direction]);
    const nextOpen = !currentOpen;

    await rec.update('cells', cellId, {
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
      await rec.update('cells', neighbor.id, {
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
  return commandDispatcher.execute('Add map grid arrow', async (rec) => {
    const map = await db.maps.get(mapId);
    if (!map) throw new Error('Map not found');

    const newArrow: MapGridArrow = {
      ...arrow,
      id: `marr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    };

    await rec.update('maps', mapId, {
      gridArrows: [...(map.gridArrows || []), newArrow],
    });

    return newArrow;
  });
}

export async function updateMapGridArrow(
  mapId: string,
  arrowId: string,
  updates: Partial<MapGridArrow>
): Promise<void> {
  await commandDispatcher.execute('Update map grid arrow', async (rec) => {
    const map = await db.maps.get(mapId);
    if (!map) return;

    await rec.update('maps', mapId, {
      gridArrows: (map.gridArrows || []).map((a) =>
        a.id === arrowId ? { ...a, ...updates } : a
      ),
    });
  });
}

export async function deleteMapGridArrow(
  mapId: string,
  arrowId: string
): Promise<void> {
  await commandDispatcher.execute('Delete map grid arrow', async (rec) => {
    const map = await db.maps.get(mapId);
    if (!map) return;

    await rec.update('maps', mapId, {
      gridArrows: (map.gridArrows || []).filter((a) => a.id !== arrowId),
    });
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
  await commandDispatcher.execute('Toggle map connection', async (rec) => {
    const map = await db.maps.get(mapId);
    if (!map) return;

    const existing = map.manualOutgoingMapIds || [];
    const next = existing.includes(targetMapId)
      ? existing.filter((id) => id !== targetMapId)
      : [...existing, targetMapId];

    await rec.update('maps', mapId, { manualOutgoingMapIds: next });
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
  const createdBlobIds = [processed.fullBlobId, processed.thumbBlobId];

  await commandDispatcher.execute(
    'Assign cell screenshot',
    async (rec) => {
      const current = await db.cells.get(cellId);
      if (!current) {
        await rec.bulkDelete('blobs', createdBlobIds);
        return;
      }

      const oldBlobs: string[] = [];
      if (current.screenshotBlobId) oldBlobs.push(current.screenshotBlobId);
      if (current.thumbnailBlobId) oldBlobs.push(current.thumbnailBlobId);
      await rec.bulkDelete(
        'blobs',
        oldBlobs.filter((id) => !createdBlobIds.includes(id))
      );

      await rec.update('cells', cellId, {
        state: 'room',
        screenshotBlobId: processed.fullBlobId,
        thumbnailBlobId: processed.thumbBlobId,
        updatedAt: Date.now(),
      });
    },
    { adopted: { blobs: createdBlobIds } }
  );
}

/**
 * Clears ONLY the background screenshot of a cell while preserving all
 * room metadata, markers, arrows, and linked comments.
 */
export async function clearCellScreenshot(cellId: string): Promise<void> {
  await commandDispatcher.execute('Clear cell screenshot', async (rec) => {
    const cell = await db.cells.get(cellId);
    if (!cell) return;

    const oldBlobs: string[] = [];
    if (cell.screenshotBlobId) oldBlobs.push(cell.screenshotBlobId);
    if (cell.thumbnailBlobId) oldBlobs.push(cell.thumbnailBlobId);
    await rec.bulkDelete('blobs', oldBlobs);

    const hasContent =
      Boolean(cell.roomName.trim()) ||
      cell.markers.length > 0 ||
      cell.arrows.length > 0;

    await rec.update('cells', cellId, {
      screenshotBlobId: undefined,
      thumbnailBlobId: undefined,
      state: hasContent ? 'room' : 'empty',
      updatedAt: Date.now(),
    });
  });
}

/**
 * Toggles the Blocked / Out-of-Bounds ('blocked_x') state on a cell.
 */
export async function toggleCellBlockedState(cellId: string): Promise<void> {
  await commandDispatcher.execute('Toggle cell blocked state', async (rec) => {
    const cell = await db.cells.get(cellId);
    if (!cell) return;

    const nextState =
      cell.state === 'blocked_x'
        ? cell.screenshotBlobId || cell.roomName.trim() || cell.markers.length > 0
          ? 'room'
          : 'empty'
        : 'blocked_x';

    await rec.update('cells', cellId, {
      state: nextState,
      updatedAt: Date.now(),
    });
  });
}

/**
 * Updates a cell's Room Name, Completion Status, or Tags.
 */
export async function updateCellMetadata(
  cellId: string,
  updates: Partial<Pick<GridCell, 'roomName' | 'isCompleted' | 'tags' | 'state'>>
): Promise<void> {
  await commandDispatcher.execute('Update cell metadata', async (rec) => {
    const cell = await db.cells.get(cellId);
    if (!cell) return;

    const nextRoomName =
      updates.roomName !== undefined ? updates.roomName : cell.roomName;
    const shouldBeRoom =
      cell.state === 'empty' &&
      (Boolean(nextRoomName.trim()) ||
        (updates.tags && updates.tags.length > 0) ||
        Boolean(updates.isCompleted));

    await rec.update('cells', cellId, {
      ...updates,
      state: updates.state ?? (shouldBeRoom ? 'room' : cell.state),
      updatedAt: Date.now(),
    });
  });
}

// ============================================================================
// 3. PIN MARKERS & VECTOR ARROWS
// ============================================================================

export async function addPinMarkerToCell(
  cellId: string,
  marker: Omit<PinMarker, 'id'>
): Promise<PinMarker> {
  return commandDispatcher.execute('Add pin marker', async (rec) => {
    const cell = await db.cells.get(cellId);
    if (!cell) throw new Error('Cell not found');

    const newPin: PinMarker = {
      ...marker,
      id: `pin-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    };

    await rec.update('cells', cellId, {
      state: cell.state === 'empty' ? 'room' : cell.state,
      markers: [...cell.markers, newPin],
      updatedAt: Date.now(),
    });

    return newPin;
  });
}

export async function updatePinMarkerOnCell(
  cellId: string,
  markerId: string,
  updates: Partial<PinMarker>
): Promise<void> {
  await commandDispatcher.execute('Update pin marker', async (rec) => {
    const cell = await db.cells.get(cellId);
    if (!cell) return;

    const nextMarkers = cell.markers.map((m) =>
      m.id === markerId ? { ...m, ...updates } : m
    );

    await rec.update('cells', cellId, {
      markers: nextMarkers,
      updatedAt: Date.now(),
    });
  });
}

export async function deletePinMarkerFromCell(
  cellId: string,
  markerId: string
): Promise<void> {
  await commandDispatcher.execute('Delete pin marker', async (rec) => {
    const cell = await db.cells.get(cellId);
    if (!cell) return;

    await rec.update('cells', cellId, {
      markers: cell.markers.filter((m) => m.id !== markerId),
      updatedAt: Date.now(),
    });
  });
}

export async function addVectorArrowToCell(
  cellId: string,
  arrow: Omit<VectorArrow, 'id'>
): Promise<VectorArrow> {
  return commandDispatcher.execute('Add vector arrow', async (rec) => {
    const cell = await db.cells.get(cellId);
    if (!cell) throw new Error('Cell not found');

    const newArrow: VectorArrow = {
      ...arrow,
      id: `arr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    };

    await rec.update('cells', cellId, {
      state: cell.state === 'empty' ? 'room' : cell.state,
      arrows: [...cell.arrows, newArrow],
      updatedAt: Date.now(),
    });

    return newArrow;
  });
}

export async function updateVectorArrowOnCell(
  cellId: string,
  arrowId: string,
  updates: Partial<VectorArrow>
): Promise<void> {
  await commandDispatcher.execute('Update vector arrow', async (rec) => {
    const cell = await db.cells.get(cellId);
    if (!cell) return;

    await rec.update('cells', cellId, {
      arrows: cell.arrows.map((a) =>
        a.id === arrowId ? { ...a, ...updates } : a
      ),
      updatedAt: Date.now(),
    });
  });
}

export async function deleteVectorArrowFromCell(
  cellId: string,
  arrowId: string
): Promise<void> {
  await commandDispatcher.execute('Delete vector arrow', async (rec) => {
    const cell = await db.cells.get(cellId);
    if (!cell) return;

    await rec.update('cells', cellId, {
      arrows: cell.arrows.filter((a) => a.id !== arrowId),
      updatedAt: Date.now(),
    });
  });
}

// ============================================================================
// 4. RELATIONAL COMMENTS, TABLETS & NPC DIALOGUE
// ============================================================================

export async function createCommentEntry(
  input: Omit<CommentEntry, 'id' | 'createdAt' | 'updatedAt'>
): Promise<CommentEntry> {
  return commandDispatcher.execute('Create comment', async (rec) => {
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

    await rec.put('comments', entry);
    return entry;
  });
}

export async function updateCommentEntry(
  commentId: string,
  updates: Partial<Omit<CommentEntry, 'id' | 'createdAt'>>
): Promise<void> {
  await commandDispatcher.execute('Update comment', async (rec) => {
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

    await rec.update('comments', commentId, {
      ...nextUpdates,
      updatedAt: Date.now(),
    });
  });
}

export async function deleteCommentEntry(commentId: string): Promise<void> {
  await commandDispatcher.execute('Delete comment', async (rec) => {
    const comm = await db.comments.get(commentId);
    if (!comm) return;

    await rec.bulkDelete('blobs', comm.attachmentBlobIds);
    await rec.delete('comments', commentId);
  });
}

export async function attachImageToComment(
  commentId: string,
  imageBlob: Blob
): Promise<string> {
  const comm = await db.comments.get(commentId);
  if (!comm) throw new Error('Comment not found');

  const blobId = await processAndStoreAttachmentImage(imageBlob);
  return commandDispatcher.execute(
    'Attach image to comment',
    async (rec) => {
      const current = await db.comments.get(commentId);
      if (!current) throw new Error('Comment not found');

      await rec.update('comments', commentId, {
        attachmentBlobIds: [...current.attachmentBlobIds, blobId],
        updatedAt: Date.now(),
      });
      return blobId;
    },
    { adopted: { blobs: [blobId] } }
  );
}

export async function removeAttachmentFromComment(
  commentId: string,
  blobId: string
): Promise<void> {
  await commandDispatcher.execute('Remove comment attachment', async (rec) => {
    const comm = await db.comments.get(commentId);
    if (!comm) return;

    await rec.delete('blobs', blobId);
    await rec.update('comments', commentId, {
      attachmentBlobIds: comm.attachmentBlobIds.filter((id) => id !== blobId),
      updatedAt: Date.now(),
    });
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

  return commandDispatcher.execute(
    'Create sketch',
    async (rec) => {
      const sketch: SketchNote = {
        id: `sketch-${now}-${Math.random().toString(36).slice(2, 7)}`,
        title: title.trim() || 'Untitled Sketch',
        description,
        mapId,
        imageBlobId,
        createdAt: now,
        updatedAt: now,
      };

      await rec.put('sketches', sketch);
      return sketch;
    },
    { adopted: imageBlobId ? { blobs: [imageBlobId] } : undefined }
  );
}

export async function updateSketchNote(
  sketchId: string,
  updates: Partial<Pick<SketchNote, 'title' | 'description' | 'mapId'>>,
  newImageBlob?: Blob
): Promise<void> {
  const existing = await db.sketches.get(sketchId);
  if (!existing) return;

  const newImageBlobId = newImageBlob
    ? await processAndStoreAttachmentImage(newImageBlob)
    : undefined;
  const createdBlobIds = newImageBlobId ? [newImageBlobId] : [];

  await commandDispatcher.execute(
    'Update sketch',
    async (rec) => {
      const current = await db.sketches.get(sketchId);
      if (!current) {
        await rec.bulkDelete('blobs', createdBlobIds);
        return;
      }

      let imageBlobId = current.imageBlobId;
      if (newImageBlobId) {
        if (current.imageBlobId && current.imageBlobId !== newImageBlobId) {
          await rec.delete('blobs', current.imageBlobId);
        }
        imageBlobId = newImageBlobId;
      }

      await rec.update('sketches', sketchId, {
        ...updates,
        imageBlobId,
        updatedAt: Date.now(),
      });
    },
    { adopted: { blobs: createdBlobIds } }
  );
}

export async function deleteSketchNote(sketchId: string): Promise<void> {
  await commandDispatcher.execute('Delete sketch', async (rec) => {
    const existing = await db.sketches.get(sketchId);
    if (!existing) return;
    if (existing.imageBlobId) {
      await rec.delete('blobs', existing.imageBlobId);
    }
    await rec.delete('sketches', sketchId);
  });
}

// ============================================================================
// 6. PROJECT CUSTOMIZATION (MARKERS, ROOM FLAGS, CUSTOM COMMENT FIELDS)
// ============================================================================

export async function addRoomFlagOption(flagName: string): Promise<void> {
  const clean = flagName.trim();
  if (!clean) return;

  await commandDispatcher.execute('Add room flag', async (rec) => {
    const config = await db.config.get('singleton');
    if (!config) return;

    const existing = config.roomFlagOptions || [];
    const exists = existing.some(
      (opt) => opt.toLowerCase() === clean.toLowerCase()
    );
    if (!exists) {
      await rec.update('config', 'singleton', {
        roomFlagOptions: [...existing, clean],
        updatedAt: Date.now(),
      });
    }
  });
}

export async function updateRoomFlagOptions(
  nextOptions: string[],
  renamedOrDeleted?: { oldName: string; newName: string }
): Promise<void> {
  const now = Date.now();
  await commandDispatcher.execute('Update room flags', async (rec) => {
    await rec.update('config', 'singleton', {
      roomFlagOptions: nextOptions,
      updatedAt: now,
    });

    if (renamedOrDeleted && renamedOrDeleted.oldName !== renamedOrDeleted.newName) {
      const allCells = await db.cells.toArray();
      const affectedCells = allCells.filter((c) =>
        c.tags.includes(renamedOrDeleted.oldName)
      );
      await rec.bulkPut(
        'cells',
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
  });
}

export async function saveMarkerDefinitions(
  definitions: MarkerDefinition[]
): Promise<void> {
  const now = Date.now();
  await commandDispatcher.execute('Save marker definitions', async (rec) => {
    await rec.update('config', 'singleton', {
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

    await rec.bulkPut('cells', cellsToUpdate);
  });
}

export async function saveCommentCategories(
  categories: CommentCategoryDefinition[]
): Promise<void> {
  const now = Date.now();
  await commandDispatcher.execute('Save comment categories', async (rec) => {
    await rec.update('config', 'singleton', {
      commentCategories: categories,
      updatedAt: now,
    });

    const validIds = new Set(categories.map((c) => c.id));
    const fallbackId = categories[0]?.id || 'general';
    const allComments = await db.comments.toArray();
    const orphaned = allComments.filter((c) => !validIds.has(c.category));
    await rec.bulkPut(
      'comments',
      orphaned.map((c) => ({
        ...c,
        category: fallbackId,
        updatedAt: now,
      }))
    );
  });
}

export async function saveCustomCommentFields(
  fields: CustomFieldDefinition[]
): Promise<void> {
  await commandDispatcher.execute('Save custom comment fields', async (rec) => {
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

    await rec.update('config', 'singleton', {
      customCommentFields: fields,
      ...(nextScanner ? { tabletScannerConfig: nextScanner } : {}),
      updatedAt: Date.now(),
    });
  });
}

export async function saveTabletScannerConfig(
  tabletScannerConfig: TabletScannerConfig
): Promise<void> {
  await commandDispatcher.execute('Save tablet scanner config', async (rec) => {
    await rec.update('config', 'singleton', {
      tabletScannerConfig,
      updatedAt: Date.now(),
    });
  });
}

export async function saveSeamlessCaptureConfig(
  seamlessCaptureConfig: SeamlessCaptureConfig
): Promise<void> {
  await commandDispatcher.execute('Save seamless capture config', async (rec) => {
    await rec.update('config', 'singleton', {
      seamlessCaptureConfig,
      updatedAt: Date.now(),
    });
  });
}

export async function addCustomFieldOption(
  fieldId: string,
  optionValue: string
): Promise<void> {
  const clean = optionValue.trim();
  if (!clean) return;

  await commandDispatcher.execute('Add custom field option', async (rec) => {
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

    await rec.update('config', 'singleton', {
      customCommentFields: updatedFields,
      updatedAt: Date.now(),
    });
  });
}

export async function updateCustomFieldOptions(
  fieldId: string,
  nextOptions: string[],
  renamedOrDeleted?: { oldName: string; newName: string }
): Promise<void> {
  const now = Date.now();
  await commandDispatcher.execute('Update custom field options', async (rec) => {
    const config = await db.config.get('singleton');
    if (!config) return;

    const updatedFields = config.customCommentFields.map((field) =>
      field.id === fieldId ? { ...field, options: nextOptions } : field
    );

    await rec.update('config', 'singleton', {
      customCommentFields: updatedFields,
      updatedAt: now,
    });

    if (renamedOrDeleted && renamedOrDeleted.oldName !== renamedOrDeleted.newName) {
      const allComments = await db.comments.toArray();
      const affected = allComments.filter(
        (c) => c.customFields?.[fieldId] === renamedOrDeleted.oldName
      );
      await rec.bulkPut(
        'comments',
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
  });
}

// ============================================================================
// 7. DATABASE RESET
// ============================================================================

/**
 * Resets the entire database back to a clean, spoiler-free blank playthrough.
 * This is a whole-database replacement, so undo/redo history is cleared.
 */
export async function resetToBlankPlaythrough(): Promise<string> {
  const { map, cells } = createBlankInitialMap();
  const config = createDefaultProjectConfig();

  await commandDispatcher.replaceDatabase(() =>
    db.transaction('rw', allTables(), async () => {
      await db.maps.clear();
      await db.cells.clear();
      await db.comments.clear();
      await db.sketches.clear();
      await db.blobs.clear();

      await db.config.put(config);
      await db.maps.put(map);
      await db.cells.bulkPut(cells);
    })
  );

  return map.id;
}
