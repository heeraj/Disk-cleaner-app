const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('diskCleanerDesktop', {
  isElectron: true,
  platform: process.platform,
});
