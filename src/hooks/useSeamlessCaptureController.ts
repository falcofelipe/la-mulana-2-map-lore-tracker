/**
 * useSeamlessCaptureController Hook
 * ---------------------------------
 * Orchestrates all seamless in-game screenshot & tablet OCR capture sources
 * across both the Web App and the Electron Desktop App:
 *
 * 1. Electron Global Hotkeys (`Alt+1` Room, `Alt+2` Tablet) + silent window capture.
 * 2. Web Live Game Window Stream (`navigator.mediaDevices.getDisplayMedia`).
 * 3. Gamepad Button Combo Polling (`Select+R1` Room, `Select+L1` Tablet) via `navigator.getGamepads()`.
 * 4. Screenshot Folder Watcher:
 *    - Web: File System Access API (`window.showDirectoryPicker`) polling for new PNG/JPG/WebP screenshots.
 *    - Electron: Native `fs.watch` on Steam's La-Mulana 2 screenshot folder (AppID 835430) or custom folder.
 * 5. First-Capture Bounding Rect Calibration Modal (for both Room and Tablet bounding rects).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CommentEntry,
  CustomFieldDefinition,
  GridCell,
  MapPage,
  NormalizedBoundingRect,
  SeamlessCaptureConfig,
  TabletScannerConfig,
} from '../types/models';
import {
  DEFAULT_SEAMLESS_CAPTURE_CONFIG,
  DEFAULT_TABLET_SCANNER_CONFIG,
} from '../config/defaultDefinitions';
import { dataUrlToBlob, getElectronAPI } from '../utils/electronBridge';
import {
  captureVideoFrameAsBlob,
  classifyScreenshotMode,
  cropImageBlobToRect,
  isGamepadComboPressed,
  playCaptureConfirmationChime,
  routeTabletScanToCommentFields,
} from '../utils/seamlessCapture';
import { scanTabletScreenshot } from '../utils/tabletScanner';

export interface CaptureStatusToast {
  id: string;
  kind: 'room' | 'tablet' | 'info' | 'error';
  title: string;
  detail?: string;
}

export interface PendingCalibrationRequest {
  mode: 'room' | 'tablet';
  frameBlob: Blob;
  isFirstTimePrompt: boolean;
  /** If true, after saving the bounding rect, immediately process the captured frame */
  processAfterSave: boolean;
}

interface UseSeamlessCaptureControllerParams {
  seamlessConfig?: SeamlessCaptureConfig;
  tabletScannerConfig?: TabletScannerConfig;
  customCommentFields: CustomFieldDefinition[];
  targetCell: GridCell | null;
  targetMap: MapPage | null;
  onSaveSeamlessConfig: (next: SeamlessCaptureConfig) => Promise<void>;
  onAssignRoomScreenshot: (cellId: string, blob: Blob) => Promise<void>;
  onCreateComment: (
    input: Omit<CommentEntry, 'id' | 'createdAt' | 'updatedAt'>
  ) => Promise<CommentEntry>;
  onAttachImageToComment: (commentId: string, blob: Blob) => Promise<string>;
  onAddCustomFieldOption: (fieldId: string, option: string) => Promise<void>;
  onInspectCell?: (cellId: string) => void;
}

