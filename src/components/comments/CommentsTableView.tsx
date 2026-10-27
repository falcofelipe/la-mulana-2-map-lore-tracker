/**
 * CommentsTableView Component
 * ---------------------------
 * Full-screen spreadsheet-style relational database view replacing the Excel
 * "Comments" tab. Supports multi-column filtering (including user-defined
 * filterable custom fields), instant keyword search, full inline row editing
 * with automatic Map + Cell migration, image/sketch attachments, and one-click
 * jump to any room on the Map Grid.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  Search,
  Filter,
  ExternalLink,
  CheckCircle2,
  Trash2,
  PenTool,
  ImagePlus,
  Plus,
  RotateCcw,
  Edit3,
  Check,
  X,
} from 'lucide-react';
import {
  CommentCategoryDefinition,
  CommentEntry,
  CustomFieldDefinition,
  GridCell,
  MapPage,
} from '../../types/models';
import { normalizeCellCoord } from '../../utils/coordinates';
import { renderHighlightedLoreText } from '../../utils/textHighlight';
import { BlobImagePreview } from '../common/BlobImagePreview';
import { CustomSelectDropdown } from './CustomSelectDropdown';
import { SketchCanvasModal } from '../sketches/SketchCanvasModal';

/**
 * Local-buffered text input for inline table cell editing.
 * Maintains local draft state while typing and commits to IndexedDB on blur
 * or Enter key, preventing async DB writes on every keystroke.
 */
const BufferedCustomTextInput: React.FC<{
  value: string;
  placeholder?: string;
  onCommit: (nextValue: string) => void;
}> = ({ value, placeholder = '—', onCommit }) => {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const commitIfChanged = () => {
    if (draft !== value) {
      onCommit(draft);
    }
  };

  return (
    <input
      type="text"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commitIfChanged}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.currentTarget.blur();
        } else if (e.key === 'Escape') {
          setDraft(value);
          e.currentTarget.blur();
        }
      }}
      placeholder={placeholder}
      className="w-full bg-slate-950/80 border border-slate-800 focus:border-amber-400 rounded px-2 py-1 text-[11px] text-slate-200 focus:outline-none"
    />
  );
};

interface CommentsTableViewProps {
  maps: MapPage[];
  cells: GridCell[];
  comments: CommentEntry[];
  commentCategories: CommentCategoryDefinition[];
  customCommentFields: CustomFieldDefinition[];
  onJumpToRoom: (mapId: string, cellCoord: string) => void;
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
  onAddCustomFieldOption: (fieldId: string, newOption: string) => Promise<void>;
}

