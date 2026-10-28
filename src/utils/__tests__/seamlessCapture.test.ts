import { describe, expect, it } from 'vitest';
import {
  clampNormalizedRect,
  isFullFrameRect,
  isGamepadComboPressed,
  normalizedRectToPixels,
  parseGamepadComboButtons,
  routeTabletScanToCommentFields,
} from '../seamlessCapture';
import { CustomFieldDefinition, TabletScannerConfig } from '../../types/models';

describe('Seamless Capture & Bounding Rect Utilities', () => {
  it('clamps normalized bounding rectangles to valid [0, 1] bounds', () => {
    const clamped = clampNormalizedRect({
      x: -0.2,
      y: 0.1,
      width: 1.5,
      height: 0.95,
    });
    expect(clamped.x).toBe(0);
    expect(clamped.y).toBe(0.1);
    expect(clamped.width).toBe(1);
    expect(clamped.height).toBe(0.9);
  });

  it('converts normalized bounding rects into exact pixel coordinates', () => {
    const px = normalizedRectToPixels(
      { x: 0, y: 0.095, width: 1, height: 0.905 },
      1920,
      1080
    );
    expect(px.sx).toBe(0);
    expect(px.sy).toBe(103);
    expect(px.sw).toBe(1920);
    expect(px.sh).toBe(977);
  });

  it('detects full-frame rects so unnecessary cropping can be skipped', () => {
    expect(isFullFrameRect(null)).toBe(true);
    expect(isFullFrameRect({ x: 0, y: 0, width: 1, height: 1 })).toBe(true);
    expect(
      isFullFrameRect({ x: 0, y: 0.095, width: 1, height: 0.905 })
    ).toBe(false);
  });

  it('parses and evaluates standard Gamepad button combinations', () => {
    const indices = parseGamepadComboButtons('Select+R1');
    expect(indices).toEqual([8, 5]);

    const l3r3 = parseGamepadComboButtons('L3 + R3');
    expect(l3r3).toEqual([10, 11]);

    const mockButtons = Array.from({ length: 16 }, (_, i) => ({
      pressed: i === 8 || i === 5,
    }));

    expect(isGamepadComboPressed(mockButtons, 'Select+R1')).toBe(true);
    expect(isGamepadComboPressed(mockButtons, 'Select+L1')).toBe(false);
  });

  it('routes TabletScanResult fields according to TabletScannerConfig', () => {
    const customFields: CustomFieldDefinition[] = [
      {
        id: 'cf-child',
        name: 'Child / Race',
        type: 'select',
        options: ['1st Child: Dalru'],
        showInTable: true,
        filterable: true,
      },
    ];

    const config: TabletScannerConfig = {
      headerTargetMode: 'custom_field',
      targetCustomFieldId: 'cf-child',
      autoHighlightColoredText: true,
      autoKeepAttachmentOnDrawing: true,
    };

    const routed = routeTabletScanToCommentFields(
      {
        transcript: 'Offer the {g:golden key} to {r:Jormungand}.',
        headerText: '6th Child: Lokapala',
        hasDrawing: true,
        drawingPixelCount: 410,
      },
      config,
      customFields
    );

    expect(routed.content).toBe('Offer the {g:golden key} to {r:Jormungand}.');
    expect(routed.customFields).toEqual({
      'cf-child': '6th Child: Lokapala',
    });
    expect(routed.newOptionToEnsure).toEqual({
      fieldId: 'cf-child',
      value: '6th Child: Lokapala',
    });
    expect(routed.keepAttachment).toBe(true);
  });
});
