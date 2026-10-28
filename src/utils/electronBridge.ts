/**
 * Optional Electron Bridge Type Definitions & Safe Accessor
 * ---------------------------------------------------------
 * Allows the exact same React codebase to run in:
 * 1. Standard Web Browsers (where `window.electronAPI` is undefined)
 * 2. Electron Desktop App (where `window.electronAPI` provides OS-level global
 *    hotkeys, silent window capture, and native Steam screenshot folder watching)
 */

export interface ElectronCapturePayload {
  kind: 'room' | 'tablet' | 'auto';
  dataUrl: string;
  sourceName: string;
  width: number;
  height: number;
  timestamp: number;
  origin: 'hotkey' | 'steam_folder' | 'manual';
}

export interface ElectronDesktopAPI {
  isElectron: boolean;
  /** Registers global OS-level hotkeys for Room and Tablet capture */
  updateGlobalHotkeys: (config: {
    enabled: boolean;
    roomHotkey: string;
    tabletHotkey: string;
    preferredWindowTitle: string;
  }) => Promise<{
    roomRegistered: boolean;
    tabletRegistered: boolean;
    error?: string;
  }>;
  /** Captures the preferred game window (or primary screen) immediately */
  captureGameFrameNow: (preferredWindowTitle?: string) => Promise<{
    dataUrl: string;
    sourceName: string;
    width: number;
    height: number;
  }>;
  /** Auto-detects or configures native Steam AppID 835430 screenshot folder watching */
  configureSteamFolderWatch: (options: {
    enabled: boolean;
    customPath?: string;
  }) => Promise<{
    watching: boolean;
    folderPath?: string;
    error?: string;
  }>;
  /** Opens a native OS folder picker dialog and returns the selected path */
  pickNativeFolder: () => Promise<string | null>;
  /** Subscribes to incoming screenshots from global hotkeys or native folder watcher */
  onCapturedFrame: (
    callback: (payload: ElectronCapturePayload) => void
  ) => () => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronDesktopAPI;
  }
}

export function getElectronAPI(): ElectronDesktopAPI | null {
  if (typeof window !== 'undefined' && window.electronAPI?.isElectron) {
    return window.electronAPI;
  }
  return null;
}

/**
 * Converts a base64 `data:image/png;base64,...` URL into a standard `Blob`.
 */
export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return await res.blob();
}
