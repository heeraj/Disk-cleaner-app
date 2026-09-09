/**
 * Electron main process.
 * Loads the API in-process (no child spawn) for reliable Windows packaging.
 */
const { app, BrowserWindow, shell, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');

// Ignore ambient PORT. Only DISK_CLEANER_PORT overrides.
const API_PORT = Number(process.env.DISK_CLEANER_PORT) || 8787;
const isDev = process.env.ELECTRON_DEV === '1';

let mainWindow = null;
let serverProc = null;
let startedServer = false;

function getRoots() {
  if (!app.isPackaged) {
    const root = path.resolve(__dirname, '..');
    return {
      root,
      bundle: path.join(root, 'server', 'bundle.cjs'),
      clientDist: path.join(root, 'client', 'dist'),
      dataDir: path.join(root, 'data'),
    };
  }
  const candidates = [
    path.join(process.resourcesPath, 'app'),
    path.join(process.resourcesPath, 'app.asar.unpacked'),
  ];
  for (const root of candidates) {
    const bundle = path.join(root, 'server', 'bundle.cjs');
    if (fs.existsSync(bundle)) {
      return {
        root,
        bundle,
        clientDist: path.join(root, 'client', 'dist'),
        dataDir: path.join(app.getPath('userData'), 'data'),
      };
    }
  }
  const root = path.join(process.resourcesPath, 'app');
  return {
    root,
    bundle: path.join(root, 'server', 'bundle.cjs'),
    clientDist: path.join(root, 'client', 'dist'),
    dataDir: path.join(app.getPath('userData'), 'data'),
  };
}

function checkHealth(port) {
  return new Promise((resolve) => {
    const req = http.get(
      { host: '127.0.0.1', port, path: '/api/health', timeout: 800 },
      (res) => {
        res.resume();
        resolve(Boolean(res.statusCode && res.statusCode < 500));
      }
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

function waitForServer(port, timeoutMs = 20000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = async () => {
      if (await checkHealth(port)) {
        resolve();
        return;
      }
      if (Date.now() - start > timeoutMs) {
        reject(new Error(`API did not become ready on port ${port}`));
        return;
      }
      setTimeout(tryOnce, 200);
    };
    void tryOnce();
  });
}

async function startServer() {
  if (await checkHealth(API_PORT)) {
    console.log(`[electron] Reusing existing API on :${API_PORT}`);
    return;
  }

  const roots = getRoots();
  process.env.PORT = String(API_PORT);
  process.env.NODE_ENV = isDev ? 'development' : 'production';
  process.env.CLIENT_DIST = roots.clientDist;
  process.env.DATA_DIR = roots.dataDir;

  if (isDev) {
    serverProc = spawn(
      process.platform === 'win32' ? 'npx.cmd' : 'npx',
      ['tsx', 'server/index.ts'],
      {
        cwd: roots.root,
        env: process.env,
        stdio: 'pipe',
        shell: process.platform === 'win32',
      }
    );
    startedServer = true;
    serverProc.stdout?.on('data', (c) => console.log('[api]', String(c)));
    serverProc.stderr?.on('data', (c) => console.error('[api]', String(c)));
    return;
  }

  if (!fs.existsSync(roots.bundle)) {
    throw new Error(
      `API bundle missing:\n${roots.bundle}\n\nRebuild with npm run build`
    );
  }

  // In-process: no spawn, no PATH, no spaces-in-exe issues.
  require(roots.bundle);
}

function stopServer() {
  if (!startedServer || !serverProc) return;
  try {
    if (process.platform === 'win32' && serverProc.pid) {
      spawn('taskkill', ['/pid', String(serverProc.pid), '/f', '/t']);
    } else {
      serverProc.kill?.('SIGTERM');
    }
  } catch {
    /* ignore */
  }
  serverProc = null;
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 960,
    height: 780,
    minWidth: 640,
    minHeight: 520,
    show: false,
    title: 'Disk Cleaner',
    backgroundColor: '#f6f5f2',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  await waitForServer(API_PORT);

  if (isDev) {
    const viteUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
    try {
      await mainWindow.loadURL(viteUrl);
    } catch (err) {
      console.warn('[electron] Vite not reachable, falling back to API', err);
      await mainWindow.loadURL(`http://127.0.0.1:${API_PORT}`);
    }
  } else {
    await mainWindow.loadURL(`http://127.0.0.1:${API_PORT}`);
  }
}

app.whenReady().then(async () => {
  try {
    await startServer();
    await createWindow();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[electron] Failed to start', err);
    dialog.showErrorBox('Disk Cleaner failed to start', message);
    app.quit();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});

app.on('window-all-closed', () => {
  stopServer();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  stopServer();
});
