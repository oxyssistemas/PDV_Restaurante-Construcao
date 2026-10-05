// Oxys Restaurante — app para Windows, Mac e Linux.
// Abre o sistema online (sempre atualizado) e acrescenta o que o navegador não faz:
// impressão direta nas térmicas sem janela, abrir com o computador, atualização automática
// e a central do modo offline (hub/), que mantém a loja funcionando na rede local sem internet.

const { app, BrowserWindow, ipcMain, shell, Menu, dialog, safeStorage, net } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { Hub, PORT: HUB_PORT } = require('./hub/index.cjs');

const APP_URL = process.env.OXYS_URL || 'https://www.oxysrestaurante.app';
const APP_ORIGIN = new URL(APP_URL).origin;
// Logins de terceiros que acontecem dentro da janela (conexão de redes sociais no marketing).
const AUTH_HOSTS = ['facebook.com', 'www.facebook.com', 'm.facebook.com', 'www.tiktok.com', 'accounts.google.com', 'supabase.co'];

let win = null;
let hub = null;
let printerWin = null;
const HUB_ORIGIN = `http://localhost:${HUB_PORT}`;

// Telas offline empacotadas no app (copiadas do build do site); em desenvolvimento usa ../dist.
const offlineUiDir = () => [path.join(__dirname, 'offline-ui'), path.join(__dirname, '..', 'dist')]
  .find(d => fs.existsSync(path.join(d, 'offline.html'))) || null;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });
}

// ---------- servidor dedicado da loja ----------
// O sistema avisa o endereço do servidor da loja (internet e rede local); o app guarda em disco para
// abrir direto pela rede da loja quando o computador ligar já sem internet.
const serverFile = () => path.join(app.getPath('userData'), 'oxys-servidor-da-loja.json');
let storeServer = null; // { publicUrl, lanUrls: [], savedAt }
function loadStoreServer() {
  try { storeServer = JSON.parse(fs.readFileSync(serverFile(), 'utf8')); } catch { storeServer = null; }
}
const originOf = (u) => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.origin : null; } catch { return null; } };
const serverOrigins = () => storeServer ? [storeServer.publicUrl, ...(storeServer.lanUrls || [])].map(originOf).filter(Boolean) : [];
const isServerUrl = (url) => { const o = originOf(url); return !!o && serverOrigins().includes(o); };

/** Primeiro endereço da rede da loja que responde (o servidor está ligado). */
async function reachableLan() {
  for (const lan of storeServer?.lanUrls || []) {
    try {
      const r = await net.fetch(`${originOf(lan)}/api/hello`, { signal: AbortSignal.timeout(2500) });
      if (r.ok) return originOf(lan);
    } catch { /* próximo */ }
  }
  return null;
}

const isAppUrl = (url) => {
  try { return new URL(url).origin === APP_ORIGIN || isServerUrl(url); } catch { return false; }
};
const isAuthUrl = (url) => {
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === 'https:' && AUTH_HOSTS.some(h => hostname === h || hostname.endsWith(`.${h}`));
  } catch { return false; }
};

function createWindow() {
  win = new BrowserWindow({
    width: 1366,
    height: 820,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    title: 'Oxys Restaurante',
    backgroundColor: '#0f172a',
    icon: path.join(__dirname, 'build', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      spellcheck: false,
    },
  });

  win.once('ready-to-show', () => { win.maximize(); win.show(); });
  win.loadURL(APP_URL);

  // Sem internet: tela própria com "tentar de novo".
  win.webContents.on('did-fail-load', async (_e, code, _desc, url, isMainFrame) => {
    if (!isMainFrame || code === -3 || !isAppUrl(url)) return;
    // Loja com servidor dedicado: sem internet, abre a mesma tela pelo servidor na rede da loja.
    const lan = await reachableLan();
    if (lan && !url.startsWith(lan)) {
      try { const u = new URL(url); return win.loadURL(`${lan}${u.pathname}${u.search}`); } catch { return win.loadURL(lan); }
    }
    // Sem internet: com a central ativa, abre o modo offline; senão a tela de "sem conexão".
    if (hub?.enabled) win.loadURL(centralUrl(url));
    else win.loadFile(path.join(__dirname, 'offline.html'));
  });

  // Fica no sistema e nos logins de terceiros; o resto abre no navegador do computador.
  win.webContents.on('will-navigate', (e, url) => {
    if (isAppUrl(url) || isAuthUrl(url) || url.startsWith('file://') || url.startsWith(HUB_ORIGIN)) return;
    e.preventDefault();
    shell.openExternal(url);
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  win.on('closed', () => { win = null; });
}

function buildMenu() {
  if (process.platform !== 'darwin') { Menu.setApplicationMenu(null); return; }
  // No Mac o menu é necessário para copiar/colar e fechar com Cmd+Q.
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { role: 'appMenu' },
    { role: 'editMenu' },
    { label: 'Exibir', submenu: [{ role: 'reload', label: 'Recarregar' }, { role: 'togglefullscreen', label: 'Tela cheia' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }] },
    { role: 'windowMenu' },
  ]));
}

