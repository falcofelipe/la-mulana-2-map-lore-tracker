/**
 * Seamless Capture & Cropping Utilities
 * -------------------------------------
 * Shared, pure/browser-compatible utilities for:
 * 1. Validating and clamping NormalizedBoundingRect (0..1 coordinates).
 * 2. Cropping a Blob or HTMLVideoElement frame to a NormalizedBoundingRect.
 * 3. Auto-classifying whether a screenshot is a La-Mulana 2 "Scan Mode" tablet
 *    or a standard room screenshot (used by the Steam screenshot folder watcher).
 * 4. Routing a scanned TabletScanResult into a CommentEntry payload according to
 *    the user's TabletScannerConfig.
 * 5. Parsing and matching Gamepad button combinations (e.g., "Select+R1", "L3+R3").
 */

import {
  CustomFieldDefinition,
  NormalizedBoundingRect,
  TabletScannerConfig,
} from '../types/models';
import { DEFAULT_TABLET_SCANNER_CONFIG } from '../config/defaultDefinitions';
import {
  detectScanModeLayout,
  TabletScanResult,
} from './tabletScanner';

/**
 * Ensures a normalized bounding rectangle stays within [0, 1] bounds and has
 * a minimum non-zero width and height.
 */
export function clampNormalizedRect(
  rect: NormalizedBoundingRect
): NormalizedBoundingRect {
  const x = Math.max(0, Math.min(0.98, Number.isFinite(rect.x) ? rect.x : 0));
  const y = Math.max(0, Math.min(0.98, Number.isFinite(rect.y) ? rect.y : 0));
  const maxW = 1 - x;
  const maxH = 1 - y;
  const width = Math.max(
    0.02,
    Math.min(maxW, Number.isFinite(rect.width) ? rect.width : maxW)
  );
  const height = Math.max(
    0.02,
    Math.min(maxH, Number.isFinite(rect.height) ? rect.height : maxH)
  );
  return {
    x: Number(x.toFixed(4)),
    y: Number(y.toFixed(4)),
    width: Number(width.toFixed(4)),
    height: Number(height.toFixed(4)),
  };
}

/**
 * Converts a normalized bounding rect (0..1) into integer pixel coordinates
 * for a given source image width and height.
 */
export function normalizedRectToPixels(
  rect: NormalizedBoundingRect,
  sourceWidth: number,
  sourceHeight: number
): { sx: number; sy: number; sw: number; sh: number } {
  const clamped = clampNormalizedRect(rect);
  const sx = Math.max(0, Math.round(clamped.x * sourceWidth));
  const sy = Math.max(0, Math.round(clamped.y * sourceHeight));
  const sw = Math.max(
    1,
    Math.min(sourceWidth - sx, Math.round(clamped.width * sourceWidth))
  );
  const sh = Math.max(
    1,
    Math.min(sourceHeight - sy, Math.round(clamped.height * sourceHeight))
  );
  return { sx, sy, sw, sh };
}

/**
 * Checks whether a NormalizedBoundingRect is effectively the entire frame (no crop needed).
 */
export function isFullFrameRect(
  rect?: NormalizedBoundingRect | null
): boolean {
  if (!rect) return true;
  return (
    rect.x <= 0.002 &&
    rect.y <= 0.002 &&
    rect.width >= 0.996 &&
    rect.height >= 0.996
  );
}

/**
 * Loads an image Blob and crops it to `rect` using an HTML5 canvas, returning a PNG Blob.
 * If `rect` is null/undefined or covers the full frame, returns `sourceBlob` directly.
 */
export async function cropImageBlobToRect(
  sourceBlob: Blob,
  rect?: NormalizedBoundingRect | null
): Promise<Blob> {
  if (!rect || isFullFrameRect(rect)) {
    return sourceBlob;
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(sourceBlob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const srcW = img.naturalWidth || img.width;
      const srcH = img.naturalHeight || img.height;
      const { sx, sy, sw, sh } = normalizedRectToPixels(rect, srcW, srcH);

      const canvas = document.createElement('canvas');
      canvas.width = sw;
      canvas.height = sh;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not initialize 2D canvas for cropping'));
        return;
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

      canvas.toBlob((croppedBlob) => {
        if (!croppedBlob) {
          reject(new Error('Failed to encode cropped image blob'));
          return;
        }
        resolve(croppedBlob);
      }, 'image/png');
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to decode source image for cropping'));
    };
    img.src = url;
  });
}

