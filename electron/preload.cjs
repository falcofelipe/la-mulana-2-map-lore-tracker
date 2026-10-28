/**
 * Electron Preload Bridge (electron/preload.cjs)
 * ----------------------------------------------
 * Safely exposes `window.electronAPI` to the React renderer via `contextBridge`.
 * Completely isolated from the web app: when running in a browser, this file
 * is not loaded and `window.electronAPI` is simply undefined.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,

  updateGlobalHotkeys: (config) =>
    ipcRenderer.invoke('seamless:update-hotkeys', config),

  captureGameFrameNow: (preferredWindowTitle) =>
    ipcRenderer.invoke('seamless:capture-now', preferredWindowTitle),

  configureSteamFolderWatch: (options) =>
    ipcRenderer.invoke('seamless:watch-steam-folder', options),

  pickNativeFolder: () => ipcRenderer.invoke('seamless:pick-folder'),

  onCapturedFrame: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('seamless:captured-frame', handler);
    return () => {
      ipcRenderer.removeListener('seamless:captured-frame', handler);
    };
  },
});
