// Ponte entre o sistema (site) e os recursos do computador. Só expõe chamadas específicas.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('oxysDesktop', {
  info: () => ipcRenderer.invoke('app:info'),
  setAutoStart: (enabled) => ipcRenderer.invoke('app:set-autostart', !!enabled),
  retry: () => ipcRenderer.invoke('app:retry'),
  listPrinters: () => ipcRenderer.invoke('printers:list'),
  printHtml: (html, options) => ipcRenderer.invoke('print:html', String(html), { deviceName: options?.deviceName ?? '' }),
  // central do modo offline
  hubStatus: () => ipcRenderer.invoke('hub:status'),
  hubActivate: (p) => ipcRenderer.invoke('hub:activate', {
    key: String(p?.key ?? ''), restaurantId: String(p?.restaurantId ?? ''), functionsUrl: String(p?.functionsUrl ?? ''),
    apikey: String(p?.apikey ?? ''), pin: String(p?.pin ?? ''),
  }),
  hubDeactivate: () => ipcRenderer.invoke('hub:deactivate'),
  hubSetDevices: (devices) => ipcRenderer.invoke('hub:set-devices', JSON.parse(JSON.stringify(devices ?? {}))),
  hubSync: () => ipcRenderer.invoke('hub:sync'),
});
