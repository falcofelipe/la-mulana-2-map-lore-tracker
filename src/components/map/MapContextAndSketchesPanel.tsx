/**
 * MapContextAndSketchesPanel Component
 * ------------------------------------
 * Collapsible panel rendered inside the Macro Map Grid workspace displaying:
 * 1. Map-Level Connections ("Leads To / Entered From"):
 *    - Auto-synced from Warp/Transition Pins (`targetMapId` / `targetCellId`) across all maps
 *    - Plus optional manual map-to-map links (`manualOutgoingMapIds`)
 * 2. Map-Attached Sketches (`sketch.mapId === activeMap.id`):
 *    - Displays freehand diagrams/notes (e.g., root maps, multi-room puzzle keys)
 *      attached to the current map right alongside the grid.
 */

import React, { useMemo, useState } from 'react';
import {
  Compass,
  PenTool,
  Plus,
  Upload,
  Trash2,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  CornerDownRight,
  X,
} from 'lucide-react';
import {
  GridCell,
  MapPage,
  PinMarker,
  SketchNote,
} from '../../types/models';
import { BlobImagePreview } from '../common/BlobImagePreview';
import { SketchCanvasModal } from '../sketches/SketchCanvasModal';

interface MapContextAndSketchesPanelProps {
  activeMap: MapPage;
  maps: MapPage[];
  allCells: GridCell[];
  mapSketches: SketchNote[];
  onSelectMap: (mapId: string) => void;
  onJumpToRoom: (mapId: string, cellCoord: string) => void;
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

interface PinTransitionLink {
  pin: PinMarker;
  sourceCell: GridCell;
  sourceMap: MapPage;
  targetCell?: GridCell;
  targetMap: MapPage;
}

export const MapContextAndSketchesPanel: React.FC<
  MapContextAndSketchesPanelProps
> = ({
  activeMap,
  maps,
  allCells,
  mapSketches,
  onSelectMap,
  onJumpToRoom,
  onToggleManualMapConnection,
  onCreateSketch,
  onUpdateSketch,
  onDeleteSketch,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isAddingManualMap, setIsAddingManualMap] = useState(false);
  const [selectedManualMapId, setSelectedManualMapId] = useState('');
  const [isDrawingNewSketch, setIsDrawingNewSketch] = useState(false);
  const [redrawSketchId, setRedrawSketchId] = useState<string | null>(null);

  const mapById = useMemo(
    () => new Map(maps.map((m) => [m.id, m])),
    [maps]
  );

  const cellById = useMemo(
    () => new Map(allCells.map((c) => [c.id, c])),
    [allCells]
  );

  // 1. Compute Outgoing & Incoming Pin-based Map Transitions
  const { outgoingPinLinks, incomingPinLinks } = useMemo(() => {
    const outgoing: PinTransitionLink[] = [];
    const incoming: PinTransitionLink[] = [];

    for (const cell of allCells) {
      const srcMap = mapById.get(cell.mapId);
      if (!srcMap) continue;

      for (const pin of cell.markers) {
        if (!pin.targetMapId && !pin.targetCellId) continue;
        const targetCell = pin.targetCellId
          ? cellById.get(pin.targetCellId)
          : undefined;
        const resolvedTargetMapId = targetCell?.mapId || pin.targetMapId;
        if (!resolvedTargetMapId) continue;

        const targetMap = mapById.get(resolvedTargetMapId);
        if (!targetMap) continue;

        // Cross-map transition (or same-map warp if needed, but here we focus on cross-map connections)
        if (cell.mapId === activeMap.id && resolvedTargetMapId !== activeMap.id) {
          outgoing.push({
            pin,
            sourceCell: cell,
            sourceMap: srcMap,
            targetCell,
            targetMap,
          });
        } else if (
          cell.mapId !== activeMap.id &&
          resolvedTargetMapId === activeMap.id
        ) {
          incoming.push({
            pin,
            sourceCell: cell,
            sourceMap: srcMap,
            targetCell,
            targetMap,
          });
        }
      }
    }

    return { outgoingPinLinks: outgoing, incomingPinLinks: incoming };
  }, [allCells, mapById, cellById, activeMap.id]);

  // 2. Compute Manual Outgoing & Incoming Map Links
  const manualOutgoingMaps = useMemo(() => {
    const ids = activeMap.manualOutgoingMapIds || [];
    return ids
      .map((id) => mapById.get(id))
      .filter((m): m is MapPage => Boolean(m && m.id !== activeMap.id));
  }, [activeMap.manualOutgoingMapIds, activeMap.id, mapById]);

  const manualIncomingMaps = useMemo(() => {
    return maps.filter(
      (m) =>
        m.id !== activeMap.id &&
        (m.manualOutgoingMapIds || []).includes(activeMap.id)
    );
  }, [maps, activeMap.id]);

  const otherMaps = useMemo(
    () => maps.filter((m) => m.id !== activeMap.id),
    [maps, activeMap.id]
  );

  const totalConnectionsCount =
    outgoingPinLinks.length +
    incomingPinLinks.length +
    manualOutgoingMaps.length +
    manualIncomingMaps.length;

  const handleUploadDiagram = async (file: File) => {
    const baseName = file.name.replace(/\.[^.]+$/, '');
    await onCreateSketch(
      baseName || `${activeMap.codePrefix} Diagram`,
      '',
      activeMap.id,
      file
    );
  };

  return (
    <div className="bg-slate-900/90 border-t border-slate-800 shrink-0">
      {/* Collapsible Header Bar */}
      <div className="px-4 py-2 flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/60">
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2.5 text-xs font-bold text-slate-200 hover:text-amber-300 transition-colors"
        >
          {isExpanded ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
          <span className="flex items-center gap-1.5">
            <Compass size={14} className="text-cyan-400" />
            <span>
              {activeMap.codePrefix} Map Connections ({totalConnectionsCount})
            </span>
          </span>
          <span className="text-slate-600">•</span>
          <span className="flex items-center gap-1.5">
            <PenTool size={13} className="text-amber-400" />
            <span>Map Sketches ({mapSketches.length})</span>
          </span>
        </button>

        <div className="flex items-center gap-2">
          {otherMaps.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setIsExpanded(true);
                setIsAddingManualMap(!isAddingManualMap);
                if (!selectedManualMapId && otherMaps[0]) {
                  setSelectedManualMapId(otherMaps[0].id);
                }
              }}
              className="flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700"
            >
              <Plus size={12} />
              <span>Link Map</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setIsExpanded(true);
              setIsDrawingNewSketch(true);
            }}
            className="flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40"
          >
            <PenTool size={12} />
            <span>+ Draw Sketch for {activeMap.codePrefix}</span>
          </button>