export function useSeamlessCaptureController({
  seamlessConfig,
  tabletScannerConfig,
  customCommentFields,
  targetCell,
  targetMap,
  onSaveSeamlessConfig,
  onAssignRoomScreenshot,
  onCreateComment,
  onAttachImageToComment,
  onAddCustomFieldOption,
  onInspectCell,
}: UseSeamlessCaptureControllerParams) {
  const effectiveConfig: SeamlessCaptureConfig = {
    ...DEFAULT_SEAMLESS_CAPTURE_CONFIG,
    ...(seamlessConfig || {}),
  };

  const electronAPI = getElectronAPI();
  const isElectron = Boolean(electronAPI);

  // Live Web Screen-Share Stream (`getDisplayMedia`)
  const [isWebStreamConnected, setIsWebStreamConnected] = useState(false);
  const [webStreamLabel, setWebStreamLabel] = useState<string | null>(null);
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  // Web Directory Watcher (`showDirectoryPicker`)
  const [isWebFolderWatching, setIsWebFolderWatching] = useState(false);
  const [watchedFolderName, setWatchedFolderName] = useState<string | null>(
    null
  );
  const dirHandleRef = useRef<FileSystemDirectoryHandle | null>(null);
  const seenFilesRef = useRef<Set<string>>(new Set());

  // Electron Hotkey & Native Steam Watcher Status
  const [electronStatus, setElectronStatus] = useState<{
    roomRegistered: boolean;
    tabletRegistered: boolean;
    watchingSteamFolder: boolean;
    steamFolderPath?: string;
    error?: string;
  }>({
    roomRegistered: false,
    tabletRegistered: false,
    watchingSteamFolder: false,
  });

  // Calibration Modal & Toast Notifications
  const [pendingCalibration, setPendingCalibration] =
    useState<PendingCalibrationRequest | null>(null);
  const [toast, setToast] = useState<CaptureStatusToast | null>(null);

  const showToast = useCallback(
    (
      kind: CaptureStatusToast['kind'],
      title: string,
      detail?: string,
      durationMs = 3800
    ) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setToast({ id, kind, title, detail });
      setTimeout(() => {
        setToast((prev) => (prev?.id === id ? null : prev));
      }, durationMs);
    },
    []
  );

  // Keep latest refs so async listeners/intervals always see fresh state without re-binding
  const stateRef = useRef({
    effectiveConfig,
    tabletScannerConfig,
    customCommentFields,
    targetCell,
    targetMap,
    isWebStreamConnected,
  });
  useEffect(() => {
    stateRef.current = {
      effectiveConfig,
      tabletScannerConfig,
      customCommentFields,
      targetCell,
      targetMap,
      isWebStreamConnected,
    };
  }, [
    effectiveConfig,
    tabletScannerConfig,
    customCommentFields,
    targetCell,
    targetMap,
    isWebStreamConnected,
  ]);

  /**
   * Executes the actual Room or Tablet processing on a full-frame Blob
   * using the given (or saved) NormalizedBoundingRect.
   */
  const executeCroppedCapture = useCallback(
    async (
      mode: 'room' | 'tablet',
      rawFrameBlob: Blob,
      overrideRect?: NormalizedBoundingRect | null
    ) => {
      const {
        effectiveConfig: cfg,
        tabletScannerConfig: scannerCfg,
        customCommentFields: fields,
        targetCell: cell,
        targetMap: map,
      } = stateRef.current;

      if (!cell || !map) {
        showToast(
          'error',
          'No Room Selected on Map Grid',
          'Click any cell on the Map Grid first so captured screenshots know which room to attach to!'
        );
        return;
      }

      try {
        const activeRect =
          overrideRect !== undefined
            ? overrideRect
            : mode === 'room'
            ? cfg.roomCropRect
            : cfg.tabletCropRect;

        const croppedBlob = await cropImageBlobToRect(rawFrameBlob, activeRect);

        if (mode === 'room') {
          await onAssignRoomScreenshot(cell.id, croppedBlob);
          if (cfg.playSoundOnCapture) {
            playCaptureConfirmationChime('room');
          }
          showToast(
            'room',
            `Room Screenshot Saved → ${map.codePrefix} ${cell.coord}`,
            cell.roomName
              ? `${cell.roomName} (Cropped & compressed to WebP)`
              : 'Cropped & compressed to WebP'
          );
          return;
        }

        // Mode === 'tablet': Run OCR + Colored Keyword Tagging + Drawing Detection
        showToast(
          'info',
          `Scanning Tablet OCR for ${map.codePrefix} ${cell.coord}...`,
          'Extracting colored keywords, Child/Race header, and diagrams...'
        );

        const effectiveScanner: TabletScannerConfig = {
          ...DEFAULT_TABLET_SCANNER_CONFIG,
          ...(scannerCfg || {}),
        };

        const scanResult = await scanTabletScreenshot(croppedBlob, {
          autoHighlightColoredText: effectiveScanner.autoHighlightColoredText,
          extractHeader: effectiveScanner.headerTargetMode !== 'ignore',
        });

        const routed = routeTabletScanToCommentFields(
          scanResult,
          effectiveScanner,
          fields
        );

        if (routed.newOptionToEnsure) {
          await onAddCustomFieldOption(
            routed.newOptionToEnsure.fieldId,
            routed.newOptionToEnsure.value
          );
        }

        const created = await onCreateComment({
          mapId: map.id,
          cellId: cell.id,
          cellCoord: cell.coord,
          category: 'tablet',
          speakerOrTitle: routed.speakerOrTitle,
          content: routed.content || '(Blank tablet scan)',
          customFields: routed.customFields,
          resolved: false,
          attachmentBlobIds: [],
        });

        if (routed.keepAttachment) {
          await onAttachImageToComment(created.id, croppedBlob);
        }

        if (cfg.tabletQuickSaveMode === 'open_drawer' && onInspectCell) {
          onInspectCell(cell.id);
        }

        if (cfg.playSoundOnCapture) {
          playCaptureConfirmationChime('tablet');
        }

        const previewSnippet =
          routed.content.length > 68
            ? `${routed.content.slice(0, 68)}...`
            : routed.content;

        showToast(
          'tablet',
          `Tablet Logged in ${map.codePrefix} ${cell.coord}${
            routed.speakerOrTitle ? ` (${routed.speakerOrTitle})` : ''
          }`,
          `${previewSnippet}${
            routed.keepAttachment ? ' • Drawing attached!' : ''
          }`
        );
      } catch (err) {
        showToast(
          'error',
          `Failed to process ${mode} screenshot`,
          err instanceof Error ? err.message : 'Unknown error'
        );
      }
    },
    [
      onAddCustomFieldOption,
      onAssignRoomScreenshot,
      onAttachImageToComment,
      onCreateComment,
      onInspectCell,
      showToast,
    ]
  );

  /**
   * Entry point whenever a full-frame screenshot arrives from ANY trigger
   * (Electron global hotkey, Gamepad combo, or Watched Screenshot Folder).
   * Checks if first-capture calibration is needed; otherwise crops and processes immediately.
   */
  const handleIncomingRawFrame = useCallback(
    async (mode: 'room' | 'tablet' | 'auto', rawFrameBlob: Blob) => {
      const { effectiveConfig: cfg, targetCell: cell } = stateRef.current;

      if (!cell) {
        showToast(
          'error',
          'Select a Room Cell First',
          'Click a room cell on the Map Grid so the tracker knows where to save the capture.'
        );
        return;
      }

      const resolvedMode: 'room' | 'tablet' =
        mode === 'auto'
          ? cfg.autoClassifyWatchedScreenshots
            ? await classifyScreenshotMode(rawFrameBlob)
            : 'room'
          : mode;

      const existingRect =
        resolvedMode === 'room' ? cfg.roomCropRect : cfg.tabletCropRect;

      if (!existingRect && cfg.promptCalibrationOnFirstCapture) {
        setPendingCalibration({
          mode: resolvedMode,
          frameBlob: rawFrameBlob,
          isFirstTimePrompt: true,
          processAfterSave: true,
        });
        return;
      }

      await executeCroppedCapture(resolvedMode, rawFrameBlob, existingRect);
    },
    [executeCroppedCapture, showToast]
  );

  /**
   * Grabs a single raw frame from either Electron's `desktopCapturer` OR
   * the connected Web `getDisplayMedia` live video stream.
   */
  const grabCurrentGameFrameBlob = useCallback(async (): Promise<Blob> => {
    const { effectiveConfig: cfg } = stateRef.current;

    if (electronAPI) {
      const frame = await electronAPI.captureGameFrameNow(
        cfg.preferredWindowTitle
      );
      return await dataUrlToBlob(frame.dataUrl);
    }

    if (videoElRef.current && mediaStreamRef.current) {
      return await captureVideoFrameAsBlob(videoElRef.current);
    }

    throw new Error(
      'No active game stream connected. Click "Connect Game Stream" in the top bar (or use the Desktop App / Folder Watcher).'
    );
  }, [electronAPI]);

  /**
   * Triggers an immediate Room or Tablet capture from the active source
   * (used by Gamepad combos, UI quick-capture buttons, or manual calibration).
   */
  const triggerCaptureNow = useCallback(
    async (mode: 'room' | 'tablet') => {
      try {
        const blob = await grabCurrentGameFrameBlob();
        await handleIncomingRawFrame(mode, blob);
      } catch (err) {
        showToast(
          'error',
          'Game Window Stream Not Connected',
          err instanceof Error ? err.message : 'Could not capture game frame'
        );
      }
    },
    [grabCurrentGameFrameBlob, handleIncomingRawFrame, showToast]
  );

  /**
   * Opens the interactive Bounding Rect Calibrator Modal for `mode` ('room' | 'tablet')
   * by grabbing a fresh game frame (or letting the user pick a sample screenshot file if not streaming).
   */
  const openCalibratorWithSample = useCallback(
    async (mode: 'room' | 'tablet', sampleBlob?: Blob) => {
      try {
        const blob = sampleBlob || (await grabCurrentGameFrameBlob());
        setPendingCalibration({
          mode,
          frameBlob: blob,
          isFirstTimePrompt: false,
          processAfterSave: false,
        });
      } catch (err) {
        showToast(
          'info',
          'Upload a Sample Screenshot or Connect Stream to Calibrate',
          err instanceof Error
            ? err.message
            : 'Connect a game stream or choose a sample screenshot file to calibrate.'
        );
      }
    },
    [grabCurrentGameFrameBlob, showToast]
  );

  /**
   * Called when the user clicks "Save Bounding Rect" inside `BoundingRectCalibratorModal`.
   */
  const confirmCalibrationRect = useCallback(
    async (rect: NormalizedBoundingRect) => {
      if (!pendingCalibration) return;
      const { mode, frameBlob, processAfterSave } = pendingCalibration;
      const { effectiveConfig: cfg } = stateRef.current;

      const updatedConfig: SeamlessCaptureConfig = {
        ...cfg,
        ...(mode === 'room' ? { roomCropRect: rect } : { tabletCropRect: rect }),
      };

      setPendingCalibration(null);
      await onSaveSeamlessConfig(updatedConfig);

      if (processAfterSave) {
        await executeCroppedCapture(mode, frameBlob, rect);
      } else {
        showToast(
          'info',
          `${mode === 'room' ? 'Room' : 'Tablet'} Bounding Rect Saved`,
          `Future ${mode} captures will automatically crop to ${Math.round(
            rect.width * 100
          )}% × ${Math.round(rect.height * 100)}%.`
        );
      }
    },
    [
      executeCroppedCapture,
      onSaveSeamlessConfig,
      pendingCalibration,
      showToast,
    ]
  );

  // ============================================================================
  // 1. WEB LIVE STREAM (`getDisplayMedia`) CONNECT / DISCONNECT
  // ============================================================================

  const connectWebGameStream = useCallback(async () => {
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices?.getDisplayMedia
    ) {
      showToast(
        'error',
        'Screen Capture Unsupported',
        'Your browser does not support getDisplayMedia.'
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: { ideal: 15, max: 30 },
        },
        audio: false,
      });

      const videoTrack = stream.getVideoTracks()[0];
      const label = videoTrack?.label || 'Game Window';

      const video = document.createElement('video');
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      await video.play();

      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      }

      mediaStreamRef.current = stream;
      videoElRef.current = video;
      setIsWebStreamConnected(true);
      setWebStreamLabel(label);

      videoTrack?.addEventListener('ended', () => {
        setIsWebStreamConnected(false);
        setWebStreamLabel(null);
        mediaStreamRef.current = null;
        videoElRef.current = null;
      });

      showToast(
        'info',
        'Live Game Stream Connected',
        `Ready! Use your Gamepad Combo (${effectiveConfig.roomGamepadCombo} / ${effectiveConfig.tabletGamepadCombo}) or Top Bar buttons to capture.`
      );
    } catch (err) {
      if (err instanceof Error && err.name === 'NotAllowedError') {
        return;
      }
      showToast(
        'error',
        'Could not connect game stream',
        err instanceof Error ? err.message : 'Unknown error'
      );
    }
  }, [
    effectiveConfig.roomGamepadCombo,
    effectiveConfig.tabletGamepadCombo,
    showToast,
  ]);

  const disconnectWebGameStream = useCallback(() => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
    }
    mediaStreamRef.current = null;
    videoElRef.current = null;
    setIsWebStreamConnected(false);
    setWebStreamLabel(null);
  }, []);

  // ============================================================================
  // 2. WEB DIRECTORY WATCHER (`window.showDirectoryPicker`) FOR STEAM F12
  // ============================================================================

  const startWebFolderWatcher = useCallback(async () => {
    const win = window as unknown as {
      showDirectoryPicker?: (options?: {
        mode?: 'read' | 'readwrite';
      }) => Promise<FileSystemDirectoryHandle>;
    };

    if (typeof win.showDirectoryPicker !== 'function') {
      showToast(
        'error',
        'Directory Watcher Requires Chromium / Edge / Chrome or Desktop App',
        'Your current browser does not expose window.showDirectoryPicker.'
      );
      return;
    }

    try {
      const handle = await win.showDirectoryPicker({ mode: 'read' });
      const initialSeen = new Set<string>();

      // Snapshot existing files so we only import NEW screenshots taken from now on
      // @ts-expect-error values() is supported in Chromium FileSystemDirectoryHandle
      for await (const entry of handle.values()) {
        if (entry.kind === 'file') {
          initialSeen.add(entry.name);
        }
      }

      dirHandleRef.current = handle;
      seenFilesRef.current = initialSeen;
      setIsWebFolderWatching(true);
      setWatchedFolderName(handle.name);

      showToast(
        'info',
        `Watching Screenshot Folder: "${handle.name}"`,
        'Press F12 in Steam while playing! New screenshots will auto-crop and import into the selected room.'
      );
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      showToast(
        'error',
        'Failed to watch screenshot folder',
        err instanceof Error ? err.message : 'Unknown error'
      );
    }
  }, [showToast]);

  const stopWebFolderWatcher = useCallback(() => {
    dirHandleRef.current = null;
    seenFilesRef.current.clear();
    setIsWebFolderWatching(false);
    setWatchedFolderName(null);
  }, []);

  useEffect(() => {
    if (!isWebFolderWatching || !dirHandleRef.current) return;

    let isChecking = false;
    const interval = setInterval(async () => {
      if (isChecking || !dirHandleRef.current) return;
      isChecking = true;
      try {
        const newFiles: { file: File; name: string }[] = [];
        // @ts-expect-error values() is standard in Chromium browsers
        for await (const entry of dirHandleRef.current.values()) {
          if (
            entry.kind === 'file' &&
            /\.(png|jpe?g|webp)$/i.test(entry.name) &&
            !seenFilesRef.current.has(entry.name)
          ) {
            // Ignore Steam's small `_vr` or thumbnail duplicates if inside a mixed folder
            if (entry.name.toLowerCase().includes('thumb')) {
              seenFilesRef.current.add(entry.name);
              continue;
            }
            const file = await (entry as FileSystemFileHandle).getFile();
            if (file.size > 4096) {
              seenFilesRef.current.add(entry.name);
              newFiles.push({ file, name: entry.name });
            }
          }
        }

        newFiles.sort((a, b) => a.file.lastModified - b.file.lastModified);
        for (const item of newFiles) {
          await handleIncomingRawFrame('auto', item.file);
        }
      } catch {
        // Ignore transient file-lock errors while Steam is mid-write
      } finally {
        isChecking = false;
      }
    }, 900);

    return () => clearInterval(interval);
  }, [isWebFolderWatching, handleIncomingRawFrame]);

  // ============================================================================
  // 3. GAMEPAD BUTTON COMBO POLLING (WORKS IN BOTH WEB & ELECTRON)
  // ============================================================================

  useEffect(() => {
    if (!effectiveConfig.enabled) return;
    if (
      !effectiveConfig.roomGamepadCombo &&
      !effectiveConfig.tabletGamepadCombo
    ) {
      return;
    }

    let lastTriggerTime = 0;
    const COOLDOWN_MS = 1100;

    const pollInterval = setInterval(() => {
      if (
        typeof navigator === 'undefined' ||
        typeof navigator.getGamepads !== 'function'
      ) {
        return;
      }

      const now = Date.now();
      if (now - lastTriggerTime < COOLDOWN_MS) return;

      const pads = navigator.getGamepads();
      if (!pads) return;

      const { effectiveConfig: cfg } = stateRef.current;

      for (const pad of pads) {
        if (!pad || !pad.connected) continue;

        if (
          cfg.roomGamepadCombo &&
          isGamepadComboPressed(pad.buttons, cfg.roomGamepadCombo)
        ) {
          lastTriggerTime = now;
          triggerCaptureNow('room');
          return;
        }

        if (
          cfg.tabletGamepadCombo &&
          isGamepadComboPressed(pad.buttons, cfg.tabletGamepadCombo)
        ) {
          lastTriggerTime = now;
          triggerCaptureNow('tablet');
          return;
        }
      }
    }, 90);

    return () => clearInterval(pollInterval);
  }, [
    effectiveConfig.enabled,
    effectiveConfig.roomGamepadCombo,
    effectiveConfig.tabletGamepadCombo,
    triggerCaptureNow,
  ]);

  // ============================================================================
  // 4. ELECTRON GLOBAL HOTKEYS & NATIVE STEAM SCREENSHOT WATCHER SYNC
  // ============================================================================

  useEffect(() => {
    if (!electronAPI) return;

    electronAPI
      .updateGlobalHotkeys({
        enabled: effectiveConfig.enabled,
        roomHotkey: effectiveConfig.roomHotkey,
        tabletHotkey: effectiveConfig.tabletHotkey,
        preferredWindowTitle: effectiveConfig.preferredWindowTitle,
      })
      .then((res) => {
        setElectronStatus((prev) => ({
          ...prev,
          roomRegistered: res.roomRegistered,
          tabletRegistered: res.tabletRegistered,
          error: res.error,
        }));
      })
      .catch(() => {});
  }, [
    electronAPI,
    effectiveConfig.enabled,
    effectiveConfig.roomHotkey,
    effectiveConfig.tabletHotkey,
    effectiveConfig.preferredWindowTitle,
  ]);

  useEffect(() => {
    if (!electronAPI) return;

    const unsubscribe = electronAPI.onCapturedFrame(async (payload) => {
      try {
        const blob = await dataUrlToBlob(payload.dataUrl);
        await handleIncomingRawFrame(payload.kind, blob);
      } catch (err) {
        showToast(
          'error',
          'Desktop Capture Error',
          err instanceof Error ? err.message : 'Failed to decode frame'
        );
      }
    });

    return unsubscribe;
  }, [electronAPI, handleIncomingRawFrame, showToast]);

  const toggleElectronSteamFolderWatch = useCallback(
    async (enable: boolean, customPath?: string) => {
      if (!electronAPI) return;
      const res = await electronAPI.configureSteamFolderWatch({
        enabled: enable,
        customPath: customPath ?? effectiveConfig.steamWatchFolderPath,
      });
      setElectronStatus((prev) => ({
        ...prev,
        watchingSteamFolder: res.watching,
        steamFolderPath: res.folderPath,
        error: res.error,
      }));
      if (res.watching && res.folderPath) {
        showToast(
          'info',
          'Watching Steam Screenshots Folder',
          res.folderPath
        );
      } else if (res.error) {
        showToast('error', 'Steam Folder Watcher', res.error);
      }
    },
    [electronAPI, effectiveConfig.steamWatchFolderPath, showToast]
  );

  return {
    effectiveConfig,
    isElectron,
    electronStatus,
    isWebStreamConnected,
    webStreamLabel,
    connectWebGameStream,
    disconnectWebGameStream,
    isWebFolderWatching,
    watchedFolderName,
    startWebFolderWatcher,
    stopWebFolderWatcher,
    toggleElectronSteamFolderWatch,
    triggerCaptureNow,
    openCalibratorWithSample,
    pendingCalibration,
    confirmCalibrationRect,
    cancelCalibration: () => setPendingCalibration(null),
    toast,
    dismissToast: () => setToast(null),
  };
}