export const CommentsTableView: React.FC<CommentsTableViewProps> = ({
  maps,
  cells,
  comments,
  commentCategories,
  customCommentFields,
  onJumpToRoom,
  onCreateComment,
  onUpdateComment,
  onDeleteComment,
  onAttachImageToComment,
  onRemoveAttachmentFromComment,
  onAddCustomFieldOption,
}) => {
  // Multi-column Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMapId, setFilterMapId] = useState('ALL');
  const [filterCategory, setFilterCategory] = useState('ALL');
  const [customFieldFilters, setCustomFieldFilters] = useState<
    Record<string, string>
  >({});
  const [onlyUnresolvedTodos, setOnlyUnresolvedTodos] = useState(false);

  // Quick Add Row State
  const [isAddingRow, setIsAddingRow] = useState(false);
  const [addMapId, setAddMapId] = useState(maps[0]?.id || '');
  const [addCoord, setAddCoord] = useState('$C$2');
  const [addCategory, setAddCategory] = useState(
    commentCategories[0]?.id || 'tablet'
  );
  const [addSpeaker, setAddSpeaker] = useState('');
  const [addContent, setAddContent] = useState('');
  const [addCustomFields, setAddCustomFields] = useState<Record<string, string>>(
    {}
  );

  // Full Row Edit State (Milestone B.3)
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editMapId, setEditMapId] = useState('');
  const [editCoord, setEditCoord] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editSpeaker, setEditSpeaker] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editCustomFields, setEditCustomFields] = useState<
    Record<string, string>
  >({});

  // Sketch Modal Target
  const [sketchTargetCommentId, setSketchTargetCommentId] = useState<
    string | null
  >(null);

  // Lookup Maps for fast relational resolution
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

  const categoryById = useMemo(
    () => new Map(commentCategories.map((c) => [c.id, c])),
    [commentCategories]
  );

  const visibleCustomColumns = useMemo(
    () => customCommentFields.filter((f) => f.showInTable),
    [customCommentFields]
  );

  const hiddenCustomFields = useMemo(
    () => customCommentFields.filter((f) => !f.showInTable),
    [customCommentFields]
  );

  const filterableCustomFields = useMemo(
    () => customCommentFields.filter((f) => f.filterable),
    [customCommentFields]
  );

  // Compute distinct options for each filterable custom field
  const filterOptionsByFieldId = useMemo(() => {
    const result = new Map<string, string[]>();
    for (const field of filterableCustomFields) {
      const set = new Set<string>(field.options || []);
      for (const comm of comments) {
        const val = comm.customFields?.[field.id]?.trim();
        if (val) set.add(val);
      }
      result.set(field.id, Array.from(set));
    }
    return result;
  }, [filterableCustomFields, comments]);

  const hasActiveCustomFilter = Object.values(customFieldFilters).some(
    (val) => Boolean(val && val !== 'ALL')
  );

  const filteredComments = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return comments.filter((comm) => {
      if (filterMapId !== 'ALL' && comm.mapId !== filterMapId) return false;
      if (filterCategory !== 'ALL' && comm.category !== filterCategory)
        return false;
      if (onlyUnresolvedTodos && (comm.category !== 'todo' || comm.resolved))
        return false;

      // Check dynamic custom field filters
      for (const [fieldId, filterVal] of Object.entries(customFieldFilters)) {
        if (!filterVal || filterVal === 'ALL') continue;
        const commVal = comm.customFields?.[fieldId] || '';
        if (commVal !== filterVal) return false;
      }

      if (q) {
        const mapObj = mapById.get(comm.mapId);
        const cellObj = cellByMapAndCoord.get(
          `${comm.mapId}::${comm.cellCoord}`
        );
        const roomName = cellObj?.roomName || '';
        const customVals = comm.customFields
          ? Object.values(comm.customFields).join(' ')
          : '';

        const haystack = [
          mapObj?.codePrefix,
          mapObj?.name,
          comm.cellCoord,
          roomName,
          comm.speakerOrTitle,
          comm.content,
          customVals,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        if (!haystack.includes(q)) return false;
      }

      return true;
    });
  }, [
    comments,
    searchQuery,
    filterMapId,
    filterCategory,
    customFieldFilters,
    onlyUnresolvedTodos,
    mapById,
    cellByMapAndCoord,
  ]);

  const handleQuickAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addContent.trim() && !addSpeaker.trim()) return;

    const targetMapId = addMapId || maps[0]?.id;
    if (!targetMapId) return;

    const cleanCoord = normalizeCellCoord(addCoord);

    await onCreateComment({
      mapId: targetMapId,
      cellCoord: cleanCoord,
      category: addCategory,
      speakerOrTitle: addSpeaker.trim() || undefined,
      content: addContent.trim(),
      customFields:
        Object.keys(addCustomFields).length > 0 ? addCustomFields : undefined,
      resolved: false,
      attachmentBlobIds: [],
    });

    setAddSpeaker('');
    setAddContent('');
    setAddCustomFields({});
    setIsAddingRow(false);
  };

  const handleStartRowEdit = (comm: CommentEntry) => {
    setEditingCommentId(comm.id);
    setEditMapId(comm.mapId);
    setEditCoord(comm.cellCoord);
    setEditCategory(comm.category);
    setEditSpeaker(comm.speakerOrTitle || '');
    setEditContent(comm.content);
    setEditCustomFields({ ...(comm.customFields || {}) });
  };

  const handleSaveRowEdit = async (commentId: string) => {
    const cleanCoord = normalizeCellCoord(editCoord);
    if (!editMapId || !cleanCoord) return;

    await onUpdateComment(commentId, {
      mapId: editMapId,
      cellCoord: cleanCoord,
      category: editCategory,
      speakerOrTitle: editSpeaker.trim() || undefined,
      content: editContent.trim(),
      customFields: editCustomFields,
    });
    setEditingCommentId(null);
  };

  const resetFilters = () => {
    setSearchQuery('');
    setFilterMapId('ALL');
    setFilterCategory('ALL');
    setCustomFieldFilters({});
    setOnlyUnresolvedTodos(false);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-950 p-5 gap-4 overflow-hidden">
      {/* TOP FILTER & ACTION BAR */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 shrink-0 shadow-lg">
        <div className="flex flex-wrap items-center gap-2.5 flex-1">
          {/* Keyword Search */}
          <div className="relative min-w-[240px] flex-1 max-w-md">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tablets, NPC quotes, room names, keywords (e.g. UNDERWORLD)..."
              className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-400"
            />
          </div>

          {/* Filter by Map */}
          <div className="flex items-center gap-1.5 text-xs">
            <Filter size={13} className="text-slate-400" />
            <select
              value={filterMapId}
              onChange={(e) => setFilterMapId(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
            >
              <option value="ALL">All Maps ({maps.length})</option>
              {maps.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.codePrefix} — {m.name}
                </option>
              ))}
            </select>
          </div>

          {/* Filter by Category */}
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
          >
            <option value="ALL">All Entry Types</option>
            {commentCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} — {c.name}
              </option>
            ))}
          </select>

          {/* Dynamic Filter Dropdowns for Filterable Custom Fields */}
          {filterableCustomFields.map((field) => {
            const options = filterOptionsByFieldId.get(field.id) || [];
            const activeVal = customFieldFilters[field.id] || 'ALL';
            return (
              <select
                key={field.id}
                value={activeVal}
                onChange={(e) =>
                  setCustomFieldFilters((prev) => ({
                    ...prev,
                    [field.id]: e.target.value,
                  }))
                }
                className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
                title={`Filter by ${field.name}`}
              >
                <option value="ALL">All {field.name}</option>
                {options.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            );
          })}

          {/* Unresolved TODOs Toggle */}
          <button
            type="button"
            onClick={() => setOnlyUnresolvedTodos(!onlyUnresolvedTodos)}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              onlyUnresolvedTodos
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
          >
            Unresolved TODOs Only
          </button>

          {(searchQuery ||
            filterMapId !== 'ALL' ||
            filterCategory !== 'ALL' ||
            hasActiveCustomFilter ||
            onlyUnresolvedTodos) && (
            <button
              type="button"
              onClick={resetFilters}
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white bg-slate-800/70"
            >
              <RotateCcw size={12} />
              <span>Reset</span>
            </button>
          )}
        </div>

        {/* Right Side: Count & Quick Add Button */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400">
            Showing{' '}
            <strong className="text-slate-100">{filteredComments.length}</strong>{' '}
            of {comments.length} entries
          </span>
          <button
            type="button"
            onClick={() => setIsAddingRow(!isAddingRow)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950"
          >
            <Plus size={14} />
            <span>New Lore / Comment Row</span>
          </button>
        </div>
      </div>

      {/* COLLAPSIBLE QUICK-ADD ROW FORM */}
      {isAddingRow && (
        <form
          onSubmit={handleQuickAddSubmit}
          className="bg-slate-900 border border-amber-500/50 rounded-xl p-4 flex flex-col gap-3 shrink-0 shadow-xl"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">
                Map
              </label>
              <select
                value={addMapId}
                onChange={(e) => setAddMapId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-slate-100"
              >
                {maps.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.codePrefix} — {m.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 mb-1">
                Cell Coordinate
              </label>
              <input
                type="text"
                value={addCoord}
                onChange={(e) => setAddCoord(e.target.value)}
                placeholder="e.g. $C$2"
                className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 font-mono text-amber-300"
              />
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 mb-1">
                Category
              </label>
              <select
                value={addCategory}
                onChange={(e) => setAddCategory(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-slate-100"
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
                Speaker / Header
              </label>
              <input
                type="text"
                value={addSpeaker}
                onChange={(e) => setAddSpeaker(e.target.value)}
                placeholder="e.g. NPC Thor / T1"
                className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100"
              />
            </div>
          </div>

          {customCommentFields.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs pt-1 border-t border-slate-800/80">
              {customCommentFields.map((field) => (
                <div key={field.id}>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    {field.name}
                  </label>
                  {field.type === 'select' ? (
                    <CustomSelectDropdown
                      value={addCustomFields[field.id] || ''}
                      options={field.options || []}
                      placeholder={`— Select ${field.name} —`}
                      onChange={(val) =>
                        setAddCustomFields((prev) => ({
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
                      value={addCustomFields[field.id] || ''}
                      onChange={(e) =>
                        setAddCustomFields((prev) => ({
                          ...prev,
                          [field.id]: e.target.value,
                        }))
                      }
                      placeholder={`Enter ${field.name}...`}
                      className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1 text-slate-100"
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-2.5">
            <textarea
              rows={2}
              value={addContent}
              onChange={(e) => setAddContent(e.target.value)}
              placeholder="Full tablet text, NPC quote, shortcut hint, or TODO note..."
              className="flex-1 bg-slate-950 border border-slate-700 rounded p-2 text-xs text-slate-100"
            />
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setIsAddingRow(false)}
                className="px-3 py-2 rounded bg-slate-800 text-xs text-slate-300"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded bg-amber-500 hover:bg-amber-400 text-xs font-semibold text-slate-950"
              >
                Save Row
              </button>
            </div>
          </div>
        </form>
      )}

      {/* RELATIONAL SPREADSHEET TABLE */}
      <div className="flex-1 overflow-auto bg-slate-900/50 border border-slate-800 rounded-xl shadow-inner">
        <table className="w-full border-collapse text-left text-xs">
          <thead className="sticky top-0 z-10 bg-slate-900 border-b border-slate-800 text-[11px] uppercase tracking-wider text-slate-400 select-none">
            <tr>
              <th className="py-3 px-3.5 w-44">Sheet (Map)</th>
              <th className="py-3 px-3 w-24">Cell</th>
              <th className="py-3 px-3.5 w-48">Room Name</th>
              <th className="py-3 px-3 w-24">Type</th>
              <th className="py-3 px-4 min-w-[320px]">
                Replies / Tablet &amp; NPC Content
              </th>
              {visibleCustomColumns.map((col) => (
                <th key={col.id} className="py-3 px-3.5 w-36">
                  {col.name}
                </th>
              ))}
              <th className="py-3 px-3.5 w-44">Sketches / Images</th>
              <th className="py-3 px-3.5 w-32 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/70">
            {filteredComments.length === 0 ? (
              <tr>
                <td
                  colSpan={7 + visibleCustomColumns.length}
                  className="py-12 text-center text-slate-500"
                >
                  No comments or lore entries match the current filters.
                </td>
              </tr>
            ) : (
              filteredComments.map((comm) => {
                const isEditing = editingCommentId === comm.id;

                if (isEditing) {
                  const previewNormalizedCoord = normalizeCellCoord(editCoord);
                  const previewCellObj = cellByMapAndCoord.get(
                    `${editMapId}::${previewNormalizedCoord}`
                  );
                  const editMapCells = cells.filter(
                    (c) => c.mapId === editMapId && c.state !== 'blocked_x'
                  );

                  return (
                    <tr
                      key={comm.id}
                      className="bg-amber-500/5 border-y border-amber-500/40"
                    >
                      {/* Edit Map */}
                      <td className="py-3 px-3.5 align-top">
                        <select
                          value={editMapId}
                          onChange={(e) => setEditMapId(e.target.value)}
                          className="w-full bg-slate-950 border border-amber-500/60 rounded px-2 py-1.5 text-xs text-slate-100 focus:outline-none"
                        >
                          {maps.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.codePrefix} — {m.name}
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* Edit Cell Coordinate */}
                      <td className="py-3 px-3 align-top">
                        <input
                          type="text"
                          list={`cell-coords-${comm.id}`}
                          value={editCoord}
                          onChange={(e) => setEditCoord(e.target.value)}
                          placeholder="$C$2"
                          className="w-20 bg-slate-950 border border-amber-500/60 rounded px-2 py-1.5 font-mono font-bold text-xs text-amber-300 focus:outline-none"
                        />
                        <datalist id={`cell-coords-${comm.id}`}>
                          {editMapCells.map((c) => (
                            <option key={c.id} value={c.coord}>
                              {c.roomName ? `${c.coord} — ${c.roomName}` : c.coord}
                            </option>
                          ))}
                        </datalist>
                      </td>

                      {/* Live Resolved Room Name Preview */}
                      <td className="py-3 px-3.5 align-top">
                        {previewCellObj ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="font-medium text-slate-200">
                              {previewCellObj.roomName || (
                                <span className="text-slate-500 italic">
                                  Unnamed Room
                                </span>
                              )}
                            </span>
                            <span className="text-[10px] text-emerald-400">
                              ✓ Links to {previewNormalizedCoord}
                            </span>
                          </div>
                        ) : (
                          <span className="text-[11px] text-rose-400">
                            Coordinate outside map grid
                          </span>
                        )}
                      </td>

                      {/* Edit Category */}
                      <td className="py-3 px-3 align-top">
                        <select
                          value={editCategory}
                          onChange={(e) => setEditCategory(e.target.value)}
                          className="w-full bg-slate-950 border border-amber-500/60 rounded px-1.5 py-1.5 text-[11px] text-slate-100 focus:outline-none"
                        >
                          {commentCategories.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.code} — {c.name}
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* Edit Speaker + Content (+ any non-column custom fields) */}
                      <td className="py-3 px-4 align-top">
                        <div className="flex flex-col gap-2">
                          <input
                            type="text"
                            value={editSpeaker}
                            onChange={(e) => setEditSpeaker(e.target.value)}
                            placeholder='Speaker or Title (e.g., "NPC Thor", "T2: Prophecy")'
                            className="w-full bg-slate-950 border border-slate-700 focus:border-amber-400 rounded px-2.5 py-1 text-xs font-semibold text-slate-100 focus:outline-none"
                          />
                          <textarea
                            rows={3}
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            placeholder="Full transcript, quote, or TODO details..."
                            className="w-full bg-slate-950 border border-slate-700 focus:border-amber-400 rounded p-2 text-xs text-slate-100 focus:outline-none"
                          />
                          {hiddenCustomFields.length > 0 && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-slate-800/80">
                              {hiddenCustomFields.map((field) => (
                                <div key={field.id}>
                                  <label className="block text-[10px] text-slate-400 mb-0.5">
                                    {field.name}
                                  </label>
                                  {field.type === 'select' ? (
                                    <CustomSelectDropdown
                                      value={editCustomFields[field.id] || ''}
                                      options={field.options || []}
                                      placeholder="—"
                                      compact
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
                                      className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-[11px] text-slate-100"
                                    />
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Edit Visible Custom Columns */}
                      {visibleCustomColumns.map((col) => (
                        <td key={col.id} className="py-3 px-3.5 align-top">
                          {col.type === 'select' ? (
                            <CustomSelectDropdown
                              value={editCustomFields[col.id] || ''}
                              options={col.options || []}
                              placeholder="—"
                              compact
                              onChange={(nextVal) =>
                                setEditCustomFields((prev) => ({
                                  ...prev,
                                  [col.id]: nextVal,
                                }))
                              }
                              onAddNewOption={(newOpt) =>
                                onAddCustomFieldOption(col.id, newOpt)
                              }
                            />
                          ) : (
                            <input
                              type="text"
                              value={editCustomFields[col.id] || ''}
                              onChange={(e) =>
                                setEditCustomFields((prev) => ({
                                  ...prev,
                                  [col.id]: e.target.value,
                                }))
                              }
                              placeholder="—"
                              className="w-full bg-slate-950 border border-slate-700 focus:border-amber-400 rounded px-2 py-1 text-[11px] text-slate-100 focus:outline-none"
                            />
                          )}
                        </td>
                      ))}

                      {/* Sketches / Images */}
                      <td className="py-3 px-3.5 align-top">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {comm.attachmentBlobIds.map((blobId) => (
                            <BlobImagePreview
                              key={blobId}
                              blobId={blobId}
                              className="w-14 h-10"
                              onRemove={() =>
                                onRemoveAttachmentFromComment(comm.id, blobId)
                              }
                            />
                          ))}
                        </div>
                      </td>

                      {/* Save / Cancel Edit Actions */}
                      <td className="py-3 px-3.5 align-top text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleSaveRowEdit(comm.id)}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs shadow"
                            title="Save changes & migrate room cell if changed"
                          >
                            <Check size={13} />
                            <span>Save</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingCommentId(null)}
                            className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
                            title="Cancel editing"
                          >
                            <X size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                }

                const mapObj = mapById.get(comm.mapId);
                const cellObj = cellByMapAndCoord.get(
                  `${comm.mapId}::${comm.cellCoord}`
                );
                const catDef = categoryById.get(comm.category);

                return (
                  <tr
                    key={comm.id}
                    className={`hover:bg-slate-800/40 transition-colors ${
                      comm.resolved ? 'opacity-60' : ''
                    }`}
                  >
                    {/* Sheet / Map */}
                    <td className="py-3 px-3.5 align-top">
                      {mapObj ? (
                        <div className="flex items-center gap-1.5">
                          <span className="px-1.5 py-0.5 rounded bg-slate-800 text-amber-300 font-mono font-bold text-[11px]">
                            {mapObj.codePrefix}
                          </span>
                          <span className="text-slate-300 font-medium truncate max-w-[120px]">
                            {mapObj.name}
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-500">Unknown Map</span>
                      )}
                    </td>

                    {/* Cell Coordinate (Jump Button) */}
                    <td className="py-3 px-3 align-top">
                      <button
                        type="button"
                        onClick={() => onJumpToRoom(comm.mapId, comm.cellCoord)}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/15 hover:bg-amber-500 text-amber-300 hover:text-slate-950 border border-amber-500/30 font-mono font-bold text-xs transition-colors"
                        title="Jump to this room on the Map Grid"
                      >
                        <span>{comm.cellCoord}</span>
                        <ExternalLink size={10} />
                      </button>
                    </td>

                    {/* Auto-Resolved Room Name */}
                    <td className="py-3 px-3.5 align-top font-medium text-slate-200">
                      {cellObj?.roomName || (
                        <span className="text-slate-600 italic">
                          Unnamed Room
                        </span>
                      )}
                    </td>

                    {/* Category Badge */}
                    <td className="py-3 px-3 align-top">
                      <span
                        style={{
                          backgroundColor: `${catDef?.badgeColor || '#3b82f6'}22`,
                          borderColor: `${catDef?.badgeColor || '#3b82f6'}66`,
                          color: catDef?.badgeColor || '#60a5fa',
                        }}
                        className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase border"
                      >
                        {catDef?.code || comm.category}
                      </span>
                    </td>

                    {/* Speaker/Header + Highlighted Content */}
                    <td className="py-3 px-4 align-top">
                      {comm.speakerOrTitle && (
                        <div className="font-bold text-slate-100 mb-0.5">
                          {comm.speakerOrTitle}
                        </div>
                      )}
                      <div
                        className={`text-slate-300 whitespace-pre-wrap leading-relaxed ${
                          comm.resolved ? 'line-through' : ''
                        }`}
                      >
                        {renderHighlightedLoreText(comm.content)}
                      </div>
                    </td>

                    {/* Custom User-Defined Columns */}
                    {visibleCustomColumns.map((col) => (
                      <td key={col.id} className="py-3 px-3.5 align-top">
                        {col.type === 'select' ? (
                          <CustomSelectDropdown
                            value={comm.customFields?.[col.id] || ''}
                            options={col.options || []}
                            placeholder="—"
                            compact
                            onChange={(nextVal) =>
                              onUpdateComment(comm.id, {
                                customFields: {
                                  ...(comm.customFields || {}),
                                  [col.id]: nextVal,
                                },
                              })
                            }
                            onAddNewOption={(newOpt) =>
                              onAddCustomFieldOption(col.id, newOpt)
                            }
                          />
                        ) : (
                          <BufferedCustomTextInput
                            value={comm.customFields?.[col.id] || ''}
                            placeholder="—"
                            onCommit={(nextVal) =>
                              onUpdateComment(comm.id, {
                                customFields: {
                                  ...(comm.customFields || {}),
                                  [col.id]: nextVal,
                                },
                              })
                            }
                          />
                        )}
                      </td>
                    ))}

                    {/* Attached Images & Sketches */}
                    <td className="py-3 px-3.5 align-top">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {comm.attachmentBlobIds.map((blobId) => (
                          <BlobImagePreview
                            key={blobId}
                            blobId={blobId}
                            className="w-14 h-10"
                            onRemove={() =>
                              onRemoveAttachmentFromComment(comm.id, blobId)
                            }
                          />
                        ))}
                        <label
                          title="Upload image attachment"
                          className="p-1.5 rounded bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-cyan-300 border border-slate-800 cursor-pointer"
                        >
                          <ImagePlus size={12} />
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
                          className="p-1.5 rounded bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-amber-300 border border-slate-800"
                          title="Draw freehand sketch"
                        >
                          <PenTool size={12} />
                        </button>
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-3.5 align-top text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleStartRowEdit(comm)}
                          className="p-1.5 rounded bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-amber-300 border border-slate-800"
                          title="Edit row (Map, Cell Coordinate, Category, Speaker, Content & Custom Fields)"
                        >
                          <Edit3 size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateComment(comm.id, {
                              resolved: !comm.resolved,
                            })
                          }
                          className={`p-1.5 rounded border ${
                            comm.resolved
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                              : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                          }`}
                          title="Toggle Resolved / Solved"
                        >
                          <CheckCircle2 size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteComment(comm.id)}
                          className="p-1.5 rounded bg-slate-900 hover:bg-rose-950/60 text-slate-400 hover:text-rose-400 border border-slate-800"
                          title="Delete entry"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

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
};
