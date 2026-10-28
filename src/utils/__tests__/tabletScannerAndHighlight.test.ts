import { describe, expect, it } from 'vitest';
import {
  buildFormattedTranscriptFromOcrLines,
  classifyTextPixelColor,
  detectScanModeLayout,
  detectTabletDrawingInImageData,
  preprocessBodyRegionForOcr,
  preprocessHeaderRegionForOcr,
} from '../tabletScanner';
import { stripLoreColorTags } from '../textHighlight';

describe('Tablet Screenshot Scanner & Color Highlighting', () => {
  it('classifies La-Mulana 2 text pixel colors accurately while rejecting background and cyan drawings', () => {
    // Green keyword ("golden key": R=72, G=200, B=138)
    expect(classifyTextPixelColor(72, 200, 138)).toBe('green');
    // Red/coral keyword ("Jormungand": R=197, G=91, B=105)
    expect(classifyTextPixelColor(197, 91, 105)).toBe('red');
    // White body text (R=220, G=225, B=235)
    expect(classifyTextPixelColor(220, 225, 235)).toBe('white');
    // Yellow keyword
    expect(classifyTextPixelColor(225, 195, 70)).toBe('yellow');

    // Cyan tablet drawing pixel (R=28, G=95, B=198) -> should be rejected as non-text
    expect(classifyTextPixelColor(28, 95, 198)).toBeNull();
    // Dark navy background / watermark pixel (R=15, G=35, B=92) -> should be rejected
    expect(classifyTextPixelColor(15, 35, 92)).toBeNull();
  });

  it('detects full 16:9 Scan Mode layout and cyan tablet drawings', () => {
    const width = 400;
    const height = 225;
    const rgba = new Uint8ClampedArray(width * height * 4);

    // Fill with dark navy background (R=14, G=42, B=105)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        if (y < height * 0.035 || y > height * 0.94) {
          // Dark top/bottom Scan Mode UI bars
          rgba[idx] = 42;
          rgba[idx + 1] = 42;
          rgba[idx + 2] = 42;
          rgba[idx + 3] = 255;
        } else {
          rgba[idx] = 14;
          rgba[idx + 1] = 42;
          rgba[idx + 2] = 105;
          rgba[idx + 3] = 255;
        }
      }
    }

    const layout = detectScanModeLayout(rgba, width, height);
    expect(layout.isFullScanFrame).toBe(true);
    expect(layout.headerRect).not.toBeNull();

    // Without cyan drawing pixels, hasDrawing should be false
    const emptyCheck = detectTabletDrawingInImageData(
      rgba,
      width,
      height,
      layout.drawingRect
    );
    expect(emptyCheck.hasDrawing).toBe(false);

    // Paint a cluster of cyan drawing stroke pixels in the lower-right drawing area
    for (let y = 110; y < 160; y++) {
      for (let x = 200; x < 240; x++) {
        const idx = (y * width + x) * 4;
        rgba[idx] = 28;
        rgba[idx + 1] = 96;
        rgba[idx + 2] = 202;
      }
    }

    const drawingCheck = detectTabletDrawingInImageData(
      rgba,
      width,
      height,
      layout.drawingRect
    );
    expect(drawingCheck.hasDrawing).toBe(true);
    expect(drawingCheck.cyanPixelCount).toBeGreaterThan(80);
  });

  it('detects upper-right Child/Race header pixels and masks them from the main body', () => {
    const width = 400;
    const height = 225;
    const rgba = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < rgba.length; i += 4) {
      rgba[i] = 16;
      rgba[i + 1] = 48;
      rgba[i + 2] = 115;
      rgba[i + 3] = 255;
    }

    const headerRect = {
      x0: Math.floor(width * 0.52),
      y0: Math.floor(height * 0.038),
      x1: Math.floor(width * 0.955),
      y1: Math.floor(height * 0.082),
    };

    // Initially no header pixels
    expect(
      preprocessHeaderRegionForOcr(rgba, width, height, headerRect).hasHeader
    ).toBe(false);

    // Paint bright header text pixels inside headerRect
    for (let y = headerRect.y0 + 2; y < headerRect.y0 + 7; y++) {
      for (let x = headerRect.x0 + 20; x < headerRect.x0 + 35; x++) {
        const idx = (y * width + x) * 4;
        rgba[idx] = 210;
        rgba[idx + 1] = 220;
        rgba[idx + 2] = 240;
      }
    }

    const hdrRes = preprocessHeaderRegionForOcr(rgba, width, height, headerRect);
    expect(hdrRes.hasHeader).toBe(true);
    expect(hdrRes.brightPixelCount).toBeGreaterThanOrEqual(35);

    // Ensure preprocessBodyRegionForOcr masks out the header area
    const bodyRect = {
      x0: 10,
      y0: headerRect.y0,
      x1: width - 10,
      y1: 120,
    };
    const bodyRes = preprocessBodyRegionForOcr(
      rgba,
      width,
      height,
      bodyRect,
      headerRect
    );
    // All pixels in bodyRes should remain pure white (255) because the only bright pixels were inside headerRect
    let nonWhite = 0;
    for (let i = 0; i < bodyRes.data.length; i += 4) {
      if (bodyRes.data[i] < 255) nonWhite++;
    }
    expect(nonWhite).toBe(0);
  });

  it('wraps contiguous colored words in {g:...} and {r:...} tags while keeping punctuation outside', () => {
    const width = 200;
    const height = 60;
    const rgba = new Uint8ClampedArray(width * height * 4);

    // Helper to paint a box of color
    const paintBox = (
      x0: number,
      y0: number,
      x1: number,
      y1: number,
      r: number,
      g: number,
      b: number
    ) => {
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const idx = (y * width + x) * 4;
          rgba[idx] = r;
          rgba[idx + 1] = g;
          rgba[idx + 2] = b;
          rgba[idx + 3] = 255;
        }
      }
    };

    // Word 1: "The" (white) at x=5..25, y=5..15
    paintBox(5, 5, 25, 15, 230, 235, 240);
    // Word 2: "golden" (green) at x=30..60, y=5..15
    paintBox(30, 5, 60, 15, 72, 200, 138);
    // Word 3: "key." (green) at x=65..90, y=5..15
    paintBox(65, 5, 90, 15, 72, 200, 138);
    // Word 4: "Jormungand." (red) at x=95..150, y=5..15
    paintBox(95, 5, 150, 15, 197, 91, 105);

    const lines = [
      {
        text: 'The golden key. Jormungand.',
        words: [
          { text: 'The', bbox: { x0: 5, y0: 5, x1: 25, y1: 15 } },
          { text: 'golden', bbox: { x0: 30, y0: 5, x1: 60, y1: 15 } },
          { text: 'key.', bbox: { x0: 65, y0: 5, x1: 90, y1: 15 } },
          { text: 'Jormungand.', bbox: { x0: 95, y0: 5, x1: 150, y1: 15 } },
        ],
      },
    ];

    const formatted = buildFormattedTranscriptFromOcrLines(
      lines,
      rgba,
      width,
      height,
      { x0: 0, y0: 0 },
      true
    );

    expect(formatted).toBe('The {g:golden key}. {r:Jormungand}.');
    expect(stripLoreColorTags(formatted)).toBe('The golden key. Jormungand.');
  });
});
