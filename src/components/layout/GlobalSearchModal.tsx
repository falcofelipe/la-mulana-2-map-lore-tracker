/**
 * GlobalSearchModal Component (Ctrl+K)
 * ------------------------------------
 * Instant command/search palette searching across all Maps, Room Names,
 * Pin Markers (e.g. "Raijin / Fujin"), Tablet transcripts, NPC quotes, and TODOs.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search,
  MapPin,
  MessageSquare,
  Compass,
  X,
  ArrowRight,
} from 'lucide-react';
import { CommentEntry, GridCell, MapPage } from '../../types/models';
import {
  renderHighlightedLoreText,
  stripLoreColorTags,
} from '../../utils/textHighlight';

interface GlobalSearchModalProps {
  maps: MapPage[];
  cells: GridCell[];
  comments: CommentEntry[];
  onJumpToRoom: (mapId: string, cellCoord: string) => void;
  onClose: () => void;
}

interface SearchResultItem {
  id: string;
  kind: 'room' | 'pin' | 'comment';
  mapId: string;
  mapPrefix: string;
  mapName: string;
  cellCoord: string;
  title: string;
  subtitle: string;
  badge?: string;
}

export const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({
  maps,
  cells,
  comments,
  onJumpToRoom,
  onClose,
}) => {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const mapById = useMemo(
    () => new Map(maps.map((m) => [m.id, m])),
    [maps]
  );

  const cellByMapAndCoord = useMemo(() => {
    const lookup = new Map<string, GridCell>();
    for (const c of cells) {
      lookup.set(`${c.mapId}::${c.coord}`, c);
    }
    return lookup;
  }, [cells]);

  const results = useMemo<SearchResultItem[]>(() => {
    const q = query.trim().toLowerCase();
    const list: SearchResultItem[] = [];

    // 1. Search named rooms & room tags
    for (const cell of cells) {
      if (!cell.roomName && cell.tags.length === 0 && cell.markers.length === 0)
        continue;
      const mapObj = mapById.get(cell.mapId);
      if (!mapObj) continue;

      const roomHaystack = `${mapObj.codePrefix} ${mapObj.name} ${cell.coord} ${
        cell.roomName
      } ${cell.tags.join(' ')}`.toLowerCase();

      if (!q || roomHaystack.includes(q)) {
        if (cell.roomName || cell.tags.length > 0) {
          list.push({
            id: `room-${cell.id}`,
            kind: 'room',
            mapId: cell.mapId,
            mapPrefix: mapObj.codePrefix,
            mapName: mapObj.name,
            cellCoord: cell.coord,
            title: cell.roomName || `Room ${cell.coord}`,
            subtitle:
              cell.tags.length > 0
                ? `Flags: ${cell.tags.join(', ')}`
                : `${mapObj.name}`,
            badge: 'ROOM',
          });
        }
      }

      // 2. Search Pin Markers inside cell
      for (const pin of cell.markers) {
        if (!pin.shortLabel && !pin.notes) continue;
        const pinHaystack = `${mapObj.codePrefix} ${cell.coord} ${cell.roomName} ${
          pin.shortLabel || ''
        } ${pin.notes || ''}`.toLowerCase();
        if (q && pinHaystack.includes(q)) {
          list.push({
            id: `pin-${pin.id}`,
            kind: 'pin',
            mapId: cell.mapId,
            mapPrefix: mapObj.codePrefix,
            mapName: mapObj.name,
            cellCoord: cell.coord,
            title: pin.shortLabel || 'Pin Marker',
            subtitle: `${cell.roomName ? `${cell.roomName} • ` : ''}${
              pin.notes || ''
            }`,
            badge: pin.resolved ? 'PIN (SOLVED)' : 'PIN',
          });
        }
      }
    }

    // 3. Search Comments, Tablets, NPCs, TODOs, & Global Notes
    for (const comm of comments) {
      const isGlobal = comm.mapId === 'global';
      const mapObj = mapById.get(comm.mapId);
      if (!isGlobal && !mapObj) continue;
      const cellObj = cellByMapAndCoord.get(`${comm.mapId}::${comm.cellCoord}`);
      const mapPrefix = isGlobal ? 'GLOBAL' : mapObj!.codePrefix;
      const mapName = isGlobal ? 'General Notes' : mapObj!.name;

      const customValsList = comm.customFields
        ? Object.values(comm.customFields).filter(Boolean)
        : [];
      const plainContent = stripLoreColorTags(comm.content);
      const commHaystack = `${mapPrefix} ${mapName} ${comm.cellCoord} ${
        cellObj?.roomName || ''
      } ${comm.speakerOrTitle || ''} ${comm.content} ${plainContent} ${customValsList.join(
        ' '
      )}`.toLowerCase();

      if (!q || commHaystack.includes(q)) {
        list.push({
          id: `comm-${comm.id}`,
          kind: 'comment',
          mapId: comm.mapId,
          mapPrefix,
          mapName,
          cellCoord: comm.cellCoord,
          title:
            comm.speakerOrTitle ||
            `${comm.category.toUpperCase()} in ${
              isGlobal ? 'General Notes' : cellObj?.roomName || comm.cellCoord
            }`,
          subtitle: comm.content,
          badge:
            customValsList.length > 0
              ? `${comm.category.toUpperCase()} • ${customValsList.join(' • ')}`
              : comm.category.toUpperCase(),
        });
      }
    }

    return list.slice(0, 40);
  }, [query, cells, comments, mapById, cellByMapAndCoord]);

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-start justify-center pt-16 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[75vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input Bar */}
        <div className="p-3.5 bg-slate-950 border-b border-slate-800 flex items-center gap-3">
          <Search size={18} className="text-amber-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
              if (e.key === 'Enter' && results.length > 0) {
                onJumpToRoom(results[0].mapId, results[0].cellCoord);
                onClose();
              }
            }}
            placeholder="Search rooms, pins (Raijin), tablets (GOLDEN WINGS), NPCs, or TODOs..."
            className="flex-1 bg-transparent text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded"
          >
            <X size={16} />
          </button>
        </div>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-800/70">
          {results.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No matching rooms, markers, or lore entries found.
            </div>
          ) : (
            results.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onJumpToRoom(item.mapId, item.cellCoord);
                  onClose();
                }}
                className="w-full px-4 py-3 text-left hover:bg-slate-800/70 transition-colors flex items-start justify-between gap-3 group"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className="mt-0.5 p-1.5 rounded-lg bg-slate-950 border border-slate-800 text-amber-400 shrink-0">
                    {item.kind === 'room' ? (
                      <Compass size={14} />
                    ) : item.kind === 'pin' ? (
                      <MapPin size={14} />
                    ) : (
                      <MessageSquare size={14} />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono font-bold text-[11px]">
                        {item.mapPrefix} {item.cellCoord}
                      </span>
                      <span className="font-bold text-xs text-slate-100 truncate">
                        {item.title}
                      </span>
                      {item.badge && (
                        <span className="px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 text-[10px] font-semibold">
                          {item.badge}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 line-clamp-2 mt-1">
                      {item.kind === 'comment'
                        ? renderHighlightedLoreText(item.subtitle)
                        : item.subtitle}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1 text-xs text-slate-500 group-hover:text-amber-300 shrink-0 self-center">
                  <span className="text-[11px]">Jump</span>
                  <ArrowRight size={13} />
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
