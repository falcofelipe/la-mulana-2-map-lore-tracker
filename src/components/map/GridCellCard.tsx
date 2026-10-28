/**
 * GridCellCard Component
 * ----------------------
 * Renders a single 16:9 cell inside the Macro Map Grid.
 * Uses the lightweight WebP thumbnail blob for high-performance rendering
 * when viewing dozens of rooms simultaneously.
 */

import React, { useState } from 'react';
import {
  Maximize2,
  CheckCircle2,
  MessageSquare,
  ImagePlus,
  Ban,
} from 'lucide-react';
import {
  CommentEntry,
  GridCell,
  MapLayerVisibility,
  MarkerDefinition,
} from '../../types/models';
import { useBlobUrl } from '../../hooks/useBlobUrl';
import { MarkerIcon } from '../common/MarkerIcon';
import { VectorArrowSvg } from '../common/VectorArrowSvg';

interface GridCellCardProps {
  cell: GridCell;
  isSelected: boolean;
  isInspected: boolean;
  cellComments: CommentEntry[];
  markerDefsMap: Map<string, MarkerDefinition>;
  layerVisibility: MapLayerVisibility;
  onSelectCell: (cellId: string) => void;
  onInspectCell: (cellId: string) => void;
  onToggleBlocked: (cellId: string) => void;
  onDropScreenshot: (cellId: string, file: File) => void;
}