// ---------- recursos nativos (só para o sistema Oxys, nunca para páginas de terceiros) ----------
function fromApp(event) {
  const url = event.senderFrame?.url ?? '';
  if (!isAppUrl(url) && !url.startsWith('file://') && !url.startsWith(`${HUB_ORIGIN}/`)) throw new Error('Origem não autorizada');
}

ipcMain.handle('app:info', (e) => {
  fromApp(e);
  return { version: app.getVersion(), platform: process.platform, autoStart: app.getLoginItemSettings().openAtLogin };
});

ipcMain.handle('app:set-autostart', (e, enabled) => {
  fromApp(e);
  app.setLoginItemSettings({ openAtLogin: !!enabled });
  return app.getLoginItemSettings().openAtLogin;
});

ipcMain.handle('app:retry', async (e) => {
  fromApp(e);
  const lan = await reachableLan();
  win?.loadURL(lan || APP_URL);
});

ipcMain.handle('server:remember', (e, info) => {
  fromApp(e);
  const lanUrls = (Array.isArray(info?.lanUrls) ? info.lanUrls : []).map(originOf).filter(Boolean).slice(0, 8);
  const publicUrl = originOf(info?.publicUrl);
  if (!lanUrls.length && !publicUrl) {
    storeServer = null;
    try { fs.rmSync(serverFile(), { force: true }); } catch { /* nada salvo */ }
    return false;
  }
  storeServer = { publicUrl, lanUrls, savedAt: new Date().toISOString() };
  fs.writeFileSync(serverFile(), JSON.stringify(storeServer, null, 2));
  return true;
});

ipcMain.handle('printers:list', async (e) => {
  fromApp(e);
  const list = await win.webContents.getPrintersAsync();
  return list.map(p => ({ name: p.name, displayName: p.displayName || p.name, isDefault: !!p.isDefault }));
});

// Imprime um cupom em HTML direto na impressora escolhida, sem abrir janela.
ipcMain.handle('print:html', async (e, html, options = {}) => {
  fromApp(e);
  if (typeof html !== 'string' || html.length > 2_000_000) throw new Error('Cupom inválido');
  const worker = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } });
  try {
    await worker.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    await new Promise((resolve, reject) => {
      worker.webContents.print(
        { silent: true, printBackground: true, deviceName: options.deviceName || undefined, margins: { marginType: 'none' } },
        (ok, reason) => (ok ? resolve() : reject(new Error(reason || 'Falha ao imprimir'))),
      );
    });
  } finally {
    worker.destroy();
  }
});

// ---------- central offline ----------
// Só o sistema (logado como administrador na nuvem) ativa; a chave vem da função offline-hub.
function onlyCloud(event) {
  if (originOf(event.senderFrame?.url ?? '') !== APP_ORIGIN) throw new Error('Origem não autorizada');
}

ipcMain.handle('hub:status', (e) => { fromApp(e); return hub ? hub.status() : { enabled: false }; });
ipcMain.handle('hub:activate', (e, params) => {
  onlyCloud(e);
  hub.activate(params);
  startPrinterWindow();
  return hub.status();
});
ipcMain.handle('hub:deactivate', (e) => { onlyCloud(e); hub.deactivate(); stopPrinterWindow(); return hub.status(); });
ipcMain.handle('hub:set-devices', (e, devices) => { onlyCloud(e); hub.setDevices(devices); return true; });
ipcMain.handle('hub:sync', async (e) => { fromApp(e); await hub.sync(); return hub.status(); });

