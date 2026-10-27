/**
 * CommentCrossReferences Components
 * ---------------------------------
 * Provides:
 * 1. `CommentCrossReferenceBadges`: Renders clickable outgoing cross-reference
 *    badges (`relatedCommentIds` and `relatedCellIds`) plus automatic incoming
 *    "Referenced By" backlinks (from other comments or pin markers across any map).
 * 2. `CommentCrossReferenceEditor`: Interactive search-and-tag picker for linking
 *    a comment/tablet/TODO to any other comment or room across the expedition.
 */

import React, { useMemo, useState } from 'react';
import {
  Link2,
  Compass,
  CornerDownRight,
  ExternalLink,
  Plus,
  X,
  Search,
  MapPin,
} from 'lucide-react';
import {
  CommentCategoryDefinition,
  CommentEntry,
  GridCell,
  MapPage,
} from '../../types/models';

interface CommentCrossReferenceBadgesProps {
  comment: CommentEntry;
  maps: MapPage[];
  cells: GridCell[];
  allComments: CommentEntry[];
  commentCategories: CommentCategoryDefinition[];
  onJumpToRoom: (
    mapId: string,
    cellCoord: string,
    highlightCommentId?: string
  ) => void;
}

export const CommentCrossReferenceBadges: React.FC<
  CommentCrossReferenceBadgesProps
