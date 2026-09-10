const { contextBridge, ipcRenderer } = require('electron');

const platform = process.platform;

contextBridge.exposeInMainWorld('diskCleaner', {
  isElectron: true,
  platform,
  /** Frameless window with custom in-app chrome. */
  frameless: true,
  pickDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
  openPath: (target) => ipcRenderer.invoke('shell:openPath', target),
  showItemInFolder: (target) => ipcRenderer.invoke('shell:showItemInFolder', target),
  emptyRecycleBin: () => ipcRenderer.invoke('recycle:empty'),
  windowControls: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximizeToggle: () => ipcRenderer.invoke('window:maximizeToggle'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
    onMaximizedChange: (cb) => {
      const handler = (_event, payload) => {
        try {
          cb(Boolean(payload && payload.maximized));
        } catch {
          /* ignore */
        }
      };
      ipcRenderer.on('window:maximized', handler);
      return () => ipcRenderer.removeListener('window:maximized', handler);
    },
  },
});
