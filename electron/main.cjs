/**
 * Electron Main Process Wrapper (electron/main.cjs)
 * -------------------------------------------------
 * Lightweight, self-contained desktop wrapper around the Vite + React app.
 * Provides:
 * 1. Global OS-level hotkeys (`globalShortcut`) that work while La-Mulana 2 is
 *    open and focused in fullscreen or borderless window mode.
 * 2. Silent background window/screen capture (`desktopCapturer`) matching the
 *    La-Mulana 2 window (or primary display fallback).
 * 3. Automatic discovery and watching (`fs.watch`) of Steam's La-Mulana 2
 *    screenshots folder (Steam AppID 835430) or any user-selected folder.
 */

const {
  app,
  BrowserWindow,
  globalShortcut,
  desktopCapturer,
  ipcMain,
  dialog,
  screen,
} = require('electron');
const path = require('path');
const fs = require('fs');

// Allow Gamepad API polling and Web Workers to run at full speed even when
// the tracker window is in the background or on a second monitor.
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');

let mainWindow = null;
let currentHotkeyConfig = {
  enabled: true,
  roomHotkey: 'Alt+1',
  tabletHotkey: 'Alt+2',
  preferredWindowTitle: 'La-Mulana 2',
};

let activeFolderWatcher = null;
let activeWatchedPath = null;

/**
 * Captures the La-Mulana 2 window (if open and non-empty) or falls back to the
 * primary display at full 1920x1080 resolution.
 */
async function capturePreferredGameSource(preferredTitle = 'La-Mulana 2') {
  const primaryDisplay = screen.getPrimaryDisplay();
  const targetWidth = Math.max(
    1920,
    Math.round(primaryDisplay.size.width * (primaryDisplay.scaleFactor || 1))
  );
  const targetHeight = Math.max(
    1080,
    Math.round(primaryDisplay.size.height * (primaryDisplay.scaleFactor || 1))
  );

  const sources = await desktopCapturer.getSources({
    types: ['window', 'screen'],
    thumbnailSize: { width: targetWidth, height: targetHeight },
  });

  const searchNeedle = (preferredTitle || 'La-Mulana 2').trim().toLowerCase();

  // 1. Try matching the game window by title (excluding the tracker's own window)
  const gameWindowSource = sources.find((src) => {
    const name = (src.name || '').toLowerCase();
    if (
      name.includes('expedition log') ||
      name.includes('lore tracker') ||
      name.includes('vite')
    ) {
      return false;
    }
    return searchNeedle && name.includes(searchNeedle);
  });

  if (gameWindowSource && !gameWindowSource.thumbnail.isEmpty()) {
    const size = gameWindowSource.thumbnail.getSize();
    if (size.width > 160 && size.height > 120) {
      return {
        dataUrl: gameWindowSource.thumbnail.toDataURL(),
        sourceName: gameWindowSource.name,
        width: size.width,
        height: size.height,
      };
    }
  }

  // 2. Fallback to the primary screen (ideal for borderless / fullscreen game)
  const screenSource =
    sources.find((src) => src.id.startsWith('screen:')) || sources[0];

  if (!screenSource || screenSource.thumbnail.isEmpty()) {
    throw new Error('Could not capture game window or screen.');
  }

  const size = screenSource.thumbnail.getSize();
  return {
    dataUrl: screenSource.thumbnail.toDataURL(),
    sourceName: screenSource.name || 'Primary Screen',
    width: size.width,
    height: size.height,
  };
}

/**
 * Attempts to auto-locate Steam's screenshot folder for La-Mulana 2 (AppID 835430)
 * on Windows, macOS, or Linux.
 */
function findSteamLaMulana2ScreenshotsFolder() {
  const candidates = [
    process.env['PROGRAMFILES(X86)']
      ? path.join(process.env['PROGRAMFILES(X86)'], 'Steam', 'userdata')
      : null,
    process.env.PROGRAMFILES
      ? path.join(process.env.PROGRAMFILES, 'Steam', 'userdata')
      : null,
    'C:\\Program Files (x86)\\Steam\\userdata',
    'D:\\Steam\\userdata',
    'E:\\Steam\\userdata',
    process.env.HOME
      ? path.join(process.env.HOME, '.local', 'share', 'Steam', 'userdata')
      : null,
    process.env.HOME
      ? path.join(
          process.env.HOME,
          'Library',
          'Application Support',
          'Steam',
          'userdata'
        )
      : null,
  ].filter(Boolean);

  for (const userdataDir of candidates) {
    try {
      if (!fs.existsSync(userdataDir)) continue;
      const userDirs = fs.readdirSync(userdataDir, { withFileTypes: true });
      for (const dirent of userDirs) {
        if (!dirent.isDirectory()) continue;
        // La-Mulana 2 Steam App ID is 835430
        const lm2ShotPath = path.join(
          userdataDir,
          dirent.name,
          '760',
          'remote',
          '835430',
          'screenshots'
        );
        if (fs.existsSync(lm2ShotPath)) {
          return lm2ShotPath;
        }
      }
    } catch {
      // Ignore permission errors on non-existent drives
    }
  }
  return null;
}