export const GridCellCard: React.FC<GridCellCardProps> = ({
  cell,
  isSelected,
  isInspected,
  cellComments,
  markerDefsMap,
  layerVisibility,
  onSelectCell,
  onInspectCell,
  onToggleBlocked,
  onDropScreenshot,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);

  // Prefer the lightweight thumbnail on the macro grid, falling back to full screenshot
  const bgUrl = useBlobUrl(cell.thumbnailBlobId || cell.screenshotBlobId);

  const unresolvedTodos = cellComments.filter(
    (c) => c.category === 'todo' && !c.resolved
  ).length;

  const visibleMarkers = cell.markers.filter((m) =>
    layerVisibility.showResolvedMarkers ? true : !m.resolved
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragOver) setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (file && file.type.startsWith('image/')) {
      onDropScreenshot(cell.id, file);
    }
  };

  return (
    <div
      onClick={() => onSelectCell(cell.id)}
      onDoubleClick={() => onInspectCell(cell.id)}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`group relative aspect-video w-full rounded-md overflow-hidden select-none cursor-pointer transition-all ${
        isInspected
          ? 'ring-2 ring-cyan-400 shadow-lg shadow-cyan-500/20 z-10'
          : isSelected
          ? 'ring-2 ring-amber-400 shadow-md shadow-amber-500/15 z-10'
          : cell.isCompleted
          ? 'border border-emerald-500/60 hover:border-emerald-400'
          : 'border border-slate-800 hover:border-slate-600'
      } ${
        isDragOver
          ? 'ring-2 ring-emerald-400 bg-emerald-950/40'
          : cell.state === 'blocked_x'
          ? 'bg-slate-950'
          : 'bg-slate-900/90'
      }`}
    >
      {/* 1. BLOCKED / OUT-OF-BOUNDS ('X') STATE */}
      {cell.state === 'blocked_x' ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="w-full h-full stroke-slate-800/90"
          >
            <line x1="0" y1="0" x2="100" y2="100" strokeWidth="1.5" />
            <line x1="100" y1="0" x2="0" y2="100" strokeWidth="1.5" />
          </svg>
          <span className="px-2 py-0.5 rounded bg-slate-950/90 border border-slate-800 text-slate-600 font-mono text-xs font-bold">
            X
          </span>
        </div>
      ) : (
        <>
          {/* 2. SCREENSHOT BACKGROUND OR EMPTY PLACEHOLDER */}
          {bgUrl ? (
            <img
              src={bgUrl}
              alt={cell.roomName || cell.coord}
              className="absolute inset-0 w-full h-full object-cover pointer-events-none"
              loading="lazy"
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-600 group-hover:text-slate-400 transition-colors p-2 text-center">
              {cell.roomName ? (
                <span className="text-xs font-medium text-slate-300 line-clamp-2 px-2">
                  {cell.roomName}
                </span>
              ) : (
                <div className="flex flex-col items-center gap-1 opacity-50 group-hover:opacity-90">
                  <ImagePlus size={16} />
                  <span className="text-[10px]">Paste / Drop 16:9</span>
                </div>
              )}
            </div>
          )}

          {/* 3. VECTOR ARROWS OVERLAY */}
          {layerVisibility.showArrows && cell.arrows.length > 0 && (
            <VectorArrowSvg arrows={cell.arrows} compact />
          )}

          {/* 4. PIN MARKERS OVERLAY */}
          {layerVisibility.showPins &&
            visibleMarkers.map((pin) => {
              const def = markerDefsMap.get(pin.typeId);
              const isBroken = pin.typeId === 'broken' || !def;
              const badgeText = isBroken
                ? pin.shortLabel || 'BROKEN'
                : pin.shortLabel;
              const showText =
                isBroken ||
                (badgeText && (def?.showShortLabelOnMacro ?? Boolean(badgeText)));

              return (
                <div
                  key={pin.id}
                  style={{
                    left: `${pin.xPercent}%`,
                    top: `${pin.yPercent}%`,
                  }}
                  title={`${isBroken ? 'BROKEN MARKER (Deleted Category)' : def?.name || 'Marker'}${
                    badgeText ? `: ${badgeText}` : ''
                  }${pin.notes ? ` — ${pin.notes}` : ''}`}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 z-20 flex items-center gap-0.5 pointer-events-none ${
                    pin.resolved ? 'opacity-45 grayscale' : ''
                  }`}
                >
                  <div
                    style={{ backgroundColor: isBroken ? '#ef4444' : pin.color }}
                    className={`w-4 h-4 rounded-full shadow-md flex items-center justify-center font-bold text-[9px] ${
                      isBroken
                        ? 'border-2 border-white ring-2 ring-red-500 text-white animate-pulse'
                        : 'border border-slate-950 text-slate-950'
                    }`}
                  >
                    {isBroken ? (
                      <span>!</span>
                    ) : def?.defaultSymbol ? (
                      <span>{def.defaultSymbol}</span>
                    ) : (
                      <MarkerIcon
                        iconKey={def?.iconKey || 'mystery'}
                        size={10}
                        className="text-slate-950 stroke-[2.5]"
                      />
                    )}
                  </div>
                  {showText && (
                    <span
                      className={`px-1 py-0.2 rounded text-[9px] font-semibold whitespace-nowrap shadow border ${
                        isBroken
                          ? 'bg-red-600 text-white border-red-300 font-bold'
                          : 'bg-slate-950/90 text-slate-100 border-slate-700/80'
                      }`}
                    >
                      {badgeText}
                    </span>
                  )}
                </div>
              );
            })}
        </>
      )}

      {/* 5. TOP OVERLAY BAR: COORDINATE BADGE + STATUS / COMMENT COUNTS */}
      <div className="absolute top-1 left-1 right-1 flex items-center justify-between gap-1 pointer-events-none z-20">
        <div className="flex items-center gap-1">
          {layerVisibility.showCoordBadges && (
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold shadow ${
                isSelected
                  ? 'bg-amber-500 text-slate-950'
                  : 'bg-slate-950/80 text-slate-300 border border-slate-800/80'
              }`}
            >
              {cell.coord}
            </span>
          )}
          {cell.isCompleted && (
            <span
              title="Room Completed"
              className="p-0.5 rounded bg-emerald-500/90 text-slate-950 shadow"
            >
              <CheckCircle2 size={11} />
            </span>
          )}
        </div>

        {/* Linked Comments & Unresolved TODO Badges */}
        <div className="flex items-center gap-1">
          {unresolvedTodos > 0 && (
            <span className="px-1.5 py-0.5 rounded bg-amber-500/95 text-slate-950 font-bold text-[9px] shadow">
              TODO:{unresolvedTodos}
            </span>
          )}
          {cellComments.length > 0 && (
            <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-blue-600/90 text-white font-semibold text-[9px] shadow">
              <MessageSquare size={9} />
              <span>{cellComments.length}</span>
            </span>
          )}
        </div>
      </div>

      {/* 6. HOVER ACTION BUTTONS (Inspect / Toggle X) */}
      <div
        className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 z-30"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => onToggleBlocked(cell.id)}
          title="Toggle Blocked / Unreachable Room (Key: X)"
          className="p-1 rounded bg-slate-950/90 hover:bg-slate-800 text-slate-300 border border-slate-700 shadow"
        >
          <Ban size={11} />
        </button>
        <button
          type="button"
          onClick={() => onInspectCell(cell.id)}
          title="Open Room Inspector (Double-click or Enter)"
          className="p-1 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold shadow"
        >
          <Maximize2 size={11} />
        </button>
      </div>

      {/* 7. ADJACENT DOORWAY / PASSAGE BORDER INDICATORS */}
      {cell.state !== 'blocked_x' && cell.openPassages && (
        <>
          {cell.openPassages.top && (
            <div
              title="Open Top Passage"
              className="absolute top-0 left-1/2 -translate-x-1/2 w-10 h-1.5 rounded-b bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.9)] pointer-events-none z-20"
            />
          )}
          {cell.openPassages.bottom && (
            <div
              title="Open Bottom Passage"
              className="absolute bottom-0 left-1/2 -translate-x-1/2 w-10 h-1.5 rounded-t bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.9)] pointer-events-none z-20"
            />
          )}
          {cell.openPassages.left && (
            <div
              title="Open Left Passage"
              className="absolute left-0 top-1/2 -translate-y-1/2 h-7 w-1.5 rounded-r bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.9)] pointer-events-none z-20"
            />
          )}
          {cell.openPassages.right && (
            <div
              title="Open Right Passage"
              className="absolute right-0 top-1/2 -translate-y-1/2 h-7 w-1.5 rounded-l bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.9)] pointer-events-none z-20"
            />
          )}
        </>
      )}

      {/* 8. BOTTOM ROOM NAME BANNER */}
      {layerVisibility.showRoomNames && cell.roomName && cell.state !== 'blocked_x' && (
        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-slate-950/95 via-slate-950/80 to-transparent px-2 py-1 pointer-events-none z-20">
          <p className="text-[11px] font-semibold text-slate-100 truncate drop-shadow">
            {cell.roomName}
          </p>
        </div>
      )}
    </div>
  );
};
