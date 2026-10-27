/**
 * ZIP Backup Export / Import Service (JSZip)
 * ------------------------------------------
 * Packages all relational tables (`config`, `maps`, `cells`, `comments`, `sketches`)
 * into `project-data.json` and writes every IndexedDB WebP image blob into an
 * `/images/` folder inside a single portable `.zip` archive.
 */

import JSZip from 'jszip';
import {
  CommentEntry,
  GridCell,
  ImageBlobRecord,
  MapPage,
  ProjectConfig,
  SketchNote,
} from '../types/models';
import { createDefaultProjectConfig } from '../config/defaultDefinitions';
import { db } from './database';

interface BackupJsonPayload {
  version: number;
  exportedAt: string;
  config: ProjectConfig;
  maps: MapPage[];
  cells: GridCell[];
  comments: CommentEntry[];
  sketches: SketchNote[];
  blobMeta: Omit<ImageBlobRecord, 'blob'>[];
}

/**
 * Builds and returns a compressed `.zip` Blob containing `project-data.json`
 * and all `/images/` binary blobs from IndexedDB.
 */
export async function buildBackupZipBlob(): Promise<Blob> {
  const zip = new JSZip();

  const [config, maps, cells, comments, sketches, blobs] = await Promise.all([
    db.config.get('singleton'),
    db.maps.orderBy('order').toArray(),
    db.cells.toArray(),
    db.comments.toArray(),
    db.sketches.toArray(),
    db.blobs.toArray(),
  ]);

  const payload: BackupJsonPayload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    config: config || createDefaultProjectConfig(),
    maps,
    cells,
    comments,
    sketches,
    blobMeta: blobs.map(({ blob: _b, ...meta }) => meta),
  };

  zip.file('project-data.json', JSON.stringify(payload, null, 2));

  const imagesFolder = zip.folder('images');
  if (imagesFolder) {
    for (const item of blobs) {
      const ext = item.mimeType === 'image/png' ? 'png' : 'webp';
      imagesFolder.file(`${item.id}.${ext}`, item.blob);
    }
  }

  return zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}

/**
 * Exports the entire IndexedDB database (JSON tables + WebP images) into a downloadable `.zip` file.
 */
export async function exportFullBackupZip(): Promise<void> {
  const zipBlob = await buildBackupZipBlob();

  const dateStamp = new Date().toISOString().slice(0, 10);
  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `la-mulana-2-tracker-backup-${dateStamp}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Imports a previously exported `.zip` backup archive and restores all maps,
 * cells, comments, custom settings, and WebP screenshot blobs into IndexedDB.
 */
export async function importFullBackupZip(
  file: Blob | ArrayBuffer | Uint8Array
): Promise<string | null> {
  const zip = await JSZip.loadAsync(file);
  const dataFile = zip.file('project-data.json');
  if (!dataFile) {
    throw new Error('Invalid backup archive: missing project-data.json');
  }

  const rawJson = await dataFile.async('string');
  const payload = JSON.parse(rawJson) as BackupJsonPayload;

  if (!payload || !Array.isArray(payload.maps) || !Array.isArray(payload.cells)) {
    throw new Error('Invalid backup JSON structure.');
  }

  const restoredBlobs: ImageBlobRecord[] = [];
  for (const meta of payload.blobMeta || []) {
    const ext = meta.mimeType === 'image/png' ? 'png' : 'webp';
    const imgEntry =
      zip.file(`images/${meta.id}.${ext}`) ||
      zip.file(`images/${meta.id}.webp`) ||
      zip.file(`images/${meta.id}.png`);
    if (imgEntry) {
      const rawBlob = await imgEntry.async('blob');
      const typedBlob = new Blob([rawBlob], {
        type: meta.mimeType || 'image/webp',
      });
      restoredBlobs.push({
        ...meta,
        blob: typedBlob,
      });
    }
  }

  await db.transaction(
    'rw',
    [db.config, db.maps, db.cells, db.comments, db.sketches, db.blobs],
    async () => {
      await db.config.clear();
      await db.maps.clear();
      await db.cells.clear();
      await db.comments.clear();
      await db.sketches.clear();
      await db.blobs.clear();

      await db.config.put(payload.config || createDefaultProjectConfig());
      await db.maps.bulkPut(payload.maps);
      await db.cells.bulkPut(payload.cells);
      await db.comments.bulkPut(payload.comments || []);
      await db.sketches.bulkPut(payload.sketches || []);
      if (restoredBlobs.length > 0) {
        await db.blobs.bulkPut(restoredBlobs);
      }
    }
  );

  return payload.maps[0]?.id || null;
}
