/**
 * TopNavbar Component
 * -------------------
 * Main application header containing the View Mode Switcher (Map Grid,
 * Comments & Lore Database, Sketches & General Notes, Customize & Backup),
 * Global Search trigger (Ctrl+K), and quick Backup/Sample controls.
 */

import React from 'react';
import {
  Map,
  TableProperties,
  PenTool,
  Settings,
  Search,
  Download,
  Compass,
  Camera,
  ScanText,
  Radio,
} from 'lucide-react';

export type ActiveAppView = 'map' | 'comments' | 'sketches' | 'settings';

interface TopNavbarProps {
  projectTitle: string;
  activeView: ActiveAppView;
  onSelectView: (view: ActiveAppView) => void;
  onOpenGlobalSearch: () => void;
  onQuickExportZip: () => void;
  totalCommentsCount: number;
  unresolvedTodoCount: number;
  sketchesCount: number;
  captureStatus?: {
    isElectron: boolean;
    isWebStreamConnected: boolean;
    isFolderWatching: boolean;
    roomHotkey: string;
    tabletHotkey: string;
    onConnectStream: () => void;
    onTriggerRoomCapture: () => void;
    onTriggerTabletCapture: () => void;
  };
}

export const TopNavbar: React.FC<TopNavbarProps> = ({
  projectTitle,
  activeView,
  onSelectView,
  onOpenGlobalSearch,
  onQuickExportZip,
  totalCommentsCount,
  unresolvedTodoCount,
  sketchesCount,
  captureStatus,
}) => {
  return (
    <header className="h-14 bg-slate-900 border-b border-slate-800 px-4 flex items-center justify-between gap-4 select-none shrink-0 z-30">
      {/* Brand & Project Title */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-amber-500/20 to-cyan-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shadow-inner shrink-0">
          <Compass size={20} />
        </div>
        <div className="truncate">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm tracking-wide text-slate-100 truncate">
              {projectTitle}
            </span>
            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 font-semibold">
              Local-First
            </span>
          </div>
          <p className="text-[11px] text-slate-400 truncate">
            La-Mulana 2 Visual Room Grid, Pin Annotator &amp; Lore Database
          </p>
        </div>
      </div>

      {/* Main View Switcher */}
      <nav className="flex items-center bg-slate-950/80 p-1 rounded-lg border border-slate-800">
        <button
          type="button"
          onClick={() => onSelectView('map')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            activeView === 'map'
              ? 'bg-amber-500 text-slate-950 font-semibold shadow-sm'
              : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <Map size={15} />
          <span>Map Grid View</span>
        </button>

        <button
          type="button"
          onClick={() => onSelectView('comments')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            activeView === 'comments'
              ? 'bg-amber-500 text-slate-950 font-semibold shadow-sm'
              : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <TableProperties size={15} />
          <span>Comments &amp; Lore</span>
          {totalCommentsCount > 0 && (
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                activeView === 'comments'
                  ? 'bg-slate-950/20 text-slate-950 font-bold'
                  : 'bg-slate-800 text-slate-300'
              }`}
            >
              {totalCommentsCount}
            </span>
          )}
          {unresolvedTodoCount > 0 && (
            <span
              title={`${unresolvedTodoCount} unresolved TODO item(s)`}
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                activeView === 'comments'
                  ? 'bg-slate-950 text-amber-400'
                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
              }`}
            >
              {unresolvedTodoCount} TODO
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => onSelectView('sketches')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            activeView === 'sketches'
              ? 'bg-amber-500 text-slate-950 font-semibold shadow-sm'
              : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <PenTool size={15} />
          <span>Sketches &amp; Notes</span>
          {sketchesCount > 0 && (
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                activeView === 'sketches'
                  ? 'bg-slate-950/20 text-slate-950 font-bold'
                  : 'bg-slate-800 text-slate-300'
              }`}
            >
              {sketchesCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => onSelectView('settings')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            activeView === 'settings'
              ? 'bg-amber-500 text-slate-950 font-semibold shadow-sm'
              : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <Settings size={15} />
          <span>Customize &amp; Backup</span>
        </button>
      </nav>

      {/* Right Action Bar: Quick Capture, Search (Ctrl+K) & Quick Export */}
      <div className="flex items-center gap-2 shrink-0">
        {captureStatus && (
          <div className="hidden xl:flex items-center gap-1.5 bg-slate-950/90 border border-slate-800 rounded-md px-2 py-1">
            {captureStatus.isElectron || captureStatus.isWebStreamConnected ? (
              <>
                <button
                  type="button"
                  onClick={captureStatus.onTriggerRoomCapture}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 transition-colors"
                  title={`Capture & Crop Room Screenshot (${captureStatus.roomHotkey})`}
                >
                  <Camera size={12} />
                  <span>Room</span>
                  <kbd className="text-[9px] font-mono opacity-80">
                    {captureStatus.roomHotkey}
                  </kbd>
                </button>
                <button
                  type="button"
                  onClick={captureStatus.onTriggerTabletCapture}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 transition-colors"
                  title={`Capture, Crop & OCR Tablet Screenshot (${captureStatus.tabletHotkey})`}
                >
                  <ScanText size={12} />
                  <span>Tablet</span>
                  <kbd className="text-[9px] font-mono opacity-80">
                    {captureStatus.tabletHotkey}
                  </kbd>
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={captureStatus.onConnectStream}
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-medium text-slate-300 hover:text-amber-300 hover:bg-slate-900 transition-colors"
                title="Connect live La-Mulana 2 game window stream for 1-click or Gamepad screenshot & tablet capture"
              >
                <Radio size={12} className="text-amber-400" />
                <span>Connect Game Capture</span>
              </button>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={onOpenGlobalSearch}
          className="flex items-center gap-2.5 px-3 py-1.5 rounded-md text-xs bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-700/80 transition-colors"
          title="Search across all rooms, markers, tablets, and NPCs (Ctrl+K)"
        >
          <Search size={14} className="text-slate-400" />
          <span>Search Lore &amp; Rooms...</span>
          <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-slate-800 text-slate-400 rounded border border-slate-700">
            Ctrl+K
          </kbd>
        </button>

        <button
          type="button"
          onClick={onQuickExportZip}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
          title="Export all maps, comments, and WebP screenshots as a portable .zip archive"
        >
          <Download size={14} className="text-amber-400" />
          <span className="hidden lg:inline">Backup ZIP</span>
        </button>
      </div>
    </header>
  );
};
