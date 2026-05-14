const { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, shell } = require('electron');
const path = require('path');

const GAME_URL = process.env.GAME_URL || 'https://jopo.kr/g/idle';

let mainWindow = null;
let tray = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 460,
    height: 820,
    minWidth: 380,
    minHeight: 600,
    frame: false,                  // 디스코드처럼 frameless
    titleBarStyle: 'hidden',
    backgroundColor: '#0A0A08',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    show: false                    // 로드 끝나면 ready-to-show로 깜빡임 방지
  });

  Menu.setApplicationMenu(null);   // 기본 메뉴 제거 (디스코드처럼)

  mainWindow.loadURL(GAME_URL);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // 외부 링크는 시스템 브라우저로
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith('http://localhost') && !url.startsWith('https://jopo.kr')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'tray.png');
  let icon;
  try { icon = nativeImage.createFromPath(iconPath); }
  catch (e) { icon = nativeImage.createEmpty(); }

  tray = new Tray(icon);
  tray.setToolTip('IDLE QUEST');
  const contextMenu = Menu.buildFromTemplate([
    { label: '게임 열기', click: () => { if (mainWindow) mainWindow.show(); } },
    { label: '항상 위', type: 'checkbox', click: (item) => {
        if (mainWindow) mainWindow.setAlwaysOnTop(item.checked);
      }},
    { type: 'separator' },
    { label: '종료', click: () => app.quit() }
  ]);
  tray.setContextMenu(contextMenu);
  tray.on('click', () => {
    if (mainWindow) {
      mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
    }
  });
}

// ─── IPC: 커스텀 타이틀바 버튼 ───
ipcMain.on('window-minimize', () => mainWindow?.minimize());
ipcMain.on('window-maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on('window-close', () => mainWindow?.close());
ipcMain.on('window-hide-to-tray', () => mainWindow?.hide());

app.whenReady().then(() => {
  createWindow();
  createTray();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
