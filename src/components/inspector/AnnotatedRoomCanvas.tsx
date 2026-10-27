/**
 * AnnotatedRoomCanvas Component
 * -----------------------------
 * Renders the high-resolution 16:9 room screenshot inside the Room Detail Inspector
 * along with the interactive Pin Marker system (place, drag, edit, resolve) and
 * the 2-click / multi-point SVG Vector Arrow tool.
 */

import React, { useRef, useState } from 'react';
import {
  MousePointer,
  MapPin,
  MoveUpRight,
  Trash2,
  CheckCircle2,
  Link as LinkIcon,
  ImagePlus,
  Check,
  X,
} from 'lucide-react';
import {
  CommentEntry,
  GridCell,
  MarkerDefinition,
  PinMarker,
  VectorArrow,
} from '../../types/models';
import { useBlobUrl } from '../../hooks/useBlobUrl';
import { MarkerIcon } from '../common/MarkerIcon';
import { VectorArrowSvg } from '../common/VectorArrowSvg';

type CanvasToolMode = 'cursor' | 'add_pin' | 'draw_arrow';

const ARROW_COLOR_SWATCHES = [
  { hex: '#06b6d4', label: 'Cyan' },
  { hex: '#22c55e', label: 'Green' },
  { hex: '#f97316', label: 'Orange' },
  { hex: '#ef4444', label: 'Red' },
  { hex: '#eab308', label: 'Gold' },
  { hex: '#a855f7', label: 'Purple' },
];

interface AnnotatedRoomCanvasProps {
  cell: GridCell;
  markerDefinitions: MarkerDefinition[];
  roomComments: CommentEntry[];
  onAddPin: (pin: Omit<PinMarker, 'id'>) => Promise<PinMarker>;
  onUpdatePin: (pinId: string, updates: Partial<PinMarker>) => Promise<void>;
  onDeletePin: (pinId: string) => Promise<void>;
  onAddArrow: (arrow: Omit<VectorArrow, 'id'>) => Promise<VectorArrow>;
  onUpdateArrow: (arrowId: string, updates: Partial<VectorArrow>) => Promise<void>;
  onDeleteArrow: (arrowId: string) => Promise<void>;
  onUploadScreenshot: (file: Blob) => Promise<void>;
  onJumpToComment?: (commentId: string) => void;
}

