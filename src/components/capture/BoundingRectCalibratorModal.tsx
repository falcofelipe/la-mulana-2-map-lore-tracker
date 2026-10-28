/**
 * BoundingRectCalibratorModal Component
 * -------------------------------------
 * Interactive visual crop-box selector that pops up:
 * 1. Automatically on the first Room or Tablet hotkey/gamepad capture (if uncalibrated), OR
 * 2. Anytime the user clicks "Calibrate Room Bounding Rect" / "Calibrate Tablet Bounding Rect" in Settings.
 *
 * Allows dragging a custom rectangle over a full-resolution game frame, choosing
 * quick presets (Full 16:9 Frame, Trim Top HUD Bar, Scan Mode Tablet Box), and
 * saving the normalized { x, y, width, height } rect for future 100% silent captures.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Crop,
  Check,
  X,
  RotateCcw,
  Maximize,
  ScanText,
  Monitor,
} from 'lucide-react';
import { NormalizedBoundingRect } from '../../types/models';
import {
  clampNormalizedRect,
  normalizedRectToPixels,
} from '../../utils/seamlessCapture';

interface BoundingRectCalibratorModalProps {
  mode: 'room' | 'tablet';
  frameBlob: Blob;
  initialRect?: NormalizedBoundingRect | null;
  isFirstTimePrompt?: boolean;
  onConfirmRect: (rect: NormalizedBoundingRect) => Promise<void> | void;
  onCancel: () => void;
}

const DEFAULT_FULL_RECT: NormalizedBoundingRect = {
  x: 0,
  y: 0,
  width: 1,
  height: 1,
};

/**
 * La-Mulana 2's top HUD bar occupies roughly the top ~9.5% of a 16:9 frame.
 */
const PRESET_ROOM_NO_HUD_RECT: NormalizedBoundingRect = {
  x: 0,
  y: 0.095,
  width: 1,
  height: 0.905,
};

/**
 * La-Mulana 2's Scan Mode tablet window (including Child/Race attribution header
 * and lower-right cyan diagram area) sits inside the top/bottom Scan Mode bars.
 */
const PRESET_TABLET_SCAN_BOX_RECT: NormalizedBoundingRect = {
  x: 0.015,
  y: 0.032,
  width: 0.97,
  height: 0.895,
};

export const BoundingRectCalibratorModal: React.FC<
  BoundingRectCalibratorModalProps