> = ({
  comment,
  maps,
  cells,
  allComments,
  commentCategories,
  onJumpToRoom,
}) => {
  const mapById = useMemo(
    () => new Map(maps.map((m) => [m.id, m])),
    [maps]
  );

  const cellById = useMemo(
    () => new Map(cells.map((c) => [c.id, c])),
    [cells]
  );

  const commentById = useMemo(
    () => new Map(allComments.map((c) => [c.id, c])),
    [allComments]
  );

  const categoryById = useMemo(
    () => new Map(commentCategories.map((c) => [c.id, c])),
    [commentCategories]
  );

  const outgoingCells = useMemo(() => {
    const ids = comment.relatedCellIds || [];
    return ids
      .map((id) => cellById.get(id))
      .filter((c): c is GridCell => Boolean(c));
  }, [comment.relatedCellIds, cellById]);

  const outgoingComments = useMemo(() => {
    const ids = comment.relatedCommentIds || [];
    return ids
      .map((id) => commentById.get(id))
      .filter((c): c is CommentEntry => Boolean(c));
  }, [comment.relatedCommentIds, commentById]);

  // Automatic incoming backlinks from other comments that reference this comment
  const incomingComments = useMemo(() => {
    return allComments.filter(
      (other) =>
        other.id !== comment.id &&
        other.relatedCommentIds?.includes(comment.id)
    );
  }, [allComments, comment.id]);

  // Automatic incoming backlinks from pins (in any room/map) linked to this comment
  const incomingPins = useMemo(() => {
    const list: { cell: GridCell; pinLabel: string }[] = [];
    for (const c of cells) {
      for (const pin of c.markers) {
        if (pin.linkedCommentId === comment.id) {
          list.push({
            cell: c,
            pinLabel: pin.shortLabel || pin.notes || 'Pin',
          });
        }
      }
    }
    return list;
  }, [cells, comment.id]);

  if (
    outgoingCells.length === 0 &&
    outgoingComments.length === 0 &&
    incomingComments.length === 0 &&
    incomingPins.length === 0
  ) {
    return null;
  }

  return (
    <div className="flex flex-col gap-1.5 pt-1.5 border-t border-slate-800/70 text-[11px]">
      {/* Outgoing Links (Related Rooms & Related Comments) */}
      {(outgoingCells.length > 0 || outgoingComments.length > 0) && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1 mr-0.5">
            <Link2 size={11} className="text-cyan-400" />
            <span>Related:</span>
          </span>

          {outgoingCells.map((targetCell) => {
            const targetMap = mapById.get(targetCell.mapId);
            return (
              <button
                key={`rel-cell-${targetCell.id}`}
                type="button"
                onClick={() =>
                  onJumpToRoom(targetCell.mapId, targetCell.coord)
                }
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 font-medium transition-colors"
                title="Jump to related room"
              >
                <Compass size={10} />
                <span className="font-mono font-bold">
                  {targetMap?.codePrefix || '?'} {targetCell.coord}
                </span>
                {targetCell.roomName && (
                  <span className="truncate max-w-[130px] text-cyan-200">
                    ({targetCell.roomName})
                  </span>
                )}
                <ExternalLink size={9} />
              </button>
            );
          })}

          {outgoingComments.map((targetComm) => {
            const targetMap = mapById.get(targetComm.mapId);
            const catDef = categoryById.get(targetComm.category);
            const label =
              targetComm.speakerOrTitle ||
              targetComm.content.slice(0, 32) ||
              targetComm.cellCoord;
            return (
              <button
                key={`rel-comm-${targetComm.id}`}
                type="button"
                onClick={() =>
                  onJumpToRoom(
                    targetComm.mapId,
                    targetComm.cellCoord,
                    targetComm.id
                  )
                }
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-500/15 hover:bg-blue-500/25 text-blue-300 border border-blue-500/30 font-medium transition-colors"
                title={`Jump to ${targetMap?.codePrefix || ''} ${
                  targetComm.cellCoord
                }: ${targetComm.content}`}
              >
                <span className="font-bold uppercase text-[9px] px-1 rounded bg-blue-500/20">
                  {catDef?.code || targetComm.category}
                </span>
                <span className="font-mono font-bold">
                  {targetMap?.codePrefix || '?'} {targetComm.cellCoord}
                </span>
                <span className="truncate max-w-[150px] text-blue-200">
                  {label}
                </span>
                <ExternalLink size={9} />
              </button>
            );
          })}
        </div>
      )}

      {/* Automatic Incoming Backlinks (Referenced By other Comments or Pins) */}
      {(incomingComments.length > 0 || incomingPins.length > 0) && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1 mr-0.5">
            <CornerDownRight size={11} className="text-purple-400" />
            <span>Referenced By:</span>
          </span>

          {incomingComments.map((srcComm) => {
            const srcMap = mapById.get(srcComm.mapId);
            const catDef = categoryById.get(srcComm.category);
            const label =
              srcComm.speakerOrTitle ||
              srcComm.content.slice(0, 28) ||
              srcComm.cellCoord;
            return (
              <button
                key={`back-comm-${srcComm.id}`}
                type="button"
                onClick={() =>
                  onJumpToRoom(srcComm.mapId, srcComm.cellCoord, srcComm.id)
                }
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/25 text-[10px] transition-colors"
                title={`Referenced by ${srcMap?.codePrefix || ''} ${
                  srcComm.cellCoord
                }: ${srcComm.content}`}
              >
                <span className="font-bold uppercase">
                  [{catDef?.code || srcComm.category}]
                </span>
                <span className="font-mono font-bold">
                  {srcMap?.codePrefix || '?'} {srcComm.cellCoord}
                </span>
                <span className="truncate max-w-[130px]">{label}</span>
              </button>
            );
          })}

          {incomingPins.map((pinRef, idx) => {
            const srcMap = mapById.get(pinRef.cell.mapId);
            return (
              <button
                key={`back-pin-${pinRef.cell.id}-${idx}`}
                type="button"
                onClick={() =>
                  onJumpToRoom(pinRef.cell.mapId, pinRef.cell.coord)
                }
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/25 text-[10px] transition-colors"
                title={`Linked from Pin "${pinRef.pinLabel}" in ${
                  srcMap?.codePrefix || ''
                } ${pinRef.cell.coord}`}
              >
                <MapPin size={10} />
                <span className="font-mono font-bold">
                  {srcMap?.codePrefix || '?'} {pinRef.cell.coord}
                </span>
                <span className="truncate max-w-[110px]">
                  Pin: {pinRef.pinLabel}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

interface CommentCrossReferenceEditorProps {
  currentCommentId?: string;
  relatedCommentIds: string[];
  relatedCellIds: string[];
  maps: MapPage[];
  cells: GridCell[];
  allComments: CommentEntry[];
  commentCategories: CommentCategoryDefinition[];
  onChangeRelatedComments: (nextIds: string[]) => void;
  onChangeRelatedCells: (nextIds: string[]) => void;
}

export const CommentCrossReferenceEditor: React.FC<
  CommentCrossReferenceEditorProps
> = ({
  currentCommentId,
  relatedCommentIds,
  relatedCellIds,
  maps,
  cells,
  allComments,
  commentCategories,
  onChangeRelatedComments,
  onChangeRelatedCells,
}) => {
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [pickerTab, setPickerTab] = useState<'comments' | 'rooms'>('comments');
  const [searchQuery, setSearchQuery] = useState('');

  const mapById = useMemo(
    () => new Map(maps.map((m) => [m.id, m])),
    [maps]
  );

  const cellById = useMemo(
    () => new Map(cells.map((c) => [c.id, c])),
    [cells]
  );

  const commentById = useMemo(
    () => new Map(allComments.map((c) => [c.id, c])),
    [allComments]
  );

  const categoryById = useMemo(
    () => new Map(commentCategories.map((c) => [c.id, c])),
    [commentCategories]
  );

  const matchingComments = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allComments
      .filter(
        (c) =>
          c.id !== currentCommentId && !relatedCommentIds.includes(c.id)
      )
      .filter((c) => {
        if (!q) return true;
        const mapObj = mapById.get(c.mapId);
        const hay = `${mapObj?.codePrefix || ''} ${mapObj?.name || ''} ${
          c.cellCoord
        } ${c.speakerOrTitle || ''} ${c.content}`.toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 15);
  }, [allComments, currentCommentId, relatedCommentIds, searchQuery, mapById]);

  const matchingCells = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return cells
      .filter(
        (c) =>
          c.state !== 'blocked_x' &&
          !relatedCellIds.includes(c.id) &&
          (Boolean(q) || c.state === 'room' || Boolean(c.roomName.trim()))
      )
      .filter((c) => {
        if (!q) return true;
        const mapObj = mapById.get(c.mapId);
        const hay = `${mapObj?.codePrefix || ''} ${mapObj?.name || ''} ${
          c.coord
        } ${c.roomName} ${c.tags.join(' ')}`.toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 15);
  }, [cells, relatedCellIds, searchQuery, mapById]);

  return (
    <div className="flex flex-col gap-2 pt-1.5 border-t border-slate-800/80 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
          <Link2 size={12} className="text-cyan-400" />
          <span>Cross-References (Related Tablets, TODOs &amp; Rooms)</span>
        </span>
        <button
          type="button"
          onClick={() => setIsPickerOpen(!isPickerOpen)}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 text-cyan-300 border border-slate-700 text-[11px] font-medium"
        >
          <Plus size={11} />
          <span>{isPickerOpen ? 'Close Picker' : 'Add Related Link'}</span>
        </button>
      </div>

      {/* Selected Cross-Reference Chips */}
      {(relatedCellIds.length > 0 || relatedCommentIds.length > 0) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {relatedCellIds.map((cellId) => {
            const c = cellById.get(cellId);
            if (!c) return null;
            const m = mapById.get(c.mapId);
            return (
              <span
                key={`sel-cell-${cellId}`}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 text-[11px]"
              >
                <Compass size={10} />
                <span className="font-mono font-bold">
                  {m?.codePrefix || '?'} {c.coord}
                </span>
                {c.roomName && (
                  <span className="truncate max-w-[110px]">({c.roomName})</span>
                )}
                <button
                  type="button"
                  onClick={() =>
                    onChangeRelatedCells(
                      relatedCellIds.filter((id) => id !== cellId)
                    )
                  }
                  className="text-cyan-400 hover:text-white ml-0.5"
                  title="Remove room link"
                >
                  <X size={11} />
                </button>
              </span>
            );
          })}

          {relatedCommentIds.map((commId) => {
            const c = commentById.get(commId);
            if (!c) return null;
            const m = mapById.get(c.mapId);
            const cat = categoryById.get(c.category);
            return (
              <span
                key={`sel-comm-${commId}`}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-500/15 text-blue-300 border border-blue-500/30 text-[11px]"
              >
                <span className="font-bold uppercase text-[9px]">
                  [{cat?.code || c.category}]
                </span>
                <span className="font-mono font-bold">
                  {m?.codePrefix || '?'} {c.cellCoord}
                </span>
                <span className="truncate max-w-[130px]">
                  {c.speakerOrTitle || c.content.slice(0, 28)}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onChangeRelatedComments(
                      relatedCommentIds.filter((id) => id !== commId)
                    )
                  }
                  className="text-blue-400 hover:text-white ml-0.5"
                  title="Remove comment link"
                >
                  <X size={11} />
                </button>
              </span>
            );
          })}
        </div>
      )}

      {/* Collapsible Search Picker */}
      {isPickerOpen && (
        <div className="bg-slate-900 border border-slate-700 rounded-lg p-2.5 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded bg-slate-950 p-0.5 border border-slate-800 text-[11px]">
              <button
                type="button"
                onClick={() => setPickerTab('comments')}
                className={`px-2 py-0.5 rounded font-medium ${
                  pickerTab === 'comments'
                    ? 'bg-blue-500/20 text-blue-300'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Tablets / Comments / TODOs
              </button>
              <button
                type="button"
                onClick={() => setPickerTab('rooms')}
                className={`px-2 py-0.5 rounded font-medium ${
                  pickerTab === 'rooms'
                    ? 'bg-cyan-500/20 text-cyan-300'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Rooms (Map + Cell)
              </button>
            </div>

            <div className="relative flex-1">
              <Search
                size={12}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={
                  pickerTab === 'comments'
                    ? 'Search tablets, NPC quotes, or coordinates (e.g. YgA $C$2)...'
                    : 'Search rooms by map, coordinate ($C$2), or room name...'
                }
                className="w-full bg-slate-950 border border-slate-700 rounded pl-7 pr-2 py-1 text-[11px] text-slate-100 focus:outline-none focus:border-amber-400"
              />
            </div>
          </div>

          <div className="max-h-36 overflow-y-auto divide-y divide-slate-800/60 border border-slate-800 rounded bg-slate-950/60">
            {pickerTab === 'comments' ? (
              matchingComments.length === 0 ? (
                <div className="p-3 text-center text-[11px] text-slate-500">
                  No matching comments found.
                </div>
              ) : (
                matchingComments.map((c) => {
                  const m = mapById.get(c.mapId);
                  const cat = categoryById.get(c.category);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() =>
                        onChangeRelatedComments([...relatedCommentIds, c.id])
                      }
                      className="w-full px-2.5 py-1.5 text-left hover:bg-slate-800/80 flex items-center justify-between gap-2 text-[11px]"
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="px-1.5 py-0.2 rounded bg-slate-800 text-amber-300 font-mono font-bold text-[10px] shrink-0">
                          {m?.codePrefix || '?'} {c.cellCoord}
                        </span>
                        <span className="font-bold text-blue-300 uppercase text-[10px] shrink-0">
                          [{cat?.code || c.category}]
                        </span>
                        <span className="text-slate-200 truncate">
                          {c.speakerOrTitle
                            ? `${c.speakerOrTitle}: ${c.content}`
                            : c.content}
                        </span>
                      </div>
                      <span className="text-cyan-400 font-semibold shrink-0">
                        + Link
                      </span>
                    </button>
                  );
                })
              )
            ) : matchingCells.length === 0 ? (
              <div className="p-3 text-center text-[11px] text-slate-500">
                Type a coordinate (e.g. $C$2) or room name to find rooms.
              </div>
            ) : (
              matchingCells.map((c) => {
                const m = mapById.get(c.mapId);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() =>
                      onChangeRelatedCells([...relatedCellIds, c.id])
                    }
                    className="w-full px-2.5 py-1.5 text-left hover:bg-slate-800/80 flex items-center justify-between gap-2 text-[11px]"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="px-1.5 py-0.2 rounded bg-slate-800 text-amber-300 font-mono font-bold text-[10px] shrink-0">
                        {m?.codePrefix || '?'} {c.coord}
                      </span>
                      <span className="text-slate-200 truncate">
                        {c.roomName || (
                          <span className="text-slate-500 italic">
                            Unnamed Room ({m?.name})
                          </span>
                        )}
                      </span>
                    </div>
                    <span className="text-cyan-400 font-semibold shrink-0">
                      + Link
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