export const AnnotatedRoomCanvas: React.FC<AnnotatedRoomCanvasProps> = ({
  cell,
  markerDefinitions,
  roomComments,
  onAddPin,
  onUpdatePin,
  onDeletePin,
  onAddArrow,
  onUpdateArrow,
  onDeleteArrow,
  onUploadScreenshot,
  onJumpToComment,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const fullImageUrl = useBlobUrl(cell.screenshotBlobId || cell.thumbnailBlobId);

  const [toolMode, setToolMode] = useState<CanvasToolMode>('cursor');
  const [activeMarkerDefId, setActiveMarkerDefId] = useState<string>(
    markerDefinitions[0]?.id || 'item_chest'
  );

  // Selection state for editing an existing pin or arrow
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);
  const [selectedArrowId, setSelectedArrowId] = useState<string | null>(null);

  // Dragging state for repositioning pins
  const [draggingPinId, setDraggingPinId] = useState<string | null>(null);

  // Draft state for drawing vector arrows
  const [draftArrowPoints, setDraftArrowPoints] = useState<
    { xPercent: number; yPercent: number }[]
  >([]);
  const [hoverPoint, setHoverPoint] = useState<{
    xPercent: number;
    yPercent: number;
  } | null>(null);
  const [arrowColor, setArrowColor] = useState('#06b6d4');
  const [arrowDashed, setArrowDashed] = useState(false);
  const [arrowBidirectional, setArrowBidirectional] = useState(false);
  const [arrowLabel, setArrowLabel] = useState('');

  const markerDefsMap = new Map<string, MarkerDefinition>(
    markerDefinitions.map((d) => [d.id, d])
  );
  const activeMarkerDef =
    markerDefsMap.get(activeMarkerDefId) || markerDefinitions[0];

  const selectedPin = cell.markers.find((m) => m.id === selectedPinId) || null;
  const selectedArrow = cell.arrows.find((a) => a.id === selectedArrowId) || null;

  const getRelativePercentCoords = (
    clientX: number,
    clientY: number
  ): { xPercent: number; yPercent: number } | null => {
    const el = containerRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const xPercent = Math.min(
      100,
      Math.max(0, Number((((clientX - rect.left) / rect.width) * 100).toFixed(1)))
    );
    const yPercent = Math.min(
      100,
      Math.max(0, Number((((clientY - rect.top) / rect.height) * 100).toFixed(1)))
    );
    return { xPercent, yPercent };
  };

  const handleCanvasClick = async (e: React.MouseEvent<HTMLDivElement>) => {
    if (draggingPinId) return;
    const coords = getRelativePercentCoords(e.clientX, e.clientY);
    if (!coords) return;

    if (toolMode === 'add_pin' && activeMarkerDef) {
      const created = await onAddPin({
        xPercent: coords.xPercent,
        yPercent: coords.yPercent,
        typeId: activeMarkerDef.id,
        color: activeMarkerDef.defaultColor,
        shortLabel: activeMarkerDef.defaultSymbol || '',
        notes: '',
        resolved: false,
      });
      setSelectedPinId(created.id);
      setSelectedArrowId(null);
      setToolMode('cursor');
    } else if (toolMode === 'draw_arrow') {
      const nextPoints = [...draftArrowPoints, coords];
      // Standard 2-click vector arrow completes immediately on the 2nd click
      if (nextPoints.length >= 2) {
        const created = await onAddArrow({
          points: nextPoints,
          color: arrowColor,
          dashed: arrowDashed,
          bidirectional: arrowBidirectional,
          label: arrowLabel.trim() || undefined,
        });
        setDraftArrowPoints([]);
        setHoverPoint(null);
        setArrowLabel('');
        setSelectedArrowId(created.id);
        setSelectedPinId(null);
        setToolMode('cursor');
      } else {
        setDraftArrowPoints(nextPoints);
      }
    } else {
      setSelectedPinId(null);
      setSelectedArrowId(null);
    }
  };

  const handlePointerMoveOnCanvas = (e: React.PointerEvent<HTMLDivElement>) => {
    const coords = getRelativePercentCoords(e.clientX, e.clientY);
    if (!coords) return;

    if (draggingPinId) {
      onUpdatePin(draggingPinId, {
        xPercent: coords.xPercent,
        yPercent: coords.yPercent,
      });
    } else if (toolMode === 'draw_arrow' && draftArrowPoints.length > 0) {
      setHoverPoint(coords);
    }
  };

  const handlePointerUpOnCanvas = () => {
    if (draggingPinId) {
      setDraggingPinId(null);
    }
  };

  const previewArrowPoints =
    toolMode === 'draw_arrow' && draftArrowPoints.length > 0 && hoverPoint
      ? [...draftArrowPoints, hoverPoint]
      : draftArrowPoints;

  return (
    <div className="flex flex-col gap-3">
      {/* 1. ANNOTATION MODE TOOLBAR */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              setToolMode('cursor');
              setDraftArrowPoints([]);
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
              toolMode === 'cursor'
                ? 'bg-amber-500 text-slate-950 font-semibold'
                : 'bg-slate-950 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <MousePointer size={13} />
            <span>Inspect / Move</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setToolMode('add_pin');
              setDraftArrowPoints([]);
              setSelectedArrowId(null);
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
              toolMode === 'add_pin'
                ? 'bg-amber-500 text-slate-950 font-semibold'
                : 'bg-slate-950 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <MapPin size={13} />
            <span>Add Pin</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setToolMode('draw_arrow');
              setDraftArrowPoints([]);
              setSelectedPinId(null);
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
              toolMode === 'draw_arrow'
                ? 'bg-amber-500 text-slate-950 font-semibold'
                : 'bg-slate-950 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <MoveUpRight size={13} />
            <span>2-Click Arrow</span>
          </button>
        </div>

        {/* Contextual Palette for Add Pin Mode */}
        {toolMode === 'add_pin' && (
          <div className="flex flex-wrap items-center gap-1.5 bg-slate-950/90 px-2.5 py-1 rounded-md border border-slate-800">
            <span className="text-[11px] text-slate-400 mr-1">Pin Type:</span>
            {markerDefinitions.map((def) => {
              const isSelected = def.id === activeMarkerDef?.id;
              return (
                <button
                  key={def.id}
                  type="button"
                  onClick={() => setActiveMarkerDefId(def.id)}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-all border ${
                    isSelected
                      ? 'bg-slate-800 border-amber-400 text-white font-semibold shadow-sm'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                  title={def.description}
                >
                  <span
                    style={{ backgroundColor: def.defaultColor }}
                    className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-slate-950 font-bold text-[9px]"
                  >
                    {def.defaultSymbol ? (
                      def.defaultSymbol
                    ) : (
                      <MarkerIcon iconKey={def.iconKey} size={9} />
                    )}
                  </span>
                  <span>{def.name}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Contextual Controls for 2-Click Arrow Mode */}
        {toolMode === 'draw_arrow' && (
          <div className="flex flex-wrap items-center gap-2 bg-slate-950/90 px-2.5 py-1 rounded-md border border-slate-800 text-xs">
            <span className="text-[11px] text-amber-300 font-medium">
              {draftArrowPoints.length === 0
                ? '1. Click Start Point on room'
                : '2. Click End Point on room'}
            </span>
            <div className="flex items-center gap-1">
              {ARROW_COLOR_SWATCHES.map((sw) => (
                <button
                  key={sw.hex}
                  type="button"
                  onClick={() => setArrowColor(sw.hex)}
                  style={{ backgroundColor: sw.hex }}
                  className={`w-4 h-4 rounded-full border ${
                    arrowColor === sw.hex
                      ? 'border-white scale-110'
                      : 'border-slate-950 opacity-75'
                  }`}
                  title={sw.label}
                />
              ))}
            </div>
            <label className="flex items-center gap-1 text-[11px] text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={arrowDashed}
                onChange={(e) => setArrowDashed(e.target.checked)}
                className="accent-amber-400"
              />
              <span>Dashed</span>
            </label>
            <label className="flex items-center gap-1 text-[11px] text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={arrowBidirectional}
                onChange={(e) => setArrowBidirectional(e.target.checked)}
                className="accent-amber-400"
              />
              <span>2-Way</span>
            </label>
            <input
              type="text"
              value={arrowLabel}
              onChange={(e) => setArrowLabel(e.target.value)}
              placeholder="Label (optional)"
              className="w-28 bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-[11px] text-slate-100"
            />
            {draftArrowPoints.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setDraftArrowPoints([]);
                  setHoverPoint(null);
                }}
                className="p-0.5 text-rose-400 hover:text-rose-300"
                title="Cancel arrow"
              >
                <X size={13} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* 2. HIGH-RESOLUTION 16:9 ROOM CANVAS */}
      <div
        ref={containerRef}
        onClick={handleCanvasClick}
        onPointerMove={handlePointerMoveOnCanvas}
        onPointerUp={handlePointerUpOnCanvas}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const file = e.dataTransfer?.files?.[0];
          if (file && file.type.startsWith('image/')) {
            onUploadScreenshot(file);
          }
        }}
        className={`relative aspect-video w-full rounded-xl overflow-hidden bg-slate-900 border-2 select-none shadow-2xl ${
          toolMode !== 'cursor'
            ? 'cursor-crosshair border-amber-500/70'
            : 'border-slate-800'
        }`}
      >
        {fullImageUrl ? (
          <img
            src={fullImageUrl}
            alt={cell.roomName || cell.coord}
            className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 gap-2 p-4 text-center">
            <ImagePlus size={32} className="text-slate-600" />
            <p className="text-sm font-medium text-slate-300">
              No screenshot assigned to {cell.coord} yet
            </p>
            <p className="text-xs text-slate-500 max-w-md">
              Press <kbd className="px-1.5 py-0.5 bg-slate-800 rounded text-slate-300">Ctrl+V</kbd> to paste a 16:9 game screenshot from your clipboard, drag-and-drop an image here, or click below to upload. You can still place pins and arrows even without a screenshot!
            </p>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
              className="mt-1 px-3 py-1.5 rounded-md text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700"
            >
              Choose Screenshot File...
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onUploadScreenshot(file);
                e.target.value = '';
              }}
            />
          </div>
        )}

        {/* Vector Arrows Layer */}
        <VectorArrowSvg
          arrows={cell.arrows}
          draftPoints={previewArrowPoints}
          draftColor={arrowColor}
          draftDashed={arrowDashed}
          draftBidirectional={arrowBidirectional}
          interactive={toolMode === 'cursor'}
          selectedArrowId={selectedArrowId}
          onSelectArrow={(id) => {
            setSelectedArrowId(id);
            setSelectedPinId(null);
          }}
        />

        {/* Pin Markers Layer */}
        {cell.markers.map((pin) => {
          const def = markerDefsMap.get(pin.typeId);
          const isSelected = pin.id === selectedPinId;

          return (
            <div
              key={pin.id}
              style={{
                left: `${pin.xPercent}%`,
                top: `${pin.yPercent}%`,
              }}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedPinId(pin.id);
                setSelectedArrowId(null);
              }}
              onPointerDown={(e) => {
                if (toolMode === 'cursor') {
                  e.stopPropagation();
                  setSelectedPinId(pin.id);
                  setSelectedArrowId(null);
                  setDraggingPinId(pin.id);
                }
              }}
              className={`absolute -translate-x-1/2 -translate-y-1/2 z-20 flex items-center gap-1 group ${
                toolMode === 'cursor' ? 'cursor-grab active:cursor-grabbing' : ''
              } ${pin.resolved ? 'opacity-55' : ''}`}
            >
              <div
                style={{ backgroundColor: pin.color }}
                className={`w-7 h-7 rounded-full border-2 flex items-center justify-center text-slate-950 font-bold text-xs shadow-lg transition-transform ${
                  isSelected
                    ? 'border-white scale-125 ring-4 ring-amber-400/40'
                    : 'border-slate-950 group-hover:scale-110'
                }`}
              >
                {def?.defaultSymbol ? (
                  <span>{def.defaultSymbol}</span>
                ) : (
                  <MarkerIcon
                    iconKey={def?.iconKey || 'mystery'}
                    size={15}
                    className="text-slate-950 stroke-[2.5]"
                  />
                )}
              </div>

              {pin.shortLabel && (
                <span
                  className={`px-1.5 py-0.5 rounded text-xs font-bold whitespace-nowrap shadow-md border ${
                    isSelected
                      ? 'bg-amber-500 text-slate-950 border-white'
                      : 'bg-slate-950/90 text-slate-100 border-slate-700'
                  } ${pin.resolved ? 'line-through opacity-75' : ''}`}
                >
                  {pin.shortLabel}
                </span>
              )}
            </div>
          );
        })}

        {/* Subtle Helper Banner when in Add Pin or Draw Arrow mode */}
        {toolMode !== 'cursor' && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-slate-950/90 border border-amber-500/50 text-amber-300 text-xs font-medium pointer-events-none shadow-lg">
            {toolMode === 'add_pin'
              ? `Click anywhere on the room to place a "${activeMarkerDef?.name}" pin`
              : draftArrowPoints.length === 0
              ? 'Click the starting point of the movement arrow'
              : 'Click the destination point to complete the arrow'}
          </div>
        )}
      </div>

      {/* 3. SELECTED PIN MARKER EDITOR */}
      {selectedPin && (
        <div className="bg-slate-900 border border-amber-500/40 rounded-lg p-3 flex flex-col gap-2.5 shadow-lg">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div className="flex items-center gap-2">
              <span
                style={{ backgroundColor: selectedPin.color }}
                className="w-5 h-5 rounded-full flex items-center justify-center text-slate-950 font-bold text-xs"
              >
                <MarkerIcon
                  iconKey={
                    markerDefsMap.get(selectedPin.typeId)?.iconKey || 'mystery'
                  }
                  size={12}
                />
              </span>
              <span className="text-xs font-bold text-slate-100">
                Edit Pin Marker ({selectedPin.xPercent}%, {selectedPin.yPercent}%)
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  onUpdatePin(selectedPin.id, { resolved: !selectedPin.resolved })
                }
                className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                  selectedPin.resolved
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                }`}
              >
                <CheckCircle2 size={13} />
                <span>{selectedPin.resolved ? 'Resolved / Solved' : 'Mark Resolved'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onDeletePin(selectedPin.id);
                  setSelectedPinId(null);
                }}
                className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30"
              >
                <Trash2 size={13} />
                <span>Delete Pin</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedPinId(null)}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-xs">
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">
                Marker Category
              </label>
              <select
                value={selectedPin.typeId}
                onChange={(e) => {
                  const nextDef = markerDefsMap.get(e.target.value);
                  onUpdatePin(selectedPin.id, {
                    typeId: e.target.value,
                    color: nextDef?.defaultColor || selectedPin.color,
                  });
                }}
                className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-slate-100"
              >
                {markerDefinitions.map((def) => (
                  <option key={def.id} value={def.id}>
                    {def.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 mb-1">
                Short Badge Label (shown next to pin)
              </label>
              <input
                type="text"
                value={selectedPin.shortLabel || ''}
                onChange={(e) =>
                  onUpdatePin(selectedPin.id, { shortLabel: e.target.value })
                }
                placeholder='e.g. "?", "Raijin / Fujin", "-> AcB $A$8"'
                className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-slate-100 focus:outline-none focus:border-amber-400"
              />
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 mb-1">
                Pin Color Override
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="color"
                  value={selectedPin.color}
                  onChange={(e) =>
                    onUpdatePin(selectedPin.id, { color: e.target.value })
                  }
                  className="w-8 h-7 rounded bg-slate-950 border border-slate-700 cursor-pointer"
                />
                <span className="font-mono text-[11px] text-slate-400">
                  {selectedPin.color}
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-xs">
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">
                Detailed Tooltip / Notes
              </label>
              <input
                type="text"
                value={selectedPin.notes || ''}
                onChange={(e) =>
                  onUpdatePin(selectedPin.id, { notes: e.target.value })
                }
                placeholder="Additional details about this switch, chest, or trap..."
                className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-slate-100 focus:outline-none focus:border-amber-400"
              />
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 mb-1">
                Link to Room Comment / Tablet Entry
              </label>
              <div className="flex items-center gap-1.5">
                <select
                  value={selectedPin.linkedCommentId || ''}
                  onChange={(e) =>
                    onUpdatePin(selectedPin.id, {
                      linkedCommentId: e.target.value || undefined,
                    })
                  }
                  className="flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-slate-100"
                >
                  <option value="">— Not linked to a specific comment —</option>
                  {roomComments.map((c) => (
                    <option key={c.id} value={c.id}>
                      [{c.category.toUpperCase()}]{' '}
                      {c.speakerOrTitle || c.content.slice(0, 40)}
                    </option>
                  ))}
                </select>
                {selectedPin.linkedCommentId && onJumpToComment && (
                  <button
                    type="button"
                    onClick={() => onJumpToComment(selectedPin.linkedCommentId!)}
                    className="px-2 py-1.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/40 hover:bg-blue-500/30 flex items-center gap-1 shrink-0"
                    title="Highlight linked comment"
                  >
                    <LinkIcon size={12} />
                    <span>View</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. SELECTED VECTOR ARROW EDITOR */}
      {selectedArrow && (
        <div className="bg-slate-900 border border-cyan-500/40 rounded-lg p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-100">Edit Movement Arrow:</span>
            <input
              type="text"
              value={selectedArrow.label || ''}
              onChange={(e) =>
                onUpdateArrow(selectedArrow.id, {
                  label: e.target.value || undefined,
                })
              }
              placeholder="Arrow label (e.g., One-way drop)..."
              className="w-44 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-100"
            />
            <div className="flex items-center gap-1">
              {ARROW_COLOR_SWATCHES.map((sw) => (
                <button
                  key={sw.hex}
                  type="button"
                  onClick={() =>
                    onUpdateArrow(selectedArrow.id, { color: sw.hex })
                  }
                  style={{ backgroundColor: sw.hex }}
                  className={`w-4 h-4 rounded-full border ${
                    selectedArrow.color === sw.hex
                      ? 'border-white scale-110'
                      : 'border-slate-950 opacity-75'
                  }`}
                />
              ))}
            </div>
            <label className="flex items-center gap-1 text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedArrow.dashed}
                onChange={(e) =>
                  onUpdateArrow(selectedArrow.id, { dashed: e.target.checked })
                }
                className="accent-amber-400"
              />
              <span>Dashed</span>
            </label>
            <label className="flex items-center gap-1 text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedArrow.bidirectional}
                onChange={(e) =>
                  onUpdateArrow(selectedArrow.id, {
                    bidirectional: e.target.checked,
                  })
                }
                className="accent-amber-400"
              />
              <span>2-Way</span>
            </label>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onDeleteArrow(selectedArrow.id);
                setSelectedArrowId(null);
              }}
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30"
            >
              <Trash2 size={13} />
              <span>Delete Arrow</span>
            </button>
            <button
              type="button"
              onClick={() => setSelectedArrowId(null)}
              className="p-1 text-slate-400 hover:text-white"
            >
              <Check size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
