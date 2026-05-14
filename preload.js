const { contextBridge, ipcRenderer } = require('electron');

// 렌더러(웹 페이지)에서 호출할 수 있는 안전한 API
contextBridge.exposeInMainWorld('electronApi', {
  minimize:     () => ipcRenderer.send('window-minimize'),
  maximize:     () => ipcRenderer.send('window-maximize'),
  close:        () => ipcRenderer.send('window-close'),
  hideToTray:   () => ipcRenderer.send('window-hide-to-tray'),
  isElectron:   true
});

// jopo.kr 페이지 로드 후 커스텀 타이틀바 자동 주입 (IDLE QUEST)
window.addEventListener('DOMContentLoaded', () => {
  const bar = document.createElement('div');
  bar.id = '__electron-titlebar';
  bar.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0;
    height: 28px;
    background: linear-gradient(180deg, #1F1F1D 0%, #0A0A08 100%);
    border-bottom: 1px solid #333;
    display: flex; align-items: center; justify-content: space-between;
    z-index: 999999;
    -webkit-app-region: drag;
    user-select: none;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    padding: 0 8px;
    color: #FAC775;
    font-size: 11px;
    font-weight: 700;
  `;
  bar.innerHTML = `
    <div style="-webkit-app-region:drag; flex:1; padding-left:6px;">
      <span style="color:#FAC775;">●</span> IDLE QUEST
    </div>
    <div style="-webkit-app-region:no-drag; display:flex; gap:0;">
      <button id="__t-min" style="${btnStyle()}">─</button>
      <button id="__t-max" style="${btnStyle()}">▢</button>
      <button id="__t-close" style="${btnStyle('#E24B4A')}">✕</button>
    </div>
  `;
  document.body.appendChild(bar);
  // body에 padding-top
  document.body.style.paddingTop = '28px';

  document.getElementById('__t-min').onclick = () => window.electronApi.minimize();
  document.getElementById('__t-max').onclick = () => window.electronApi.maximize();
  document.getElementById('__t-close').onclick = () => window.electronApi.close();
});

function btnStyle(hoverColor) {
  return `
    width: 38px; height: 28px;
    background: transparent; border: none;
    color: #B5B3A8; font-size: 12px;
    cursor: pointer;
    transition: background 0.1s;
  ` + (hoverColor
    ? `--hover:${hoverColor};`
    : '');
}
