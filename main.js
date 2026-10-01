const { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, shell, dialog, screen } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');

autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

// v1.1.0: 유실된 달토끼 대신 이터널 아이들(5월 버전 복원). productName/appId 는 그대로(바꾸면 userData 경로가 바뀌어 로그인·저장 유실)
const GAME_URL = process.env.GAME_URL || 'https://jopo.kr/g/idle';   // 이터널 아이들 (방치형 RPG)
const GAME_ORIGIN = new URL(GAME_URL).origin;
const APP_TITLE = 'ETERNAL IDLE';

// ─── 창 상태 기억 (위치·크기·항상 위) — userData/window-state.json, 실패해도 기본값으로 시작 ───
const STATE_FILE = path.join(app.getPath('userData'), 'window-state.json');
function loadWindowState() {
  try {
    const st = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    const out = { alwaysOnTop: !!st.alwaysOnTop };
    if ([st.x, st.y, st.w, st.h].every(Number.isFinite)) {
      // 저장된 위치가 지금 모니터 작업 영역 안일 때만 복원 (모니터 구성이 바뀐 경우 대비)
      const wa = screen.getDisplayMatching({ x: st.x, y: st.y, width: st.w, height: st.h }).workArea;
      const inside = st.x >= wa.x - 50 && st.y >= wa.y - 10 && st.x + 100 <= wa.x + wa.width && st.y + 50 <= wa.y + wa.height;
      if (inside) Object.assign(out, { x: st.x, y: st.y, w: st.w, h: st.h });
    }
    return out;
  } catch (e) { return { alwaysOnTop: false }; }
}
let winState = { alwaysOnTop: false };
let saveStateTimer = null;
function saveWindowState() {
  try {
    if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isMinimized()) return;
    const b = mainWindow.getContentBounds();
    winState = { x: b.x, y: b.y, w: b.width, h: b.height, alwaysOnTop: mainWindow.isAlwaysOnTop() };
    fs.writeFileSync(STATE_FILE, JSON.stringify(winState));
  } catch (e) { /* 저장 실패는 무시 */ }
}
function scheduleSaveState() { clearTimeout(saveStateTimer); saveStateTimer = setTimeout(saveWindowState, 500); }
function setAlwaysOnTop(on) {
  try {
    if (!mainWindow) return;
    mainWindow.setAlwaysOnTop(on, 'floating');
    saveWindowState();
    buildTrayMenu();
  } catch (e) { console.error('[always-on-top]', e); }
}

// 게임 창 안에서 허용하는 경로 (그 외 jopo.kr 페이지는 기본 브라우저로)
function isAllowedInApp(url) {
  try {
    const u = new URL(url);
    if (u.origin !== GAME_ORIGIN) return false;
    return u.pathname === new URL(GAME_URL).pathname
      || u.pathname === '/login' || u.pathname === '/register' || u.pathname === '/logout';
  } catch (e) { return false; }
}

// 원본 디자인 사이즈에 가깝게 (iPhone 13: 390×844, -44는 타이틀바/하단 여백)
const WIN_W = 390;
const WIN_H = 800;

let mainWindow = null;
let tray = null;

function createWindow() {
  try { winState = loadWindowState(); } catch (e) { winState = { alwaysOnTop: false }; }
  mainWindow = new BrowserWindow({
    width: winState.w || WIN_W,
    height: winState.h || WIN_H,
    ...(Number.isFinite(winState.x) ? { x: winState.x, y: winState.y } : {}),
    alwaysOnTop: !!winState.alwaysOnTop,
    title: APP_TITLE,
    minWidth: 200,                 // 작게 줄이면 화면 전체가 같은 비율로 축소됨 (fitZoom)
    minHeight: 340,
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
    if (ctrl && input.key === '0') {   // 기본 크기(390×800)로 되돌리기
      mainWindow.setContentSize(WIN_W, WIN_H);
      event.preventDefault();
      return;
    }
    if (ctrl && input.shift && input.key.toLowerCase() === 't') {   // 항상 위 토글
      setAlwaysOnTop(!mainWindow.isAlwaysOnTop());
      event.preventDefault();
      return;
    }
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
    saveWindowState();
    const wc = mainWindow.webContents;
    wc.executeJavaScript('window.dispatchEvent(new Event("beforeunload"))').catch(() => {});   // 로컬 저장
    const flush = wc.executeJavaScript("typeof window.__cfFlush === 'function' ? window.__cfFlush() : null").catch(() => {});
    Promise.race([flush, new Promise(r => setTimeout(r, 3000))])
      .finally(() => { allowClose = true; if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close(); });
  });
  mainWindow.on('moved', scheduleSaveState);
  mainWindow.on('resized', scheduleSaveState);

  // 창 크기에 맞춰 게임 화면 전체를 확대/축소 — 기본 390×800 이 100%, 줄이면 그대로 작아짐
  function fitZoom() {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const [w, h] = mainWindow.getContentSize();
    const z = Math.max(0.45, Math.min(1.6, Math.min(w / WIN_W, h / WIN_H)));
    mainWindow.webContents.setZoomFactor(z);
  }
  mainWindow.on('resize', fitZoom);
  mainWindow.webContents.on('did-finish-load', fitZoom);
  mainWindow.webContents.on('did-navigate-in-page', fitZoom);

  // 시작 시 SW + 캐시 강제 비움 (옛 SW가 jsx 가로채던 문제 영구 해결)
  const session = mainWindow.webContents.session;
  Promise.all([
    session.clearStorageData({ storages: ['serviceworkers'] }),
    session.clearCache(),
  ]).catch(() => {}).finally(() => {
    mainWindow.loadURL(GAME_URL);
  });

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

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isAllowedInApp(url)) return;
    event.preventDefault();
    if (/^https?:/.test(url)) shell.openExternal(url);
  });
  mainWindow.webContents.on('did-navigate', (event, url) => {
    try {
      const u = new URL(url);
      if (u.origin === GAME_ORIGIN && (u.pathname === '/' || u.pathname === '/home')) mainWindow.loadURL(GAME_URL);
    } catch (e) {}
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'tray.png');
  let icon;
  try { icon = nativeImage.createFromPath(iconPath); }
  catch (e) { icon = nativeImage.createEmpty(); }

  tray = new Tray(icon);
  tray.setToolTip(APP_TITLE + ' v' + app.getVersion());
  buildTrayMenu();
  tray.on('click', () => {
    if (mainWindow) {
      mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
    }
  });
}

function buildTrayMenu() {
  if (!tray) return;
  const contextMenu = Menu.buildFromTemplate([
    { label: '버전 ' + app.getVersion(), enabled: false },
    { type: 'separator' },
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
    { label: '항상 위 (Ctrl+Shift+T)', type: 'checkbox',
      checked: !!(mainWindow && mainWindow.isAlwaysOnTop()),
      click: (item) => setAlwaysOnTop(item.checked) },
    { type: 'separator' },
    { label: '업데이트 확인', click: () => checkForUpdatesManual() },
    { type: 'separator' },
    { label: '종료', click: () => app.quit() }
  ]);
  tray.setContextMenu(contextMenu);
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
      title: APP_TITLE + ' 업데이트',
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
  try { setupAutoUpdater(); } catch (e) { console.error('[updater] setup', e); }
  try { createWindow(); } catch (e) { console.error('[window]', e); }
  try { createTray(); } catch (e) { console.error('[tray]', e); }
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