/**
 * Captures the current frame from a live `HTMLVideoElement` (e.g. `getDisplayMedia` stream)
 * as a full-frame PNG Blob.
 */
export async function captureVideoFrameAsBlob(
  videoEl: HTMLVideoElement
): Promise<Blob> {
  const width = videoEl.videoWidth;
  const height = videoEl.videoHeight;
  if (!width || !height) {
    throw new Error('Live video stream is not ready or has ended.');
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not initialize 2D canvas for video capture');
  }

  ctx.drawImage(videoEl, 0, 0, width, height);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Failed to encode video frame blob'));
        return;
      }
      resolve(blob);
    }, 'image/png');
  });
}

/**
 * Inspects a screenshot Blob to determine whether it is a La-Mulana 2 "Scan Mode"
 * tablet capture (dark top/bottom Scan Mode UI bars + navy tablet box) vs. a room screen.
 */
export async function classifyScreenshotMode(
  imageBlob: Blob
): Promise<'tablet' | 'room'> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(imageBlob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const width = img.naturalWidth || img.width;
      const height = img.naturalHeight || img.height;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve('room');
        return;
      }
      ctx.drawImage(img, 0, 0);
      const imgData = ctx.getImageData(0, 0, width, height);
      const layout = detectScanModeLayout(imgData.data, width, height);
      if (!layout.isFullScanFrame) {
        resolve('room');
        return;
      }

      // Also verify that the center of the screen has the characteristic dark navy
      // Scan Mode tablet box (high blue/dark navy consistency)
      let navySamples = 0;
      const samplePoints = [
        [0.25, 0.35],
        [0.5, 0.35],
        [0.75, 0.35],
        [0.25, 0.5],
        [0.5, 0.5],
        [0.75, 0.5],
        [0.5, 0.65],
      ];
      for (const [nx, ny] of samplePoints) {
        const px = Math.floor(width * nx);
        const py = Math.floor(height * ny);
        const idx = (py * width + px) * 4;
        const r = imgData.data[idx];
        const g = imgData.data[idx + 1];
        const b = imgData.data[idx + 2];
        // Scan Mode background is dark navy blue (B >= R, R < 95, G < 110, B between 25 and 160)
        if (b >= r && r < 95 && g < 115 && b >= 20 && b <= 165) {
          navySamples++;
        }
      }

      resolve(navySamples >= 4 ? 'tablet' : 'room');
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve('room');
    };
    img.src = url;
  });
}

/**
 * Pure helper that maps a `TabletScanResult` into comment fields based on
 * `TabletScannerConfig` (used by both the manual scanner bar and seamless hotkey capture).
 */
