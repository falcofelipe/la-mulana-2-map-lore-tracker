/**
 * La-Mulana 2 Tablet Screenshot Scanner (OCR + Color Tagging + Drawing Detector)
 * ------------------------------------------------------------------------------
 * Client-side image analysis and OCR pipeline tailored specifically for
 * La-Mulana 2 "Scan Mode" screenshots:
 * 1. Detects whether a screenshot is a full 16:9 "Scan Mode" frame or a cropped snippet.
 * 2. Isolates and OCRs the optional upper-right Child / Race attribution header
 *    (e.g., "6th Child: Lokapala") so it never pollutes line 1 of the tablet text.
 * 3. Filters out background murals, watermarks, and cyan diagram squiggles before
 *    running Tesseract.js OCR on the tablet transcript.
 * 4. Samples original RGB pixels inside each OCR word bounding box to wrap green,
 *    red/coral, yellow, or cyan keywords in `{g:...}` / `{r:...}` highlight tags.
 * 5. Detects whether the lower tablet area contains a bright cyan diagram/drawing
 *    so the "Keep screenshot as attachment" checkbox can be auto-selected.
 */

import { createWorker, Worker } from 'tesseract.js';

export type DetectedWordColorTag = 'g' | 'r' | 'c' | 'y' | null;

export interface OcrWordBox {
  text: string;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

export interface OcrLineBox {
  text: string;
  words: OcrWordBox[];
}

export interface TabletScanResult {
  /** Formatted transcript (with optional `{g:...}` / `{r:...}` tags) */
  transcript: string;
  /** Upper-right attribution text if present (e.g. "6th Child: Lokapala") */
  headerText?: string;
  /** True if a cyan tablet drawing/diagram was detected below the text */
  hasDrawing: boolean;
  /** Raw count of bright cyan diagram pixels detected */
  drawingPixelCount: number;
}

/**
 * Classifies a single RGB pixel from a La-Mulana 2 tablet screenshot into
 * one of the foreground text colors, or `null` if it belongs to the navy
 * background, dark watermark, or cyan diagram drawing.
 */
export function classifyTextPixelColor(
  r: number,
  g: number,
  b: number
): 'white' | 'green' | 'red' | 'yellow' | 'cyan' | null {
  // 1. Green tablet keywords (e.g. "golden key": R~50-80, G~150-225, B~125-145)
  if (g >= 135 && g - r >= 50 && g >= b) {
    return 'green';
  }

  // 2. Red / Coral tablet keywords (e.g. "Jormungand": R~150-215, G~75-100, B~95-115)
  if (r >= 135 && r - g >= 45 && r >= b) {
    return 'red';
  }

  // 3. Yellow / Gold keywords
  if (r >= 165 && g >= 140 && b <= 115 && r - b >= 55) {
    return 'yellow';
  }

  // 4. Standard White / Light-Silver tablet text (R~140-255, G~145-255, B~155-255)
  // Excludes blue/cyan diagram pixels where (b - r) > 50.
  if (r >= 132 && g >= 138 && b >= 148 && b - r <= 48 && Math.abs(g - r) <= 40) {
    return 'white';
  }

  return null;
}

/**
 * Determines whether the image is a full-screen "Scan Mode" capture (with top
 * "Scan Mode" and bottom "Close Scan" dark UI bars) vs. a user-cropped region.
 */
export function detectScanModeLayout(
  rgba: Uint8ClampedArray,
  width: number,
  height: number
): {
  isFullScanFrame: boolean;
  bodyRect: { x0: number; y0: number; x1: number; y1: number };
  headerRect: { x0: number; y0: number; x1: number; y1: number } | null;
  drawingRect: { x0: number; y0: number; x1: number; y1: number };
} {
  const aspect = width / Math.max(1, height);
  let darkTopSamples = 0;
  let darkBottomSamples = 0;
  const sampleCount = 20;

  const topY = Math.floor(height * 0.015);
  const bottomY = Math.floor(height * 0.98);

  for (let i = 1; i <= sampleCount; i++) {
    const x = Math.floor((width * i) / (sampleCount + 1));
    const topIdx = (topY * width + x) * 4;
    const botIdx = (bottomY * width + x) * 4;

    if (
      rgba[topIdx] < 75 &&
      rgba[topIdx + 1] < 75 &&
      rgba[topIdx + 2] < 75
    ) {
      darkTopSamples++;
    }
    if (
      rgba[botIdx] < 75 &&
      rgba[botIdx + 1] < 75 &&
      rgba[botIdx + 2] < 75
    ) {
      darkBottomSamples++;
    }
  }

  const isFullScanFrame =
    aspect >= 1.45 &&
    aspect <= 2.05 &&
    darkTopSamples >= 14 &&
    darkBottomSamples >= 14;

  if (isFullScanFrame) {
    return {
      isFullScanFrame: true,
      bodyRect: {
        x0: Math.floor(width * 0.02),
        y0: Math.floor(height * 0.065),
        x1: Math.floor(width * 0.98),
        y1: Math.floor(height * 0.62),
      },
      headerRect: {
        x0: Math.floor(width * 0.52),
        y0: Math.floor(height * 0.038),
        x1: Math.floor(width * 0.955),
        y1: Math.floor(height * 0.082),
      },
      drawingRect: {
        x0: Math.floor(width * 0.34),
        y0: Math.floor(height * 0.34),
        x1: Math.floor(width * 0.96),
        y1: Math.floor(height * 0.92),
      },
    };
  }

  // Fallback for pre-cropped tablet snippets
  return {
    isFullScanFrame: false,
    bodyRect: {
      x0: 0,
      y0: 0,
      x1: width,
      y1: height,
    },
    headerRect: null,
    drawingRect: {
      x0: Math.floor(width * 0.25),
      y0: Math.floor(height * 0.3),
      x1: width,
      y1: height,
    },
  };
}

/**
 * Counts bright cyan diagram stroke pixels in the lower-right drawing area
 * of a tablet screenshot. Ignores the dark navy Yggdrasil watermark on the left.
 */
export function detectTabletDrawingInImageData(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  drawingRect: { x0: number; y0: number; x1: number; y1: number }
): { hasDrawing: boolean; cyanPixelCount: number } {
  let cyanPixelCount = 0;
  const x0 = Math.max(0, drawingRect.x0);
  const y0 = Math.max(0, drawingRect.y0);
  const x1 = Math.min(width, drawingRect.x1);
  const y1 = Math.min(height, drawingRect.y1);

  for (let y = y0; y < y1; y += 2) {
    for (let x = x0; x < x1; x += 2) {
      const idx = (y * width + x) * 4;
      const r = rgba[idx];
      const g = rgba[idx + 1];
      const b = rgba[idx + 2];

      // Cyan diagram glow has high Blue (>=145), medium-high Green (>=68), and low Red (<=110)
      if (b >= 145 && g >= 68 && b - r >= 95 && r <= 110) {
        cyanPixelCount++;
      }
    }
  }

  const areaSamples = Math.max(1, ((x1 - x0) / 2) * ((y1 - y0) / 2));
  const density = cyanPixelCount / areaSamples;

  // A genuine tablet drawing has at least 80 sampled cyan stroke pixels (or >0.35% density)
  const hasDrawing = cyanPixelCount >= 80 || density >= 0.0035;
  return { hasDrawing, cyanPixelCount };
}

/**
 * Creates a clean black-ink-on-white-background RGBA buffer for the main body
 * text region, stripping away the navy background, murals, and cyan drawings,
 * and masking out the top-right Child/Race attribution header box.
 */
export function preprocessBodyRegionForOcr(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  bodyRect: { x0: number; y0: number; x1: number; y1: number },
  headerMaskRect: { x0: number; y0: number; x1: number; y1: number } | null
): { data: Uint8ClampedArray; width: number; height: number } {
  const bw = Math.max(1, bodyRect.x1 - bodyRect.x0);
  const bh = Math.max(1, bodyRect.y1 - bodyRect.y0);
  const out = new Uint8ClampedArray(bw * bh * 4);
  out.fill(255);

  // Also mask out the circular crest icon in the top-right corner if full frame
  const maskX0 = headerMaskRect ? headerMaskRect.x0 : width + 1;
  const maskY1 = headerMaskRect ? headerMaskRect.y1 : -1;

  for (let y = 0; y < bh; y++) {
    const srcY = bodyRect.y0 + y;
    if (srcY >= height) continue;

    for (let x = 0; x < bw; x++) {
      const srcX = bodyRect.x0 + x;
      if (srcX >= width) continue;

      if (srcX >= maskX0 && srcY <= maskY1) {
        continue;
      }

      const srcIdx = (srcY * width + srcX) * 4;
      const r = rgba[srcIdx];
      const g = rgba[srcIdx + 1];
      const b = rgba[srcIdx + 2];

      const colorClass = classifyTextPixelColor(r, g, b);
      if (colorClass !== null) {
        const lum = Math.max(r, g, b);
        const ink = Math.max(0, Math.min(255, Math.round(255 - (lum - 110) * 1.85)));
        const dstIdx = (y * bw + x) * 4;
        out[dstIdx] = ink;
        out[dstIdx + 1] = ink;
        out[dstIdx + 2] = ink;
        out[dstIdx + 3] = 255;
      }
    }
  }

  return { data: out, width: bw, height: bh };
}

/**
 * Checks the upper-right header strip for Child/Race attribution text
 * (e.g. "6th Child: Lokapala") and produces a binarized buffer if present.
 */
export function preprocessHeaderRegionForOcr(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  headerRect: { x0: number; y0: number; x1: number; y1: number } | null
): {
  hasHeader: boolean;
  brightPixelCount: number;
  data?: Uint8ClampedArray;
  width: number;
  height: number;
} {
  if (!headerRect) {
    return { hasHeader: false, brightPixelCount: 0, width: 0, height: 0 };
  }

  const hw = Math.max(1, headerRect.x1 - headerRect.x0);
  const hh = Math.max(1, headerRect.y1 - headerRect.y0);
  const out = new Uint8ClampedArray(hw * hh * 4);
  out.fill(255);

  let brightPixelCount = 0;

  for (let y = 0; y < hh; y++) {
    const srcY = headerRect.y0 + y;
    if (srcY >= height) continue;

    for (let x = 0; x < hw; x++) {
      const srcX = headerRect.x0 + x;
      if (srcX >= width) continue;

      const srcIdx = (srcY * width + srcX) * 4;
      const r = rgba[srcIdx];
      const g = rgba[srcIdx + 1];
      const b = rgba[srcIdx + 2];

      // Upper-right child/race header is rendered in light silver-blue serif font
      if (r >= 125 && g >= 135 && b >= 155 && b - r <= 55) {
        brightPixelCount++;
        const lum = Math.max(r, g, b);
        const ink = Math.max(0, Math.min(255, Math.round(255 - (lum - 105) * 1.9)));
        const dstIdx = (y * hw + x) * 4;
        out[dstIdx] = ink;
        out[dstIdx + 1] = ink;
        out[dstIdx + 2] = ink;
        out[dstIdx + 3] = 255;
      }
    }
  }

  if (brightPixelCount < 35) {
    return { hasHeader: false, brightPixelCount, width: hw, height: hh };
  }

  return {
    hasHeader: true,
    brightPixelCount,
    data: out,
    width: hw,
    height: hh,
  };
}

/**
 * Samples the original screenshot pixels inside a recognized word's bounding box
 * to determine if the word is colored (green, red/coral, yellow, or cyan).
 */
export function detectWordColorFromSourceImage(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  wordBboxInBody: { x0: number; y0: number; x1: number; y1: number },
  bodyOffset: { x0: number; y0: number }
): DetectedWordColorTag {
  const x0 = Math.max(0, bodyOffset.x0 + Math.floor(wordBboxInBody.x0));
  const y0 = Math.max(0, bodyOffset.y0 + Math.floor(wordBboxInBody.y0));
  const x1 = Math.min(width, bodyOffset.x0 + Math.ceil(wordBboxInBody.x1));
  const y1 = Math.min(height, bodyOffset.y0 + Math.ceil(wordBboxInBody.y1));

  let greenCount = 0;
  let redCount = 0;
  let yellowCount = 0;
  let whiteCount = 0;

  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const idx = (y * width + x) * 4;
      const cls = classifyTextPixelColor(rgba[idx], rgba[idx + 1], rgba[idx + 2]);
      if (cls === 'green') greenCount++;
      else if (cls === 'red') redCount++;
      else if (cls === 'yellow') yellowCount++;
      else if (cls === 'white') whiteCount++;
    }
  }

  const totalTextPixels = greenCount + redCount + yellowCount + whiteCount;
  if (totalTextPixels < 5) return null;

  if (greenCount >= 5 && greenCount / totalTextPixels >= 0.25) return 'g';
  if (redCount >= 5 && redCount / totalTextPixels >= 0.25) return 'r';
  if (yellowCount >= 5 && yellowCount / totalTextPixels >= 0.25) return 'y';

  return null;
}

