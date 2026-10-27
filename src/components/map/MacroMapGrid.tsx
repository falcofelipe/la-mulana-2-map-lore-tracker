/**
 * MacroMapGrid Component
 * ----------------------
 * Renders the interactive 2D room grid for the active MapPage, including:
 * - Selected cell quick-action bar (inline Room Name edit, Paste/Upload image, Toggle X, Inspect)
 * - Layer visibility toggles (Pins, Arrows, Room Names, Coords, Resolved Pins)
 * - Zoom slider (50% to 200%)
 * - 4-Edge Grid Expansion / Shrink buttons (+Top, +Bottom, +Left, +Right)
 * - Excel-style column headers (A..Z) and row headers (1..N)
 */

import React, { useRef, useState } from 'react';
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Eye,
  EyeOff,
  Upload,
  Trash2,
  Maximize2,
  Ban,
  Plus,
  Minus,
  CheckCircle2,
  ClipboardPaste,
} from 'lucide-react';
import {
  CommentEntry,
  GridCell,
  MapLayerVisibility,
  MapPage,
  MarkerDefinition,
} from '../../types/models';
import { colIndexToLetter } from '../../utils/coordinates';
import { GridCellCard } from './GridCellCard';

interface MacroMapGridProps {
  map: MapPage;
  cells: GridCell[];
  comments: CommentEntry[];
  markerDefinitions: MarkerDefinition[];
  selectedCellId: string | null;
  inspectedCellId: string | null;
  layerVisibility: MapLayerVisibility;
  onToggleLayer: (layerKey: keyof MapLayerVisibility) => void;
  onSelectCell: (cellId: string) => void;
  onInspectCell: (cellId: string) => void;
  onToggleBlocked: (cellId: string) => void;
  onUpdateCellMetadata: (
    cellId: string,
    updates: Partial<Pick<GridCell, 'roomName' | 'isCompleted' | 'tags'>>
  ) => void;
  onUploadScreenshot: (cellId: string, file: Blob) => void;
  onClearScreenshot: (cellId: string) => void;
  onExpandGrid: (direction: 'top' | 'bottom' | 'left' | 'right') => void;
  onShrinkGrid: (direction: 'top' | 'bottom' | 'left' | 'right') => void;
}

