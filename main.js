const { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, shell, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');

autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

const GAME_URL = process.env.GAME_URL || 'https://jopo.kr/g/moonrabbit';

// 원본 디자인 사이즈에 가깝게 (iPhone 13: 390×844, -44는 타이틀바/하단 여백)
const WIN_W = 390;
const WIN_H = 800;

let mainWindow = null;
let tray = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: WIN_W,
    height: WIN_H,
    minWidth: 320,
    minHeight: 560,
    resizable: true,
    useContentSize: true,
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

  // 단축키: Ctrl+R / F5 = 새로고침, Ctrl+Shift+R = 강제 새로고침, F12 / Ctrl+Shift+I = DevTools
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const ctrl = input.control || input.meta;
    const isHardReload = ctrl && input.shift && input.key.toLowerCase() === 'r';
    const isReload = (ctrl && input.key.toLowerCase() === 'r') || input.key === 'F5';
    const isDevTools = input.key === 'F12' || input.code === 'F12'
                       || (ctrl && input.shift && input.key.toLowerCase() === 'i');
    if (isHardReload) {
      mainWindow.webContents.reloadIgnoringCache();
      event.preventDefault();
    } else if (isReload) {
      mainWindow.webContents.reload();
      event.preventDefault();
    } else if (isDevTools) {
      // 별도 창으로 띄움 (작은 게임 화면 안 가림)
      if (mainWindow.webContents.isDevToolsOpened()) {
        mainWindow.webContents.closeDevTools();
      } else {
        mainWindow.webContents.openDevTools({ mode: 'detach' });
      }
      event.preventDefault();
    }
  });

  // 종료 시 클라이언트 sync 완료 위해 1.5초 대기
  let allowClose = false;
  mainWindow.on('close', (e) => {
    if (allowClose) return;
    e.preventDefault();
    mainWindow.webContents.executeJavaScript(
      'window.dispatchEvent(new Event("beforeunload"))'
    ).catch(() => {});
    setTimeout(() => { allowClose = true; mainWindow.close(); }, 1500);
  });

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
    { label: '새로고침 (Ctrl+R)', accelerator: 'CmdOrCtrl+R',
      click: () => { if (mainWindow) mainWindow.webContents.reload(); } },
    { label: '개발자 도구 (F12)',
      click: () => {
        if (!mainWindow) return;
        if (mainWindow.webContents.isDevToolsOpened()) {
          mainWindow.webContents.closeDevTools();
        } else {
          mainWindow.webContents.openDevTools({ mode: 'detach' });
        }
      } },
    { label: '항상 위', type: 'checkbox', click: (item) => {
        if (mainWindow) mainWindow.setAlwaysOnTop(item.checked);
      }},
    { type: 'separator' },
    { label: '업데이트 확인', click: () => checkForUpdatesManual() },
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

// ─── 자동 업데이트 (electron-updater + GitHub Releases) ───
function setupAutoUpdater() {
  autoUpdater.on('update-available', (info) => {
    console.log('[updater] 새 버전 발견:', info.version);
  });
  autoUpdater.on('update-not-available', () => {
    console.log('[updater] 최신 버전');
  });
  autoUpdater.on('error', (err) => {
    console.error('[updater] 에러:', err);
  });
  autoUpdater.on('download-progress', (p) => {
    console.log(`[updater] 다운로드 ${p.percent.toFixed(1)}% (${(p.bytesPerSecond / 1024).toFixed(0)} KB/s)`);
  });
  autoUpdater.on('update-downloaded', (info) => {
    const result = dialog.showMessageBoxSync(mainWindow, {
      type: 'info',
      buttons: ['지금 재시작', '나중에'],
      defaultId: 0,
      title: 'IDLE QUEST 업데이트',
      message: `새 버전 ${info.version} 다운로드 완료`,
      detail: '재시작하면 자동 적용됩니다.',
    });
    if (result === 0) {
      autoUpdater.quitAndInstall();
    }
  });
  // 앱 시작 5초 후 1회 체크 + 이후 1시간마다
  setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 5000);
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 60 * 60 * 1000);
}

function checkForUpdatesManual() {
  autoUpdater.checkForUpdates()
    .then((result) => {
      if (!result || !result.updateInfo) return;
      // update-available 또는 update-not-available 이벤트가 알아서 처리
    })
    .catch((err) => {
      dialog.showMessageBox(mainWindow, {
        type: 'error',
        title: '업데이트 확인 실패',
        message: '업데이트 서버에 연결할 수 없습니다.',
        detail: String(err),
      });
    });
}

app.whenReady().then(() => {
  createWindow();
  createTray();
  setupAutoUpdater();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
