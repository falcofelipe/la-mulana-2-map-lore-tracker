/**
 * Main Application Entry (App.tsx)
 * --------------------------------
 * Orchestrates live IndexedDB queries (via `dexie-react-hooks`), view routing,
 * global keyboard shortcuts (`Ctrl+K`, `Ctrl+V` screenshot paste, `X` blocked toggle,
 * `Enter` inspect room), and coordinates the Map Grid + Room Inspector split view.
 */

import React, { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, ensureDatabaseInitialized } from './db/database';
import {
  addCustomFieldOption,
  addMapGridArrow,
  addPinMarkerToCell,
  addRoomFlagOption,
  addVectorArrowToCell,
  assignCellScreenshot,
  attachImageToComment,
  clearCellScreenshot,
  createCommentEntry,
  createMapPage,
  createSketchNote,
  deleteColAt,
  deleteCommentEntry,
  deleteMapGridArrow,
  deleteMapPage,
  deletePinMarkerFromCell,
  deleteRowAt,
  deleteSketchNote,
  deleteVectorArrowFromCell,
  expandMapGrid,
  insertColAt,
  insertRowAt,
  removeAttachmentFromComment,
  reorderMapPages,
  resetToBlankPlaythrough,
  saveCommentCategories,
  saveCustomCommentFields,
  saveMarkerDefinitions,
  saveSeamlessCaptureConfig,
  saveTabletScannerConfig,
  shrinkMapGrid,
  swapOrMoveCells,
  toggleCellBlockedState,
  toggleCellPassage,
  toggleManualMapConnection,
  updateCellMetadata,
  updateCommentEntry,
  updateCustomFieldOptions,
  updateMapPageMetadata,
  updatePinMarkerOnCell,
  updateRoomFlagOptions,
  updateSketchNote,
  updateVectorArrowOnCell,
} from './db/repository';
import {
  exportFullBackupZip,
  importFullBackupZip,
} from './db/backupService';
import { createDefaultProjectConfig } from './config/defaultDefinitions';
import { MapLayerVisibility } from './types/models';
import { TopNavbar, ActiveAppView } from './components/layout/TopNavbar';
import { MapTabsBar } from './components/layout/MapTabsBar';
import { MacroMapGrid } from './components/map/MacroMapGrid';
import { RoomDetailDrawer } from './components/inspector/RoomDetailDrawer';
import { CommentsTableView } from './components/comments/CommentsTableView';
import { SketchesBoardView } from './components/sketches/SketchesBoardView';
import { SettingsAndCustomizeView } from './components/settings/SettingsAndCustomizeView';
import { GlobalSearchModal } from './components/layout/GlobalSearchModal';
import { BoundingRectCalibratorModal } from './components/capture/BoundingRectCalibratorModal';
import { useSeamlessCaptureController } from './hooks/useSeamlessCaptureController';

