/**
 * Local Image Processor (WebP Compression & Thumbnail Pipeline)
 * -------------------------------------------------------------
 * Converts pasted (Ctrl+V) or uploaded screenshots into:
 * 1. High-resolution WebP (0.90 quality, up to 1920x1080) -> ~85-90% smaller than raw PNG
 * 2. Lightweight Macro-Grid Thumbnail WebP (0.80 quality, up to 480px wide) -> instant grid rendering
 */

import { ImageBlobRecord } from '../types/models';
import { db } from './database';

export interface ProcessedImageResult {
  fullBlobId: string;
  thumbBlobId: string;
  width: number;
  height: number;
}

/**
 * Loads a File or Blob into an HTMLImageElement for offscreen canvas processing.
 */
function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };
    img.src = url;
  });
}

/**
 * Renders an image onto an offscreen canvas at the target dimensions and exports as WebP.
 */
function renderToWebpBlob(
  img: HTMLImageElement,
  maxWidth: number,
  maxHeight: number,
  quality: number
): Promise<{ blob: Blob; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    let width = img.naturalWidth || img.width;
    let height = img.naturalHeight || img.height;

    if (width > maxWidth || height > maxHeight) {
      const ratio = Math.min(maxWidth / width, maxHeight / height);
      width = Math.round(width * ratio);
      height = Math.round(height * ratio);
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      reject(new Error('Failed to get 2D canvas context'));
      return;
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, width, height);

    canvas.toBlob(
      (resultBlob) => {
        if (!resultBlob) {
          reject(new Error('Failed to encode WebP blob'));
          return;
        }
        resolve({ blob: resultBlob, width, height });
      },
      'image/webp',
      quality
    );
  });
}

/**
 * Processes a room screenshot (from clipboard or file upload), stores both the
 * high-res 90% WebP and macro-grid thumbnail WebP in IndexedDB, and returns their IDs.
 */
export async function processAndStoreRoomScreenshot(
  sourceBlob: Blob
): Promise<ProcessedImageResult> {
  const img = await loadImageFromBlob(sourceBlob);
  const now = Date.now();

  const full = await renderToWebpBlob(img, 1920, 1080, 0.90);
  const thumb = await renderToWebpBlob(img, 480, 270, 0.80);

  const fullId = `img-full-${now}-${Math.random().toString(36).slice(2, 8)}`;
  const thumbId = `img-thumb-${now}-${Math.random().toString(36).slice(2, 8)}`;

  const fullRecord: ImageBlobRecord = {
    id: fullId,
    blob: full.blob,
    mimeType: 'image/webp',
    width: full.width,
    height: full.height,
    byteSize: full.blob.size,
    createdAt: now,
  };

  const thumbRecord: ImageBlobRecord = {
    id: thumbId,
    blob: thumb.blob,
    mimeType: 'image/webp',
    width: thumb.width,
    height: thumb.height,
    byteSize: thumb.blob.size,
    createdAt: now,
  };

  await db.blobs.bulkPut([fullRecord, thumbRecord]);

  return {
    fullBlobId: fullId,
    thumbBlobId: thumbId,
    width: full.width,
    height: full.height,
  };
}

/**
 * Processes and stores a single image attachment (for comments or sketches) as 90% WebP.
 */
export async function processAndStoreAttachmentImage(sourceBlob: Blob): Promise<string> {
  const img = await loadImageFromBlob(sourceBlob);
  const now = Date.now();
  const converted = await renderToWebpBlob(img, 1600, 1200, 0.90);

  const blobId = `img-att-${now}-${Math.random().toString(36).slice(2, 8)}`;
  await db.blobs.put({
    id: blobId,
    blob: converted.blob,
    mimeType: 'image/webp',
    width: converted.width,
    height: converted.height,
    byteSize: converted.blob.size,
    createdAt: now,
  });

  return blobId;
}