/**
 * Formats recognized OCR lines and words into a clean transcript, wrapping
 * colored words or multi-word phrases in `{g:...}` / `{r:...}` tags while
 * keeping trailing punctuation outside the tag.
 */
export function buildFormattedTranscriptFromOcrLines(
  lines: OcrLineBox[],
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  bodyOffset: { x0: number; y0: number },
  autoHighlightColoredText: boolean
): string {
  const formattedLines: string[] = [];

  for (const line of lines) {
    const validWords = (line.words || []).filter(
      (w) => w.text && w.text.trim().length > 0
    );
    if (validWords.length === 0) continue;

    // Group contiguous words with the same color tag unless separated by sentence punctuation
    const segments: {
      leadingPunct: string;
      coreText: string;
      trailingPunct: string;
      colorTag: DetectedWordColorTag;
    }[] = [];

    for (const word of validWords) {
      const raw = cleanOcrWordText(word.text.trim());
      if (!raw) continue;

      const match = /^([("'“‘[]*)(.*?)([.,!?;:)"'”’\]]*)$/.exec(raw);
      const leadingPunct = match ? match[1] : '';
      const coreText = match ? match[2] : raw;
      const trailingPunct = match ? match[3] : '';

      const colorTag =
        autoHighlightColoredText && coreText.length > 0
          ? detectWordColorFromSourceImage(
              rgba,
              width,
              height,
              word.bbox,
              bodyOffset
            )
          : null;

      const prev = segments[segments.length - 1];
      if (
        prev &&
        colorTag !== null &&
        prev.colorTag === colorTag &&
        !prev.trailingPunct &&
        !leadingPunct
      ) {
        prev.coreText = `${prev.coreText} ${coreText}`;
        prev.trailingPunct = trailingPunct;
      } else {
        segments.push({
          leadingPunct,
          coreText,
          trailingPunct,
          colorTag,
        });
      }
    }

    const lineStr = segments
      .map((seg) => {
        if (!seg.colorTag || !seg.coreText) {
          return `${seg.leadingPunct}${seg.coreText}${seg.trailingPunct}`;
        }
        return `${seg.leadingPunct}{${seg.colorTag}:${seg.coreText}}${seg.trailingPunct}`;
      })
      .join(' ')
      .trim();

    if (lineStr) {
      formattedLines.push(lineStr);
    }
  }

  return formattedLines.join('\n').trim();
}

/**
 * Normalizes minor OCR artifacts common in serif/sans-serif game fonts.
 */
export function cleanOcrWordText(word: string): string {
  return word
    .replace(/[|]/g, 'I')
    .replace(/’/g, "'")
    .replace(/‘/g, "'")
    .replace(/“|”/g, '"')
    .trim();
}

export function cleanHeaderText(raw: string): string {
  return raw
    .replace(/\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[.,:;~•\-_*]+|[.,:;~•\-_*]+$/g, '')
    .trim();
}

// ============================================================================
// BROWSER CANVAS + TESSERACT.JS WORKER EXECUTION
// ============================================================================

let sharedOcrWorkerPromise: Promise<Worker> | null = null;

async function getSharedOcrWorker(): Promise<Worker> {
  if (!sharedOcrWorkerPromise) {
    sharedOcrWorkerPromise = createWorker('eng').catch((err) => {
      sharedOcrWorkerPromise = null;
      throw err;
    });
  }
  return sharedOcrWorkerPromise;
}

function loadBlobToCanvas(blob: Blob): Promise<{
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  imageData: ImageData;
}> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not initialize 2D canvas context'));
        return;
      }
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      resolve({ canvas, ctx, imageData });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load screenshot image'));
    };
    img.src = url;
  });
}

