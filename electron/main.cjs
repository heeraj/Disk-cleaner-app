/**
 * Electron main process.
 * Starts the Express API via utilityProcess (or Node fallback), then loads the UI.
 */
const { app, BrowserWindow, shell, dialog, utilityProcess } = require('electron');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const http = require('http');
const fs = require('fs');

// Ignore ambient PORT (shells/CI often set it). Only DISK_CLEANER_PORT overrides.
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
      serverEntry: path.join(root, 'server', 'dist', 'index.js'),
      clientDist: path.join(root, 'client', 'dist'),
      dataDir: path.join(root, 'data'),
    };
  }
  const candidates = [
    path.join(process.resourcesPath, 'app'),
    path.join(process.resourcesPath, 'app.asar.unpacked'),
  ];
  for (const root of candidates) {
    const serverEntry = path.join(root, 'server', 'dist', 'index.js');
    if (fs.existsSync(serverEntry)) {
      return {
        root,
        serverEntry,
        clientDist: path.join(root, 'client', 'dist'),
        dataDir: path.join(app.getPath('userData'), 'data'),
      };
    }
  }
  const root = path.join(process.resourcesPath, 'app');
  return {
    root,
    serverEntry: path.join(root, 'server', 'dist', 'index.js'),
    clientDist: path.join(root, 'client', 'dist'),
    dataDir: path.join(app.getPath('userData'), 'data'),
  };
}

function findNodeBinary() {
  try {
    if (process.platform === 'win32') {
      const out = execFileSync('where.exe', ['node'], { encoding: 'utf8' });
      const first = out.split(/\r?\n/).map((s) => s.trim()).find(Boolean);
      if (first && fs.existsSync(first)) return first;
    } else {
      const out = execFileSync('which', ['node'], { encoding: 'utf8' }).trim();
      if (out && fs.existsSync(out)) return out;
    }
  } catch {
    /* ignore */
  }
  return null;
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

function waitForServer(port, timeoutMs = 30000) {
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
      setTimeout(tryOnce, 250);
    };
    void tryOnce();
  });
}

function attachProcLogs(proc, label) {
  if (proc.stdout) proc.stdout.on('data', (c) => console.log(`[${label}]`, String(c)));
  if (proc.stderr) proc.stderr.on('data', (c) => console.error(`[${label}]`, String(c)));
  proc.on?.('exit', (code, signal) => {
    console.log(`[electron] ${label} exited code=${code} signal=${signal}`);
  });
}

async function startServer() {
  if (await checkHealth(API_PORT)) {
    console.log(`[electron] Reusing existing API on :${API_PORT}`);
    return;
  }

  const roots = getRoots();
  const env = {
    ...process.env,
    PORT: String(API_PORT),
    NODE_ENV: isDev ? 'development' : 'production',
    CLIENT_DIST: roots.clientDist,
    DATA_DIR: roots.dataDir,
  };
  // Avoid confusing a second Electron instance.
  delete env.ELECTRON_RUN_AS_NODE;

  if (isDev) {
    serverProc = spawn(
      process.platform === 'win32' ? 'npx.cmd' : 'npx',
      ['tsx', 'server/index.ts'],
      { cwd: roots.root, env, stdio: 'pipe', shell: process.platform === 'win32' }
    );
    startedServer = true;
    attachProcLogs(serverProc, 'api');
    return;
  }

  if (!fs.existsSync(roots.serverEntry)) {
    throw new Error(`Server entry missing:\n${roots.serverEntry}`);
  }

  // 1) Prefer system Node (reliable for ESM + express).
  const nodeBin = findNodeBinary();
  if (nodeBin) {
    console.log('[electron] Starting API with Node:', nodeBin);
    serverProc = spawn(nodeBin, [roots.serverEntry], {
      cwd: roots.root,
      env,
      stdio: 'pipe',
      windowsHide: true,
    });
    startedServer = true;
    attachProcLogs(serverProc, 'api-node');
    return;
  }

  // 2) Electron utilityProcess (Node-like worker, no second BrowserWindow).
  if (typeof utilityProcess?.fork === 'function') {
    console.log('[electron] Starting API with utilityProcess.fork');
    serverProc = utilityProcess.fork(roots.serverEntry, [], {
      cwd: roots.root,
      env,
      stdio: 'pipe',
      serviceName: 'disk-cleaner-api',
    });
    startedServer = true;
    attachProcLogs(serverProc, 'api-utility');
    return;
  }

  throw new Error(
    'Could not start the API: Node.js was not found on PATH, and utilityProcess is unavailable. Install Node.js LTS, or run `npm run dev` instead.'
  );
}

function stopServer() {
  if (!startedServer || !serverProc) return;
  try {
    if (typeof serverProc.kill === 'function') {
      serverProc.kill();
    } else if (serverProc.pid) {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', String(serverProc.pid), '/f', '/t']);
      }
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
      `${message}\n\nTip: install Node.js LTS from https://nodejs.org then retry, or run the web app with npm run dev.`
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