          <label className="flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 cursor-pointer">
            <Upload size={12} />
            <span>Upload Map Diagram</span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  setIsExpanded(true);
                  handleUploadDiagram(file);
                }
                e.target.value = '';
              }}
            />
          </label>
        </div>
      </div>

      {isExpanded && (
        <div className="p-4 flex flex-col gap-4 max-h-80 overflow-y-auto">
          {/* 1. MAP CONNECTIONS BAR (OUTGOING & INCOMING) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 text-xs">
            {/* LEADS TO (OUTGOING) */}
            <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3 flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-cyan-300 flex items-center gap-1.5">
                  <ArrowRight size={13} />
                  <span>Leads To (Outgoing from {activeMap.codePrefix})</span>
                </span>
              </div>

              {isAddingManualMap && otherMaps.length > 0 && (
                <div className="flex items-center gap-2 bg-slate-900 p-2 rounded border border-cyan-500/40">
                  <select
                    value={selectedManualMapId}
                    onChange={(e) => setSelectedManualMapId(e.target.value)}
                    className="flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-100"
                  >
                    {otherMaps.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.codePrefix} — {m.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={async () => {
                      if (selectedManualMapId) {
                        await onToggleManualMapConnection(selectedManualMapId);
                        setIsAddingManualMap(false);
                      }
                    }}
                    className="px-2.5 py-1 rounded bg-cyan-500 text-slate-950 font-semibold text-[11px]"
                  >
                    Toggle Link
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsAddingManualMap(false)}
                    className="p-1 text-slate-400 hover:text-white"
                  >
                    <X size={13} />
                  </button>
                </div>
              )}

              {outgoingPinLinks.length === 0 && manualOutgoingMaps.length === 0 ? (
                <p className="text-[11px] text-slate-500 italic">
                  No outgoing map connections recorded yet. Set a Target Map/Room on any Warp Pin or click "Link Map".
                </p>
              ) : (
                <div className="flex flex-wrap items-center gap-1.5">
                  {outgoingPinLinks.map((item) => (
                    <div
                      key={`out-pin-${item.sourceCell.id}-${item.pin.id}`}
                      className="inline-flex items-center gap-1 rounded-md bg-cyan-500/10 border border-cyan-500/30 px-2 py-1 text-[11px]"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          onJumpToRoom(item.sourceMap.id, item.sourceCell.coord)
                        }
                        className="font-mono font-bold text-amber-300 hover:underline"
                        title={`Inspect source room ${item.sourceMap.codePrefix} ${item.sourceCell.coord}`}
                      >
                        {item.sourceCell.coord}
                      </button>
                      <span className="text-cyan-400 font-bold px-0.5">
                        {item.pin.isBidirectionalWarp !== false ? '⇄' : '➔'}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          if (item.targetCell) {
                            onJumpToRoom(
                              item.targetMap.id,
                              item.targetCell.coord
                            );
                          } else {
                            onSelectMap(item.targetMap.id);
                          }
                        }}
                        className="inline-flex items-center gap-1 font-semibold text-cyan-200 hover:text-white"
                        title={`Jump to ${item.targetMap.codePrefix} — ${
                          item.targetMap.name
                        }${
                          item.targetCell ? ` (${item.targetCell.coord})` : ''
                        }`}
                      >
                        <span className="font-mono font-bold text-cyan-300">
                          {item.targetMap.codePrefix}
                          {item.targetCell ? ` ${item.targetCell.coord}` : ''}
                        </span>
                        <span className="truncate max-w-[120px] text-slate-300">
                          {item.targetCell?.roomName || item.targetMap.name}
                        </span>
                        <ExternalLink size={10} />
                      </button>
                    </div>
                  ))}

                  {manualOutgoingMaps.map((targetMap) => (
                    <div
                      key={`out-manual-${targetMap.id}`}
                      className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 border border-slate-700 px-2.5 py-1 text-[11px]"
                    >
                      <button
                        type="button"
                        onClick={() => onSelectMap(targetMap.id)}
                        className="inline-flex items-center gap-1 text-slate-200 hover:text-amber-300 font-medium"
                        title={`Switch to ${targetMap.codePrefix} — ${targetMap.name}`}
                      >
                        <span className="font-mono font-bold text-amber-300">
                          {targetMap.codePrefix}
                        </span>
                        <span>{targetMap.name}</span>
                        <ExternalLink size={10} />
                      </button>
                      <button
                        type="button"
                        onClick={() => onToggleManualMapConnection(targetMap.id)}
                        className="text-slate-500 hover:text-rose-400 ml-0.5"
                        title="Remove manual map connection"
                      >
                        <X size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ENTERED FROM (INCOMING) */}
            <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3 flex flex-col gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-purple-300 flex items-center gap-1.5">
                <CornerDownRight size={13} />
                <span>Entered From (Incoming to {activeMap.codePrefix})</span>
              </span>

              {incomingPinLinks.length === 0 && manualIncomingMaps.length === 0 ? (
                <p className="text-[11px] text-slate-500 italic">
                  No incoming connections from other maps yet.
                </p>
              ) : (
                <div className="flex flex-wrap items-center gap-1.5">
                  {incomingPinLinks.map((item) => (
                    <div
                      key={`in-pin-${item.sourceCell.id}-${item.pin.id}`}
                      className="inline-flex items-center gap-1 rounded-md bg-purple-500/10 border border-purple-500/30 px-2 py-1 text-[11px]"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          onJumpToRoom(item.sourceMap.id, item.sourceCell.coord)
                        }
                        className="inline-flex items-center gap-1 font-semibold text-purple-200 hover:text-white"
                        title={`Jump to origin room ${item.sourceMap.codePrefix} ${item.sourceCell.coord}`}
                      >
                        <span className="font-mono font-bold text-amber-300">
                          {item.sourceMap.codePrefix} {item.sourceCell.coord}
                        </span>
                        {item.sourceCell.roomName && (
                          <span className="truncate max-w-[110px] text-slate-300">
                            ({item.sourceCell.roomName})
                          </span>
                        )}
                        <ExternalLink size={10} />
                      </button>
                      <span className="text-purple-400 font-bold px-0.5">
                        {item.pin.isBidirectionalWarp !== false ? '⇄' : '➔'}
                      </span>
                      {item.targetCell ? (
                        <button
                          type="button"
                          onClick={() =>
                            onJumpToRoom(activeMap.id, item.targetCell!.coord)
                          }
                          className="font-mono font-bold text-cyan-300 hover:underline"
                          title={`Inspect destination room ${activeMap.codePrefix} ${item.targetCell.coord}`}
                        >
                          {item.targetCell.coord}
                        </button>
                      ) : (
                        <span className="font-mono text-slate-400">
                          {activeMap.codePrefix}
                        </span>
                      )}
                    </div>
                  ))}

                  {manualIncomingMaps.map((srcMap) => (
                    <button
                      key={`in-manual-${srcMap.id}`}
                      type="button"
                      onClick={() => onSelectMap(srcMap.id)}
                      className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 hover:bg-slate-800 border border-slate-700 px-2.5 py-1 text-[11px] text-slate-200 hover:text-amber-300"
                      title={`Switch to ${srcMap.codePrefix} — ${srcMap.name}`}
                    >
                      <span className="font-mono font-bold text-amber-300">
                        {srcMap.codePrefix}
                      </span>
                      <span>{srcMap.name}</span>
                      <ExternalLink size={10} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 2. MAP-ATTACHED SKETCHES GALLERY */}
          {mapSketches.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="text-[11px] font-bold uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
                <PenTool size={12} />
                <span>
                  Attached Diagrams &amp; Sketches for {activeMap.codePrefix} (
                  {mapSketches.length})
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {mapSketches.map((sketch) => (
                  <div
                    key={sketch.id}
                    className="bg-slate-950 border border-slate-800 rounded-lg p-2.5 flex gap-3 items-start"
                  >
                    <div className="w-28 aspect-video bg-slate-900 border border-slate-800 rounded overflow-hidden shrink-0 flex items-center justify-center">
                      {sketch.imageBlobId ? (
                        <BlobImagePreview
                          blobId={sketch.imageBlobId}
                          alt={sketch.title}
                          className="w-full h-full"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => setRedrawSketchId(sketch.id)}
                          className="text-[10px] text-slate-500 hover:text-amber-300 flex flex-col items-center gap-1"
                        >
                          <PenTool size={14} />
                          <span>Draw</span>
                        </button>
                      )}
                    </div>

                    <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                      <input
                        type="text"
                        value={sketch.title}
                        onChange={(e) =>
                          onUpdateSketch(sketch.id, { title: e.target.value })
                        }
                        placeholder="Sketch Title..."
                        className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-0.5 text-xs font-bold text-slate-100 focus:outline-none focus:border-amber-400"
                      />
                      <textarea
                        rows={2}
                        value={sketch.description}
                        onChange={(e) =>
                          onUpdateSketch(sketch.id, {
                            description: e.target.value,
                          })
                        }
                        placeholder="Sketch notes..."
                        className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-[11px] text-slate-300 focus:outline-none focus:border-amber-400"
                      />
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => setRedrawSketchId(sketch.id)}
                          className="inline-flex items-center gap-1 text-[10px] text-amber-300 hover:underline"
                        >
                          <PenTool size={10} />
                          <span>
                            {sketch.imageBlobId ? 'Redraw' : 'Draw Canvas'}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteSketch(sketch.id)}
                          className="text-slate-500 hover:text-rose-400"
                          title="Delete sketch"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {isDrawingNewSketch && (
        <SketchCanvasModal
          showMetadataInputs
          initialTitle={`${activeMap.codePrefix} — Diagram`}
          onSave={async (blob, title, description) => {
            await onCreateSketch(
              title || `${activeMap.codePrefix} — Diagram`,
              description,
              activeMap.id,
              blob
            );
          }}
          onClose={() => setIsDrawingNewSketch(false)}
        />
      )}

      {redrawSketchId && (
        <SketchCanvasModal
          onSave={async (blob) => {
            await onUpdateSketch(redrawSketchId, {}, blob);
          }}
          onClose={() => setRedrawSketchId(null)}
        />
      )}
    </div>
  );
};
