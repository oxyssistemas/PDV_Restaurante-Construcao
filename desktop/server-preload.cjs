// Ponte do painel do Oxys Servidor com o processo principal. Só expõe chamadas específicas.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('oxysServer', {
  status: () => ipcRenderer.invoke('server:status'),
  activate: (code) => ipcRenderer.invoke('server:activate', String(code ?? '')),
  setTunnel: (cfg) => ipcRenderer.invoke('server:tunnel', {
    mode: String(cfg?.mode ?? 'quick'), token: cfg?.token ? String(cfg.token) : undefined, publicUrl: cfg?.publicUrl ? String(cfg.publicUrl) : undefined,
  }),
  setOwnSupabase: (cfg) => ipcRenderer.invoke('server:own-supabase', { url: String(cfg?.url ?? ''), key: cfg?.key ? String(cfg.key) : undefined }),
  backup: () => ipcRenderer.invoke('server:backup'),
  openBackups: () => ipcRenderer.invoke('server:open-backups'),
  openSystem: () => ipcRenderer.invoke('server:open-system'),
  openUrl: (url) => ipcRenderer.invoke('server:open-url', String(url ?? '')),
  setAutoStart: (on) => ipcRenderer.invoke('server:auto-start', !!on),
  printers: () => ipcRenderer.invoke('server:printers'),
  setDevices: (devices) => ipcRenderer.invoke('server:devices', JSON.parse(JSON.stringify(devices ?? {}))),
});
