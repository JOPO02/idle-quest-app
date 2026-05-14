const { contextBridge, ipcRenderer } = require('electron');

// 렌더러(웹 페이지)에서 호출할 수 있는 안전한 API
contextBridge.exposeInMainWorld('electronApi', {
  minimize:     () => ipcRenderer.send('window-minimize'),
  maximize:     () => ipcRenderer.send('window-maximize'),
  close:        () => ipcRenderer.send('window-close'),
  hideToTray:   () => ipcRenderer.send('window-hide-to-tray'),
  isElectron:   true
});

// 미니멀 타이틀바 — 18px 얇은 띠 + 작은 닫기/최소화 버튼만 (텍스트/로고 없음)
// 드래그는 좌측 90% 영역, 우측 60px만 버튼 영역
window.addEventListener('DOMContentLoaded', () => {
  const bar = document.createElement('div');
  bar.id = '__electron-titlebar';
  bar.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0;
    height: 18px;
    background: rgba(20, 14, 36, 0.7);
    backdrop-filter: blur(4px);
    display: flex; align-items: center; justify-content: flex-end;
    z-index: 999999;
    -webkit-app-region: drag;
    user-select: none;
  `;
  bar.innerHTML = `
    <div style="-webkit-app-region:no-drag; display:flex;">
      <button id="__t-min" title="최소화" style="${btn()}">─</button>
      <button id="__t-close" title="닫기" style="${btn(true)}">✕</button>
    </div>
  `;
  document.body.appendChild(bar);
  document.body.style.paddingTop = '18px';

  document.getElementById('__t-min').onclick = () => window.electronApi.minimize();
  document.getElementById('__t-close').onclick = () => window.electronApi.close();
});

function btn(isClose) {
  return `
    width: 30px; height: 18px;
    background: transparent; border: none;
    color: ${isClose ? '#E89BAA' : '#B5AEEE'};
    font-size: 10px; line-height: 18px; padding: 0;
    cursor: pointer; font-family: inherit;
  `;
}
