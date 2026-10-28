/**
 * SettingsAndCustomizeView Component
 * ----------------------------------
 * Provides user-friendly controls for:
 * 1. Portable ZIP Backup Export/Import, Storage Diagnostics, & Reset.
 * 2. Custom Pin Marker Manager (add new marker types, change icons/colors/macro visibility).
 * 3. Spoiler-Free Room Flags Manager (add, rename across rooms, or delete room flags).
 * 4. Custom Comment Fields Manager (add custom text or filterable select fields to comments & table columns).
 */

import React, { useState } from 'react';
import {
  Download,
  Upload,
  RotateCcw,
  MapPin,
  MessageSquare,
  Tag,
  Columns,
  Plus,
  Trash2,
  HardDrive,
  Check,
  Edit3,
  X,
  ScanText,
} from 'lucide-react';
import {
  CommentCategoryDefinition,
  CustomFieldDefinition,
  MarkerDefinition,
  MarkerIconKey,
  ProjectConfig,
  SeamlessCaptureConfig,
  TabletScannerConfig,
} from '../../types/models';
import { DEFAULT_TABLET_SCANNER_CONFIG } from '../../config/defaultDefinitions';
import {
  AVAILABLE_MARKER_ICONS,
  MarkerIcon,
} from '../common/MarkerIcon';
import { SeamlessCaptureSettingsSection } from './SeamlessCaptureSettingsSection';

interface SettingsAndCustomizeViewProps {
  config: ProjectConfig;
  storageStats: {
    mapCount: number;
    roomCount: number;
    commentCount: number;
    blobCount: number;
    totalBytes: number;
  };
  onUpdateProjectTitle: (title: string) => Promise<void>;
  onSaveMarkerDefinitions: (defs: MarkerDefinition[]) => Promise<void>;
  onSaveCommentCategories: (cats: CommentCategoryDefinition[]) => Promise<void>;
  onUpdateRoomFlagOptions: (
    nextOptions: string[],
    renamedOrDeleted?: { oldName: string; newName: string }
  ) => Promise<void>;
  onSaveCustomCommentFields: (fields: CustomFieldDefinition[]) => Promise<void>;
  onUpdateCustomFieldOptions: (
    fieldId: string,
    nextOptions: string[],
    renamedOrDeleted?: { oldName: string; newName: string }
  ) => Promise<void>;
  onSaveTabletScannerConfig: (
    scannerConfig: TabletScannerConfig
  ) => Promise<void>;
  onSaveSeamlessCaptureConfig: (
    seamlessConfig: SeamlessCaptureConfig
  ) => Promise<void>;
  seamlessCaptureRuntime: {
    isElectron: boolean;
    electronStatus: {
      roomRegistered: boolean;
      tabletRegistered: boolean;
      watchingSteamFolder: boolean;
      steamFolderPath?: string;
      error?: string;
    };
    isWebStreamConnected: boolean;
    webStreamLabel: string | null;
    onConnectWebStream: () => Promise<void>;
    onDisconnectWebStream: () => void;
    isWebFolderWatching: boolean;
    watchedFolderName: string | null;
    onStartWebFolderWatch: () => Promise<void>;
    onStopWebFolderWatch: () => void;
    onToggleElectronSteamWatch: (
      enable: boolean,
      customPath?: string
    ) => Promise<void>;
    onOpenCalibratorWithSample: (
      mode: 'room' | 'tablet',
      sampleBlob?: Blob
    ) => Promise<void>;
  };
  onExportZip: () => Promise<void>;
  onImportZip: (file: File) => Promise<void>;
  onResetToBlank: () => Promise<void>;
}

export const SettingsAndCustomizeView: React.FC<
  SettingsAndCustomizeViewProps
