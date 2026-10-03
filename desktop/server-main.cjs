// Oxys Servidor — servidor dedicado da loja (recurso contratado).
// Fica ligado no computador da loja (abre com o computador e continua na bandeja ao fechar a janela),
// guarda o banco da loja (hub/dedicated.cjs), atende a equipe pela rede da loja e pela internet (túnel seguro)
// e imprime as vias nas impressoras deste computador.

const { app, BrowserWindow, ipcMain, shell, Menu, Tray, nativeImage, safeStorage, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { DedicatedServer, PORT } = require('./hub/dedicated.cjs');

const LOCAL = `http://localhost:${PORT}`;
// endereço e chave pública da nuvem principal (gerados no build: server-env.json)
const ENV = (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'server-env.json'), 'utf8')); } catch { return {}; } })();
const uiDir = () => [path.join(__dirname, 'offline-ui'), path.join(__dirname, '..', 'dist')].find(d => fs.existsSync(path.join(d, 'index.html'))) || null;
// cloudflared vem junto do instalador (extraResources); em desenvolvimento, desktop/bin
const binDir = () => [path.join(process.resourcesPath || '', 'bin'), path.join(__dirname, 'bin')].find(d => fs.existsSync(d)) || null;

// pasta de dados própria (nunca a do app Oxys Restaurante instalado no mesmo computador)
app.setName('Oxys Servidor');
app.setPath('userData', process.env.OXYS_SERVER_DATA || path.join(app.getPath('appData'), 'Oxys Servidor'));

let panel = null;
let systemWin = null;
let printerWin = null;
let tray = null;
let server = null;
let quitting = false;

if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => showPanel());

function showPanel() {
  if (panel) { if (panel.isMinimized()) panel.restore(); panel.show(); panel.focus(); return; }
  panel = new BrowserWindow({
    width: 1040, height: 760, minWidth: 820, minHeight: 600, title: 'Oxys Servidor', backgroundColor: '#0b1120',
    icon: path.join(__dirname, 'build', 'icon.png'), autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'server-preload.cjs'), contextIsolation: true, sandbox: true },
  });
  panel.loadFile(path.join(__dirname, 'servidor.html'));
  // fechar a janela não desliga o servidor: ele continua na bandeja
  panel.on('close', (e) => { if (!quitting) { e.preventDefault(); panel.hide(); } });
  panel.on('closed', () => { panel = null; });
}

/** O sistema da loja, aberto a partir do próprio servidor (com impressão direta). */
function openSystem() {
  if (systemWin) { systemWin.show(); systemWin.focus(); return; }
  systemWin = new BrowserWindow({
    width: 1366, height: 820, minWidth: 1024, minHeight: 640, title: 'Oxys Restaurante', backgroundColor: '#0f172a',
    icon: path.join(__dirname, 'build', 'icon.png'), autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true },
  });
  systemWin.maximize();
  systemWin.loadURL(`${LOCAL}/`);
  systemWin.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  systemWin.on('closed', () => { systemWin = null; });
}

/** Janela escondida que imprime as vias da loja nas impressoras deste computador. */
function startPrinter() {
  if (printerWin || !server?.mirror.ready) return;
  printerWin = new BrowserWindow({ show: false, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true } });
  const load = () => printerWin?.loadURL(`${LOCAL}/offline.html#/impressora`).catch(() => {});
  load();
  printerWin.webContents.on('did-fail-load', () => setTimeout(load, 5000));
  printerWin.on('closed', () => { printerWin = null; });
}

function setupTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'build', 'icon.png')).resize({ width: 18, height: 18 });
  tray = new Tray(icon);
  tray.setToolTip('Oxys Servidor');
  const menu = () => Menu.buildFromTemplate([
    { label: 'Painel do servidor', click: showPanel },
    { label: 'Abrir o sistema', click: openSystem },
    { type: 'separator' },
    { label: 'Desligar o servidor', click: async () => {
      const r = await dialog.showMessageBox({ type: 'warning', buttons: ['Cancelar', 'Desligar'], defaultId: 0, cancelId: 0,
        message: 'Desligar o servidor da loja?', detail: 'A equipe para de conseguir usar o sistema até o servidor ser aberto de novo.' });
      if (r.response === 1) { quitting = true; app.quit(); }
    } },
  ]);
  tray.setContextMenu(menu());
  tray.on('click', showPanel);
}

// ---------- painel → servidor ----------
const fromPanel = (e) => e.senderFrame?.url?.startsWith('file://');
const handle = (name, fn) => ipcMain.handle(name, async (e, arg) => {
  if (!fromPanel(e)) throw new Error('Não permitido');
  return fn(arg);
});

