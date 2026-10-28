/**
 * SeamlessCaptureSettingsSection Component
 * ----------------------------------------
 * Dedicated configuration panel inside Customize & Backup (SettingsAndCustomizeView)
 * for Seamless In-Game Room & Tablet Screenshot Capture:
 * 1. Global Keyboard Hotkeys (Electron Desktop App) + Gamepad Button Combos (Web & Desktop).
 * 2. Separate Bounding Rect Calibration for Room Screenshots and Tablet Captures
 *    (with 1-click Live Frame Calibrate, Upload Sample Screenshot to Calibrate, or Reset).
 * 3. Live Game Window Stream (`getDisplayMedia`) & Steam Screenshot Folder Watcher controls.
 */

import React, { useState } from 'react';
import {
  Camera,
  Crop,
  FolderSearch,
  Gamepad2,
  Keyboard,
  Monitor,
  RotateCcw,
  ScanText,
  Sparkles,
  Upload,
  CheckCircle2,
  Radio,
} from 'lucide-react';
import {
  NormalizedBoundingRect,
  SeamlessCaptureConfig,
} from '../../types/models';
import { DEFAULT_SEAMLESS_CAPTURE_CONFIG } from '../../config/defaultDefinitions';
import { getElectronAPI } from '../../utils/electronBridge';

interface SeamlessCaptureSettingsSectionProps {
  seamlessConfig?: SeamlessCaptureConfig;
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
  onSaveSeamlessConfig: (next: SeamlessCaptureConfig) => Promise<void>;
}

const GAMEPAD_COMBO_PRESETS = [
  { label: 'Select + R1 / RB', value: 'Select+R1' },
  { label: 'Select + L1 / LB', value: 'Select+L1' },
  { label: 'L3 + R3 (Both Sticks)', value: 'L3+R3' },
  { label: 'Select + R3', value: 'Select+R3' },
  { label: 'Select + L3', value: 'Select+L3' },
  { label: 'Start + Select', value: 'Start+Select' },
  { label: 'Disabled', value: '' },
];

function formatRectSummary(rect?: NormalizedBoundingRect | null): string {
  if (!rect) return 'Not calibrated yet (prompts on 1st capture)';
  const wPct = Math.round(rect.width * 100);
  const hPct = Math.round(rect.height * 100);
  const xPct = Math.round(rect.x * 100);
  const yPct = Math.round(rect.y * 100);
  return `${wPct}% × ${hPct}% (offset ${xPct}%, ${yPct}%)`;
}

export const SeamlessCaptureSettingsSection: React.FC<
  SeamlessCaptureSettingsSectionProps
