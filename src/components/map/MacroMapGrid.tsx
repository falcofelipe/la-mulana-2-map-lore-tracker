/**
 * MacroMapGrid Component
 * ----------------------
 * Renders the interactive 2D room grid for the active MapPage, including:
 * - Selected cell quick-action bar (inline Room Name edit, Paste/Upload image,
 *   1-click Doorway Passage toggles, Move/Swap Room mode, Toggle X, Inspect)
 * - Cross-Cell Map Grid Arrow drawing mode & SVG overlay (`map.gridArrows`)
 * - Layer visibility toggles (Pins, Arrows, Room Names, Coords, Resolved Pins)
 * - Zoom slider (50% to 200%)
 * - Outer 4-Edge Grid Expansion / Shrink buttons AND middle-of-grid Row/Column
 *   insert/delete controls on every Row & Column header
 * - Collapsible Map Connections ("Leads To / Entered From") & Map Sketches panel
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
  ArrowLeftRight,
  MoveUpRight,
  ArrowUp,
  ArrowRight,
  ArrowDown,
  ArrowLeft,
  X,
} from 'lucide-react';
import {
  CommentEntry,
  GridCell,
  MapGridArrow,
  MapLayerVisibility,
  MapPage,
  MarkerDefinition,
  PassageDirection,
  SketchNote,
} from '../../types/models';
import { colIndexToLetter } from '../../utils/coordinates';
import { GridCellCard } from './GridCellCard';
import { MapContextAndSketchesPanel } from './MapContextAndSketchesPanel';

const GRID_ARROW_COLORS = [
  { label: 'Cyan', hex: '#06b6d4' },
  { label: 'Green', hex: '#22c55e' },
  { label: 'Orange', hex: '#f97316' },
  { label: 'Gold', hex: '#eab308' },
  { label: 'Magenta', hex: '#ec4899' },
];

interface MacroMapGridProps {
  map: MapPage;
  maps: MapPage[];
  cells: GridCell[];
  allCells: GridCell[];
  comments: CommentEntry[];
  mapSketches: SketchNote[];
  markerDefinitions: MarkerDefinition[];
  selectedCellId: string | null;
  inspectedCellId: string | null;
  layerVisibility: MapLayerVisibility;
  onToggleLayer: (layerKey: keyof MapLayerVisibility) => void;
  onSelectMap: (mapId: string) => void;
  onJumpToRoom: (mapId: string, cellCoord: string) => void;
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
  onInsertRowAt: (rowIndex: number) => void;
  onInsertColAt: (colIndex: number) => void;
  onDeleteRowAt: (rowIndex: number) => void;
  onDeleteColAt: (colIndex: number) => void;
  onSwapOrMoveCells: (cellIdA: string, cellIdB: string) => Promise<void>;
  onToggleCellPassage: (
    cellId: string,
    direction: PassageDirection
  ) => Promise<void>;
  onAddMapGridArrow: (
    arrow: Omit<MapGridArrow, 'id'>
  ) => Promise<MapGridArrow>;
  onDeleteMapGridArrow: (arrowId: string) => Promise<void>;
  onToggleManualMapConnection: (targetMapId: string) => Promise<void>;
  onCreateSketch: (
    title: string,
    description: string,
    mapId?: string,
    imageBlob?: Blob
  ) => Promise<SketchNote>;
  onUpdateSketch: (
    sketchId: string,
    updates: Partial<Pick<SketchNote, 'title' | 'description' | 'mapId'>>,
    newImageBlob?: Blob
  ) => Promise<void>;
  onDeleteSketch: (sketchId: string) => Promise<void>;
}

export const MacroMapGrid: React.FC<MacroMapGridProps> = ({
  map,
  maps,
  cells,
  allCells,
  comments,
  mapSketches,
  markerDefinitions,
  selectedCellId,
  inspectedCellId,
  layerVisibility,
  onToggleLayer,
  onSelectMap,
  onJumpToRoom,
  onSelectCell,
  onInspectCell,
  onToggleBlocked,
  onUpdateCellMetadata,
  onUploadScreenshot,
  onClearScreenshot,
  onExpandGrid,
  onShrinkGrid,
  onInsertRowAt,
  onInsertColAt,
  onDeleteRowAt,
  onDeleteColAt,
  onSwapOrMoveCells,
  onToggleCellPassage,
  onAddMapGridArrow,
  onDeleteMapGridArrow,
  onToggleManualMapConnection,
  onCreateSketch,
  onUpdateSketch,
  onDeleteSketch,
}) => {
  const [cellWidthPx, setCellWidthPx] = useState<number>(210);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Move / Swap Cell Mode
  const [isMoveSwapMode, setIsMoveSwapMode] = useState(false);

  // Cross-Cell Map Grid Arrow Drawing Mode
  const [isGridArrowMode, setIsGridArrowMode] = useState(false);
  const [gridArrowStartCellId, setGridArrowStartCellId] = useState<
    string | null
  >(null);
  const [gridArrowColor, setGridArrowColor] = useState<string>(
    GRID_ARROW_COLORS[0].hex
  );
  const [gridArrowBidirectional, setGridArrowBidirectional] = useState(false);
  const [gridArrowDashed, setGridArrowDashed] = useState(false);

  const selectedCell = cells.find((c) => c.id === selectedCellId) || null;

  // Build fast lookup maps
  const cellLookup = new Map<string, GridCell>();
  const cellById = new Map<string, GridCell>();
  for (const c of cells) {
    cellLookup.set(`${c.row}-${c.col}`, c);
    cellById.set(c.id, c);
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
      alert(
        'No image found on the clipboard. Take a screenshot (e.g., Win+Shift+S or PrtScn) and press Ctrl+V!'
      );
    } catch {
      alert(
        'Use Ctrl+V on your keyboard while a cell is selected to paste a screenshot directly.'
      );
    }
  };

  const handleCellClick = async (clickedCellId: string) => {
    // 1. Cross-Cell Grid Arrow Drawing Mode
    if (isGridArrowMode) {
      if (!gridArrowStartCellId) {
        setGridArrowStartCellId(clickedCellId);
      } else if (gridArrowStartCellId === clickedCellId) {
        setGridArrowStartCellId(null);
      } else {
        await onAddMapGridArrow({
          fromCellId: gridArrowStartCellId,
          toCellId: clickedCellId,
          color: gridArrowColor,
          bidirectional: gridArrowBidirectional,
          dashed: gridArrowDashed,
        });
        setGridArrowStartCellId(null);
      }
      return;
    }

    // 2. Move / Swap Room Mode
    if (isMoveSwapMode && selectedCellId) {
      if (selectedCellId !== clickedCellId) {
        await onSwapOrMoveCells(selectedCellId, clickedCellId);
      }
      setIsMoveSwapMode(false);
      return;
    }

    // 3. Standard Cell Selection
    onSelectCell(clickedCellId);
  };

  const gridArrows = map.gridArrows || [];
  const rowHeightPx = Math.round((cellWidthPx * 9) / 16);

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-slate-950">
      {/* SUB-TOOLBAR: SELECTED CELL CONTROLS + GRID ARROW TOOL + LAYER VISIBILITY + ZOOM */}
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
                onUpdateCellMetadata(selectedCell.id, {
                  roomName: e.target.value,
                })
              }
              placeholder="Enter Room Name (e.g., Room of Generations)..."
              className="w-48 bg-slate-950 border border-slate-700 rounded-md px-2.5 py-1 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-400"
            />

            <button
              type="button"
              onClick={() => onInspectCell(selectedCell.id)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors"
            >
              <Maximize2 size={13} />
              <span>Inspect</span>
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
              title="Upload a 16:9 room screenshot from disk"
            >
              <Upload size={13} />
              <span>Upload</span>
            </button>

            <button
              type="button"
              onClick={handlePasteFromClipboardButton}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
              title="Paste screenshot from clipboard (or press Ctrl+V)"
            >
              <ClipboardPaste size={13} />
              <span>Paste</span>
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

            {/* 1-Click Cardinal Doorway / Passage Toggles */}
            <div
              className="flex items-center gap-0.5 bg-slate-950 px-1.5 py-0.5 rounded-md border border-slate-800"
              title="Toggle open doorway/passage indicators on cell borders (syncs with adjacent cell)"
            >
              <span className="text-[10px] text-slate-400 mr-1">Doors:</span>
              {(
                [
                  { dir: 'top', icon: ArrowUp, label: 'Top' },
                  { dir: 'right', icon: ArrowRight, label: 'Right' },
                  { dir: 'bottom', icon: ArrowDown, label: 'Bottom' },
                  { dir: 'left', icon: ArrowLeft, label: 'Left' },
                ] as {
                  dir: PassageDirection;
                  icon: React.FC<{ size?: number }>;
                  label: string;
                }[]
              ).map(({ dir, icon: Icon, label }) => {
                const isOpen = Boolean(selectedCell.openPassages?.[dir]);
                return (
                  <button
                    key={dir}
                    type="button"
                    onClick={() => onToggleCellPassage(selectedCell.id, dir)}
                    className={`p-1 rounded transition-colors ${
                      isOpen
                        ? 'bg-cyan-500/25 text-cyan-300 border border-cyan-500/40'
                        : 'text-slate-500 hover:text-slate-200'
                    }`}
                    title={`Toggle ${label} Doorway Passage`}
                  >
                    <Icon size={12} />
                  </button>
                );
              })}
            </div>

            {/* Move / Swap Cell Mode Button */}
            <button
              type="button"
              onClick={() => {
                setIsMoveSwapMode(!isMoveSwapMode);
                setIsGridArrowMode(false);
                setGridArrowStartCellId(null);
              }}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                isMoveSwapMode
                  ? 'bg-cyan-500 text-slate-950 border-cyan-400 font-bold shadow'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
              }`}
              title="Move or swap this room (screenshot, pins, and linked comments) with another cell on this map"
            >
              <ArrowLeftRight size={13} />
              <span>{isMoveSwapMode ? 'Click Target Cell...' : 'Move / Swap'}</span>
            </button>

            <button
              type="button"
              onClick={() => onToggleBlocked(selectedCell.id)}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs border transition-colors ${
                selectedCell.state === 'blocked_x'
                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
              }`}
              title="Mark/Unmark cell as unreachable 'X' (Keyboard shortcut: X)"
            >
              <Ban size={13} />
              <span>X</span>
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
            Select any cell on the grid to paste a screenshot (
            <kbd className="px-1 py-0.5 bg-slate-800 rounded text-[10px]">
              Ctrl+V
            </kbd>
            ), toggle blocked (
            <kbd className="px-1 py-0.5 bg-slate-800 rounded text-[10px]">
              X
            </kbd>
            ), or double-click to inspect.
          </div>
        )}

        {/* Right Controls: Cross-Cell Grid Arrow Tool + Layer Toggles + Zoom */}
        <div className="flex flex-wrap items-center gap-2.5 ml-auto">
          {/* Cross-Cell Grid Arrow Tool */}
          <div className="flex items-center gap-1.5 bg-slate-950 px-2 py-1 rounded-md border border-slate-800 text-xs">
            <button
              type="button"
              onClick={() => {
                setIsGridArrowMode(!isGridArrowMode);
                setGridArrowStartCellId(null);
                setIsMoveSwapMode(false);
              }}
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                isGridArrowMode
                  ? 'bg-cyan-500 text-slate-950 font-bold'
                  : 'text-slate-300 hover:text-white'
              }`}
              title="Draw a cross-cell arrow between two rooms on the Macro Map Grid"
            >
              <MoveUpRight size={12} />
              <span>
                {isGridArrowMode
                  ? gridArrowStartCellId
                    ? 'Click Target Cell...'
                    : 'Click Start Cell...'
                  : 'Grid Arrow'}
              </span>
            </button>

            {isGridArrowMode && (
              <>
                <div className="flex items-center gap-1 pl-1 border-l border-slate-800">
                  {GRID_ARROW_COLORS.map((c) => (
                    <button
                      key={c.hex}
                      type="button"
                      onClick={() => setGridArrowColor(c.hex)}
                      style={{ backgroundColor: c.hex }}
                      className={`w-3.5 h-3.5 rounded-full border ${
                        gridArrowColor === c.hex
                          ? 'border-white scale-110'
                          : 'border-transparent opacity-70'
                      }`}
                      title={c.label}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setGridArrowBidirectional(!gridArrowBidirectional)
                  }
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                    gridArrowBidirectional
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title="Toggle Bidirectional Arrow"
                >
                  ⇄ 2-Way
                </button>
                <button
                  type="button"
                  onClick={() => setGridArrowDashed(!gridArrowDashed)}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                    gridArrowDashed
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title="Toggle Dashed Line"
                >
                  Dashed
                </button>
              </>
            )}
          </div>

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

      {/* SCROLLABLE 2D MAP CANVAS WITH 4-EDGE & MIDDLE-OF-GRID EXPAND CONTROLS */}
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
                <span className="[writing-mode:vertical-rl] rotate-180">
                  Add Col Left
                </span>
              </button>
              {map.cols > 2 && (
                <button
                  type="button"
                  onClick={() => {
                    if (
                      window.confirm('Remove the left-most column (Col A)?')
                    ) {
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
              {/* Column Letter Headers (A, B, C...) with hover Insert/Delete Col buttons */}
              <div
                className="grid gap-2 mb-2"
                style={{
                  gridTemplateColumns: `42px repeat(${map.cols}, ${cellWidthPx}px)`,
                }}
              >
                <div className="flex items-center justify-center text-[10px] font-mono text-slate-500">
                  {map.codePrefix}
                </div>
                {Array.from({ length: map.cols }).map((_, colIdx) => {
                  const colLetter = colIndexToLetter(colIdx);
                  return (
                    <div
                      key={`col-header-${colIdx}`}
                      className="group/col relative py-1 px-1.5 rounded bg-slate-900/90 border border-slate-800 flex items-center justify-between font-mono font-bold text-xs text-amber-400/90"
                    >
                      <button
                        type="button"
                        onClick={() => onInsertColAt(colIdx)}
                        className="opacity-0 group-hover/col:opacity-100 px-1 rounded bg-slate-800 hover:bg-amber-500 text-slate-300 hover:text-slate-950 text-[10px] transition-opacity"
                        title={`Insert new column to the left of Col ${colLetter}`}
                      >
                        +L
                      </button>

                      <span>{colLetter}</span>

                      <div className="flex items-center gap-0.5 opacity-0 group-hover/col:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={() => onInsertColAt(colIdx + 1)}
                          className="px-1 rounded bg-slate-800 hover:bg-amber-500 text-slate-300 hover:text-slate-950 text-[10px]"
                          title={`Insert new column to the right of Col ${colLetter}`}
                        >
                          +R
                        </button>
                        {map.cols > 2 && (
                          <button
                            type="button"
                            onClick={() => {
                              if (
                                window.confirm(
                                  `Delete Column ${colLetter} and shift columns right of ${colLetter} left by 1?`
                                )
                              ) {
                                onDeleteColAt(colIdx);
                              }
                            }}
                            className="px-1 rounded bg-slate-800 hover:bg-rose-500 text-slate-400 hover:text-white text-[10px]"
                            title={`Delete Column ${colLetter}`}
                          >
                            ×
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Grid Body: Left Row Number Headers + Right Relative Cell Matrix & Cross-Cell SVG Overlay */}
              <div className="flex gap-2">
                {/* Row Number Headers (1, 2, 3...) with hover Insert/Delete Row buttons */}
                <div className="flex flex-col gap-2 w-[42px] shrink-0">
                  {Array.from({ length: map.rows }).map((_, rowIdx) => (
                    <div
                      key={`row-header-${rowIdx}`}
                      style={{ height: `${rowHeightPx}px` }}
                      className="group/row relative rounded bg-slate-900/90 border border-slate-800 flex flex-col items-center justify-between py-1 font-mono font-bold text-xs text-amber-400/90"
                    >
                      <button
                        type="button"
                        onClick={() => onInsertRowAt(rowIdx)}
                        className="opacity-0 group-hover/row:opacity-100 px-1 rounded bg-slate-800 hover:bg-amber-500 text-slate-300 hover:text-slate-950 text-[9px] leading-tight transition-opacity"
                        title={`Insert new row above Row ${rowIdx + 1}`}
                      >
                        +↑
                      </button>

                      <span>{rowIdx + 1}</span>

                      <div className="flex items-center gap-0.5 opacity-0 group-hover/row:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={() => onInsertRowAt(rowIdx + 1)}
                          className="px-1 rounded bg-slate-800 hover:bg-amber-500 text-slate-300 hover:text-slate-950 text-[9px] leading-tight"
                          title={`Insert new row below Row ${rowIdx + 1}`}
                        >
                          +↓
                        </button>
                        {map.rows > 2 && (
                          <button
                            type="button"
                            onClick={() => {
                              if (
                                window.confirm(
                                  `Delete Row ${
                                    rowIdx + 1
                                  } and shift rows below it up by 1?`
                                )
                              ) {
                                onDeleteRowAt(rowIdx);
                              }
                            }}
                            className="px-0.5 rounded bg-slate-800 hover:bg-rose-500 text-slate-400 hover:text-white text-[9px] leading-tight"
                            title={`Delete Row ${rowIdx + 1}`}
                          >
                            ×
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Relative Cell Grid + Cross-Cell SVG Arrow Overlay */}
                <div className="relative">
                  <div
                    className="grid gap-2"
                    style={{
                      gridTemplateColumns: `repeat(${map.cols}, ${cellWidthPx}px)`,
                    }}
                  >
                    {Array.from({ length: map.rows }).map((_, rowIdx) =>
                      Array.from({ length: map.cols }).map((__, colIdx) => {
                        const cell = cellLookup.get(`${rowIdx}-${colIdx}`);
                        if (!cell) {
                          return (
                            <div
                              key={`missing-${rowIdx}-${colIdx}`}
                              style={{ height: `${rowHeightPx}px` }}
                              className="bg-slate-900/30 rounded border border-slate-800/40"
                            />
                          );
                        }

                        const isPendingArrowStart =
                          isGridArrowMode && gridArrowStartCellId === cell.id;

                        return (
                          <div
                            key={cell.id}
                            className={
                              isPendingArrowStart
                                ? 'ring-2 ring-cyan-400 rounded-md'
                                : isMoveSwapMode && cell.id !== selectedCellId
                                ? 'hover:ring-2 hover:ring-cyan-400 rounded-md'
                                : ''
                            }
                          >
                            <GridCellCard
                              cell={cell}
                              isSelected={cell.id === selectedCellId}
                              isInspected={cell.id === inspectedCellId}
                              cellComments={
                                commentsByCellCoord.get(cell.coord) || []
                              }
                              markerDefsMap={markerDefsMap}
                              layerVisibility={layerVisibility}
                              onSelectCell={handleCellClick}
                              onInspectCell={onInspectCell}
                              onToggleBlocked={onToggleBlocked}
                              onDropScreenshot={onUploadScreenshot}
                            />
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Cross-Cell Map Grid Arrows SVG Overlay */}
                  {layerVisibility.showArrows && gridArrows.length > 0 && (
                    <svg
                      viewBox="0 0 1000 1000"
                      preserveAspectRatio="none"
                      className="absolute inset-0 w-full h-full pointer-events-none z-25"
                    >
                      <defs>
                        {gridArrows.map((arrow) => (
                          <React.Fragment key={`mdefs-${arrow.id}`}>
                            <marker
                              id={`marrow-end-${arrow.id}`}
                              viewBox="0 0 10 10"
                              refX="7"
                              refY="5"
                              markerWidth="5"
                              markerHeight="5"
                              orient="auto-start-reverse"
                            >
                              <path d="M 0 1 L 10 5 L 0 9 z" fill={arrow.color} />
                            </marker>
                            {arrow.bidirectional && (
                              <marker
                                id={`marrow-start-${arrow.id}`}
                                viewBox="0 0 10 10"
                                refX="7"
                                refY="5"
                                markerWidth="5"
                                markerHeight="5"
                                orient="auto-start-reverse"
                              >
                                <path
                                  d="M 0 1 L 10 5 L 0 9 z"
                                  fill={arrow.color}
                                />
                              </marker>
                            )}
                          </React.Fragment>
                        ))}
                      </defs>

                      {gridArrows.map((arrow) => {
                        const fromCell = cellById.get(arrow.fromCellId);
                        const toCell = cellById.get(arrow.toCellId);
                        if (!fromCell || !toCell) return null;

                        const x1 = ((fromCell.col + 0.5) / map.cols) * 1000;
                        const y1 = ((fromCell.row + 0.5) / map.rows) * 1000;
                        const x2 = ((toCell.col + 0.5) / map.cols) * 1000;
                        const y2 = ((toCell.row + 0.5) / map.rows) * 1000;

                        return (
                          <g key={arrow.id}>
                            <line
                              x1={x1}
                              y1={y1}
                              x2={x2}
                              y2={y2}
                              stroke="#020617"
                              strokeWidth={7}
                              strokeLinecap="round"
                            />
                            <line
                              x1={x1}
                              y1={y1}
                              x2={x2}
                              y2={y2}
                              stroke={arrow.color}
                              strokeWidth={3.5}
                              strokeLinecap="round"
                              strokeDasharray={arrow.dashed ? '10 7' : undefined}
                              markerEnd={`url(#marrow-end-${arrow.id})`}
                              markerStart={
                                arrow.bidirectional
                                  ? `url(#marrow-start-${arrow.id})`
                                  : undefined
                              }
                            />
                            {/* Clickable Hit Target to Delete Cross-Cell Arrow */}
                            <line
                              x1={x1}
                              y1={y1}
                              x2={x2}
                              y2={y2}
                              stroke="transparent"
                              strokeWidth={18}
                              className="pointer-events-auto cursor-pointer"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (
                                  window.confirm(
                                    `Delete cross-cell arrow between ${fromCell.coord} and ${toCell.coord}?`
                                  )
                                ) {
                                  onDeleteMapGridArrow(arrow.id);
                                }
                              }}
                            >
                              <title>
                                Cross-cell arrow ({fromCell.coord} ➔{' '}
                                {toCell.coord}) — Click to delete
                              </title>
                            </line>
                          </g>
                        );
                      })}
                    </svg>
                  )}
                </div>
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

      {/* COLLAPSIBLE MAP CONNECTIONS ("LEADS TO / ENTERED FROM") & MAP SKETCHES PANEL */}
      <MapContextAndSketchesPanel
        activeMap={map}
        maps={maps}
        allCells={allCells}
        mapSketches={mapSketches}
        onSelectMap={onSelectMap}
        onJumpToRoom={onJumpToRoom}
        onToggleManualMapConnection={onToggleManualMapConnection}
        onCreateSketch={onCreateSketch}
        onUpdateSketch={onUpdateSketch}
        onDeleteSketch={onDeleteSketch}
      />
    </div>
  );
};