> = ({
  config,
  storageStats,
  onUpdateProjectTitle,
  onSaveMarkerDefinitions,
  onSaveCommentCategories,
  onUpdateRoomFlagOptions,
  onSaveCustomCommentFields,
  onUpdateCustomFieldOptions,
  onSaveTabletScannerConfig,
  onSaveSeamlessCaptureConfig,
  seamlessCaptureRuntime,
  onExportZip,
  onImportZip,
  onResetToBlank,
}) => {
  // 1. Custom Marker creation & inline editing state
  const [newMarkerName, setNewMarkerName] = useState('');
  const [newMarkerDesc, setNewMarkerDesc] = useState('');
  const [newMarkerIcon, setNewMarkerIcon] = useState<MarkerIconKey>('star');
  const [newMarkerColor, setNewMarkerColor] = useState('#eab308');
  const [newMarkerSymbol, setNewMarkerSymbol] = useState('');
  const [newMarkerShowOnMacro, setNewMarkerShowOnMacro] = useState(true);

  const [editingMarkerId, setEditingMarkerId] = useState<string | null>(null);
  const [editMarkerName, setEditMarkerName] = useState('');
  const [editMarkerDesc, setEditMarkerDesc] = useState('');
  const [editMarkerIcon, setEditMarkerIcon] = useState<MarkerIconKey>('star');
  const [editMarkerSymbol, setEditMarkerSymbol] = useState('');
  const [editMarkerColor, setEditMarkerColor] = useState('#eab308');

  // 1b. Comment Categories creation & inline editing state
  const [newCatCode, setNewCatCode] = useState('');
  const [newCatName, setNewCatName] = useState('');
  const [newCatColor, setNewCatColor] = useState('#06b6d4');
  const [newCatSupportsResolved, setNewCatSupportsResolved] = useState(false);

  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editCatCode, setEditCatCode] = useState('');
  const [editCatName, setEditCatName] = useState('');
  const [editCatColor, setEditCatColor] = useState('#06b6d4');
  const [editCatSupportsResolved, setEditCatSupportsResolved] = useState(false);

  // 2. Room Flags manager state
  const [newRoomFlagName, setNewRoomFlagName] = useState('');
  const [editingRoomFlagIdx, setEditingRoomFlagIdx] = useState<number | null>(
    null
  );
  const [editingRoomFlagValue, setEditingRoomFlagValue] = useState('');

  // 3. Custom Comment Field creation & option editing state
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldType, setNewFieldType] = useState<'text' | 'select'>('select');
  const [newFieldOptionsRaw, setNewFieldOptionsRaw] = useState('');
  const [newFieldShowInTable, setNewFieldShowInTable] = useState(true);
  const [newFieldFilterable, setNewFieldFilterable] = useState(true);

  const [addingOptionFieldId, setAddingOptionFieldId] = useState<string | null>(
    null
  );
  const [newOptionValue, setNewOptionValue] = useState('');
  const [editingOptionTarget, setEditingOptionTarget] = useState<{
    fieldId: string;
    optIdx: number;
  } | null>(null);
  const [editingOptionValue, setEditingOptionValue] = useState('');

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  // Marker handlers
  const handleAddMarkerDef = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMarkerName.trim()) return;

    const newDef: MarkerDefinition = {
      id: `marker-custom-${Date.now()}`,
      name: newMarkerName.trim(),
      description: newMarkerDesc.trim() || 'Custom user marker',
      iconKey: newMarkerIcon,
      defaultColor: newMarkerColor,
      defaultSymbol: newMarkerSymbol.trim() || undefined,
      showShortLabelOnMacro: newMarkerShowOnMacro,
      isBuiltIn: false,
    };

    await onSaveMarkerDefinitions([...config.markerDefinitions, newDef]);
    setNewMarkerName('');
    setNewMarkerDesc('');
    setNewMarkerSymbol('');
  };

  const handleToggleMarkerMacroVisibility = async (markerId: string) => {
    const next = config.markerDefinitions.map((m) =>
      m.id === markerId
        ? { ...m, showShortLabelOnMacro: !m.showShortLabelOnMacro }
        : m
    );
    await onSaveMarkerDefinitions(next);
  };

  const handleUpdateMarkerColor = async (markerId: string, color: string) => {
    const next = config.markerDefinitions.map((m) =>
      m.id === markerId ? { ...m, defaultColor: color } : m
    );
    await onSaveMarkerDefinitions(next);
  };

  const handleDeleteMarkerDef = async (markerId: string, markerName: string) => {
    if (
      !window.confirm(
        `Delete marker category "${markerName}"?\n\nAny existing pins of this type on your maps will be converted into red "BROKEN" markers so you can easily spot and reassign or delete them.`
      )
    ) {
      return;
    }
    const next = config.markerDefinitions.filter((m) => m.id !== markerId);
    await onSaveMarkerDefinitions(next);
  };

  const handleStartEditMarker = (def: MarkerDefinition) => {
    setEditingMarkerId(def.id);
    setEditMarkerName(def.name);
    setEditMarkerDesc(def.description || '');
    setEditMarkerIcon(def.iconKey);
    setEditMarkerSymbol(def.defaultSymbol || '');
    setEditMarkerColor(def.defaultColor);
  };

  const handleSaveEditMarker = async (markerId: string) => {
    if (!editMarkerName.trim()) return;
    const next = config.markerDefinitions.map((m) =>
      m.id === markerId
        ? {
            ...m,
            name: editMarkerName.trim(),
            description: editMarkerDesc.trim(),
            iconKey: editMarkerIcon,
            defaultSymbol: editMarkerSymbol.trim() || undefined,
            defaultColor: editMarkerColor,
          }
        : m
    );
    await onSaveMarkerDefinitions(next);
    setEditingMarkerId(null);
  };

  // Comment Category handlers
  const handleAddCommentCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = newCatCode.trim();
    const name = newCatName.trim();
    if (!code || !name) return;

    const newCat: CommentCategoryDefinition = {
      id: `cat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      code,
      name,
      badgeColor: newCatColor,
      supportsResolved: newCatSupportsResolved,
    };
    await onSaveCommentCategories([...config.commentCategories, newCat]);
    setNewCatCode('');
    setNewCatName('');
    setNewCatSupportsResolved(false);
  };

  const handleStartEditCat = (cat: CommentCategoryDefinition) => {
    setEditingCatId(cat.id);
    setEditCatCode(cat.code);
    setEditCatName(cat.name);
    setEditCatColor(cat.badgeColor);
    setEditCatSupportsResolved(Boolean(cat.supportsResolved));
  };

  const handleSaveEditCat = async (catId: string) => {
    if (!editCatCode.trim() || !editCatName.trim()) return;
    const next = config.commentCategories.map((c) =>
      c.id === catId
        ? {
            ...c,
            code: editCatCode.trim(),
            name: editCatName.trim(),
            badgeColor: editCatColor,
            supportsResolved: editCatSupportsResolved,
          }
        : c
    );
    await onSaveCommentCategories(next);
    setEditingCatId(null);
  };

  const handleDeleteCommentCategory = async (
    catId: string,
    catName: string
  ) => {
    if (config.commentCategories.length <= 1) {
      window.alert('At least one comment category must remain.');
      return;
    }
    if (
      !window.confirm(
        `Delete comment category "${catName}"?\n\nAny existing comments using this category will be reassigned to "${config.commentCategories[0]?.name || 'General Note'}".`
      )
    ) {
      return;
    }
    const next = config.commentCategories.filter((c) => c.id !== catId);
    await onSaveCommentCategories(next);
  };

  // Room Flags handlers
  const roomFlags = config.roomFlagOptions || [];

  const handleAddRoomFlag = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newRoomFlagName.trim();
    if (!clean) return;
    if (
      !roomFlags.some((flag) => flag.toLowerCase() === clean.toLowerCase())
    ) {
      await onUpdateRoomFlagOptions([...roomFlags, clean]);
    }
    setNewRoomFlagName('');
  };

  const handleSaveRenameRoomFlag = async (idx: number) => {
    const oldName = roomFlags[idx];
    const newName = editingRoomFlagValue.trim();
    if (!newName) return;

    const next = [...roomFlags];
    next[idx] = newName;
    await onUpdateRoomFlagOptions(next, { oldName, newName });
    setEditingRoomFlagIdx(null);
  };

  const handleDeleteRoomFlag = async (idx: number) => {
    const oldName = roomFlags[idx];
    const next = roomFlags.filter((_, i) => i !== idx);
    await onUpdateRoomFlagOptions(next, { oldName, newName: '' });
  };

  // Custom Comment Field handlers
  const handleAddCustomField = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFieldName.trim()) return;

    const newField: CustomFieldDefinition = {
      id: `cf-${Date.now()}`,
      name: newFieldName.trim(),
      type: newFieldType,
      options:
        newFieldType === 'select'
          ? newFieldOptionsRaw
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          : undefined,
      showInTable: newFieldShowInTable,
      filterable: newFieldFilterable,
    };

    await onSaveCustomCommentFields([...config.customCommentFields, newField]);
    setNewFieldName('');
    setNewFieldOptionsRaw('');
  };

  const handleToggleCustomFieldInTable = async (fieldId: string) => {
    const next = config.customCommentFields.map((f) =>
      f.id === fieldId ? { ...f, showInTable: !f.showInTable } : f
    );
    await onSaveCustomCommentFields(next);
  };

  const handleToggleCustomFieldFilterable = async (fieldId: string) => {
    const next = config.customCommentFields.map((f) =>
      f.id === fieldId ? { ...f, filterable: !f.filterable } : f
    );
    await onSaveCustomCommentFields(next);
  };

  const handleDeleteCustomField = async (fieldId: string) => {
    const next = config.customCommentFields.filter((f) => f.id !== fieldId);
    await onSaveCustomCommentFields(next);
  };

  const handleAddOptionToField = async (field: CustomFieldDefinition) => {
    const clean = newOptionValue.trim();
    if (!clean) {
      setAddingOptionFieldId(null);
      return;
    }
    const existing = field.options || [];
    if (!existing.some((o) => o.toLowerCase() === clean.toLowerCase())) {
      await onUpdateCustomFieldOptions(field.id, [...existing, clean]);
    }
    setNewOptionValue('');
    setAddingOptionFieldId(null);
  };

  const handleSaveRenameOptionOnField = async (
    field: CustomFieldDefinition,
    optIdx: number
  ) => {
    const existing = field.options || [];
    const oldName = existing[optIdx];
    const newName = editingOptionValue.trim();
    if (!newName) return;

    const next = [...existing];
    next[optIdx] = newName;
    await onUpdateCustomFieldOptions(field.id, next, { oldName, newName });
    setEditingOptionTarget(null);
  };

  const handleDeleteOptionOnField = async (
    field: CustomFieldDefinition,
    optIdx: number
  ) => {
    const existing = field.options || [];
    const oldName = existing[optIdx];
    const next = existing.filter((_, i) => i !== optIdx);
    await onUpdateCustomFieldOptions(field.id, next, { oldName, newName: '' });
  };

  return (
    <div className="flex-1 overflow-y-auto bg-slate-950 p-6">
      <div className="max-w-6xl mx-auto flex flex-col gap-6">
        {/* SECTION 1: BACKUP, PORTABILITY & LOCAL STORAGE STATS */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <div>
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <HardDrive size={18} className="text-amber-400" />
                <span>Project Backup, Portability &amp; Local Storage</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                All maps and screenshots are stored locally in IndexedDB as compressed WebP blobs (no 5MB limit). Export a ZIP backup anytime.
              </p>
            </div>

            {/* Project Title Input */}
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-400">Expedition Title:</span>
              <input
                type="text"
                value={config.projectTitle}
                onChange={(e) => onUpdateProjectTitle(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded-md px-3 py-1.5 text-slate-100 font-semibold focus:outline-none focus:border-amber-400"
              />
            </div>
          </div>

          {/* Storage Metrics Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3">
              <div className="text-[11px] text-slate-400">Map Tabs</div>
              <div className="text-lg font-bold text-slate-100 mt-0.5">
                {storageStats.mapCount}
              </div>
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3">
              <div className="text-[11px] text-slate-400">Active Rooms</div>
              <div className="text-lg font-bold text-slate-100 mt-0.5">
                {storageStats.roomCount}
              </div>
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3">
              <div className="text-[11px] text-slate-400">Lore / Comments</div>
              <div className="text-lg font-bold text-slate-100 mt-0.5">
                {storageStats.commentCount}
              </div>
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3">
              <div className="text-[11px] text-slate-400">WebP Image Blobs</div>
              <div className="text-lg font-bold text-slate-100 mt-0.5">
                {storageStats.blobCount}
              </div>
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3">
              <div className="text-[11px] text-slate-400">Local Disk Used</div>
              <div className="text-lg font-bold text-amber-400 mt-0.5">
                {formatBytes(storageStats.totalBytes)}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="button"
              onClick={onExportZip}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 shadow"
            >
              <Download size={15} />
              <span>Export Full Backup (.ZIP)</span>
            </button>

            <label className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 cursor-pointer">
              <Upload size={15} className="text-cyan-400" />
              <span>Import Backup (.ZIP)</span>
              <input
                type="file"
                accept=".zip,application/zip"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    if (
                      window.confirm(
                        'Importing a backup ZIP will replace the current local database. Continue?'
                      )
                    ) {
                      onImportZip(file);
                    }
                  }
                  e.target.value = '';
                }}
              />
            </label>

            <button
              type="button"
              onClick={() => {
                if (
                  window.confirm(
                    'Reset the entire tracker to a blank, spoiler-free state? Export a backup ZIP first if you want to keep your current data!'
                  )
                ) {
                  onResetToBlank();
                }
              }}
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 ml-auto"
            >
              <RotateCcw size={14} />
              <span>Reset to Blank Playthrough</span>
            </button>
          </div>
        </div>

        {/* SECTION 1B: SEAMLESS IN-GAME SCREENSHOT & TABLET CAPTURE */}
        <SeamlessCaptureSettingsSection
          seamlessConfig={config.seamlessCaptureConfig}
          isElectron={seamlessCaptureRuntime.isElectron}
          electronStatus={seamlessCaptureRuntime.electronStatus}
          isWebStreamConnected={seamlessCaptureRuntime.isWebStreamConnected}
          webStreamLabel={seamlessCaptureRuntime.webStreamLabel}
          onConnectWebStream={seamlessCaptureRuntime.onConnectWebStream}
          onDisconnectWebStream={seamlessCaptureRuntime.onDisconnectWebStream}
          isWebFolderWatching={seamlessCaptureRuntime.isWebFolderWatching}
          watchedFolderName={seamlessCaptureRuntime.watchedFolderName}
          onStartWebFolderWatch={seamlessCaptureRuntime.onStartWebFolderWatch}
          onStopWebFolderWatch={seamlessCaptureRuntime.onStopWebFolderWatch}
          onToggleElectronSteamWatch={
            seamlessCaptureRuntime.onToggleElectronSteamWatch
          }
          onOpenCalibratorWithSample={
            seamlessCaptureRuntime.onOpenCalibratorWithSample
          }
          onSaveSeamlessConfig={onSaveSeamlessCaptureConfig}
        />

        {/* SECTION 2: CUSTOM PIN MARKER TYPES MANAGER */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <MapPin size={18} className="text-amber-400" />
              <span>Pin Marker Categories &amp; Custom Markers</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Customize colors and macro-map label visibility for built-in pins, or create your own custom marker categories.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {config.markerDefinitions.map((def) => {
              const isEditing = editingMarkerId === def.id;

              if (isEditing) {
                return (
                  <div
                    key={def.id}
                    className="bg-slate-950 border border-amber-500/60 rounded-lg p-3 flex flex-col gap-2.5 text-xs"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] text-slate-400 mb-0.5">
                          Marker Name
                        </label>
                        <input
                          type="text"
                          value={editMarkerName}
                          onChange={(e) => setEditMarkerName(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-100 font-semibold"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400 mb-0.5">
                          Description
                        </label>
                        <input
                          type="text"
                          value={editMarkerDesc}
                          onChange={(e) => setEditMarkerDesc(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200"
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1 flex-wrap">
                        {AVAILABLE_MARKER_ICONS.map((ic) => (
                          <button
                            key={ic.key}
                            type="button"
                            onClick={() => setEditMarkerIcon(ic.key)}
                            title={ic.label}
                            className={`p-1.5 rounded border ${
                              editMarkerIcon === ic.key
                                ? 'bg-amber-500 text-slate-950 border-amber-400'
                                : 'bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-800'
                            }`}
                          >
                            <MarkerIcon iconKey={ic.key} size={12} />
                          </button>
                        ))}
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          maxLength={3}
                          value={editMarkerSymbol}
                          onChange={(e) => setEditMarkerSymbol(e.target.value)}
                          placeholder="Sym"
                          title="Optional 1-3 char symbol override (leave empty to use Icon)"
                          className="w-14 bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-center font-mono text-slate-100"
                        />
                        <input
                          type="color"
                          value={editMarkerColor}
                          onChange={(e) => setEditMarkerColor(e.target.value)}
                          className="w-7 h-7 rounded bg-slate-900 border border-slate-700 cursor-pointer"
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveEditMarker(def.id)}
                          className="px-2.5 py-1 rounded bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold flex items-center gap-1"
                        >
                          <Check size={12} />
                          <span>Save</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingMarkerId(null)}
                          className="p-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-400"
                        >
                          <X size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={def.id}
                  className="bg-slate-950 border border-slate-800 rounded-lg p-3 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      style={{ backgroundColor: def.defaultColor }}
                      className="w-8 h-8 rounded-full flex items-center justify-center text-slate-950 font-bold text-xs shrink-0 shadow"
                    >
                      {def.defaultSymbol ? (
                        <span>{def.defaultSymbol}</span>
                      ) : (
                        <MarkerIcon iconKey={def.iconKey} size={15} />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-xs text-slate-100 truncate">
                        {def.name}
                      </div>
                      <div className="text-[11px] text-slate-400 truncate">
                        {def.description}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <input
                      type="color"
                      value={def.defaultColor}
                      onChange={(e) =>
                        handleUpdateMarkerColor(def.id, e.target.value)
                      }
                      title="Change Default Pin Color"
                      className="w-7 h-7 rounded bg-slate-900 border border-slate-700 cursor-pointer"
                    />
                    <label className="flex items-center gap-1 text-[11px] text-slate-300 cursor-pointer bg-slate-900 px-2 py-1 rounded border border-slate-800">
                      <input
                        type="checkbox"
                        checked={def.showShortLabelOnMacro}
                        onChange={() => handleToggleMarkerMacroVisibility(def.id)}
                        className="accent-amber-400"
                      />
                      <span>Macro Label</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => handleStartEditMarker(def)}
                      className="p-1.5 rounded bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-amber-300 border border-slate-800"
                      title="Edit marker name, icon, or symbol"
                    >
                      <Edit3 size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteMarkerDef(def.id, def.name)}
                      className="p-1.5 rounded bg-slate-900 hover:bg-rose-950 text-slate-400 hover:text-rose-400 border border-slate-800"
                      title="Delete marker category (converts instances to BROKEN)"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Add New Marker Category Form */}
          <form
            onSubmit={handleAddMarkerDef}
            className="bg-slate-950/80 border border-slate-800 rounded-lg p-4 flex flex-col gap-3.5 text-xs"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  New Marker Name
                </label>
                <input
                  type="text"
                  value={newMarkerName}
                  onChange={(e) => setNewMarkerName(e.target.value)}
                  placeholder="e.g., Grail Point / Fairy / Dissonance"
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100 focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  Description
                </label>
                <input
                  type="text"
                  value={newMarkerDesc}
                  onChange={(e) => setNewMarkerDesc(e.target.value)}
                  placeholder="Short description..."
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100 focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="flex items-end gap-3">
                <div className="w-24">
                  <label className="block text-[11px] text-slate-400 mb-1">
                    Badge Char
                  </label>
                  <input
                    type="text"
                    maxLength={2}
                    value={newMarkerSymbol}
                    onChange={(e) => setNewMarkerSymbol(e.target.value)}
                    placeholder="Opt (!)"
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-center text-slate-100 focus:outline-none focus:border-amber-400"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    Color
                  </label>
                  <input
                    type="color"
                    value={newMarkerColor}
                    onChange={(e) => setNewMarkerColor(e.target.value)}
                    className="w-10 h-8 rounded bg-slate-900 border border-slate-700 cursor-pointer"
                  />
                </div>
              </div>

              <label className="flex items-center gap-1.5 py-2 text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newMarkerShowOnMacro}
                  onChange={(e) => setNewMarkerShowOnMacro(e.target.checked)}
                  className="accent-amber-400"
                />
                <span>Show Label on Macro Grid</span>
              </label>
            </div>

            {/* Visual Clickable Icon Picker + Live Pin Preview */}
            <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-slate-800/80">
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] text-slate-400">
                  Choose Marker Icon{' '}
                  <span className="text-slate-500">
                    (used when Badge Char is blank)
                  </span>
                </span>
                <div className="flex flex-wrap items-center gap-1.5">
                  {AVAILABLE_MARKER_ICONS.map((ic) => {
                    const isSelected = newMarkerIcon === ic.key;
                    return (
                      <button
                        key={ic.key}
                        type="button"
                        onClick={() => setNewMarkerIcon(ic.key)}
                        title={ic.label}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-[11px] transition-all ${
                          isSelected
                            ? 'bg-amber-500/20 border-amber-400 text-amber-300 font-semibold shadow-sm'
                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                        }`}
                      >
                        <MarkerIcon iconKey={ic.key} size={14} />
                        <span>{ic.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Live Visual Pin Preview + Submit Button */}
              <div className="flex items-center gap-3 ml-auto">
                <div className="flex items-center gap-2.5 bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5">
                  <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
                    Live Preview:
                  </span>
                  <div className="flex items-center gap-1.5">
                    <div
                      style={{ backgroundColor: newMarkerColor }}
                      className="w-7 h-7 rounded-full border-2 border-slate-950 flex items-center justify-center text-slate-950 font-bold text-xs shadow-md"
                    >
                      {newMarkerSymbol.trim() ? (
                        <span>{newMarkerSymbol.trim()}</span>
                      ) : (
                        <MarkerIcon
                          iconKey={newMarkerIcon}
                          size={15}
                          className="text-slate-950 stroke-[2.5]"
                        />
                      )}
                    </div>
                    <span className="px-1.5 py-0.5 rounded bg-slate-950 text-slate-100 border border-slate-700 text-xs font-bold whitespace-nowrap">
                      {newMarkerName.trim() || 'Sample Label'}
                    </span>
                  </div>
                </div>

                <button
                  type="submit"
                  className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold shadow"
                >
                  <Plus size={14} />
                  <span>Add Marker Type</span>
                </button>
              </div>
            </div>
          </form>
        </div>

        {/* SECTION 2B: COMMENT CATEGORIES MANAGER */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <MessageSquare size={18} className="text-amber-400" />
              <span>Comment Categories Manager (Tablets, NPCs, Skeletons, TODOs)</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Edit category names (e.g. &ldquo;Sk: Skeleton&rdquo;), short badge codes, colors, and resolution toggles, or add/remove comment categories.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {config.commentCategories.map((cat) => {
              const isEditing = editingCatId === cat.id;

              if (isEditing) {
                return (
                  <div
                    key={cat.id}
                    className="bg-slate-950 border border-amber-500/60 rounded-lg p-3 flex flex-col gap-2 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        maxLength={6}
                        value={editCatCode}
                        onChange={(e) => setEditCatCode(e.target.value)}
                        placeholder="Code"
                        className="w-16 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-center font-mono font-bold text-slate-100"
                      />
                      <input
                        type="text"
                        value={editCatName}
                        onChange={(e) => setEditCatName(e.target.value)}
                        placeholder="Category Name"
                        className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-100 font-semibold"
                      />
                      <input
                        type="color"
                        value={editCatColor}
                        onChange={(e) => setEditCatColor(e.target.value)}
                        className="w-7 h-7 rounded bg-slate-900 border border-slate-700 cursor-pointer shrink-0"
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <label className="flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={editCatSupportsResolved}
                          onChange={(e) =>
                            setEditCatSupportsResolved(e.target.checked)
                          }
                          className="accent-amber-400"
                        />
                        <span>Has Open/Done Status</span>
                      </label>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleSaveEditCat(cat.id)}
                          className="px-2.5 py-1 rounded bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold flex items-center gap-1"
                        >
                          <Check size={12} />
                          <span>Save</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingCatId(null)}
                          className="p-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-400"
                        >
                          <X size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={cat.id}
                  className="bg-slate-950 border border-slate-800 rounded-lg p-3 flex items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      style={{
                        backgroundColor: `${cat.badgeColor}22`,
                        color: cat.badgeColor,
                        borderColor: `${cat.badgeColor}55`,
                      }}
                      className="px-2 py-0.5 rounded border font-mono font-bold text-xs shrink-0"
                    >
                      {cat.code}
                    </span>
                    <div className="min-w-0">
                      <div className="font-bold text-xs text-slate-100 truncate">
                        {cat.name}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {cat.supportsResolved
                          ? 'Supports Open / Done status'
                          : 'Lore / Note entry'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleStartEditCat(cat)}
                      className="p-1.5 rounded bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-amber-300 border border-slate-800"
                      title="Edit category code, name, or color"
                    >
                      <Edit3 size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleDeleteCommentCategory(cat.id, cat.name)
                      }
                      className="p-1.5 rounded bg-slate-900 hover:bg-rose-950 text-slate-400 hover:text-rose-400 border border-slate-800"
                      title="Delete comment category"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <form
            onSubmit={handleAddCommentCategory}
            className="bg-slate-950/80 border border-slate-800 rounded-lg p-3.5 flex flex-wrap items-end gap-3 text-xs"
          >
            <div className="w-24">
              <label className="block text-[11px] text-slate-400 mb-1">
                Code Badge
              </label>
              <input
                type="text"
                maxLength={6}
                value={newCatCode}
                onChange={(e) => setNewCatCode(e.target.value)}
                placeholder="e.g. Sk"
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 font-mono text-slate-100 focus:outline-none focus:border-amber-400"
              />
            </div>

            <div className="flex-1 min-w-[180px]">
              <label className="block text-[11px] text-slate-400 mb-1">
                Category Name
              </label>
              <input
                type="text"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                placeholder="e.g. Skeleton / Hint / Journal"
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100 focus:outline-none focus:border-amber-400"
              />
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 mb-1">
                Badge Color
              </label>
              <input
                type="color"
                value={newCatColor}
                onChange={(e) => setNewCatColor(e.target.value)}
                className="w-10 h-8 rounded bg-slate-900 border border-slate-700 cursor-pointer"
              />
            </div>

            <label className="flex items-center gap-1.5 py-2 text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={newCatSupportsResolved}
                onChange={(e) => setNewCatSupportsResolved(e.target.checked)}
                className="accent-amber-400"
              />
              <span>Supports Open/Done Checkbox</span>
            </label>

            <button
              type="submit"
              className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold shadow ml-auto"
            >
              <Plus size={14} />
              <span>Add Comment Category</span>
            </button>
          </form>
        </div>

        {/* SECTION 3: SPOILER-FREE ROOM FLAGS MANAGER & CUSTOM COMMENT FIELDS */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Room Flags Manager (Spoiler-Free) */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col gap-4">
            <div>
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <Tag size={18} className="text-amber-400" />
                <span>Room Flags Manager (Spoiler-Free)</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Starts blank for new playthroughs. Add, rename, or remove room feature flags (e.g. "Save Point") used inside the Room Detail Inspector.
              </p>
            </div>

            <form
              onSubmit={handleAddRoomFlag}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                value={newRoomFlagName}
                onChange={(e) => setNewRoomFlagName(e.target.value)}
                placeholder="Add new Room Flag (e.g. Save Point, Boss Room, Shop)..."
                className="flex-1 bg-slate-950 border border-slate-700 rounded-md px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-amber-400"
              />
              <button
                type="submit"
                className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold"
              >
                <Plus size={14} />
                <span>Add Flag</span>
              </button>
            </form>

            {roomFlags.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-lg">
                No Room Flags added yet (100% spoiler-free). Add flags above or directly inside any Room Inspector via the "+ Add Room Flag" button!
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {roomFlags.map((flag, idx) => (
                  <div
                    key={`${flag}-${idx}`}
                    className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs"
                  >
                    {editingRoomFlagIdx === idx ? (
                      <>
                        <input
                          type="text"
                          value={editingRoomFlagValue}
                          onChange={(e) =>
                            setEditingRoomFlagValue(e.target.value)
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleSaveRenameRoomFlag(idx);
                            } else if (e.key === 'Escape') {
                              setEditingRoomFlagIdx(null);
                            }
                          }}
                          className="w-28 bg-slate-900 border border-amber-500/60 rounded px-1.5 py-0.5 text-xs text-slate-100 focus:outline-none"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveRenameRoomFlag(idx)}
                          className="text-emerald-400 hover:text-emerald-300"
                          title="Save rename across all rooms"
                        >
                          <Check size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingRoomFlagIdx(null)}
                          className="text-slate-400 hover:text-slate-200"
                          title="Cancel"
                        >
                          <X size={13} />
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="font-semibold text-amber-300">
                          {flag}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingRoomFlagIdx(idx);
                            setEditingRoomFlagValue(flag);
                          }}
                          className="text-slate-500 hover:text-slate-200 ml-1"
                          title="Rename flag across all rooms"
                        >
                          <Edit3 size={11} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteRoomFlag(idx)}
                          className="text-slate-500 hover:text-rose-400"
                          title="Remove flag"
                        >
                          <Trash2 size={11} />
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Custom Comment Fields Manager */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col gap-4">
            <div>
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <Columns size={18} className="text-cyan-400" />
                <span>Custom Comment Fields &amp; Filterable Dropdowns</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Add custom dropdown or text fields (e.g., "Race / Tribe", "Required Item", "Status") to comments, table columns, and the top filter bar.
              </p>
            </div>

            <form
              onSubmit={handleAddCustomField}
              className="bg-slate-950/80 border border-slate-800 rounded-lg p-3 flex flex-col gap-2.5 text-xs"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="text"
                  value={newFieldName}
                  onChange={(e) => setNewFieldName(e.target.value)}
                  placeholder='Field Name (e.g. "Race / Tribe" or "Status")'
                  className="bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100 focus:outline-none focus:border-amber-400"
                />
                <select
                  value={newFieldType}
                  onChange={(e) => {
                    const nextType = e.target.value as 'text' | 'select';
                    setNewFieldType(nextType);
                    setNewFieldFilterable(nextType === 'select');
                  }}
                  className="bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100"
                >
                  <option value="select">Dropdown Select (+ Inline Add)</option>
                  <option value="text">Free Text Input</option>
                </select>
              </div>

              {newFieldType === 'select' && (
                <input
                  type="text"
                  value={newFieldOptionsRaw}
                  onChange={(e) => setNewFieldOptionsRaw(e.target.value)}
                  placeholder="Optional initial options, comma-separated (can also add inline later!)"
                  className="bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100 focus:outline-none focus:border-amber-400"
                />
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newFieldShowInTable}
                      onChange={(e) => setNewFieldShowInTable(e.target.checked)}
                      className="accent-amber-400"
                    />
                    <span>Show as Table Column</span>
                  </label>

                  <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newFieldFilterable}
                      onChange={(e) => setNewFieldFilterable(e.target.checked)}
                      className="accent-amber-400"
                    />
                    <span>Filterable in Top Bar</span>
                  </label>
                </div>

                <button
                  type="submit"
                  className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold"
                >
                  <Plus size={14} />
                  <span>Add Custom Field</span>
                </button>
              </div>
            </form>

            {config.customCommentFields.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-lg">
                No custom comment fields defined yet. Create a "Dropdown Select" field above (for example, "Race / Tribe" or "Puzzle Status")!
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {config.customCommentFields.map((field) => (
                  <div
                    key={field.id}
                    className="bg-slate-950 border border-slate-800 rounded-lg p-3 flex flex-col gap-2 text-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-100">
                          {field.name}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-900 text-cyan-400 border border-slate-800 uppercase font-semibold">
                          {field.type}
                        </span>
                      </div>

                      <div className="flex items-center gap-2.5">
                        <label className="flex items-center gap-1 text-[11px] text-slate-300 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={field.showInTable}
                            onChange={() =>
                              handleToggleCustomFieldInTable(field.id)
                            }
                            className="accent-amber-400"
                          />
                          <span>Table Column</span>
                        </label>
                        <label className="flex items-center gap-1 text-[11px] text-slate-300 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={Boolean(field.filterable)}
                            onChange={() =>
                              handleToggleCustomFieldFilterable(field.id)
                            }
                            className="accent-amber-400"
                          />
                          <span>Top Bar Filter</span>
                        </label>
                        <button
                          type="button"
                          onClick={() => handleDeleteCustomField(field.id)}
                          className="p-1 text-slate-500 hover:text-rose-400"
                          title="Delete custom field"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>

                    {/* Dropdown Option Manager for 'select' fields */}
                    {field.type === 'select' && (
                      <div className="flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-slate-900">
                        <span className="text-[10px] text-slate-500 mr-1">
                          Options:
                        </span>
                        {(field.options || []).map((opt, optIdx) => {
                          const isEditingOpt =
                            editingOptionTarget?.fieldId === field.id &&
                            editingOptionTarget?.optIdx === optIdx;

                          return (
                            <div
                              key={`${opt}-${optIdx}`}
                              className="inline-flex items-center gap-1 bg-slate-900 border border-slate-800 rounded px-2 py-0.5 text-[11px]"
                            >
                              {isEditingOpt ? (
                                <>
                                  <input
                                    type="text"
                                    value={editingOptionValue}
                                    onChange={(e) =>
                                      setEditingOptionValue(e.target.value)
                                    }
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault();
                                        handleSaveRenameOptionOnField(
                                          field,
                                          optIdx
                                        );
                                      } else if (e.key === 'Escape') {
                                        setEditingOptionTarget(null);
                                      }
                                    }}
                                    className="w-24 bg-slate-950 border border-amber-500/60 rounded px-1 py-0.2 text-[11px] text-slate-100 focus:outline-none"
                                    autoFocus
                                  />
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleSaveRenameOptionOnField(
                                        field,
                                        optIdx
                                      )
                                    }
                                    className="text-emerald-400 hover:text-emerald-300"
                                  >
                                    <Check size={11} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingOptionTarget(null)}
                                    className="text-slate-400 hover:text-slate-200"
                                  >
                                    <X size={11} />
                                  </button>
                                </>
                              ) : (
                                <>
                                  <span className="text-purple-300 font-medium">
                                    {opt}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingOptionTarget({
                                        fieldId: field.id,
                                        optIdx,
                                      });
                                      setEditingOptionValue(opt);
                                    }}
                                    className="text-slate-500 hover:text-slate-200 ml-0.5"
                                    title="Rename option across all comments"
                                  >
                                    <Edit3 size={10} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleDeleteOptionOnField(field, optIdx)
                                    }
                                    className="text-slate-500 hover:text-rose-400"
                                    title="Delete option"
                                  >
                                    <Trash2 size={10} />
                                  </button>
                                </>
                              )}
                            </div>
                          );
                        })}

                        {addingOptionFieldId === field.id ? (
                          <div className="inline-flex items-center gap-1">
                            <input
                              type="text"
                              value={newOptionValue}
                              onChange={(e) =>
                                setNewOptionValue(e.target.value)
                              }
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleAddOptionToField(field);
                                } else if (e.key === 'Escape') {
                                  setNewOptionValue('');
                                  setAddingOptionFieldId(null);
                                }
                              }}
                              placeholder="New option..."
                              className="w-24 bg-slate-900 border border-amber-500/60 rounded px-1.5 py-0.5 text-[11px] text-slate-100 focus:outline-none"
                              autoFocus
                            />
                            <button
                              type="button"
                              onClick={() => handleAddOptionToField(field)}
                              className="text-emerald-400 hover:text-emerald-300"
                            >
                              <Check size={12} />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setNewOptionValue('');
                                setAddingOptionFieldId(null);
                              }}
                              className="text-slate-400 hover:text-slate-200"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setAddingOptionFieldId(field.id);
                              setNewOptionValue('');
                            }}
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-slate-900 hover:bg-slate-800 text-amber-300 border border-dashed border-slate-700 text-[10px]"
                          >
                            <Plus size={10} />
                            <span>Add Option</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* SECTION 4: TABLET SCREENSHOT SCANNER (OCR, COLOR HIGHLIGHTING & CHILD ATTRIBUTION) */}
        {(() => {
          const scanner: TabletScannerConfig = {
            ...DEFAULT_TABLET_SCANNER_CONFIG,
            ...(config.tabletScannerConfig || {}),
          };

          const selectValue =
            scanner.headerTargetMode === 'custom_field' &&
            scanner.targetCustomFieldId
              ? `custom_field:${scanner.targetCustomFieldId}`
              : scanner.headerTargetMode;

          const handleHeaderRoutingChange = async (val: string) => {
            if (val.startsWith('custom_field:')) {
              const fieldId = val.slice('custom_field:'.length);
              await onSaveTabletScannerConfig({
                ...scanner,
                headerTargetMode: 'custom_field',
                targetCustomFieldId: fieldId,
              });
            } else {
              await onSaveTabletScannerConfig({
                ...scanner,
                headerTargetMode:
                  val as TabletScannerConfig['headerTargetMode'],
                targetCustomFieldId: undefined,
              });
            }
          };

          const handleQuickCreateChildField = async () => {
            const newId = `cf-child-${Date.now()}`;
            const newField: CustomFieldDefinition = {
              id: newId,
              name: 'Child / Race',
              type: 'select',
              options: [],
              showInTable: true,
              filterable: true,
            };
            await onSaveCustomCommentFields([
              ...config.customCommentFields,
              newField,
            ]);
            await onSaveTabletScannerConfig({
              ...scanner,
              headerTargetMode: 'custom_field',
              targetCustomFieldId: newId,
            });
          };

          return (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col gap-4">
              <div>
                <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                  <ScanText size={18} className="text-cyan-400" />
                  <span>
                    Tablet Screenshot Scanner (OCR, Colored Keywords &amp; Child
                    Attribution)
                  </span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Configure how scanned tablet screenshots parse colored keywords (
                  <code className="text-emerald-300">{'{g:green}'}</code>,{' '}
                  <code className="text-rose-300">{'{r:red}'}</code>), detect
                  tablet drawings, and route upper-right Child / Race headers
                  (e.g. &ldquo;6th Child: Lokapala&rdquo;).
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
                <div className="bg-slate-950 border border-slate-800 rounded-lg p-3.5 flex flex-col gap-2">
                  <label className="font-bold text-slate-200">
                    Upper-Right Tablet Header Destination (e.g. &ldquo;6th Child:
                    Lokapala&rdquo;)
                  </label>
                  <p className="text-[11px] text-slate-400">
                    Choose where the small attribution text in the top-right
                    corner of a tablet screenshot should be saved:
                  </p>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <select
                      value={selectValue}
                      onChange={(e) => handleHeaderRoutingChange(e.target.value)}
                      className="flex-1 min-w-[220px] bg-slate-900 border border-slate-700 rounded-md px-2.5 py-1.5 text-slate-100 focus:outline-none focus:border-cyan-400"
                    >
                      <option value="speaker_or_title">
                        Speaker or Tablet Header Field (Default)
                      </option>
                      {config.customCommentFields.map((field) => (
                        <option
                          key={field.id}
                          value={`custom_field:${field.id}`}
                        >
                          Custom Field: {field.name} ({field.type})
                        </option>
                      ))}
                      <option value="append_content">
                        Append as Note at End of Tablet Transcript
                      </option>
                      <option value="ignore">
                        Ignore / Strip Header Text
                      </option>
                    </select>

                    {config.customCommentFields.length === 0 && (
                      <button
                        type="button"
                        onClick={handleQuickCreateChildField}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-200 border border-cyan-500/40 font-semibold"
                        title="Create a filterable 'Child / Race' custom dropdown field and route tablet headers to it automatically"
                      >
                        <Plus size={13} />
                        <span>Create &amp; Use &ldquo;Child / Race&rdquo; Field</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="bg-slate-950 border border-slate-800 rounded-lg p-3.5 flex flex-col justify-center gap-3">
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={scanner.autoHighlightColoredText}
                      onChange={(e) =>
                        onSaveTabletScannerConfig({
                          ...scanner,
                          autoHighlightColoredText: e.target.checked,
                        })
                      }
                      className="mt-0.5 accent-cyan-400"
                    />
                    <div>
                      <div className="font-bold text-slate-200">
                        Auto-Highlight Colored Tablet Keywords
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Detects green and red/coral words in the screenshot and
                        wraps them in{' '}
                        <code className="text-emerald-300">
                          {'{g:golden key}'}
                        </code>{' '}
                        and{' '}
                        <code className="text-rose-300">
                          {'{r:Jormungand}'}
                        </code>{' '}
                        tags.
                      </div>
                    </div>
                  </label>

                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={scanner.autoKeepAttachmentOnDrawing}
                      onChange={(e) =>
                        onSaveTabletScannerConfig({
                          ...scanner,
                          autoKeepAttachmentOnDrawing: e.target.checked,
                        })
                      }
                      className="mt-0.5 accent-cyan-400"
                    />
                    <div>
                      <div className="font-bold text-slate-200">
                        Auto-Select &ldquo;Keep Picture as Attachment&rdquo; When
                        Drawing Detected
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Automatically checks the attachment toggle if the tablet
                        contains a cyan diagram/drawing below the text.
                      </div>
                    </div>
                  </label>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
};