/**
 * Registers the Room and Tablet global hotkeys with Electron's `globalShortcut`.
 */
function applyGlobalHotkeys(config) {
  globalShortcut.unregisterAll();
  currentHotkeyConfig = {
    ...currentHotkeyConfig,
    ...config,
  };

  if (!currentHotkeyConfig.enabled) {
    return { roomRegistered: false, tabletRegistered: false };
  }

  let roomRegistered = false;
  let tabletRegistered = false;
  let errorMsg;

  const triggerAndSend = async (kind) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    try {
      const captured = await capturePreferredGameSource(
        currentHotkeyConfig.preferredWindowTitle
      );
      mainWindow.webContents.send('seamless:captured-frame', {
        kind,
        dataUrl: captured.dataUrl,
        sourceName: captured.sourceName,
        width: captured.width,
        height: captured.height,
        timestamp: Date.now(),
        origin: 'hotkey',
      });
    } catch (err) {
      // Ignore capture errors if screen is locked
    }
  };

  try {
    if (currentHotkeyConfig.roomHotkey) {
      roomRegistered = globalShortcut.register(
        currentHotkeyConfig.roomHotkey,
        () => triggerAndSend('room')
      );
    }
  } catch (err) {
    errorMsg = err.message;
  }

  try {
    if (
      currentHotkeyConfig.tabletHotkey &&
      currentHotkeyConfig.tabletHotkey !== currentHotkeyConfig.roomHotkey
    ) {
      tabletRegistered = globalShortcut.register(
        currentHotkeyConfig.tabletHotkey,
        () => triggerAndSend('tablet')
      );
    }
  } catch (err) {
    errorMsg = err.message;
  }

  return { roomRegistered, tabletRegistered, error: errorMsg };
}

/**
 * Starts or stops watching a native screenshot directory for newly created images.
 */
function configureNativeFolderWatcher(options = {}) {
  if (activeFolderWatcher) {
    try {
      activeFolderWatcher.close();
    } catch {}
    activeFolderWatcher = null;
    activeWatchedPath = null;
  }

  if (!options.enabled) {
    return { watching: false };
  }

  const targetFolder =
    (options.customPath && fs.existsSync(options.customPath)
      ? options.customPath
      : null) || findSteamLaMulana2ScreenshotsFolder();

  if (!targetFolder || !fs.existsSync(targetFolder)) {
    return {
      watching: false,
      error:
        'Could not auto-detect Steam AppID 835430 screenshots folder. Click "Browse..." to select your screenshot folder.',
    };
  }

  const processedFiles = new Set();
  try {
    for (const f of fs.readdirSync(targetFolder)) {
      processedFiles.add(f);
    }
  } catch {}

  try {
    activeFolderWatcher = fs.watch(targetFolder, (eventType, filename) => {
      if (!filename || processedFiles.has(filename)) return;
      if (!/\.(png|jpe?g|webp)$/i.test(filename)) return;
      if (filename.toLowerCase().includes('thumb')) return;

      const fullPath = path.join(targetFolder, filename);

      // Wait 350ms so Steam finishes flushing the PNG/JPG file to disk
      setTimeout(() => {
        try {
          if (!fs.existsSync(fullPath)) return;
          const stat = fs.statSync(fullPath);
          if (stat.size < 4096) return;
          processedFiles.add(filename);

          const buf = fs.readFileSync(fullPath);
          const ext = path.extname(filename).toLowerCase();
          const mime =
            ext === '.png'
              ? 'image/png'
              : ext === '.webp'
              ? 'image/webp'
              : 'image/jpeg';
          const dataUrl = `data:${mime};base64,${buf.toString('base64')}`;

          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('seamless:captured-frame', {
              kind: 'auto',
              dataUrl,
              sourceName: filename,
              width: 0,
              height: 0,
              timestamp: Date.now(),
              origin: 'steam_folder',
            });
          }
        } catch {}
      }, 350);
    });

    activeWatchedPath = targetFolder;
    return { watching: true, folderPath: activeWatchedPath };
  } catch (err) {
    return { watching: false, error: err.message };
  }
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#020617',
    title: 'La-Mulana 2 Expedition Log',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
  ipcMain.handle('seamless:update-hotkeys', (_event, config) =>
    applyGlobalHotkeys(config)
  );

  ipcMain.handle('seamless:capture-now', (_event, preferredWindowTitle) =>
    capturePreferredGameSource(preferredWindowTitle)
  );

  ipcMain.handle('seamless:watch-steam-folder', (_event, options) =>
    configureNativeFolderWatcher(options)
  );

  ipcMain.handle('seamless:pick-folder', async () => {
    const res = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: 'Select Screenshot Folder to Watch (e.g. Steam Screenshots)',
    });
    if (res.canceled || !res.filePaths?.length) return null;
    return res.filePaths[0];
  });

  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (activeFolderWatcher) {
    try {
      activeFolderWatcher.close();
    } catch {}
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
