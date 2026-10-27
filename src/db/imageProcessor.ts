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

/**
 * Generates a stylized 16:9 retro ruin room placeholder WebP image for the optional Sample Dataset.
 */
export async function generateSampleRoomGraphic(
  title: string,
  subtitle: string,
  accentHex: string
): Promise<ProcessedImageResult> {
  const canvas = document.createElement('canvas');
  canvas.width = 960;
  canvas.height = 540;
  const ctx = canvas.getContext('2d')!;

  // Dark stone background gradient
  const grad = ctx.createLinearGradient(0, 0, 0, 540);
  grad.addColorStop(0, '#0f172a');
  grad.addColorStop(0.5, '#1e293b');
  grad.addColorStop(1, '#090d16');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 960, 540);

  // Ruin brick grid pattern
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.08)';
  ctx.lineWidth = 2;
  for (let y = 0; y < 540; y += 45) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(960, y);
    ctx.stroke();
    const offset = (y / 45) % 2 === 0 ? 0 : 45;
    for (let x = offset; x < 960; x += 90) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + 45);
      ctx.stroke();
    }
  }

  // Platforms & pillars
  ctx.fillStyle = '#334155';
  ctx.fillRect(0, 0, 960, 28);
  ctx.fillRect(0, 512, 960, 28);
  ctx.fillRect(0, 0, 28, 540);
  ctx.fillRect(932, 0, 28, 540);
  ctx.fillRect(140, 360, 680, 22);
  ctx.fillRect(220, 210, 520, 20);

  // Decorative accent border
  ctx.strokeStyle = accentHex;
  ctx.lineWidth = 3;
  ctx.strokeRect(36, 36, 888, 468);

  // Room banner text
  ctx.fillStyle = 'rgba(15, 23, 42, 0.78)';
  ctx.fillRect(280, 70, 400, 76);
  ctx.strokeStyle = accentHex;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(280, 70, 400, 76);

  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 24px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(title, 480, 106);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '15px sans-serif';
  ctx.fillText(subtitle, 480, 132);

  const blob: Blob = await new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b!), 'image/webp', 0.9)
  );

  return processAndStoreRoomScreenshot(blob);
}