export const MacroMapGrid: React.FC<MacroMapGridProps> = ({
  map,
  cells,
  comments,
  markerDefinitions,
  selectedCellId,
  inspectedCellId,
  layerVisibility,
  onToggleLayer,
  onSelectCell,
  onInspectCell,
  onToggleBlocked,
  onUpdateCellMetadata,
  onUploadScreenshot,
  onClearScreenshot,
  onExpandGrid,
  onShrinkGrid,
}) => {
  const [cellWidthPx, setCellWidthPx] = useState<number>(210);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const selectedCell = cells.find((c) => c.id === selectedCellId) || null;

  // Build fast lookup maps
  const cellLookup = new Map<string, GridCell>();
  for (const c of cells) {
    cellLookup.set(`${c.row}-${c.col}`, c);
  }

  const commentsByCellCoord = new Map<string, CommentEntry[]>();
  for (const comm of comments) {
    const list = commentsByCellCoord.get(comm.cellCoord) || [];
    list.push(comm);
    commentsByCellCoord.set(comm.cellCoord, list);
  }

  const markerDefsMap = new Map<string, MarkerDefinition>(
    markerDefinitions.map((d) => [d.id, d])
  );

  const handlePasteFromClipboardButton = async () => {
    if (!selectedCell) return;
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageType = item.types.find((t) => t.startsWith('image/'));
        if (imageType) {
          const blob = await item.getType(imageType);
          onUploadScreenshot(selectedCell.id, blob);
          return;
        }
      }
      alert('No image found on the clipboard. Take a screenshot (e.g., Win+Shift+S or PrtScn) and press Ctrl+V!');
    } catch {
      alert('Use Ctrl+V on your keyboard while a cell is selected to paste a screenshot directly.');
    }
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-slate-950">
      {/* SUB-TOOLBAR: SELECTED CELL CONTROLS + LAYER VISIBILITY + ZOOM */}
      <div className="bg-slate-900/70 border-b border-slate-800/80 px-4 py-2 flex flex-wrap items-center justify-between gap-3 shrink-0">
        {/* Selected Cell Quick Editor */}
        {selectedCell ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2 py-1 rounded bg-amber-500 text-slate-950 font-mono font-bold text-xs">
              {map.codePrefix} {selectedCell.coord}
            </span>

            <input
              type="text"
              value={selectedCell.roomName}
              onChange={(e) =>
                onUpdateCellMetadata(selectedCell.id, { roomName: e.target.value })
              }
              placeholder="Enter Room Name (e.g., Room of Generations)..."
              className="w-56 bg-slate-950 border border-slate-700 rounded-md px-2.5 py-1 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-400"
            />

            <button
              type="button"
              onClick={() => onInspectCell(selectedCell.id)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors"
            >
              <Maximize2 size={13} />
              <span>Inspect Room</span>
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
              title="Upload a 16:9 room screenshot from disk"
            >
              <Upload size={13} />
              <span>Upload</span>
            </button>

            <button
              type="button"
              onClick={handlePasteFromClipboardButton}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
              title="Paste screenshot from clipboard (or press Ctrl+V)"
            >
              <ClipboardPaste size={13} />
              <span>Paste (Ctrl+V)</span>
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file && selectedCell) {
                  onUploadScreenshot(selectedCell.id, file);
                }
                e.target.value = '';
              }}
            />

            <button
              type="button"
              onClick={() => onToggleBlocked(selectedCell.id)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs border transition-colors ${
                selectedCell.state === 'blocked_x'
                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
              }`}
              title="Mark/Unmark cell as unreachable 'X' (Keyboard shortcut: X)"
            >
              <Ban size={13} />
              <span>Blocked (X)</span>
            </button>

            <button
              type="button"
              onClick={() =>
                onUpdateCellMetadata(selectedCell.id, {
                  isCompleted: !selectedCell.isCompleted,
                })
              }
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs border transition-colors ${
                selectedCell.isCompleted
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-400 border-slate-700'
              }`}
              title="Toggle Room Completed badge"
            >
              <CheckCircle2 size={13} />
              <span>Done</span>
            </button>

            {selectedCell.screenshotBlobId && (
              <button
                type="button"
                onClick={() => onClearScreenshot(selectedCell.id)}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-slate-800 hover:bg-rose-950/60 text-slate-400 hover:text-rose-300 border border-slate-700 transition-colors"
                title="Clear screenshot image (preserves Room Name, Pins, and Comments)"
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        ) : (
          <div className="text-xs text-slate-400">
            Select any cell on the grid to paste a screenshot (<kbd className="px-1 py-0.5 bg-slate-800 rounded text-[10px]">Ctrl+V</kbd>), toggle blocked (<kbd className="px-1 py-0.5 bg-slate-800 rounded text-[10px]">X</kbd>), or double-click to inspect.
          </div>
        )}

        {/* Right Controls: Layer Toggles & Zoom */}
        <div className="flex items-center gap-3 ml-auto">
          {/* Layer Visibility Pills */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-md border border-slate-800 text-[11px]">
            {(
              [
                { key: 'showPins', label: 'Pins' },
                { key: 'showArrows', label: 'Arrows' },
                { key: 'showRoomNames', label: 'Names' },
                { key: 'showCoordBadges', label: 'Coords' },
                { key: 'showResolvedMarkers', label: 'Solved' },
              ] as { key: keyof MapLayerVisibility; label: string }[]
            ).map((item) => {
              const active = layerVisibility[item.key];
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => onToggleLayer(item.key)}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded transition-colors ${
                    active
                      ? 'bg-slate-800 text-amber-300 font-medium'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                  title={`Toggle ${item.label} layer on Macro Grid`}
                >
                  {active ? <Eye size={11} /> : <EyeOff size={11} />}
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>

          {/* Cell Zoom Controls */}
          <div className="flex items-center gap-1 bg-slate-950 px-2 py-1 rounded-md border border-slate-800 text-xs">
            <button
              type="button"
              onClick={() => setCellWidthPx((w) => Math.max(120, w - 30))}
              className="p-0.5 text-slate-400 hover:text-white"
              title="Zoom Out Grid"
            >
              <ZoomOut size={14} />
            </button>
            <span className="font-mono text-[11px] text-slate-300 w-12 text-center">
              {Math.round((cellWidthPx / 210) * 100)}%
            </span>
            <button
              type="button"
              onClick={() => setCellWidthPx((w) => Math.min(420, w + 30))}
              className="p-0.5 text-slate-400 hover:text-white"
              title="Zoom In Grid"
            >
              <ZoomIn size={14} />
            </button>
            <button
              type="button"
              onClick={() => setCellWidthPx(210)}
              className="p-0.5 text-slate-500 hover:text-slate-300 ml-0.5"
              title="Reset Zoom (100%)"
            >
              <RotateCcw size={12} />
            </button>
          </div>
        </div>
      </div>

      {/* SCROLLABLE 2D MAP CANVAS WITH 4-EDGE EXPAND CONTROLS */}
      <div className="flex-1 overflow-auto p-6">
        <div className="inline-flex flex-col items-center min-w-full">
          {/* TOP EDGE EXPAND / SHRINK BAR */}
          <div className="flex items-center gap-2 mb-3">
            <button
              type="button"
              onClick={() => onExpandGrid('top')}
              className="flex items-center gap-1 px-2.5 py-1 rounded text-[11px] bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-colors"
              title="Insert a new row at the top (automatically shifts existing row numbers & comment links)"
            >
              <Plus size={12} className="text-amber-400" />
              <span>Add Row Above</span>
            </button>
            {map.rows > 2 && (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm('Remove the top-most row (Row 1)?')) {
                    onShrinkGrid('top');
                  }
                }}
                className="flex items-center gap-1 px-2 py-1 rounded text-[11px] bg-slate-900/60 hover:bg-rose-950/50 text-slate-500 hover:text-rose-300 border border-slate-800/80 transition-colors"
                title="Remove top row"
              >
                <Minus size={12} />
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* LEFT EDGE EXPAND / SHRINK BAR */}
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={() => onExpandGrid('left')}
                className="flex flex-col items-center gap-1 px-1.5 py-2.5 rounded text-[11px] bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-colors"
                title="Insert a new column on the left (automatically shifts existing column letters & comment links)"
              >
                <Plus size={12} className="text-amber-400" />
                <span className="[writing-mode:vertical-rl] rotate-180">Add Col Left</span>
              </button>
              {map.cols > 2 && (
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('Remove the left-most column (Col A)?')) {
                      onShrinkGrid('left');
                    }
                  }}
                  className="p-1.5 rounded text-[11px] bg-slate-900/60 hover:bg-rose-950/50 text-slate-500 hover:text-rose-300 border border-slate-800/80 transition-colors"
                  title="Remove left-most column"
                >
                  <Minus size={12} />
                </button>
              )}
            </div>

            {/* MAIN EXCEL-STYLE COORDINATE GRID */}
            <div className="bg-slate-900/40 p-3 rounded-xl border border-slate-800/80 shadow-xl">
              {/* Column Letter Headers (A, B, C...) */}
              <div
                className="grid gap-2 mb-2"
                style={{
                  gridTemplateColumns: `36px repeat(${map.cols}, ${cellWidthPx}px)`,
                }}
              >
                <div className="flex items-center justify-center text-[10px] font-mono text-slate-500">
                  {map.codePrefix}
                </div>
                {Array.from({ length: map.cols }).map((_, colIdx) => (
                  <div
                    key={`col-header-${colIdx}`}
                    className="py-1 rounded bg-slate-900/90 border border-slate-800 text-center font-mono font-bold text-xs text-amber-400/90"
                  >
                    {colIndexToLetter(colIdx)}
                  </div>
                ))}
              </div>

              {/* Grid Rows */}
              <div className="flex flex-col gap-2">
                {Array.from({ length: map.rows }).map((_, rowIdx) => (
                  <div
                    key={`row-${rowIdx}`}
                    className="grid gap-2 items-center"
                    style={{
                      gridTemplateColumns: `36px repeat(${map.cols}, ${cellWidthPx}px)`,
                    }}
                  >
                    {/* Row Number Header (1, 2, 3...) */}
                    <div className="h-full flex items-center justify-center rounded bg-slate-900/90 border border-slate-800 font-mono font-bold text-xs text-amber-400/90">
                      {rowIdx + 1}
                    </div>

                    {/* Row Cells */}
                    {Array.from({ length: map.cols }).map((__, colIdx) => {
                      const cell = cellLookup.get(`${rowIdx}-${colIdx}`);
                      if (!cell) {
                        return (
                          <div
                            key={`missing-${rowIdx}-${colIdx}`}
                            className="aspect-video bg-slate-900/30 rounded border border-slate-800/40"
                          />
                        );
                      }

                      return (
                        <GridCellCard
                          key={cell.id}
                          cell={cell}
                          isSelected={cell.id === selectedCellId}
                          isInspected={cell.id === inspectedCellId}
                          cellComments={commentsByCellCoord.get(cell.coord) || []}
                          markerDefsMap={markerDefsMap}
                          layerVisibility={layerVisibility}
                          onSelectCell={onSelectCell}
                          onInspectCell={onInspectCell}
                          onToggleBlocked={onToggleBlocked}
                          onDropScreenshot={onUploadScreenshot}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            {/* RIGHT EDGE EXPAND / SHRINK BAR */}
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={() => onExpandGrid('right')}
                className="flex flex-col items-center gap-1 px-1.5 py-2.5 rounded text-[11px] bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-colors"
                title="Append a new column on the right"
              >
                <Plus size={12} className="text-amber-400" />
                <span className="[writing-mode:vertical-rl]">Add Col Right</span>
              </button>
              {map.cols > 2 && (
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('Remove the right-most column?')) {
                      onShrinkGrid('right');
                    }
                  }}
                  className="p-1.5 rounded text-[11px] bg-slate-900/60 hover:bg-rose-950/50 text-slate-500 hover:text-rose-300 border border-slate-800/80 transition-colors"
                  title="Remove right-most column"
                >
                  <Minus size={12} />
                </button>
              )}
            </div>
          </div>

          {/* BOTTOM EDGE EXPAND / SHRINK BAR */}
          <div className="flex items-center gap-2 mt-3">
            <button
              type="button"
              onClick={() => onExpandGrid('bottom')}
              className="flex items-center gap-1 px-2.5 py-1 rounded text-[11px] bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-colors"
              title="Append a new row at the bottom"
            >
              <Plus size={12} className="text-amber-400" />
              <span>Add Row Below</span>
            </button>
            {map.rows > 2 && (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm('Remove the bottom-most row?')) {
                    onShrinkGrid('bottom');
                  }
                }}
                className="flex items-center gap-1 px-2 py-1 rounded text-[11px] bg-slate-900/60 hover:bg-rose-950/50 text-slate-500 hover:text-rose-300 border border-slate-800/80 transition-colors"
                title="Remove bottom row"
              >
                <Minus size={12} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