/**
 * Troca automática: quando a central confirma que a internet caiu (2 tentativas seguidas), a janela
 * principal vai sozinha para o modo offline, lembrando a tela em que estava. A volta é feita pelo
 * próprio modo offline quando a internet voltar e tudo tiver sido enviado.
 */
function watchConnection() {
  let switchingAt = 0;
  setInterval(async () => {
    if (!hub?.enabled && printerWin) stopPrinterWindow(); // central desligada: sem janela de impressão
    if (!win) return;
    const url = win.webContents.getURL();
    // aberto pela central, mas ela foi desligada (desativada no sistema): volta para o sistema online, na mesma tela
    if (url.startsWith(`${HUB_ORIGIN}/`) && !hub?.enabled) {
      try { const u = new URL(url); win.loadURL(`${APP_ORIGIN}${u.pathname}${u.search}`); } catch { win.loadURL(APP_URL); }
      return;
    }
    if (!hub?.enabled || hub.online || hub.offlineFails < 2) return;
    if (!isAppUrl(url) || Date.now() - switchingAt < 15_000) return;
    switchingAt = Date.now();
    // A própria página troca levando a pessoa logada e a mesma tela; se não der, abre a mesma tela na central.
    const done = await win.webContents.executeJavaScript(`window.oxysGoCentral ? window.oxysGoCentral(${JSON.stringify(HUB_ORIGIN)}) : false`).catch(() => false);
    if (!done) win.loadURL(centralUrl(url));
  }, 3000);
}
/** Mesmo caminho do sistema, aberto pela central. */
function centralUrl(url) {
  try { const u = new URL(url); return `${HUB_ORIGIN}${u.pathname}${u.search}`; } catch { return `${HUB_ORIGIN}/`; }
}

/** Janela escondida que imprime as vias feitas no modo offline nas impressoras deste computador. */
function startPrinterWindow() {
  if (printerWin || !hub?.enabled) return;
  printerWin = new BrowserWindow({
    show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true },
  });
  printerWin.loadURL(`${HUB_ORIGIN}/offline.html#/impressora`).catch(() => {});
  printerWin.webContents.on('did-fail-load', () => setTimeout(() => printerWin?.loadURL(`${HUB_ORIGIN}/offline.html#/impressora`).catch(() => {}), 5000));
  printerWin.on('closed', () => { printerWin = null; });
}
function stopPrinterWindow() { printerWin?.destroy(); printerWin = null; }

// ---------- atualização automática ----------
function setupUpdates() {
  if (!app.isPackaged) return;
  let autoUpdater;
  try { ({ autoUpdater } = require('electron-updater')); } catch { return; }
  autoUpdater.on('update-downloaded', async () => {
    const { response } = await dialog.showMessageBox({
      type: 'info', buttons: ['Reiniciar agora', 'Depois'], defaultId: 0,
      message: 'Nova versão do Oxys Restaurante baixada', detail: 'Ela é instalada ao reiniciar o app.',
    });
    if (response === 0) autoUpdater.quitAndInstall();
  });
  const check = () => autoUpdater.checkForUpdates().catch(() => {});
  check();
  setInterval(check, 6 * 60 * 60 * 1000);
}

app.whenReady().then(() => {
  app.setAppUserModelId('app.oxysrestaurante.desktop');
  buildMenu();
  // cofre de login da central criptografado pelo sistema (Windows DPAPI, Keychain no Mac, chaveiro no Linux)
  const secure = safeStorage.isEncryptionAvailable()
    ? { encrypt: (text) => safeStorage.encryptString(text), decrypt: (buf) => safeStorage.decryptString(buf) }
    : null;
  loadStoreServer();
  hub = new Hub({ dataDir: app.getPath('userData'), uiDir: offlineUiDir(), version: app.getVersion(), secure });
  if (hub.enabled) { hub.start(); hub.sync(); startPrinterWindow(); }
  createWindow();
  watchConnection();
  setupUpdates();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