> = ({
  seamlessConfig,
  isElectron,
  electronStatus,
  isWebStreamConnected,
  webStreamLabel,
  onConnectWebStream,
  onDisconnectWebStream,
  isWebFolderWatching,
  watchedFolderName,
  onStartWebFolderWatch,
  onStopWebFolderWatch,
  onToggleElectronSteamWatch,
  onOpenCalibratorWithSample,
  onSaveSeamlessConfig,
}) => {
  const cfg: SeamlessCaptureConfig = {
    ...DEFAULT_SEAMLESS_CAPTURE_CONFIG,
    ...(seamlessConfig || {}),
  };

  const [recordingKeyFor, setRecordingKeyFor] = useState<
    'room' | 'tablet' | null
  >(null);

  const handleRecordKeyDown = async (
    e: React.KeyboardEvent<HTMLButtonElement>,
    target: 'room' | 'tablet'
  ) => {
    e.preventDefault();
    e.stopPropagation();

    if (e.key === 'Escape') {
      setRecordingKeyFor(null);
      return;
    }

    // Ignore modifier-only presses
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) {
      return;
    }

    const parts: string[] = [];
    if (e.ctrlKey || e.metaKey) parts.push('CommandOrControl');
    if (e.altKey) parts.push('Alt');
    if (e.shiftKey) parts.push('Shift');

    let keyName = e.key;
    if (keyName === ' ') keyName = 'Space';
    else if (keyName.length === 1) keyName = keyName.toUpperCase();

    parts.push(keyName);
    const accelerator = parts.join('+');

    setRecordingKeyFor(null);
    await onSaveSeamlessConfig({
      ...cfg,
      ...(target === 'room'
        ? { roomHotkey: accelerator }
        : { tabletHotkey: accelerator }),
    });
  };

  const handlePickNativeFolderForElectron = async () => {
    const api = getElectronAPI();
    if (!api) return;
    const picked = await api.pickNativeFolder();
    if (picked) {
      await onSaveSeamlessConfig({
        ...cfg,
        steamWatchFolderPath: picked,
      });
      await onToggleElectronSteamWatch(true, picked);
    }
  };

  return (
    <div className="bg-slate-900 border border-amber-500/30 rounded-xl p-5 shadow-lg flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 pb-3.5">
        <div>
          <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <Camera size={18} className="text-amber-400" />
            <span>
              Seamless In-Game Screenshot &amp; Tablet Capture (Hotkeys, Gamepad &amp; Bounding Rects)
            </span>
            <span
              className={`text-[10px] px-2 py-0.5 rounded uppercase tracking-wider font-semibold border ${
                isElectron
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  : 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
              }`}
            >
              {isElectron ? 'Desktop Native Mode' : 'Web Browser Mode'}
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Automatically capture and crop <strong className="text-amber-300">Room Maps</strong> and{' '}
            <strong className="text-cyan-300">Stone Tablets (with OCR)</strong> into the currently selected grid cell while playing La-Mulana 2—with independent bounding boxes calibrated on your first capture!
          </p>
        </div>

        <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-semibold text-slate-200 cursor-pointer">
          <input
            type="checkbox"
            checked={cfg.enabled}
            onChange={(e) =>
              onSaveSeamlessConfig({ ...cfg, enabled: e.target.checked })
            }
            className="accent-amber-400"
          />
          <span>Enable Seamless Capture</span>
        </label>
      </div>

      {/* ROW 1: CAPTURE SOURCES (LIVE GAME STREAM + STEAM SCREENSHOT FOLDER WATCHER) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
        {/* Source A: Live Game Window Capture */}
        <div className="bg-slate-950 border border-slate-800 rounded-lg p-3.5 flex flex-col justify-between gap-3">
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold text-slate-100 flex items-center gap-1.5">
                <Monitor size={14} className="text-amber-400" />
                <span>
                  {isElectron
                    ? '1. Silent Native Game Window Capture (Active)'
                    : '1. Live Game Window Stream (getDisplayMedia)'}
                </span>
              </span>
              {(isElectron || isWebStreamConnected) && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-semibold">
                  <CheckCircle2 size={11} />
                  <span>Connected</span>
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400">
              {isElectron
                ? 'Electron automatically captures your La-Mulana 2 window in the background when you press your Global Hotkey or Gamepad Combo.'
                : 'In Web mode, connect your La-Mulana 2 window once per session so Gamepad Combos and 1-click capture buttons can grab frames instantly without leaving the game.'}
            </p>
          </div>

          {isElectron ? (
            <div className="flex items-center gap-2">
              <label className="text-[11px] text-slate-400 shrink-0">
                Target Window Title:
              </label>
              <input
                type="text"
                value={cfg.preferredWindowTitle}
                onChange={(e) =>
                  onSaveSeamlessConfig({
                    ...cfg,
                    preferredWindowTitle: e.target.value,
                  })
                }
                placeholder="La-Mulana 2"
                className="flex-1 bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-slate-100 font-medium"
              />
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {!isWebStreamConnected ? (
                <button
                  type="button"
                  onClick={onConnectWebStream}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold shadow"
                >
                  <Radio size={13} />
                  <span>Connect Game Window Stream</span>
                </button>
              ) : (
                <>
                  <span className="text-[11px] text-emerald-300 font-medium truncate max-w-[220px]">
                    Streaming: {webStreamLabel}
                  </span>
                  <button
                    type="button"
                    onClick={onDisconnectWebStream}
                    className="px-2.5 py-1 rounded bg-slate-800 hover:bg-rose-950 text-slate-300 hover:text-rose-300 border border-slate-700 ml-auto"
                  >
                    Disconnect
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Source B: Steam F12 / Screenshot Folder Watcher */}
        <div className="bg-slate-950 border border-slate-800 rounded-lg p-3.5 flex flex-col justify-between gap-3">
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold text-slate-100 flex items-center gap-1.5">
                <FolderSearch size={14} className="text-cyan-400" />
                <span>2. Steam F12 / Screenshot Folder Auto-Watcher</span>
              </span>
              {(isWebFolderWatching || electronStatus.watchingSteamFolder) && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-200 border border-cyan-500/40 text-[10px] font-semibold">
                  <Sparkles size={11} />
                  <span>Watching Folder</span>
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400">
              Watch your Steam screenshot folder! Whenever you take a screenshot in-game (e.g. <code className="text-amber-300">F12</code>), the app detects whether it is a{' '}
              <strong className="text-cyan-300">Scan Mode Tablet</strong> or a{' '}
              <strong className="text-amber-300">Room Screen</strong>, crops it to your bounding rect, and imports it.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={cfg.autoClassifyWatchedScreenshots}
                onChange={(e) =>
                  onSaveSeamlessConfig({
                    ...cfg,
                    autoClassifyWatchedScreenshots: e.target.checked,
                  })
                }
                className="accent-cyan-400"
              />
              <span>Auto-detect Tablet vs. Room</span>
            </label>

            {isElectron ? (
              <div className="flex items-center gap-2">
                {!electronStatus.watchingSteamFolder ? (
                  <button
                    type="button"
                    onClick={() => onToggleElectronSteamWatch(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 border border-cyan-500/40 font-semibold"
                  >
                    <FolderSearch size={13} />
                    <span>Auto-Watch Steam Screenshots (AppID 835430)</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onToggleElectronSteamWatch(false)}
                    className="px-2.5 py-1 rounded bg-slate-800 hover:bg-rose-950 text-slate-300 hover:text-rose-300 border border-slate-700"
                  >
                    Stop Watching
                  </button>
                )}
                <button
                  type="button"
                  onClick={handlePickNativeFolderForElectron}
                  className="px-2.5 py-1.5 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700"
                  title="Pick a custom screenshot folder"
                >
                  Browse...
                </button>
              </div>
            ) : !isWebFolderWatching ? (
              <button
                type="button"
                onClick={onStartWebFolderWatch}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 border border-cyan-500/40 font-semibold"
              >
                <FolderSearch size={13} />
                <span>Pick Screenshot Folder to Watch...</span>
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-cyan-300 font-mono">
                  /{watchedFolderName}
                </span>
                <button
                  type="button"
                  onClick={onStopWebFolderWatch}
                  className="px-2.5 py-1 rounded bg-slate-800 hover:bg-rose-950 text-slate-300 hover:text-rose-300 border border-slate-700"
                >
                  Stop
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ROW 2: TWO INDEPENDENT CHANNELS (ROOM CAPTURE vs. TABLET CAPTURE) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
        {/* CHANNEL 1: ROOM SCREENSHOT CAPTURE */}
        <div className="bg-slate-950 border border-amber-500/30 rounded-lg p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="font-bold text-amber-300 flex items-center gap-1.5">
              <Monitor size={15} />
              <span>Keybind 1: Room Screenshot Capture</span>
            </span>
            <span className="text-[10px] text-slate-400">
              Saves to selected Map Grid cell
            </span>
          </div>

          {/* Global Hotkey + Gamepad Combo */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] text-slate-400 mb-1 flex items-center gap-1">
                <Keyboard size={11} className="text-amber-400" />
                <span>Global Hotkey {isElectron ? '(Active)' : '(Desktop App)'}</span>
              </label>
              <button
                type="button"
                onClick={() =>
                  setRecordingKeyFor(
                    recordingKeyFor === 'room' ? null : 'room'
                  )
                }
                onKeyDown={(e) => {
                  if (recordingKeyFor === 'room') {
                    handleRecordKeyDown(e, 'room');
                  }
                }}
                className={`w-full px-2.5 py-1.5 rounded border font-mono font-bold text-left flex items-center justify-between ${
                  recordingKeyFor === 'room'
                    ? 'bg-amber-500/20 border-amber-400 text-amber-200 animate-pulse'
                    : 'bg-slate-900 border-slate-700 text-slate-100 hover:border-amber-500/50'
                }`}
              >
                <span>
                  {recordingKeyFor === 'room'
                    ? 'Press key combo...'
                    : cfg.roomHotkey}
                </span>
                <span className="text-[10px] font-sans font-normal text-slate-400">
                  {recordingKeyFor === 'room' ? 'Esc cancel' : 'Click to set'}
                </span>
              </button>
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 mb-1 flex items-center gap-1">
                <Gamepad2 size={11} className="text-amber-400" />
                <span>Gamepad Combo (Web &amp; Desktop)</span>
              </label>
              <select
                value={cfg.roomGamepadCombo}
                onChange={(e) =>
                  onSaveSeamlessConfig({
                    ...cfg,
                    roomGamepadCombo: e.target.value,
                  })
                }
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100"
              >
                {GAMEPAD_COMBO_PRESETS.map((p) => (
                  <option key={`room-gp-${p.value}`} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Room Bounding Rect Status & Calibrator */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-md p-2.5 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-slate-400 font-medium">
                Room Bounding Rect:
              </span>
              <span className="font-mono text-[11px] text-amber-300 font-semibold">
                {formatRectSummary(cfg.roomCropRect)}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => onOpenCalibratorWithSample('room')}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 font-semibold"
              >
                <Crop size={12} />
                <span>Calibrate from Live Stream</span>
              </button>

              <label className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 cursor-pointer">
                <Upload size={12} className="text-amber-400" />
                <span>Calibrate from Image File...</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      onOpenCalibratorWithSample('room', file);
                    }
                    e.target.value = '';
                  }}
                />
              </label>

              {cfg.roomCropRect && (
                <button
                  type="button"
                  onClick={() =>
                    onSaveSeamlessConfig({ ...cfg, roomCropRect: null })
                  }
                  className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-950 hover:bg-rose-950 text-slate-400 hover:text-rose-300 border border-slate-800 ml-auto"
                  title="Clear saved bounding rect so the next Room capture prompts for calibration"
                >
                  <RotateCcw size={11} />
                  <span>Reset</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* CHANNEL 2: TABLET OCR & DIAGRAM CAPTURE */}
        <div className="bg-slate-950 border border-cyan-500/30 rounded-lg p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="font-bold text-cyan-300 flex items-center gap-1.5">
              <ScanText size={15} />
              <span>Keybind 2: Tablet OCR &amp; Diagram Capture</span>
            </span>
            <span className="text-[10px] text-slate-400">
              OCRs text, colors &amp; drawings into selected room
            </span>
          </div>

          {/* Global Hotkey + Gamepad Combo */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] text-slate-400 mb-1 flex items-center gap-1">
                <Keyboard size={11} className="text-cyan-400" />
                <span>Global Hotkey {isElectron ? '(Active)' : '(Desktop App)'}</span>
              </label>
              <button
                type="button"
                onClick={() =>
                  setRecordingKeyFor(
                    recordingKeyFor === 'tablet' ? null : 'tablet'
                  )
                }
                onKeyDown={(e) => {
                  if (recordingKeyFor === 'tablet') {
                    handleRecordKeyDown(e, 'tablet');
                  }
                }}
                className={`w-full px-2.5 py-1.5 rounded border font-mono font-bold text-left flex items-center justify-between ${
                  recordingKeyFor === 'tablet'
                    ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200 animate-pulse'
                    : 'bg-slate-900 border-slate-700 text-slate-100 hover:border-cyan-500/50'
                }`}
              >
                <span>
                  {recordingKeyFor === 'tablet'
                    ? 'Press key combo...'
                    : cfg.tabletHotkey}
                </span>
                <span className="text-[10px] font-sans font-normal text-slate-400">
                  {recordingKeyFor === 'tablet' ? 'Esc cancel' : 'Click to set'}
                </span>
              </button>
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 mb-1 flex items-center gap-1">
                <Gamepad2 size={11} className="text-cyan-400" />
                <span>Gamepad Combo (Web &amp; Desktop)</span>
              </label>
              <select
                value={cfg.tabletGamepadCombo}
                onChange={(e) =>
                  onSaveSeamlessConfig({
                    ...cfg,
                    tabletGamepadCombo: e.target.value,
                  })
                }
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100"
              >
                {GAMEPAD_COMBO_PRESETS.map((p) => (
                  <option key={`tab-gp-${p.value}`} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Tablet Bounding Rect Status & Calibrator */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-md p-2.5 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-slate-400 font-medium">
                Tablet Bounding Rect:
              </span>
              <span className="font-mono text-[11px] text-cyan-300 font-semibold">
                {formatRectSummary(cfg.tabletCropRect)}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => onOpenCalibratorWithSample('tablet')}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 border border-cyan-500/40 font-semibold"
              >
                <Crop size={12} />
                <span>Calibrate from Live Stream</span>
              </button>

              <label className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 cursor-pointer">
                <Upload size={12} className="text-cyan-400" />
                <span>Calibrate from Image File...</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      onOpenCalibratorWithSample('tablet', file);
                    }
                    e.target.value = '';
                  }}
                />
              </label>

              {cfg.tabletCropRect && (
                <button
                  type="button"
                  onClick={() =>
                    onSaveSeamlessConfig({ ...cfg, tabletCropRect: null })
                  }
                  className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-950 hover:bg-rose-950 text-slate-400 hover:text-rose-300 border border-slate-800 ml-auto"
                  title="Clear saved bounding rect so the next Tablet capture prompts for calibration"
                >
                  <RotateCcw size={11} />
                  <span>Reset</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ROW 3: GENERAL CAPTURE BEHAVIOR TOGGLES */}
      <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-slate-800 text-xs">
        <div className="flex flex-wrap items-center gap-5">
          <label className="inline-flex items-center gap-2 text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={cfg.promptCalibrationOnFirstCapture}
              onChange={(e) =>
                onSaveSeamlessConfig({
                  ...cfg,
                  promptCalibrationOnFirstCapture: e.target.checked,
                })
              }
              className="accent-amber-400"
            />
            <span>
              Open Bounding-Box Calibrator automatically on first Room / Tablet capture
            </span>
          </label>

          <label className="inline-flex items-center gap-2 text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={cfg.playSoundOnCapture}
              onChange={(e) =>
                onSaveSeamlessConfig({
                  ...cfg,
                  playSoundOnCapture: e.target.checked,
                })
              }
              className="accent-amber-400"
            />
            <span>Play subtle confirmation chime on background capture</span>
          </label>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-slate-400">After Tablet Hotkey OCR:</span>
          <select
            value={cfg.tabletQuickSaveMode}
            onChange={(e) =>
              onSaveSeamlessConfig({
                ...cfg,
                tabletQuickSaveMode: e.target.value as
                  | 'auto_save'
                  | 'open_drawer',
              })
            }
            className="bg-slate-950 border border-slate-700 rounded px-2.5 py-1 text-slate-200"
          >
            <option value="auto_save">
              Save Silently in Background (Stay In-Game)
            </option>
            <option value="open_drawer">
              Save &amp; Open Room Inspector Drawer
            </option>
          </select>
        </div>
      </div>
    </div>
  );
};
