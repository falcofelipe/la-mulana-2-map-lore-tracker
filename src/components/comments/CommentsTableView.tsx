/**
 * CommentsTableView Component
 * ---------------------------
 * Full-screen spreadsheet-style relational database view replacing the Excel
 * "Comments" tab. Supports multi-column filtering, instant keyword search,
 * custom comment field columns, image/sketch attachments, and one-click
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
} from 'lucide-react';
import {
  CommentCategoryDefinition,
  CommentEntry,
  CustomFieldDefinition,
  GridCell,
  MapPage,
} from '../../types/models';
import { renderHighlightedLoreText } from '../../utils/textHighlight';
import { BlobImagePreview } from '../common/BlobImagePreview';
import { CustomSelectDropdown } from './CustomSelectDropdown';
import { RaceTribeSelector } from './RaceTribeSelector';
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
  raceOrTribeOptions: string[];
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
  onAddNewRaceOrTribe: (name: string) => Promise<void>;
  onAddCustomFieldOption: (fieldId: string, newOption: string) => Promise<void>;
}

export const CommentsTableView: React.FC<CommentsTableViewProps> = ({
  maps,
  cells,
  comments,
  commentCategories,
  raceOrTribeOptions,
  customCommentFields,
  onJumpToRoom,
  onCreateComment,
  onUpdateComment,
  onDeleteComment,
  onAttachImageToComment,
  onRemoveAttachmentFromComment,
  onAddNewRaceOrTribe,
  onAddCustomFieldOption,
}) => {
  // Multi-column Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMapId, setFilterMapId] = useState('ALL');
  const [filterCategory, setFilterCategory] = useState('ALL');
  const [filterRace, setFilterRace] = useState('ALL');
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
  const [addRace, setAddRace] = useState('');
  const [addCustomFields, setAddCustomFields] = useState<Record<string, string>>({});

  // Sketch Modal Target
  const [sketchTargetCommentId, setSketchTargetCommentId] = useState<string | null>(
    null
  );

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

  const filteredComments = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return comments.filter((comm) => {
      if (filterMapId !== 'ALL' && comm.mapId !== filterMapId) return false;
      if (filterCategory !== 'ALL' && comm.category !== filterCategory)
        return false;
      if (filterRace !== 'ALL' && (comm.raceOrTribe || '') !== filterRace)
        return false;
      if (onlyUnresolvedTodos && (comm.category !== 'todo' || comm.resolved))
        return false;

      if (q) {
        const mapObj = mapById.get(comm.mapId);
        const cellObj = cellByMapAndCoord.get(`${comm.mapId}::${comm.cellCoord}`);
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
          comm.raceOrTribe,
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
    filterRace,
    onlyUnresolvedTodos,
    mapById,
    cellByMapAndCoord,
  ]);

  const handleQuickAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addContent.trim() && !addSpeaker.trim()) return;

    const targetMapId = addMapId || maps[0]?.id;
    if (!targetMapId) return;

    const cleanCoord = addCoord.trim().toUpperCase().startsWith('$')
      ? addCoord.trim().toUpperCase()
      : `$${addCoord.trim().toUpperCase().replace(/([A-Z]+)(\d+)/, '$1$$$2')}`;

    await onCreateComment({
      mapId: targetMapId,
      cellCoord: cleanCoord,
      category: addCategory,
      speakerOrTitle: addSpeaker.trim() || undefined,
      content: addContent.trim(),
      raceOrTribe: addRace.trim() || undefined,
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

  const resetFilters = () => {
    setSearchQuery('');
    setFilterMapId('ALL');
    setFilterCategory('ALL');
    setFilterRace('ALL');
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

          {/* Filter by Race/Tribe */}
          <select
            value={filterRace}
            onChange={(e) => setFilterRace(e.target.value)}
            className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
          >
            <option value="ALL">All Races / Tribes</option>
            {raceOrTribeOptions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>

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
            filterRace !== 'ALL' ||
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
            Showing <strong className="text-slate-100">{filteredComments.length}</strong> of{' '}
            {comments.length} entries
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 text-xs">
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Map</label>
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

            <div>
              <label className="block text-[11px] text-slate-400 mb-1">
                Race / Tribe
              </label>
              <RaceTribeSelector
                value={addRace}
                options={raceOrTribeOptions}
                onChange={setAddRace}
                onAddNewOption={onAddNewRaceOrTribe}
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
              <th className="py-3 px-4 min-w-[320px]">Replies / Tablet &amp; NPC Content</th>
              <th className="py-3 px-3.5 w-36">Race / Tribe</th>
              {visibleCustomColumns.map((col) => (
                <th key={col.id} className="py-3 px-3.5 w-36">
                  {col.name}
                </th>
              ))}
              <th className="py-3 px-3.5 w-44">Sketches / Images</th>
              <th className="py-3 px-3.5 w-28 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/70">
            {filteredComments.length === 0 ? (
              <tr>
                <td
                  colSpan={8 + visibleCustomColumns.length}
                  className="py-12 text-center text-slate-500"
                >
                  No comments or lore entries match the current filters.
                </td>
              </tr>
            ) : (
              filteredComments.map((comm) => {
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
                        <span className="text-slate-600 italic">Unnamed Room</span>
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

                    {/* Race / Tribe */}
                    <td className="py-3 px-3.5 align-top">
                      <select
                        value={comm.raceOrTribe || ''}
                        onChange={(e) =>
                          onUpdateComment(comm.id, {
                            raceOrTribe: e.target.value || undefined,
                          })
                        }
                        className="w-full bg-slate-950/90 border border-slate-800 rounded px-2 py-1 text-[11px] text-purple-300 font-medium"
                      >
                        <option value="">—</option>
                        {raceOrTribeOptions.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                        {comm.raceOrTribe &&
                          !raceOrTribeOptions.includes(comm.raceOrTribe) && (
                            <option value={comm.raceOrTribe}>
                              {comm.raceOrTribe}
                            </option>
                          )}
                      </select>
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
                          onClick={() =>
                            onUpdateComment(comm.id, { resolved: !comm.resolved })
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
