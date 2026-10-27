/**
 * RoomDetailDrawer Component
 * --------------------------
 * Dual-mode Room Inspector (docked side-by-side split drawer OR full-screen modal).
 * Displays the high-resolution AnnotatedRoomCanvas alongside the room's metadata,
 * tags, and relational Comments / Tablets / NPC Dialogue / TODO entries.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  Maximize2,
  Minimize2,
  Plus,
  Edit3,
  Trash2,
  CheckCircle2,
  PenTool,
  ImagePlus,
  Tag,
  MessageSquarePlus,
  Check,
  Compass,
  ExternalLink,
} from 'lucide-react';
import {
  CommentCategoryDefinition,
  CommentEntry,
  CustomFieldDefinition,
  GridCell,
  MapPage,
  MarkerDefinition,
  PinMarker,
  VectorArrow,
} from '../../types/models';
import { renderHighlightedLoreText } from '../../utils/textHighlight';
import { AnnotatedRoomCanvas } from './AnnotatedRoomCanvas';
import { CustomSelectDropdown } from '../comments/CustomSelectDropdown';
import {
  CommentCrossReferenceBadges,
  CommentCrossReferenceEditor,
} from '../comments/CommentCrossReferences';
import { BlobImagePreview } from '../common/BlobImagePreview';
import { SketchCanvasModal } from '../sketches/SketchCanvasModal';

interface RoomDetailDrawerProps {
  map: MapPage;
  cell: GridCell;
  maps: MapPage[];
  allCells: GridCell[];
  allComments: CommentEntry[];
  roomComments: CommentEntry[];
  markerDefinitions: MarkerDefinition[];
  commentCategories: CommentCategoryDefinition[];
  roomFlagOptions: string[];
  customCommentFields: CustomFieldDefinition[];
  initialHighlightedCommentId?: string | null;
  isFullModal: boolean;
  onToggleFullModal: () => void;
  onClose: () => void;
  onJumpToRoom: (
    mapId: string,
    cellCoord: string,
    highlightCommentId?: string
  ) => void;
  onUpdateCellMetadata: (
    updates: Partial<Pick<GridCell, 'roomName' | 'isCompleted' | 'tags'>>
  ) => Promise<void>;
  onUploadScreenshot: (file: Blob) => Promise<void>;
  onAddPin: (pin: Omit<PinMarker, 'id'>) => Promise<PinMarker>;
  onUpdatePin: (pinId: string, updates: Partial<PinMarker>) => Promise<void>;
  onDeletePin: (pinId: string) => Promise<void>;
  onAddArrow: (arrow: Omit<VectorArrow, 'id'>) => Promise<VectorArrow>;
  onUpdateArrow: (arrowId: string, updates: Partial<VectorArrow>) => Promise<void>;
  onDeleteArrow: (arrowId: string) => Promise<void>;
  onCreateComment: (
    input: Omit<CommentEntry, 'id' | 'createdAt' | 'updatedAt'>
  ) => Promise<CommentEntry>;
  onUpdateComment: (
    commentId: string,
    updates: Partial<Omit<CommentEntry, 'id' | 'createdAt'>>
  ) => Promise<void>;
  onDeleteComment: (commentId: string) => Promise<void>;
  onAttachImageToComment: (commentId: string, blob: Blob) => Promise<string>;
  onRemoveAttachmentFromComment: (commentId: string, blobId: string) => Promise<void>;
  onAddRoomFlagOption: (flagName: string) => Promise<void>;
  onAddCustomFieldOption: (fieldId: string, newOption: string) => Promise<void>;
}

export const RoomDetailDrawer: React.FC<RoomDetailDrawerProps> = ({
  map,
  cell,
  maps,
  allCells,
  allComments,
  roomComments,
  markerDefinitions,
  commentCategories,
  roomFlagOptions,
  customCommentFields,
  initialHighlightedCommentId,
  isFullModal,
  onToggleFullModal,
  onClose,
  onJumpToRoom,
  onUpdateCellMetadata,
  onUploadScreenshot,
  onAddPin,
  onUpdatePin,
  onDeletePin,
  onAddArrow,
  onUpdateArrow,
  onDeleteArrow,
  onCreateComment,
  onUpdateComment,
  onDeleteComment,
  onAttachImageToComment,
  onRemoveAttachmentFromComment,
  onAddRoomFlagOption,
  onAddCustomFieldOption,
}) => {
  // Inline Room Flag Creation State
  const [isAddingRoomFlag, setIsAddingRoomFlag] = useState(false);
  const [newRoomFlagInput, setNewRoomFlagInput] = useState('');

  // Quick-Add Comment Form State
  const [newCategory, setNewCategory] = useState<string>(
    commentCategories[0]?.id || 'tablet'
  );
  const [newSpeakerOrTitle, setNewSpeakerOrTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newCustomFields, setNewCustomFields] = useState<Record<string, string>>({});
  const [newRelatedCommentIds, setNewRelatedCommentIds] = useState<string[]>([]);
  const [newRelatedCellIds, setNewRelatedCellIds] = useState<string[]>([]);

  // Editing existing comment state
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editCategory, setEditCategory] = useState('');
  const [editSpeaker, setEditSpeaker] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editCustomFields, setEditCustomFields] = useState<Record<string, string>>({});
  const [editRelatedCommentIds, setEditRelatedCommentIds] = useState<string[]>([]);
  const [editRelatedCellIds, setEditRelatedCellIds] = useState<string[]>([]);

  // Highlighted comment (when jumping from a linked pin or cross-reference)
  const [highlightedCommentId, setHighlightedCommentId] = useState<string | null>(
    null
  );

  useEffect(() => {
    if (!initialHighlightedCommentId) return;
    setHighlightedCommentId(initialHighlightedCommentId);
    const timerScroll = setTimeout(() => {
      const el = document.getElementById(
        `comment-card-${initialHighlightedCommentId}`
      );
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 60);
    const timerClear = setTimeout(() => {
      setHighlightedCommentId(null);
    }, 2600);
    return () => {
      clearTimeout(timerScroll);
      clearTimeout(timerClear);
    };
  }, [initialHighlightedCommentId, cell.id]);

  // Incoming warps/connections from other rooms whose PinMarkers target this cell
  const incomingWarps = useMemo(() => {
    const mapLookup = new Map(maps.map((m) => [m.id, m]));
    const list: {
      originCell: GridCell;
      originMap?: MapPage;
      pin: PinMarker;
    }[] = [];

    for (const c of allCells) {
      if (c.id === cell.id) continue;
      for (const pin of c.markers) {
        if (pin.targetCellId === cell.id) {
          list.push({
            originCell: c,
            originMap: mapLookup.get(c.mapId),
            pin,
          });
        }
      }
    }
    return list;
  }, [allCells, maps, cell.id]);

  // Sketch Modal target comment ID
  const [sketchTargetCommentId, setSketchTargetCommentId] = useState<string | null>(
    null
  );

  const categoryMap = new Map<string, CommentCategoryDefinition>(
    commentCategories.map((c) => [c.id, c])
  );

  const handleToggleTag = (tag: string) => {
    const exists = cell.tags.includes(tag);
    const nextTags = exists
      ? cell.tags.filter((t) => t !== tag)
      : [...cell.tags, tag];
    onUpdateCellMetadata({ tags: nextTags });
  };

  const handleConfirmAddRoomFlag = async () => {
    const clean = newRoomFlagInput.trim();
    if (!clean) {
      setIsAddingRoomFlag(false);
      return;
    }
    await onAddRoomFlagOption(clean);
    if (!cell.tags.includes(clean)) {
      await onUpdateCellMetadata({ tags: [...cell.tags, clean] });
    }
    setNewRoomFlagInput('');
    setIsAddingRoomFlag(false);
  };

  const availableRoomFlags = Array.from(
    new Set([...roomFlagOptions, ...cell.tags])
  );

  const handleAddCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContent.trim() && !newSpeakerOrTitle.trim()) return;

    await onCreateComment({
      mapId: map.id,
      cellId: cell.id,
      cellCoord: cell.coord,
      category: newCategory,
      speakerOrTitle: newSpeakerOrTitle.trim() || undefined,
      content: newContent.trim(),
      customFields:
        Object.keys(newCustomFields).length > 0 ? newCustomFields : undefined,
      relatedCommentIds:
        newRelatedCommentIds.length > 0 ? newRelatedCommentIds : undefined,
      relatedCellIds:
        newRelatedCellIds.length > 0 ? newRelatedCellIds : undefined,
      resolved: false,
      attachmentBlobIds: [],
    });

    setNewSpeakerOrTitle('');
    setNewContent('');
    setNewCustomFields({});
    setNewRelatedCommentIds([]);
    setNewRelatedCellIds([]);
  };

  const handleStartEditComment = (comm: CommentEntry) => {
    setEditingCommentId(comm.id);
    setEditCategory(comm.category);
    setEditSpeaker(comm.speakerOrTitle || '');
    setEditContent(comm.content);
    setEditCustomFields(comm.customFields || {});
    setEditRelatedCommentIds(comm.relatedCommentIds || []);
    setEditRelatedCellIds(comm.relatedCellIds || []);
  };

  const handleSaveEditComment = async (commentId: string) => {
    await onUpdateComment(commentId, {
      category: editCategory,
      speakerOrTitle: editSpeaker.trim() || undefined,
      content: editContent.trim(),
      customFields: editCustomFields,
      relatedCommentIds: editRelatedCommentIds,
      relatedCellIds: editRelatedCellIds,
    });
    setEditingCommentId(null);
  };

  const inspectorBody = (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-950">
      {/* HEADER BAR */}
      <div className="px-4 py-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <span className="px-2.5 py-1 rounded-md bg-amber-500 text-slate-950 font-mono font-bold text-xs shrink-0">
            {map.codePrefix} {cell.coord}
          </span>
          <input
            type="text"
            value={cell.roomName}
            onChange={(e) => onUpdateCellMetadata({ roomName: e.target.value })}
            placeholder="Type Room Name (auto-syncs with all comments)..."
            className="flex-1 bg-slate-950 border border-slate-700 rounded-md px-3 py-1.5 text-sm font-semibold text-slate-100 placeholder:text-slate-500 placeholder:font-normal focus:outline-none focus:border-amber-400"
          />
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() =>
              onUpdateCellMetadata({ isCompleted: !cell.isCompleted })
            }
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium border transition-colors ${
              cell.isCompleted
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
            }`}
            title="Mark room as fully explored/completed"
          >
            <CheckCircle2 size={14} />
            <span>{cell.isCompleted ? 'Completed' : 'Mark Done'}</span>
          </button>

          <button
            type="button"
            onClick={onToggleFullModal}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
            title={
              isFullModal
                ? 'Switch to Side-by-Side Split Drawer'
                : 'Expand to Full-Screen Dual-Pane Modal'
            }
          >
            {isFullModal ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            <span className="hidden sm:inline">
              {isFullModal ? 'Split Drawer' : 'Expand Modal'}
            </span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300"
            title="Close Room Inspector (Esc)"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* MAIN CONTENT AREA (2-column in Full Modal, scrollable vertical stack in Split Drawer) */}
      <div
        className={`flex-1 overflow-y-auto p-4 ${
          isFullModal
            ? 'grid grid-cols-1 lg:grid-cols-12 gap-6 items-start'
            : 'flex flex-col gap-5'
        }`}
      >
        {/* LEFT / TOP PANE: ANNOTATED HIGH-RES ROOM CANVAS + ROOM TAGS */}
        <div className={isFullModal ? 'lg:col-span-7 flex flex-col gap-4' : 'flex flex-col gap-4'}>
          <AnnotatedRoomCanvas
            cell={cell}
            maps={maps}
            allCells={allCells}
            allComments={allComments}
            markerDefinitions={markerDefinitions}
            roomComments={roomComments}
            onAddPin={onAddPin}
            onUpdatePin={onUpdatePin}
            onDeletePin={onDeletePin}
            onAddArrow={onAddArrow}
            onUpdateArrow={onUpdateArrow}
            onDeleteArrow={onDeleteArrow}
            onUploadScreenshot={onUploadScreenshot}
            onJumpToComment={(commentId) => {
              setHighlightedCommentId(commentId);
              const el = document.getElementById(`comment-card-${commentId}`);
              if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }
              setTimeout(() => setHighlightedCommentId(null), 2500);
            }}
            onJumpToRoom={onJumpToRoom}
          />

          {/* Incoming Warps / Connections to This Room (from other cells' pins) */}
          {incomingWarps.length > 0 && (
            <div className="bg-slate-900/80 border border-cyan-500/30 rounded-lg p-3 flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-cyan-300 mr-1">
                <Compass size={13} className="text-cyan-400" />
                <span>Incoming Warps / Connections ({incomingWarps.length}):</span>
              </span>

              {incomingWarps.map(({ originCell, originMap, pin }) => (
                <button
                  key={`inc-warp-${originCell.id}-${pin.id}`}
                  type="button"
                  onClick={() =>
                    onJumpToRoom(originCell.mapId, originCell.coord)
                  }
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-200 border border-cyan-500/35 text-xs font-medium transition-colors"
                  title={`Jump to origin room ${
                    originMap?.codePrefix || ''
                  } ${originCell.coord}${
                    originCell.roomName ? ` (${originCell.roomName})` : ''
                  }`}
                >
                  <span className="font-mono font-bold text-amber-300">
                    {originMap?.codePrefix || '?'} {originCell.coord}
                  </span>
                  {originCell.roomName && (
                    <span className="truncate max-w-[140px]">
                      {originCell.roomName}
                    </span>
                  )}
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-950/70 text-cyan-300 border border-cyan-500/20">
                    {pin.isBidirectionalWarp !== false ? '⇄ Warp' : '→ One-Way'}
                  </span>
                  <ExternalLink size={11} />
                </button>
              ))}
            </div>
          )}

          {/* Room Feature Flags / Tags (Spoiler-Free Editable) */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-3 flex flex-wrap items-center gap-1.5">
            <span className="flex items-center gap-1 text-xs text-slate-400 mr-1 font-medium">
              <Tag size={12} className="text-amber-400" />
              <span>Room Flags:</span>
            </span>

            {availableRoomFlags.length === 0 && !isAddingRoomFlag && (
              <span className="text-[11px] text-slate-500 italic mr-1">
                No room flags defined yet —
              </span>
            )}

            {availableRoomFlags.map((tag) => {
              const active = cell.tags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => handleToggleTag(tag)}
                  className={`px-2 py-0.5 rounded-full text-[11px] font-medium border transition-colors ${
                    active
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                      : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
                  }`}
                >
                  {tag}
                </button>
              );
            })}

            {isAddingRoomFlag ? (
              <div className="inline-flex items-center gap-1">
                <input
                  type="text"
                  value={newRoomFlagInput}
                  onChange={(e) => setNewRoomFlagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleConfirmAddRoomFlag();
                    } else if (e.key === 'Escape') {
                      setNewRoomFlagInput('');
                      setIsAddingRoomFlag(false);
                    }
                  }}
                  placeholder="New flag (e.g. Save Point)..."
                  className="bg-slate-950 border border-amber-500/60 rounded-full px-2.5 py-0.5 text-[11px] text-slate-100 focus:outline-none"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={handleConfirmAddRoomFlag}
                  className="p-1 rounded-full bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/30"
                  title="Add & Tag Room"
                >
                  <Check size={11} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setNewRoomFlagInput('');
                    setIsAddingRoomFlag(false);
                  }}
                  className="p-1 rounded-full bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700"
                  title="Cancel"
                >
                  <X size={11} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsAddingRoomFlag(true)}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-950 hover:bg-slate-800 text-amber-300 border border-dashed border-slate-700 hover:border-amber-500/50 transition-colors"
                title="Create a new custom Room Flag option"
              >
                <Plus size={11} />
                <span>Add Room Flag</span>
              </button>
            )}
          </div>
        </div>

        {/* RIGHT / BOTTOM PANE: LINKED COMMENTS, TABLETS, NPC QUOTES & TODOS */}
        <div
          className={
            isFullModal
              ? 'lg:col-span-5 flex flex-col gap-4'
              : 'flex flex-col gap-4'
          }
        >
          {/* Existing Room Comments List */}
          <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-3.5 flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                  Room Lore, Tablets, NPCs &amp; TODOs ({roomComments.length})
                </h3>
                <p className="text-[11px] text-slate-400">
                  Linked to <span className="font-mono text-amber-300">{map.codePrefix} {cell.coord}</span>
                  {cell.roomName ? ` • ${cell.roomName}` : ''}
                </p>
              </div>
            </div>

            {roomComments.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-lg">
                No tablets, NPC quotes, or TODO notes recorded for this room yet. Use the form below to add one!
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {roomComments.map((comm) => {
                  const catDef = categoryMap.get(comm.category);
                  const isEditing = editingCommentId === comm.id;
                  const isHighlighted = highlightedCommentId === comm.id;

                  if (isEditing) {
                    return (
                      <div
                        key={comm.id}
                        id={`comment-card-${comm.id}`}
                        className="bg-slate-950 border border-amber-500/60 rounded-lg p-3 flex flex-col gap-2 text-xs"
                      >
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <select
                            value={editCategory}
                            onChange={(e) => setEditCategory(e.target.value)}
                            className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-100"
                          >
                            {commentCategories.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.code} — {c.name}
                              </option>
                            ))}
                          </select>
                          <input
                            type="text"
                            value={editSpeaker}
                            onChange={(e) => setEditSpeaker(e.target.value)}
                            placeholder='Speaker or Title (e.g., "NPC Thor", "T2: Prophecy")'
                            className="bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-slate-100"
                          />
                        </div>
                        <textarea
                          rows={3}
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          className="bg-slate-900 border border-slate-700 rounded p-2 text-slate-100"
                        />
                        {customCommentFields.length > 0 && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {customCommentFields.map((field) => (
                              <div key={field.id}>
                                <label className="block text-[10px] text-slate-400 mb-0.5">
                                  {field.name}
                                </label>
                                {field.type === 'select' ? (
                                  <CustomSelectDropdown
                                    value={editCustomFields[field.id] || ''}
                                    options={field.options || []}
                                    placeholder="—"
                                    onChange={(val) =>
                                      setEditCustomFields((prev) => ({
                                        ...prev,
                                        [field.id]: val,
                                      }))
                                    }
                                    onAddNewOption={(newOpt) =>
                                      onAddCustomFieldOption(field.id, newOpt)
                                    }
                                  />
                                ) : (
                                  <input
                                    type="text"
                                    value={editCustomFields[field.id] || ''}
                                    onChange={(e) =>
                                      setEditCustomFields((prev) => ({
                                        ...prev,
                                        [field.id]: e.target.value,
                                      }))
                                    }
                                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-100"
                                  />
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                        <CommentCrossReferenceEditor
                          currentCommentId={comm.id}
                          relatedCommentIds={editRelatedCommentIds}
                          relatedCellIds={editRelatedCellIds}
                          maps={maps}
                          cells={allCells}
                          allComments={allComments}
                          commentCategories={commentCategories}
                          onChangeRelatedComments={setEditRelatedCommentIds}
                          onChangeRelatedCells={setEditRelatedCellIds}
                        />
                        <div className="flex items-center justify-end gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => setEditingCommentId(null)}
                            className="px-2.5 py-1 rounded bg-slate-800 text-slate-300"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSaveEditComment(comm.id)}
                            className="flex items-center gap-1 px-3 py-1 rounded bg-amber-500 text-slate-950 font-semibold"
                          >
                            <Check size={13} />
                            <span>Save</span>
                          </button>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={comm.id}
                      id={`comment-card-${comm.id}`}
                      className={`bg-slate-950/90 border rounded-lg p-3 flex flex-col gap-2 transition-all ${
                        isHighlighted
                          ? 'border-amber-400 ring-2 ring-amber-400/40'
                          : comm.resolved
                          ? 'border-slate-800/60 opacity-65'
                          : 'border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      {/* Comment Top Row: Category Badge, Speaker/Title, Race/Tribe, Actions */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            style={{
                              backgroundColor: `${catDef?.badgeColor || '#3b82f6'}22`,
                              borderColor: `${catDef?.badgeColor || '#3b82f6'}66`,
                              color: catDef?.badgeColor || '#60a5fa',
                            }}
                            className="px-2 py-0.5 rounded text-[10px] font-bold uppercase border"
                          >
                            {catDef?.code || comm.category}
                          </span>

                          {comm.speakerOrTitle && (
                            <span className="font-bold text-xs text-slate-100">
                              {comm.speakerOrTitle}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          {(catDef?.supportsResolved || comm.category === 'todo') && (
                            <button
                              type="button"
                              onClick={() =>
                                onUpdateComment(comm.id, {
                                  resolved: !comm.resolved,
                                })
                              }
                              className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                                comm.resolved
                                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                  : 'bg-slate-900 text-slate-400 border-slate-700 hover:text-white'
                              }`}
                              title="Toggle TODO Resolved"
                            >
                              {comm.resolved ? '✓ Solved' : 'Mark Done'}
                            </button>
                          )}

                          <label
                            title="Attach reference screenshot or crop"
                            className="p-1 text-slate-400 hover:text-cyan-300 cursor-pointer"
                          >
                            <ImagePlus size={13} />
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) onAttachImageToComment(comm.id, file);
                                e.target.value = '';
                              }}
                            />
                          </label>

                          <button
                            type="button"
                            onClick={() => setSketchTargetCommentId(comm.id)}
                            className="p-1 text-slate-400 hover:text-amber-300"
                            title="Draw & attach a freehand tablet symbol or sketch"
                          >
                            <PenTool size={13} />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleStartEditComment(comm)}
                            className="p-1 text-slate-400 hover:text-slate-200"
                            title="Edit comment"
                          >
                            <Edit3 size={13} />
                          </button>

                          <button
                            type="button"
                            onClick={() => onDeleteComment(comm.id)}
                            className="p-1 text-slate-400 hover:text-rose-400"
                            title="Delete comment"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>

                      {/* Transcript / Content with automatic ALL-CAPS keyword highlighting */}
                      {comm.content && (
                        <p
                          className={`text-xs text-slate-300 whitespace-pre-wrap leading-relaxed ${
                            comm.resolved ? 'line-through' : ''
                          }`}
                        >
                          {renderHighlightedLoreText(comm.content)}
                        </p>
                      )}

                      {/* Custom Field Values (if any) */}
                      {comm.customFields &&
                        Object.entries(comm.customFields).some(
                          ([, val]) => Boolean(val)
                        ) && (
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {customCommentFields.map((field) => {
                              const val = comm.customFields?.[field.id];
                              if (!val) return null;
                              return (
                                <span
                                  key={field.id}
                                  className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-[10px] text-slate-300"
                                >
                                  <strong className="text-slate-400">
                                    {field.name}:
                                  </strong>{' '}
                                  {val}
                                </span>
                              );
                            })}
                          </div>
                        )}

                      {/* Outgoing Cross-References & Automatic Incoming Backlinks */}
                      <CommentCrossReferenceBadges
                        comment={comm}
                        maps={maps}
                        cells={allCells}
                        allComments={allComments}
                        commentCategories={commentCategories}
                        onJumpToRoom={onJumpToRoom}
                      />

                      {/* Attached Images / Sketches */}
                      {comm.attachmentBlobIds.length > 0 && (
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          {comm.attachmentBlobIds.map((blobId) => (
                            <BlobImagePreview
                              key={blobId}
                              blobId={blobId}
                              onRemove={() =>
                                onRemoveAttachmentFromComment(comm.id, blobId)
                              }
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* QUICK-ADD COMMENT / TABLET / NPC FORM */}
          <form
            onSubmit={handleAddCommentSubmit}
            className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 flex flex-col gap-3"
          >
            <div className="flex items-center gap-2 text-xs font-bold text-amber-400">
              <MessageSquarePlus size={15} />
              <span>
                Add Tablet, NPC Quote, or TODO to {map.codePrefix} {cell.coord}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  Entry Type
                </label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100 focus:outline-none focus:border-amber-400"
                >
                  {commentCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} — {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  Speaker or Tablet Header
                </label>
                <input
                  type="text"
                  value={newSpeakerOrTitle}
                  onChange={(e) => setNewSpeakerOrTitle(e.target.value)}
                  placeholder='e.g., "NPC Thor", "T2: Prophecy"'
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-amber-400"
                />
              </div>
            </div>

            <div>
              <textarea
                rows={3}
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                placeholder="Type tablet transcript, NPC dialogue, shortcut note, or TODO... (ALL-CAPS words like GOLDEN WINGS are automatically highlighted)"
                className="w-full bg-slate-950 border border-slate-700 rounded p-2.5 text-xs text-slate-100 focus:outline-none focus:border-amber-400"
              />
            </div>

            {/* Render any User-Defined Custom Comment Fields */}
            {customCommentFields.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1 border-t border-slate-800/80">
                {customCommentFields.map((field) => (
                  <div key={field.id}>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      {field.name}
                    </label>
                    {field.type === 'select' ? (
                      <CustomSelectDropdown
                        value={newCustomFields[field.id] || ''}
                        options={field.options || []}
                        placeholder={`— Select ${field.name} —`}
                        onChange={(val) =>
                          setNewCustomFields((prev) => ({
                            ...prev,
                            [field.id]: val,
                          }))
                        }
                        onAddNewOption={(newOpt) =>
                          onAddCustomFieldOption(field.id, newOpt)
                        }
                      />
                    ) : (
                      <input
                        type="text"
                        value={newCustomFields[field.id] || ''}
                        onChange={(e) =>
                          setNewCustomFields((prev) => ({
                            ...prev,
                            [field.id]: e.target.value,
                          }))
                        }
                        placeholder={`Enter ${field.name}...`}
                        className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1 text-xs text-slate-100"
                      />
                    )}
                  </div>
                ))}
              </div>
            )}

            <CommentCrossReferenceEditor
              relatedCommentIds={newRelatedCommentIds}
              relatedCellIds={newRelatedCellIds}
              maps={maps}
              cells={allCells}
              allComments={allComments}
              commentCategories={commentCategories}
              onChangeRelatedComments={setNewRelatedCommentIds}
              onChangeRelatedCells={setNewRelatedCellIds}
            />

            <div className="flex items-center justify-end">
              <button
                type="submit"
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 shadow"
              >
                <Plus size={14} />
                <span>Add Entry to {cell.coord}</span>
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Sketch Canvas Modal for attaching a freehand sketch to a comment */}
      {sketchTargetCommentId && (
        <SketchCanvasModal
          onSave={async (blob) => {
            await onAttachImageToComment(sketchTargetCommentId, blob);
          }}
          onClose={() => setSketchTargetCommentId(null)}
        />
      )}
    </div>
  );

  if (isFullModal) {
    return (
      <div
        className="fixed inset-0 z-40 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4 lg:p-8"
        onClick={onClose}
      >
        <div
          className="w-full max-w-7xl h-[90vh] rounded-2xl border border-slate-700 shadow-2xl overflow-hidden flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {inspectorBody}
        </div>
      </div>
    );
  }

  return (
    <aside className="w-[540px] xl:w-[640px] 2xl:w-[740px] border-l border-slate-800 h-full flex flex-col shrink-0 shadow-2xl z-20">
      {inspectorBody}
    </aside>
  );
};
