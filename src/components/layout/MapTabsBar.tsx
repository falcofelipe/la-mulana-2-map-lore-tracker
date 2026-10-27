/**
 * MapTabsBar Component
 * --------------------
 * Renders the horizontal bar of customizable field map tabs (e.g.,
 * "YgA Roots of Yggdrasil", "DfA Divine Fortress"), with inline dialogs for
 * creating a new map, renaming/reordering the active map, or deleting it.
 */

import React, { useState } from 'react';
import {
  Plus,
  Edit3,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Check,
  X,
} from 'lucide-react';
import { MapPage } from '../../types/models';

interface MapTabsBarProps {
  maps: MapPage[];
  activeMapId: string;
  onSelectMap: (mapId: string) => void;
  onCreateMap: (codePrefix: string, name: string, rows: number, cols: number) => Promise<void>;
  onUpdateMap: (
    mapId: string,
    updates: Partial<Pick<MapPage, 'codePrefix' | 'name'>>
  ) => Promise<void>;
  onReorderMaps: (orderedIds: string[]) => Promise<void>;
  onDeleteMap: (mapId: string) => Promise<void>;
}

export const MapTabsBar: React.FC<MapTabsBarProps> = ({
  maps,
  activeMapId,
  onSelectMap,
  onCreateMap,
  onUpdateMap,
  onReorderMaps,
  onDeleteMap,
}) => {
  const [isCreating, setIsCreating] = useState(false);
  const [newPrefix, setNewPrefix] = useState('');
  const [newName, setNewName] = useState('');
  const [newRows, setNewRows] = useState(7);
  const [newCols, setNewCols] = useState(8);

  const [editingMapId, setEditingMapId] = useState<string | null>(null);
  const [editPrefix, setEditPrefix] = useState('');
  const [editName, setEditName] = useState('');

  const handleStartCreate = () => {
    const nextNum = maps.length + 1;
    setNewPrefix(`F0${nextNum}`);
    setNewName('');
    setNewRows(7);
    setNewCols(8);
    setIsCreating(true);
  };

  const handleConfirmCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await onCreateMap(
      newPrefix.trim() || `F0${maps.length + 1}`,
      newName.trim() || `Field ${maps.length + 1}`,
      newRows,
      newCols
    );
    setIsCreating(false);
  };

  const handleStartEdit = (map: MapPage) => {
    setEditingMapId(map.id);
    setEditPrefix(map.codePrefix);
    setEditName(map.name);
  };

  const handleConfirmEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMapId) return;
    await onUpdateMap(editingMapId, {
      codePrefix: editPrefix.trim() || 'MAP',
      name: editName.trim() || 'Unnamed Map',
    });
    setEditingMapId(null);
  };

  const handleMoveTab = async (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= maps.length) return;
    const ids = maps.map((m) => m.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(targetIndex, 0, moved);
    await onReorderMaps(ids);
  };

  return (
    <div className="bg-slate-900/90 border-b border-slate-800 px-4 py-1.5 flex items-center justify-between gap-3 shrink-0 z-20">
      {/* Scrollable Tabs Container */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
        {maps.map((map, idx) => {
          const isActive = map.id === activeMapId;
          const isEditingThis = editingMapId === map.id;

          if (isEditingThis) {
            return (
              <form
                key={map.id}
                onSubmit={handleConfirmEdit}
                className="flex items-center gap-1.5 bg-slate-800 border border-amber-500/60 rounded-md px-2 py-1 text-xs"
              >
                <input
                  type="text"
                  value={editPrefix}
                  onChange={(e) => setEditPrefix(e.target.value)}
                  placeholder="Code (e.g. YgA)"
                  className="w-14 bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-amber-300 font-mono text-xs focus:outline-none focus:border-amber-400"
                  maxLength={8}
                  autoFocus
                />
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Field Name"
                  className="w-40 bg-slate-950 border border-slate-700 rounded px-2 py-0.5 text-slate-100 text-xs focus:outline-none focus:border-amber-400"
                />
                <button
                  type="submit"
                  className="p-1 rounded bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30"
                  title="Save Map Name"
                >
                  <Check size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => setEditingMapId(null)}
                  className="p-1 rounded bg-slate-700 text-slate-300 hover:bg-slate-600"
                  title="Cancel"
                >
                  <X size={13} />
                </button>
              </form>
            );
          }

          return (
            <div
              key={map.id}
              onClick={() => onSelectMap(map.id)}
              onDoubleClick={() => handleStartEdit(map)}
              className={`group flex items-center gap-2 px-3 py-1.5 rounded-md text-xs cursor-pointer transition-all border shrink-0 ${
                isActive
                  ? 'bg-slate-800 border-amber-500/60 text-slate-100 shadow-sm'
                  : 'bg-slate-950/60 border-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <span
                className={`font-mono font-bold px-1.5 py-0.5 rounded text-[11px] ${
                  isActive
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    : 'bg-slate-900 text-slate-400'
                }`}
              >
                {map.codePrefix}
              </span>
              <span className="font-medium truncate max-w-[160px]">{map.name}</span>
              <span className="text-[10px] text-slate-500 font-mono">
                {map.cols}×{map.rows}
              </span>

              {isActive && (
                <div
                  className="flex items-center gap-0.5 ml-1 pl-1.5 border-l border-slate-700"
                  onClick={(e) => e.stopPropagation()}
                >
                  {idx > 0 && (
                    <button
                      type="button"
                      onClick={() => handleMoveTab(idx, -1)}
                      className="p-0.5 text-slate-400 hover:text-slate-200"
                      title="Move Tab Left"
                    >
                      <ChevronLeft size={12} />
                    </button>
                  )}
                  {idx < maps.length - 1 && (
                    <button
                      type="button"
                      onClick={() => handleMoveTab(idx, 1)}
                      className="p-0.5 text-slate-400 hover:text-slate-200"
                      title="Move Tab Right"
                    >
                      <ChevronRight size={12} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleStartEdit(map)}
                    className="p-0.5 text-slate-400 hover:text-amber-300"
                    title="Rename Map Tab (or double-click tab)"
                  >
                    <Edit3 size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (
                        window.confirm(
                          `Delete map "${map.codePrefix} ${map.name}" and all its room screenshots and comments?`
                        )
                      ) {
                        onDeleteMap(map.id);
                      }
                    }}
                    className="p-0.5 text-slate-400 hover:text-rose-400"
                    title="Delete Map Tab"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {/* + New Map Button or Inline Form */}
        {!isCreating ? (
          <button
            type="button"
            onClick={handleStartCreate}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 transition-colors shrink-0"
          >
            <Plus size={14} />
            <span>New Map</span>
          </button>
        ) : (
          <form
            onSubmit={handleConfirmCreate}
            className="flex items-center gap-1.5 bg-slate-800 border border-amber-500/50 rounded-md px-2.5 py-1 text-xs shrink-0"
          >
            <input
              type="text"
              value={newPrefix}
              onChange={(e) => setNewPrefix(e.target.value)}
              placeholder="Code (e.g. YgA)"
              className="w-16 bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-amber-300 font-mono text-xs focus:outline-none focus:border-amber-400"
              maxLength={8}
              autoFocus
            />
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Area Name (e.g. Roots of Yggdrasil)"
              className="w-44 bg-slate-950 border border-slate-700 rounded px-2 py-0.5 text-slate-100 text-xs focus:outline-none focus:border-amber-400"
            />
            <div className="flex items-center gap-1 text-[11px] text-slate-400">
              <span>Cols:</span>
              <input
                type="number"
                min={2}
                max={26}
                value={newCols}
                onChange={(e) => setNewCols(Number(e.target.value))}
                className="w-11 bg-slate-950 border border-slate-700 rounded px-1 py-0.5 text-center text-slate-200"
              />
              <span>Rows:</span>
              <input
                type="number"
                min={2}
                max={26}
                value={newRows}
                onChange={(e) => setNewRows(Number(e.target.value))}
                className="w-11 bg-slate-950 border border-slate-700 rounded px-1 py-0.5 text-center text-slate-200"
              />
            </div>
            <button
              type="submit"
              className="px-2 py-0.5 rounded bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400"
            >
              Create
            </button>
            <button
              type="button"
              onClick={() => setIsCreating(false)}
              className="p-0.5 text-slate-400 hover:text-slate-200"
            >
              <X size={14} />
            </button>
          </form>
        )}
      </div>

      {/* Quick Hint on Right */}
      <div className="hidden xl:flex items-center gap-3 text-[11px] text-slate-400 shrink-0">
        <span>
          <strong className="text-slate-300">Click cell + Ctrl+V:</strong> Paste 16:9 Screenshot
        </span>
        <span>•</span>
        <span>
          <strong className="text-slate-300">Press X:</strong> Mark Blocked
        </span>
        <span>•</span>
        <span>
          <strong className="text-slate-300">Double-click / Enter:</strong> Inspect Room
        </span>
      </div>
    </div>
  );
};