> = ({
  mode,
  frameBlob,
  initialRect,
  isFirstTimePrompt = false,
  onConfirmRect,
  onCancel,
}) => {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number }>({
    w: 1920,
    h: 1080,
  });

  const [rect, setRect] = useState<NormalizedBoundingRect>(() =>
    initialRect ? clampNormalizedRect(initialRect) : DEFAULT_FULL_RECT
  );

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(
    null
  );

  useEffect(() => {
    const url = URL.createObjectURL(frameBlob);
    setImageUrl(url);
    const img = new Image();
    img.onload = () => {
      setNaturalSize({
        w: img.naturalWidth || img.width || 1920,
        h: img.naturalHeight || img.height || 1080,
      });
    };
    img.src = url;
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [frameBlob]);

  const getRelativePoint = (clientX: number, clientY: number) => {
    const el = containerRef.current;
    if (!el) return { x: 0, y: 0 };
    const bounds = el.getBoundingClientRect();
    const x = Math.max(
      0,
      Math.min(1, (clientX - bounds.left) / Math.max(1, bounds.width))
    );
    const y = Math.max(
      0,
      Math.min(1, (clientY - bounds.top) / Math.max(1, bounds.height))
    );
    return { x, y };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const pt = getRelativePoint(e.clientX, e.clientY);
    setDragStart(pt);
    setRect({
      x: pt.x,
      y: pt.y,
      width: 0.02,
      height: 0.02,
    });
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStart) return;
    const pt = getRelativePoint(e.clientX, e.clientY);
    const x0 = Math.min(dragStart.x, pt.x);
    const y0 = Math.min(dragStart.y, pt.y);
    const x1 = Math.max(dragStart.x, pt.x);
    const y1 = Math.max(dragStart.y, pt.y);

    setRect(
      clampNormalizedRect({
        x: x0,
        y: y0,
        width: Math.max(0.02, x1 - x0),
        height: Math.max(0.02, y1 - y0),
      })
    );
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStart) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore if not captured
    }
    setDragStart(null);
  };

  const pixelReadout = normalizedRectToPixels(
    rect,
    naturalSize.w,
    naturalSize.h
  );

  const isRoom = mode === 'room';

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl max-w-5xl w-full max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center border ${
                isRoom
                  ? 'bg-amber-500/20 border-amber-500/40 text-amber-400'
                  : 'bg-cyan-500/20 border-cyan-500/40 text-cyan-400'
              }`}
            >
              {isRoom ? <Monitor size={17} /> : <ScanText size={17} />}
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <span>
                  {isRoom
                    ? 'Calibrate Room Screenshot Bounding Rect'
                    : 'Calibrate Tablet Screenshot Bounding Rect'}
                </span>
                {isFirstTimePrompt && (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 uppercase tracking-wider font-semibold">
                    First-Capture Setup
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-400">
                Click and drag on the game frame below to set the bounding box (or pick a preset). Future captures will use this region automatically!
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onCancel}
            className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800"
            title="Cancel"
          >
            <X size={16} />
          </button>
        </div>

        {/* Preset Toolbar & Pixel Readout */}
        <div className="px-5 py-2.5 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-slate-400 font-medium mr-1">Quick Presets:</span>
            <button
              type="button"
              onClick={() => setRect(DEFAULT_FULL_RECT)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-medium"
            >
              <Maximize size={12} className="text-amber-400" />
              <span>Full 16:9 Screen (100%)</span>
            </button>

            {isRoom ? (
              <button
                type="button"
                onClick={() => setRect(PRESET_ROOM_NO_HUD_RECT)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-500/15 hover:bg-amber-500/25 text-amber-200 border border-amber-500/40 font-medium"
              >
                <Crop size={12} className="text-amber-400" />
                <span>Trim Top HUD Bar (Bottom 90.5%)</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setRect(PRESET_TABLET_SCAN_BOX_RECT)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-200 border border-cyan-500/40 font-medium"
              >
                <ScanText size={12} className="text-cyan-400" />
                <span>Scan Mode Tablet Frame (Trim Scan Bars)</span>
              </button>
            )}

            {initialRect && (
              <button
                type="button"
                onClick={() => setRect(clampNormalizedRect(initialRect))}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-slate-950 hover:bg-slate-800 text-slate-400 border border-slate-800"
              >
                <RotateCcw size={11} />
                <span>Revert</span>
              </button>
            )}
          </div>

          <div className="font-mono text-[11px] text-slate-300 bg-slate-950 px-3 py-1 rounded border border-slate-800">
            Crop: <span className="text-amber-300">{pixelReadout.sw}×{pixelReadout.sh}px</span>{' '}
            at ({pixelReadout.sx}, {pixelReadout.sy})
          </div>
        </div>

        {/* Interactive Image Canvas Area */}
        <div className="flex-1 overflow-auto p-5 bg-slate-950 flex items-center justify-center select-none">
          {imageUrl && (
            <div
              ref={containerRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              className="relative inline-block max-w-full max-h-[62vh] cursor-crosshair border border-slate-700 rounded overflow-hidden shadow-xl"
            >
              <img
                src={imageUrl}
                alt="Game capture frame for calibration"
                draggable={false}
                className="block max-w-full max-h-[62vh] w-auto h-auto select-none pointer-events-none"
              />

              {/* Dimmed Backdrop Outside Selection */}
              <div
                style={{
                  left: `${rect.x * 100}%`,
                  top: `${rect.y * 100}%`,
                  width: `${rect.width * 100}%`,
                  height: `${rect.height * 100}%`,
                  boxShadow: '0 0 0 9999px rgba(2, 6, 23, 0.68)',
                }}
                className={`absolute pointer-events-none border-2 ${
                  isRoom
                    ? 'border-amber-400 bg-amber-400/5'
                    : 'border-cyan-400 bg-cyan-400/5'
                }`}
              >
                <div
                  className={`absolute -top-6 left-0 px-2 py-0.5 rounded text-[10px] font-mono font-bold whitespace-nowrap shadow ${
                    isRoom
                      ? 'bg-amber-400 text-slate-950'
                      : 'bg-cyan-400 text-slate-950'
                  }`}
                >
                  {isRoom ? 'ROOM CROP' : 'TABLET CROP'}: {pixelReadout.sw}×
                  {pixelReadout.sh}px ({Math.round(rect.width * 100)}% ×{' '}
                  {Math.round(rect.height * 100)}%)
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3 bg-slate-900 border-t border-slate-800 flex items-center justify-between gap-3 text-xs">
          <span className="text-slate-400">
            Tip: You can recalibrate or reset this bounding box anytime in{' '}
            <strong className="text-slate-200">Customize &amp; Backup → Seamless In-Game Capture</strong>.
          </span>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onCancel}
              className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onConfirmRect(clampNormalizedRect(rect))}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg font-bold text-slate-950 shadow ${
                isRoom
                  ? 'bg-amber-500 hover:bg-amber-400'
                  : 'bg-cyan-400 hover:bg-cyan-300'
              }`}
            >
              <Check size={15} />
              <span>
                {isFirstTimePrompt
                  ? 'Save Bounding Rect & Process Capture'
                  : 'Save Bounding Rect'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
