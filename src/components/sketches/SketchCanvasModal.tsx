/**
 * SketchCanvasModal Component
 * ---------------------------
 * Lightweight freehand drawing pad for sketching tablet symbols, mantra shapes,
 * or tree-root connections (like the Yggdrasil diagram in the original Excel sheet).
 * Exports drawings directly as WebP Blobs for attaching to comments or the Sketches tab.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  PenTool,
  Eraser,
  Undo2,
  Trash2,
  Check,
  X,
} from 'lucide-react';

interface SketchCanvasModalProps {
  initialTitle?: string;
  initialDescription?: string;
  showMetadataInputs?: boolean;
  onSave: (blob: Blob, title: string, description: string) => Promise<void>;
  onClose: () => void;
}

const PALETTE_COLORS = [
  { hex: '#f8fafc', label: 'Chalk White' },
  { hex: '#f59e0b', label: 'Amber Gold' },
  { hex: '#06b6d4', label: 'Portal Cyan' },
  { hex: '#22c55e', label: 'Root Green' },
  { hex: '#ef4444', label: 'Hazard Red' },
  { hex: '#a855f7', label: 'Sigil Purple' },
];

export const SketchCanvasModal: React.FC<SketchCanvasModalProps> = ({
  initialTitle = '',
  initialDescription = '',
  showMetadataInputs = false,
  onSave,
  onClose,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState('#f59e0b');
  const [lineWidth, setLineWidth] = useState(4);
  const [isEraser, setIsEraser] = useState(false);
  const [history, setHistory] = useState<ImageData[]>([]);
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [isSaving, setIsSaving] = useState(false);

  const fillBackground = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, width, height);

    // Subtle dot/grid lines for alignment
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.08)';
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    fillBackground(ctx, canvas.width, canvas.height);
    setHistory([ctx.getImageData(0, 0, canvas.width, canvas.height)]);
  }, []);

  const getCanvasPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.setPointerCapture(e.pointerId);
    setIsDrawing(true);
    const pt = getCanvasPoint(e);

    ctx.beginPath();
    ctx.moveTo(pt.x, pt.y);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = isEraser ? '#0f172a' : color;
    ctx.lineWidth = isEraser ? lineWidth * 4 : lineWidth;
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const pt = getCanvasPoint(e);
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();
  };

  const handlePointerUp = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
    setHistory((prev) => [...prev.slice(-19), snapshot]);
  };

  const handleUndo = () => {
    if (history.length <= 1) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const nextHistory = history.slice(0, -1);
    const previousState = nextHistory[nextHistory.length - 1];
    ctx.putImageData(previousState, 0, 0);
    setHistory(nextHistory);
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    fillBackground(ctx, canvas.width, canvas.height);
    const snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
    setHistory((prev) => [...prev, snapshot]);
  };

  const handleConfirmSave = async () => {
    const canvas = canvasRef.current;
    if (!canvas || isSaving) return;
    setIsSaving(true);

    canvas.toBlob(
      async (blob) => {
        if (blob) {
          await onSave(blob, title, description);
        }
        setIsSaving(false);
        onClose();
      },
      'image/webp',
      0.9
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl max-w-3xl w-full overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PenTool size={16} className="text-amber-400" />
            <h3 className="text-sm font-bold text-slate-100">
              Sketch Tablet Symbol / Lore Diagram
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded"
          >
            <X size={16} />
          </button>
        </div>

        {/* Optional Title & Description Inputs (for Global Sketches tab) */}
        {showMetadataInputs && (
          <div className="p-3 bg-slate-900/90 border-b border-slate-800 grid grid-cols-1 md:grid-cols-2 gap-2">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Sketch Title (e.g., Yggdrasil Roots & 3 Knots)..."
              className="bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-amber-400"
            />
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional notes or puzzle interpretation..."
              className="bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-amber-400"
            />
          </div>
        )}

        {/* Drawing Toolbar */}
        <div className="px-4 py-2 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
          {/* Color Swatches */}
          <div className="flex items-center gap-1.5">
            {PALETTE_COLORS.map((c) => (
              <button
                key={c.hex}
                type="button"
                onClick={() => {
                  setColor(c.hex);
                  setIsEraser(false);
                }}
                style={{ backgroundColor: c.hex }}
                className={`w-6 h-6 rounded-full border-2 transition-transform ${
                  !isEraser && color === c.hex
                    ? 'border-white scale-110 shadow'
                    : 'border-slate-950 opacity-80 hover:opacity-100'
                }`}
                title={c.label}
              />
            ))}

            <button
              type="button"
              onClick={() => setIsEraser(!isEraser)}
              className={`ml-2 flex items-center gap-1 px-2.5 py-1 rounded text-xs border transition-colors ${
                isEraser
                  ? 'bg-amber-500 text-slate-950 font-semibold border-amber-400'
                  : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
              }`}
            >
              <Eraser size={13} />
              <span>Eraser</span>
            </button>
          </div>

          {/* Brush Size & Undo / Clear */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <span>Size:</span>
              <input
                type="range"
                min={2}
                max={14}
                value={lineWidth}
                onChange={(e) => setLineWidth(Number(e.target.value))}
                className="w-20 accent-amber-400"
              />
            </div>

            <button
              type="button"
              onClick={handleUndo}
              disabled={history.length <= 1}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 border border-slate-700"
            >
              <Undo2 size={13} />
              <span>Undo</span>
            </button>

            <button
              type="button"
              onClick={handleClear}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-slate-800 hover:bg-rose-950/60 text-slate-300 hover:text-rose-300 border border-slate-700"
            >
              <Trash2 size={13} />
              <span>Clear</span>
            </button>
          </div>
        </div>

        {/* Drawing Canvas */}
        <div className="p-4 bg-slate-950 flex items-center justify-center">
          <canvas
            ref={canvasRef}
            width={800}
            height={450}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className="w-full aspect-video rounded-lg border border-slate-800 cursor-crosshair touch-none shadow-inner"
          />
        </div>

        {/* Footer */}
        <div className="px-4 py-3 bg-slate-950 border-t border-slate-800 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-md text-xs bg-slate-800 hover:bg-slate-700 text-slate-300"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirmSave}
            disabled={isSaving}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950"
          >
            <Check size={14} />
            <span>{isSaving ? 'Saving WebP...' : 'Save Sketch'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