function rgbaBufferToCanvas(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  scale = 1,
  padding = 12
): HTMLCanvasElement {
  const baseCanvas = document.createElement('canvas');
  baseCanvas.width = width;
  baseCanvas.height = height;
  const baseCtx = baseCanvas.getContext('2d')!;
  const imgData = new ImageData(new Uint8ClampedArray(data), width, height);
  baseCtx.putImageData(imgData, 0, 0);

  if (scale === 1 && padding === 0) {
    return baseCanvas;
  }

  const outCanvas = document.createElement('canvas');
  outCanvas.width = Math.round(width * scale) + padding * 2;
  outCanvas.height = Math.round(height * scale) + padding * 2;
  const outCtx = outCanvas.getContext('2d')!;
  outCtx.fillStyle = '#ffffff';
  outCtx.fillRect(0, 0, outCanvas.width, outCanvas.height);
  outCtx.imageSmoothingEnabled = true;
  outCtx.imageSmoothingQuality = 'high';
  outCtx.drawImage(
    baseCanvas,
    padding,
    padding,
    Math.round(width * scale),
    Math.round(height * scale)
  );
  return outCanvas;
}

/**
 * Full end-to-end scanner for a La-Mulana 2 tablet screenshot `Blob` or `File`.
 */
export async function scanTabletScreenshot(
  imageBlob: Blob,
  options?: {
    autoHighlightColoredText?: boolean;
    extractHeader?: boolean;
  }
): Promise<TabletScanResult> {
  const autoHighlight = options?.autoHighlightColoredText ?? true;
  const shouldExtractHeader = options?.extractHeader ?? true;

  const { imageData } = await loadBlobToCanvas(imageBlob);
  const { data: rgba, width, height } = imageData;

  const layout = detectScanModeLayout(rgba, width, height);

  // 1. Detect whether the tablet has a cyan drawing
  const drawingCheck = detectTabletDrawingInImageData(
    rgba,
    width,
    height,
    layout.drawingRect
  );

  // 2. Preprocess main body region
  const bodyPre = preprocessBodyRegionForOcr(
    rgba,
    width,
    height,
    layout.bodyRect,
    layout.headerRect
  );
  const bodyPadding = 12;
  const bodyCanvas = rgbaBufferToCanvas(
    bodyPre.data,
    bodyPre.width,
    bodyPre.height,
    1,
    bodyPadding
  );

  const worker = await getSharedOcrWorker();

  // Request both `text` and `blocks` so word bounding boxes are populated in Tesseract.js v7
  const bodyOcrRes = await worker.recognize(
    bodyCanvas,
    {},
    { text: true, blocks: true }
  );

  const extractedLines: OcrLineBox[] = [];
  if (bodyOcrRes.data.blocks) {
    for (const block of bodyOcrRes.data.blocks) {
      for (const para of block.paragraphs || []) {
        for (const line of para.lines || []) {
          extractedLines.push({
            text: line.text,
            words: (line.words || []).map((w) => ({
              text: w.text,
              bbox: {
                x0: w.bbox.x0 - bodyPadding,
                y0: w.bbox.y0 - bodyPadding,
                x1: w.bbox.x1 - bodyPadding,
                y1: w.bbox.y1 - bodyPadding,
              },
            })),
          });
        }
      }
    }
  }

  let transcript = '';
  if (extractedLines.length > 0) {
    transcript = buildFormattedTranscriptFromOcrLines(
      extractedLines,
      rgba,
      width,
      height,
      { x0: layout.bodyRect.x0, y0: layout.bodyRect.y0 },
      autoHighlight
    );
  } else if (bodyOcrRes.data.text) {
    transcript = bodyOcrRes.data.text.trim();
  }

  // 3. Optionally extract upper-right Child / Race header if bright text pixels exist there
  let headerText: string | undefined;
  if (shouldExtractHeader && layout.headerRect) {
    const hdrPre = preprocessHeaderRegionForOcr(
      rgba,
      width,
      height,
      layout.headerRect
    );
    if (hdrPre.hasHeader && hdrPre.data) {
      const hdrCanvas = rgbaBufferToCanvas(
        hdrPre.data,
        hdrPre.width,
        hdrPre.height,
        3,
        16
      );
      const hdrOcrRes = await worker.recognize(
        hdrCanvas,
        {},
        { text: true }
      );
      const cleaned = cleanHeaderText(hdrOcrRes.data.text || '');
      if (cleaned.length >= 2) {
        headerText = cleaned;
      }
    }
  }

  return {
    transcript,
    headerText,
    hasDrawing: drawingCheck.hasDrawing,
    drawingPixelCount: drawingCheck.cyanPixelCount,
  };
}
