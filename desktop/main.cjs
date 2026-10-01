// Oxys Restaurante — app para Windows e Mac.
// Abre o sistema online (sempre atualizado) e acrescenta o que o navegador não faz:
// impressão direta nas térmicas sem janela, abrir com o computador e atualização automática.

const { app, BrowserWindow, ipcMain, shell, Menu, dialog } = require('electron');
const path = require('node:path');

const APP_URL = process.env.OXYS_URL || 'https://www.oxysrestaurante.app';
const APP_ORIGIN = new URL(APP_URL).origin;
// Logins de terceiros que acontecem dentro da janela (conexão de redes sociais no marketing).
const AUTH_HOSTS = ['facebook.com', 'www.facebook.com', 'm.facebook.com', 'www.tiktok.com', 'accounts.google.com', 'supabase.co'];

let win = null;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });
}

const isAppUrl = (url) => {
  try { return new URL(url).origin === APP_ORIGIN; } catch { return false; }
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
  win.webContents.on('did-fail-load', (_e, code, _desc, url, isMainFrame) => {
    if (isMainFrame && code !== -3 && isAppUrl(url)) win.loadFile(path.join(__dirname, 'offline.html'));
  });

  // Fica no sistema e nos logins de terceiros; o resto abre no navegador do computador.
  win.webContents.on('will-navigate', (e, url) => {
    if (isAppUrl(url) || isAuthUrl(url) || url.startsWith('file://')) return;
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
  if (!isAppUrl(url) && !url.startsWith('file://')) throw new Error('Origem não autorizada');
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

ipcMain.handle('app:retry', (e) => {
  fromApp(e);
  win?.loadURL(APP_URL);
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
  createWindow();
  setupUpdates();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
