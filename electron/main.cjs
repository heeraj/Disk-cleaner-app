/**
 * Electron main process.
 * Spawns the Express API if needed, then loads the Vite UI (dev) or built client via the API (prod).
 */
const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');

const API_PORT = Number(process.env.PORT) || 8787;
const isDev = process.env.ELECTRON_DEV === '1';
const ROOT = path.resolve(__dirname, '..');

let mainWindow = null;
let serverProc = null;
let startedServer = false;

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

  const env = {
    ...process.env,
    PORT: String(API_PORT),
    NODE_ENV: isDev ? 'development' : 'production',
  };

  if (isDev) {
    serverProc = spawn(
      process.platform === 'win32' ? 'npx.cmd' : 'npx',
      ['tsx', 'server/index.ts'],
      { cwd: ROOT, env, stdio: 'inherit', shell: process.platform === 'win32' }
    );
  } else {
    const compiled = path.join(ROOT, 'server', 'dist', 'index.js');
    if (fs.existsSync(compiled)) {
      serverProc = spawn(process.execPath, [compiled], {
        cwd: ROOT,
        env: { ...env, ELECTRON_RUN_AS_NODE: '1' },
        stdio: 'inherit',
      });
    } else {
      serverProc = spawn(
        process.platform === 'win32' ? 'npx.cmd' : 'npx',
        ['tsx', 'server/index.ts'],
        { cwd: ROOT, env, stdio: 'inherit', shell: process.platform === 'win32' }
      );
    }
  }

  startedServer = true;
  serverProc.on('exit', (code, signal) => {
    console.log(`[electron] API process exited code=${code} signal=${signal}`);
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
    console.error('[electron] Failed to start', err);
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
