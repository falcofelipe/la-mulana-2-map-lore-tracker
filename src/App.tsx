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
  addPinMarkerToCell,
  addRaceOrTribeOption,
  addVectorArrowToCell,
  assignCellScreenshot,
  attachImageToComment,
  clearCellScreenshot,
  createCommentEntry,
  createMapPage,
  createSketchNote,
  deleteCommentEntry,
  deleteMapPage,
  deletePinMarkerFromCell,
  deleteSketchNote,
  deleteVectorArrowFromCell,
  expandMapGrid,
  loadSampleDatasetWithGraphics,
  removeAttachmentFromComment,
  reorderMapPages,
  resetToBlankPlaythrough,
  saveCustomCommentFields,
  saveMarkerDefinitions,
  shrinkMapGrid,
  toggleCellBlockedState,
  updateCellMetadata,
  updateCommentEntry,
  updateMapPageMetadata,
  updatePinMarkerOnCell,
  updateRaceOrTribeOptions,
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

export const App: React.FC = () => {
  const [isDbReady, setIsDbReady] = useState(false);
  const [activeView, setActiveView] = useState<ActiveAppView>('map');
  const [activeMapId, setActiveMapId] = useState<string>('');
  const [selectedCellId, setSelectedCellId] = useState<string | null>(null);
  const [inspectedCellId, setInspectedCellId] = useState<string | null>(null);
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

  // Check if the database is still completely blank (so we can show the optional "Load Sample Data" button)
  const activeRoomsCount = allCells.filter((c) => c.state !== 'empty').length;
  const isBlankDatabase =
    maps.length <= 1 && activeRoomsCount === 0 && allComments.length === 0;

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

  // Jump from Comments Table or Global Search directly to a Map + Cell
  const handleJumpToRoom = (mapId: string, cellCoord: string) => {
    setActiveMapId(mapId);
    setActiveView('map');
    const targetCell = allCells.find(
      (c) => c.mapId === mapId && c.coord === cellCoord
    );
    if (targetCell) {
      setSelectedCellId(targetCell.id);
      setInspectedCellId(targetCell.id);
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
        onLoadSampleData={async () => {
          const firstMapId = await loadSampleDatasetWithGraphics();
          setActiveMapId(firstMapId);
          setActiveView('map');
        }}
        totalCommentsCount={allComments.length}
        unresolvedTodoCount={unresolvedTodoCount}
        sketchesCount={allSketches.length}
        isBlankDatabase={isBlankDatabase}
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
              cells={activeMapCells}
              comments={activeMapComments}
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
            />

            {/* Dual-Mode Room Detail Inspector (Split Drawer or Full Modal) */}
            {inspectedCell && inspectedCellMap && (
              <RoomDetailDrawer
                map={inspectedCellMap}
                cell={inspectedCell}
                roomComments={inspectedRoomComments}
                markerDefinitions={config.markerDefinitions}
                commentCategories={config.commentCategories}
                raceOrTribeOptions={config.raceOrTribeOptions}
                customCommentFields={config.customCommentFields}
                isFullModal={isInspectorFullModal}
                onToggleFullModal={() =>
                  setIsInspectorFullModal((prev) => !prev)
                }
                onClose={() => setInspectedCellId(null)}
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
                onAddNewRaceOrTribe={addRaceOrTribeOption}
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
          raceOrTribeOptions={config.raceOrTribeOptions}
          customCommentFields={config.customCommentFields}
          onJumpToRoom={handleJumpToRoom}
          onCreateComment={createCommentEntry}
          onUpdateComment={updateCommentEntry}
          onDeleteComment={deleteCommentEntry}
          onAttachImageToComment={attachImageToComment}
          onRemoveAttachmentFromComment={removeAttachmentFromComment}
          onAddNewRaceOrTribe={addRaceOrTribeOption}
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
          onUpdateRaceOrTribeOptions={updateRaceOrTribeOptions}
          onSaveCustomCommentFields={saveCustomCommentFields}
          onExportZip={exportFullBackupZip}
          onImportZip={async (file) => {
            const firstMapId = await importFullBackupZip(file);
            if (firstMapId) setActiveMapId(firstMapId);
            setActiveView('map');
          }}
          onLoadSampleData={async () => {
            const firstMapId = await loadSampleDatasetWithGraphics();
            setActiveMapId(firstMapId);
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
    </div>
  );
};

export default App;