export const App: React.FC = () => {
  const [isDbReady, setIsDbReady] = useState(false);
  const [activeView, setActiveView] = useState<ActiveAppView>('map');
  const [activeMapId, setActiveMapId] = useState<string>('');
  const [selectedCellId, setSelectedCellId] = useState<string | null>(null);
  const [inspectedCellId, setInspectedCellId] = useState<string | null>(null);
  const [pendingHighlightCommentId, setPendingHighlightCommentId] = useState<
    string | null
  >(null);
  const [isInspectorFullModal, setIsInspectorFullModal] = useState(false);
  const [isGlobalSearchOpen, setIsGlobalSearchOpen] = useState(false);

  const [layerVisibility, setLayerVisibility] = useState<MapLayerVisibility>({
    showPins: true,
    showArrows: true,
    showRoomNames: true,
    showCoordBadges: true,
    showResolvedMarkers: true,
  });

  // 1. Initialize IndexedDB on first mount
  useEffect(() => {
    ensureDatabaseInitialized().then(() => {
      setIsDbReady(true);
    });
  }, []);

  // 2. Reactive Live Queries from Dexie
  const config =
    useLiveQuery(() => db.config.get('singleton'), [isDbReady]) ||
    createDefaultProjectConfig();

  const maps =
    useLiveQuery(() => db.maps.orderBy('order').toArray(), [isDbReady]) || [];

  const allCells = useLiveQuery(() => db.cells.toArray(), [isDbReady]) || [];

  const allComments =
    useLiveQuery(
      () => db.comments.orderBy('createdAt').reverse().toArray(),
      [isDbReady]
    ) || [];

  const allSketches =
    useLiveQuery(
      () => db.sketches.orderBy('createdAt').reverse().toArray(),
      [isDbReady]
    ) || [];

  const blobMetrics = useLiveQuery(async () => {
    const blobs = await db.blobs.toArray();
    const totalBytes = blobs.reduce((acc, b) => acc + (b.byteSize || 0), 0);
    return { count: blobs.length, totalBytes };
  }, [isDbReady]) || { count: 0, totalBytes: 0 };

  // Ensure an activeMapId is always selected once maps load
  useEffect(() => {
    if (maps.length > 0 && (!activeMapId || !maps.some((m) => m.id === activeMapId))) {
      setActiveMapId(maps[0].id);
    }
  }, [maps, activeMapId]);

  const activeMap = maps.find((m) => m.id === activeMapId) || maps[0] || null;
  const activeMapCells = allCells.filter((c) => c.mapId === activeMap?.id);
  const activeMapComments = allComments.filter((c) => c.mapId === activeMap?.id);
  const activeMapSketches = allSketches.filter((s) => s.mapId === activeMap?.id);

  const inspectedCell =
    allCells.find((c) => c.id === inspectedCellId) || null;
  const inspectedCellMap =
    maps.find((m) => m.id === inspectedCell?.mapId) || activeMap;
  const inspectedRoomComments = inspectedCell
    ? allComments.filter(
        (c) =>
          c.mapId === inspectedCell.mapId && c.cellCoord === inspectedCell.coord
      )
    : [];

  const activeRoomsCount = allCells.filter((c) => c.state !== 'empty').length;

  const activeTargetCell =
    inspectedCell ||
    allCells.find((c) => c.id === selectedCellId) ||
    null;
  const activeTargetMap =
    maps.find((m) => m.id === activeTargetCell?.mapId) || activeMap;

  const captureCtrl = useSeamlessCaptureController({
    seamlessConfig: config.seamlessCaptureConfig,
    tabletScannerConfig: config.tabletScannerConfig,
    customCommentFields: config.customCommentFields,
    targetCell: activeTargetCell,
    targetMap: activeTargetMap,
    onSaveSeamlessConfig: saveSeamlessCaptureConfig,
    onAssignRoomScreenshot: assignCellScreenshot,
    onCreateComment: createCommentEntry,
    onAttachImageToComment: attachImageToComment,
    onAddCustomFieldOption: addCustomFieldOption,
    onInspectCell: (cellId) => {
      setSelectedCellId(cellId);
      setInspectedCellId(cellId);
    },
  });

  // 3. Global Keyboard Shortcuts (Ctrl+K, Ctrl+V Screenshot Paste, X Toggle Blocked, Enter Inspect, Esc Close)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+K or Cmd+K -> Global Search
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsGlobalSearchOpen((prev) => !prev);
        return;
      }

      // Ignore single-key shortcuts when typing inside an input, textarea, or select
      const target = e.target as HTMLElement | null;
      const isTyping =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      if (isTyping) return;

      if (e.key === 'Escape') {
        if (isGlobalSearchOpen) {
          setIsGlobalSearchOpen(false);
        } else if (inspectedCellId) {
          setInspectedCellId(null);
        }
        return;
      }

      if (activeView === 'map' && selectedCellId) {
        if (e.key.toLowerCase() === 'x' && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          toggleCellBlockedState(selectedCellId);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          setInspectedCellId(selectedCellId);
        }
      }
    };

    const handlePaste = async (e: ClipboardEvent) => {
      const targetEl = e.target as HTMLElement | null;
      if (targetEl?.closest?.('[data-comment-scanner-form="true"]')) {
        return;
      }

      const targetCellId = inspectedCellId || selectedCellId;
      if (!targetCellId) return;

      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          const blob = item.getAsFile();
          if (blob) {
            e.preventDefault();
            await assignCellScreenshot(targetCellId, blob);
            return;
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('paste', handlePaste);
    };
  }, [activeView, selectedCellId, inspectedCellId, isGlobalSearchOpen]);

  // Jump from Comments Table, Cross-Reference, Warp Pin, or Global Search directly to a Map + Cell
  const handleJumpToRoom = (
    mapId: string,
    cellCoord: string,
    highlightCommentId?: string
  ) => {
    if (mapId === 'global' || !cellCoord) {
      setActiveView('comments');
      return;
    }
    setActiveMapId(mapId);
    setActiveView('map');
    const targetCell = allCells.find(
      (c) => c.mapId === mapId && c.coord === cellCoord
    );
    if (targetCell) {
      setSelectedCellId(targetCell.id);
      setInspectedCellId(targetCell.id);
      setPendingHighlightCommentId(highlightCommentId || null);
    }
  };

  if (!isDbReady) {
    return (
      <div className="h-screen w-screen bg-slate-950 text-slate-300 flex items-center justify-center text-sm">
        Initializing Local IndexedDB...
      </div>
    );
  }

  const unresolvedTodoCount = allComments.filter(
    (c) => c.category === 'todo' && !c.resolved
  ).length;

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-950 text-slate-100 overflow-hidden">
      {/* TOP NAVIGATION BAR */}
      <TopNavbar
        projectTitle={config.projectTitle}
        activeView={activeView}
        onSelectView={setActiveView}
        onOpenGlobalSearch={() => setIsGlobalSearchOpen(true)}
        onQuickExportZip={exportFullBackupZip}
        totalCommentsCount={allComments.length}
        unresolvedTodoCount={unresolvedTodoCount}
        sketchesCount={allSketches.length}
        captureStatus={{
          isElectron: captureCtrl.isElectron,
          isWebStreamConnected: captureCtrl.isWebStreamConnected,
          isFolderWatching:
            captureCtrl.isWebFolderWatching ||
            captureCtrl.electronStatus.watchingSteamFolder,
          roomHotkey: captureCtrl.effectiveConfig.roomHotkey,
          tabletHotkey: captureCtrl.effectiveConfig.tabletHotkey,
          onConnectStream: captureCtrl.connectWebGameStream,
          onTriggerRoomCapture: () => captureCtrl.triggerCaptureNow('room'),
          onTriggerTabletCapture: () => captureCtrl.triggerCaptureNow('tablet'),
        }}
      />

      {/* VIEW 1: MAP GRID WORKSPACE (+ SPLIT OR MODAL ROOM INSPECTOR) */}
      {activeView === 'map' && activeMap && (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <MapTabsBar
            maps={maps}
            activeMapId={activeMap.id}
            onSelectMap={(id) => {
              setActiveMapId(id);
              setSelectedCellId(null);
              setInspectedCellId(null);
            }}
            onCreateMap={async (prefix, name, rows, cols) => {
              const created = await createMapPage(prefix, name, rows, cols);
              setActiveMapId(created.id);
              setSelectedCellId(null);
              setInspectedCellId(null);
            }}
            onUpdateMap={updateMapPageMetadata}
            onReorderMaps={reorderMapPages}
            onDeleteMap={async (mapId) => {
              const nextId = await deleteMapPage(mapId);
              if (nextId) setActiveMapId(nextId);
              setSelectedCellId(null);
              setInspectedCellId(null);
            }}
          />

          <div className="flex-1 flex min-h-0 overflow-hidden">
            <MacroMapGrid
              map={activeMap}
              maps={maps}
              cells={activeMapCells}
              allCells={allCells}
              comments={activeMapComments}
              mapSketches={activeMapSketches}
              markerDefinitions={config.markerDefinitions}
              selectedCellId={selectedCellId}
              inspectedCellId={inspectedCellId}
              layerVisibility={layerVisibility}
              onToggleLayer={(key) =>
                setLayerVisibility((prev) => ({
                  ...prev,
                  [key]: !prev[key],
                }))
              }
              onSelectMap={(id) => {
                setActiveMapId(id);
                setSelectedCellId(null);
                setInspectedCellId(null);
              }}
              onJumpToRoom={handleJumpToRoom}
              onSelectCell={(cellId) => setSelectedCellId(cellId)}
              onInspectCell={(cellId) => {
                setSelectedCellId(cellId);
                setInspectedCellId(cellId);
              }}
              onToggleBlocked={toggleCellBlockedState}
              onUpdateCellMetadata={updateCellMetadata}
              onUploadScreenshot={assignCellScreenshot}
              onClearScreenshot={clearCellScreenshot}
              onExpandGrid={(dir) => expandMapGrid(activeMap.id, dir)}
              onShrinkGrid={(dir) => shrinkMapGrid(activeMap.id, dir)}
              onInsertRowAt={(rowIdx) => insertRowAt(activeMap.id, rowIdx)}
              onInsertColAt={(colIdx) => insertColAt(activeMap.id, colIdx)}
              onDeleteRowAt={(rowIdx) => deleteRowAt(activeMap.id, rowIdx)}
              onDeleteColAt={(colIdx) => deleteColAt(activeMap.id, colIdx)}
              onSwapOrMoveCells={swapOrMoveCells}
              onToggleCellPassage={toggleCellPassage}
              onAddMapGridArrow={(arrow) =>
                addMapGridArrow(activeMap.id, arrow)
              }
              onDeleteMapGridArrow={(arrowId) =>
                deleteMapGridArrow(activeMap.id, arrowId)
              }
              onToggleManualMapConnection={(targetMapId) =>
                toggleManualMapConnection(activeMap.id, targetMapId)
              }
              onCreateSketch={createSketchNote}
              onUpdateSketch={updateSketchNote}
              onDeleteSketch={deleteSketchNote}
            />

            {/* Dual-Mode Room Detail Inspector (Split Drawer or Full Modal) */}
            {inspectedCell && inspectedCellMap && (
              <RoomDetailDrawer
                map={inspectedCellMap}
                cell={inspectedCell}
                maps={maps}
                allCells={allCells}
                allComments={allComments}
                roomComments={inspectedRoomComments}
                markerDefinitions={config.markerDefinitions}
                commentCategories={config.commentCategories}
                roomFlagOptions={config.roomFlagOptions || []}
                customCommentFields={config.customCommentFields}
                tabletScannerConfig={config.tabletScannerConfig}
                initialHighlightedCommentId={pendingHighlightCommentId}
                isFullModal={isInspectorFullModal}
                onToggleFullModal={() =>
                  setIsInspectorFullModal((prev) => !prev)
                }
                onClose={() => {
                  setInspectedCellId(null);
                  setPendingHighlightCommentId(null);
                }}
                onJumpToRoom={handleJumpToRoom}
                onUpdateCellMetadata={(updates) =>
                  updateCellMetadata(inspectedCell.id, updates)
                }
                onUploadScreenshot={(blob) =>
                  assignCellScreenshot(inspectedCell.id, blob)
                }
                onAddPin={(pin) => addPinMarkerToCell(inspectedCell.id, pin)}
                onUpdatePin={(pinId, updates) =>
                  updatePinMarkerOnCell(inspectedCell.id, pinId, updates)
                }
                onDeletePin={(pinId) =>
                  deletePinMarkerFromCell(inspectedCell.id, pinId)
                }
                onAddArrow={(arrow) =>
                  addVectorArrowToCell(inspectedCell.id, arrow)
                }
                onUpdateArrow={(arrowId, updates) =>
                  updateVectorArrowOnCell(inspectedCell.id, arrowId, updates)
                }
                onDeleteArrow={(arrowId) =>
                  deleteVectorArrowFromCell(inspectedCell.id, arrowId)
                }
                onCreateComment={createCommentEntry}
                onUpdateComment={updateCommentEntry}
                onDeleteComment={deleteCommentEntry}
                onAttachImageToComment={attachImageToComment}
                onRemoveAttachmentFromComment={removeAttachmentFromComment}
                onAddRoomFlagOption={addRoomFlagOption}
                onAddCustomFieldOption={addCustomFieldOption}
              />
            )}
          </div>
        </div>
      )}

      {/* VIEW 2: RELATIONAL COMMENTS & LORE SPREADSHEET TABLE */}
      {activeView === 'comments' && (
        <CommentsTableView
          maps={maps}
          cells={allCells}
          comments={allComments}
          commentCategories={config.commentCategories}
          customCommentFields={config.customCommentFields}
          tabletScannerConfig={config.tabletScannerConfig}
          onJumpToRoom={handleJumpToRoom}
          onCreateComment={createCommentEntry}
          onUpdateComment={updateCommentEntry}
          onDeleteComment={deleteCommentEntry}
          onAttachImageToComment={attachImageToComment}
          onRemoveAttachmentFromComment={removeAttachmentFromComment}
          onAddCustomFieldOption={addCustomFieldOption}
        />
      )}

      {/* VIEW 3: SKETCHES & GENERAL PUZZLE NOTES */}
      {activeView === 'sketches' && (
        <SketchesBoardView
          sketches={allSketches}
          maps={maps}
          onCreateSketch={createSketchNote}
          onUpdateSketch={updateSketchNote}
          onDeleteSketch={deleteSketchNote}
        />
      )}

      {/* VIEW 4: CUSTOMIZATION & BACKUP SETTINGS */}
      {activeView === 'settings' && (
        <SettingsAndCustomizeView
          config={config}
          storageStats={{
            mapCount: maps.length,
            roomCount: activeRoomsCount,
            commentCount: allComments.length,
            blobCount: blobMetrics.count,
            totalBytes: blobMetrics.totalBytes,
          }}
          onUpdateProjectTitle={async (title) => {
            await db.config.update('singleton', {
              projectTitle: title,
              updatedAt: Date.now(),
            });
          }}
          onSaveMarkerDefinitions={saveMarkerDefinitions}
          onSaveCommentCategories={saveCommentCategories}
          onUpdateRoomFlagOptions={updateRoomFlagOptions}
          onSaveCustomCommentFields={saveCustomCommentFields}
          onUpdateCustomFieldOptions={updateCustomFieldOptions}
          onSaveTabletScannerConfig={saveTabletScannerConfig}
          onSaveSeamlessCaptureConfig={saveSeamlessCaptureConfig}
          seamlessCaptureRuntime={{
            isElectron: captureCtrl.isElectron,
            electronStatus: captureCtrl.electronStatus,
            isWebStreamConnected: captureCtrl.isWebStreamConnected,
            webStreamLabel: captureCtrl.webStreamLabel,
            onConnectWebStream: captureCtrl.connectWebGameStream,
            onDisconnectWebStream: captureCtrl.disconnectWebGameStream,
            isWebFolderWatching: captureCtrl.isWebFolderWatching,
            watchedFolderName: captureCtrl.watchedFolderName,
            onStartWebFolderWatch: captureCtrl.startWebFolderWatcher,
            onStopWebFolderWatch: captureCtrl.stopWebFolderWatcher,
            onToggleElectronSteamWatch:
              captureCtrl.toggleElectronSteamFolderWatch,
            onOpenCalibratorWithSample: captureCtrl.openCalibratorWithSample,
          }}
          onExportZip={exportFullBackupZip}
          onImportZip={async (file) => {
            const firstMapId = await importFullBackupZip(file);
            if (firstMapId) setActiveMapId(firstMapId);
            setActiveView('map');
          }}
          onResetToBlank={async () => {
            const firstMapId = await resetToBlankPlaythrough();
            setActiveMapId(firstMapId);
            setSelectedCellId(null);
            setInspectedCellId(null);
            setActiveView('map');
          }}
        />
      )}

      {/* GLOBAL SEARCH MODAL (Ctrl+K) */}
      {isGlobalSearchOpen && (
        <GlobalSearchModal
          maps={maps}
          cells={allCells}
          comments={allComments}
          onJumpToRoom={handleJumpToRoom}
          onClose={() => setIsGlobalSearchOpen(false)}
        />
      )}

      {/* FIRST-CAPTURE OR MANUAL BOUNDING RECT CALIBRATOR MODAL */}
      {captureCtrl.pendingCalibration && (
        <BoundingRectCalibratorModal
          mode={captureCtrl.pendingCalibration.mode}
          frameBlob={captureCtrl.pendingCalibration.frameBlob}
          initialRect={
            captureCtrl.pendingCalibration.mode === 'room'
              ? captureCtrl.effectiveConfig.roomCropRect
              : captureCtrl.effectiveConfig.tabletCropRect
          }
          isFirstTimePrompt={
            captureCtrl.pendingCalibration.isFirstTimePrompt
          }
          onConfirmRect={captureCtrl.confirmCalibrationRect}
          onCancel={captureCtrl.cancelCalibration}
        />
      )}

      {/* NON-INTRUSIVE CAPTURE TOAST BANNER */}
      {captureCtrl.toast && (
        <div
          onClick={captureCtrl.dismissToast}
          className={`fixed bottom-4 right-4 z-50 max-w-md px-4 py-3 rounded-xl border shadow-2xl cursor-pointer transition-all ${
            captureCtrl.toast.kind === 'room'
              ? 'bg-slate-900/95 border-amber-500/60 text-amber-200'
              : captureCtrl.toast.kind === 'tablet'
              ? 'bg-slate-900/95 border-cyan-500/60 text-cyan-200'
              : captureCtrl.toast.kind === 'error'
              ? 'bg-rose-950/95 border-rose-500/60 text-rose-200'
              : 'bg-slate-900/95 border-slate-700 text-slate-200'
          }`}
        >
          <div className="text-xs font-bold">{captureCtrl.toast.title}</div>
          {captureCtrl.toast.detail && (
            <div className="text-[11px] opacity-85 mt-0.5 line-clamp-2">
              {captureCtrl.toast.detail}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default App;
