// Ponte entre o sistema (site) e os recursos do computador. Só expõe chamadas específicas.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('oxysDesktop', {
  info: () => ipcRenderer.invoke('app:info'),
  setAutoStart: (enabled) => ipcRenderer.invoke('app:set-autostart', !!enabled),
  retry: () => ipcRenderer.invoke('app:retry'),
  listPrinters: () => ipcRenderer.invoke('printers:list'),
  printHtml: (html, options) => ipcRenderer.invoke('print:html', String(html), { deviceName: options?.deviceName ?? '' }),
});
