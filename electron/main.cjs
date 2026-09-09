/**
 * Electron main process.
 * Spawns the Express API if needed, then loads the UI from the API (or Vite in dev).
 */
const { app, BrowserWindow, shell, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');

const API_PORT = Number(process.env.PORT) || 8787;
const isDev = process.env.ELECTRON_DEV === '1';

let mainWindow = null;
let serverProc = null;
let startedServer = false;

function getRoots() {
  if (!app.isPackaged) {
    const root = path.resolve(__dirname, '..');
    return {
      root,
      serverEntry: path.join(root, 'server', 'dist', 'index.js'),
      clientDist: path.join(root, 'client', 'dist'),
      dataDir: path.join(root, 'data'),
    };
  }
  // Packaged builds use a real resources/app folder (asar disabled) so the API can spawn reliably.
  // Keep the asar-unpacked fallback for compatibility with earlier builds.
  const unpacked = path.join(process.resourcesPath, 'app.asar.unpacked');
  const unpackedEntry = path.join(unpacked, 'server', 'dist', 'index.js');
  const root = fs.existsSync(unpackedEntry)
    ? unpacked
    : path.join(process.resourcesPath, 'app');
  return {
    root,
    serverEntry: path.join(root, 'server', 'dist', 'index.js'),
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

function waitForServer(port, timeoutMs = 45000) {
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
      setTimeout(tryOnce, 300);
    };
    void tryOnce();
  });
}

async function startServer() {
  if (await checkHealth(API_PORT)) {
    console.log(`[electron] Reusing existing API on :${API_PORT}`);
    return;
  }

  const { root, serverEntry, clientDist, dataDir } = getRoots();
  const env = {
    ...process.env,
    PORT: String(API_PORT),
    NODE_ENV: isDev ? 'development' : 'production',
    CLIENT_DIST: clientDist,
    DATA_DIR: dataDir,
  };

  if (isDev) {
    serverProc = spawn(
      process.platform === 'win32' ? 'npx.cmd' : 'npx',
      ['tsx', 'server/index.ts'],
      { cwd: root, env, stdio: 'pipe', shell: process.platform === 'win32' }
    );
  } else {
    if (!fs.existsSync(serverEntry)) {
      throw new Error(`Server entry missing:\n${serverEntry}`);
    }
    // Prefer a real filesystem path (unpacked), not app.asar/...
    serverProc = spawn(process.execPath, [serverEntry], {
      cwd: root,
      env: { ...env, ELECTRON_RUN_AS_NODE: '1' },
      stdio: 'pipe',
    });
  }

  startedServer = true;
  let errBuf = '';
  if (serverProc.stderr) {
    serverProc.stderr.on('data', (chunk) => {
      const text = String(chunk);
      errBuf += text;
      console.error('[api]', text);
    });
  }
  if (serverProc.stdout) {
    serverProc.stdout.on('data', (chunk) => console.log('[api]', String(chunk)));
  }
  serverProc.on('exit', (code, signal) => {
    console.log(`[electron] API process exited code=${code} signal=${signal}`);
    if (errBuf) console.error('[electron] API stderr:', errBuf.slice(-2000));
  });
}

function stopServer() {
  if (!startedServer || !serverProc || serverProc.killed) return;
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(serverProc.pid), '/f', '/t']);
    } else {
      serverProc.kill('SIGTERM');
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
      console.warn('[electron] Vite not reachable, falling back to API static', err);
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
    dialog.showErrorBox(
      'Disk Cleaner failed to start',
      `${message}\n\nIf this keeps happening, run the web version with npm run dev, or reinstall from the latest release.`
    );
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