export function routeTabletScanToCommentFields(
  scanResult: TabletScanResult,
  scannerConfig: TabletScannerConfig = DEFAULT_TABLET_SCANNER_CONFIG,
  customCommentFields: CustomFieldDefinition[] = []
): {
  content: string;
  speakerOrTitle?: string;
  customFields?: Record<string, string>;
  newOptionToEnsure?: { fieldId: string; value: string };
  keepAttachment: boolean;
} {
  const effectiveConfig: TabletScannerConfig = {
    ...DEFAULT_TABLET_SCANNER_CONFIG,
    ...scannerConfig,
  };

  let speakerOrTitle: string | undefined;
  let customFields: Record<string, string> | undefined;
  let newOptionToEnsure: { fieldId: string; value: string } | undefined;
  let appendedHeaderNote: string | undefined;

  if (scanResult.headerText) {
    if (
      effectiveConfig.headerTargetMode === 'custom_field' &&
      effectiveConfig.targetCustomFieldId
    ) {
      const targetField = customCommentFields.find(
        (f) => f.id === effectiveConfig.targetCustomFieldId
      );
      if (targetField) {
        customFields = { [targetField.id]: scanResult.headerText };
        if (
          targetField.type === 'select' &&
          !(targetField.options || []).some(
            (o) => o.toLowerCase() === scanResult.headerText!.toLowerCase()
          )
        ) {
          newOptionToEnsure = {
            fieldId: targetField.id,
            value: scanResult.headerText,
          };
        }
      } else {
        speakerOrTitle = scanResult.headerText;
      }
    } else if (effectiveConfig.headerTargetMode === 'speaker_or_title') {
      speakerOrTitle = scanResult.headerText;
    } else if (effectiveConfig.headerTargetMode === 'append_content') {
      appendedHeaderNote = `[${scanResult.headerText}]`;
    }
  }

  let content = scanResult.transcript.trim();
  if (appendedHeaderNote) {
    content = content ? `${content}\n\n${appendedHeaderNote}` : appendedHeaderNote;
  }

  const keepAttachment = effectiveConfig.autoKeepAttachmentOnDrawing
    ? scanResult.hasDrawing
    : false;

  return {
    content,
    speakerOrTitle,
    customFields,
    newOptionToEnsure,
    keepAttachment,
  };
}

// ============================================================================
// GAMEPAD COMBO PARSING & MATCHING (STANDARD GAMEPAD MAPPING)
// ============================================================================

export const STANDARD_GAMEPAD_BUTTON_INDICES: Record<string, number> = {
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  L1: 4,
  LB: 4,
  R1: 5,
  RB: 5,
  L2: 6,
  LT: 6,
  R2: 7,
  RT: 7,
  SELECT: 8,
  BACK: 8,
  SHARE: 8,
  START: 9,
  OPTIONS: 9,
  L3: 10,
  LS: 10,
  R3: 11,
  RS: 11,
  DPADUP: 12,
  UP: 12,
  DPADDOWN: 13,
  DOWN: 13,
  DPADLEFT: 14,
  LEFT: 14,
  DPADRIGHT: 15,
  RIGHT: 15,
};

/**
 * Parses a human-readable gamepad combo string (e.g., "Select+R1" or "L3+R3")
 * into an array of standard W3C Gamepad button indices.
 */
export function parseGamepadComboButtons(combo: string): number[] {
  if (!combo || !combo.trim()) return [];
  const parts = combo
    .split('+')
    .map((p) => p.trim().toUpperCase().replace(/[\s_-]/g, ''))
    .filter(Boolean);

  const indices: number[] = [];
  for (const part of parts) {
    const idx = STANDARD_GAMEPAD_BUTTON_INDICES[part];
    if (idx !== undefined && !indices.includes(idx)) {
      indices.push(idx);
    }
  }
  return indices;
}

/**
 * Checks whether all buttons in `combo` are currently pressed on the given Gamepad.
 */
export function isGamepadComboPressed(
  buttons: readonly { pressed: boolean }[],
  combo: string
): boolean {
  const requiredIndices = parseGamepadComboButtons(combo);
  if (requiredIndices.length === 0) return false;
  return requiredIndices.every((idx) => Boolean(buttons[idx]?.pressed));
}

/**
 * Plays a subtle, non-intrusive confirmation chime using the Web Audio API
 * so the player knows a room or tablet screenshot was captured while in-game.
 */
export function playCaptureConfirmationChime(kind: 'room' | 'tablet'): void {
  try {
    if (typeof window === 'undefined') return;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    if (kind === 'room') {
      // Pleasant ascending 2-note chime for Room Capture
      osc.frequency.setValueAtTime(523.25, now); // C5
      osc.frequency.setValueAtTime(659.25, now + 0.08); // E5
    } else {
      // Crisp 3-note chime for Tablet OCR Capture
      osc.frequency.setValueAtTime(587.33, now); // D5
      osc.frequency.setValueAtTime(783.99, now + 0.07); // G5
      osc.frequency.setValueAtTime(987.77, now + 0.14); // B5
    }

    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.25);
    setTimeout(() => {
      ctx.close().catch(() => {});
    }, 350);
  } catch {
    // Ignore audio context errors if blocked
  }
}
