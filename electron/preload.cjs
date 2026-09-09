const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('diskCleaner', {
  isElectron: true,
  platform: process.platform,
  pickDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
  openPath: (target) => ipcRenderer.invoke('shell:openPath', target),
  showItemInFolder: (target) => ipcRenderer.invoke('shell:showItemInFolder', target),
  emptyRecycleBin: () => ipcRenderer.invoke('recycle:empty'),
});