function setupIpc() {
  handle('server:status', () => ({ ...server.status(), autoStart: app.getLoginItemSettings().openAtLogin, devices: server.config.devices || {} }));
  handle('server:activate', async (code) => { const s = await server.activate(String(code || '')); startPrinter(); return s; });
  handle('server:tunnel', (cfg) => server.setTunnel(cfg || {}));
  handle('server:own-supabase', (cfg) => server.setOwnSupabase(cfg || {}));
  handle('server:backup', () => server.backupNow());
  handle('server:open-backups', () => { fs.mkdirSync(server.backupDir(), { recursive: true }); return shell.openPath(server.backupDir()); });
  handle('server:open-system', () => openSystem());
  handle('server:open-url', (url) => { if (/^https?:\/\//.test(url)) shell.openExternal(url); });
  handle('server:auto-start', (on) => { app.setLoginItemSettings({ openAtLogin: !!on, openAsHidden: true }); return !!on; });
  handle('server:printers', async () => ({
    system: panel ? await panel.webContents.getPrintersAsync() : [],
    registered: server.mirror.rows('printers').map(p => ({ id: p.id, name: p.name, purposes: p.purposes, enabled: p.enabled })),
  }));
  handle('server:devices', (devices) => { server.config.devices = devices && typeof devices === 'object' ? devices : {}; server.saveConfig(); return true; });

  // ---------- mesma ponte do app de computador (preload.cjs), para o sistema aberto a partir do servidor ----------
  const fromSystem = (e) => { const u = e.senderFrame?.url || ''; if (!u.startsWith(LOCAL)) throw new Error('Não permitido'); };
  ipcMain.handle('print:html', async (e, html, options = {}) => {
    fromSystem(e);
    if (typeof html !== 'string' || html.length > 2_000_000) throw new Error('Cupom inválido');
    const w = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } });
    try {
      await w.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
      await new Promise((resolve, reject) => w.webContents.print(
        { silent: true, printBackground: true, deviceName: options.deviceName || undefined, margins: { marginType: 'none' } },
        (ok, err) => (ok ? resolve() : reject(new Error(err || 'Falha ao imprimir')))));
    } finally { w.destroy(); }
  });
  ipcMain.handle('printers:list', async (e) => { fromSystem(e); return e.sender.getPrintersAsync(); });
  ipcMain.handle('app:info', () => ({ version: app.getVersion(), platform: process.platform, autoStart: app.getLoginItemSettings().openAtLogin, server: true }));
  ipcMain.handle('app:set-autostart', (_e, on) => { app.setLoginItemSettings({ openAtLogin: !!on, openAsHidden: true }); return !!on; });
  ipcMain.handle('app:retry', (e) => { fromSystem(e); e.sender.reload(); });
  // o servidor já é o banco da loja: não existe "central offline" aqui
  ipcMain.handle('hub:status', () => ({ enabled: false }));
  // impressora de cada setor escolhida na Estação de impressão → impressão das vias pelo servidor
  ipcMain.handle('hub:set-devices', (e, devices) => {
    fromSystem(e);
    server.config.devices = devices && typeof devices === 'object' ? devices : {};
    server.saveConfig();
    return true;
  });
}

// ---------- atualização automática (canal próprio do servidor) ----------
function setupUpdates() {
  if (!app.isPackaged) return;
  try {
    const { autoUpdater } = require('electron-updater');
    autoUpdater.channel = 'servidor';
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.checkForUpdates().catch(() => {});
    setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 6 * 3600e3).unref();
  } catch { /* sem atualizador */ }
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  const secure = safeStorage.isEncryptionAvailable()
    ? { encrypt: (t) => safeStorage.encryptString(t), decrypt: (b) => safeStorage.decryptString(b) }
    : null;
  server = new DedicatedServer({
    dataDir: app.getPath('userData'), uiDir: uiDir(), version: app.getVersion(), secure,
    cloudUrl: process.env.OXYS_CLOUD_URL || ENV.cloudUrl, apikey: process.env.OXYS_CLOUD_KEY || ENV.apikey, binDir: binDir(),
  });
  server.start();
  // primeira vez: abre com o computador
  if (!fs.existsSync(path.join(app.getPath('userData'), '.autostart-set'))) {
    app.setLoginItemSettings({ openAtLogin: true, openAsHidden: true });
    fs.writeFileSync(path.join(app.getPath('userData'), '.autostart-set'), '1');
  }
  setupIpc();
  setupTray();
  startPrinter();
  setInterval(startPrinter, 10_000).unref();
  const hidden = process.argv.includes('--hidden') || app.getLoginItemSettings().wasOpenedAsHidden;
  if (!hidden || !server.activated) showPanel();
  setupUpdates();
});

app.on('before-quit', () => { quitting = true; server?.stop(); });
app.on('window-all-closed', (e) => { if (!quitting) e.preventDefault?.(); }); // continua na bandeja
