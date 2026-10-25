'use strict';
const { app, BrowserWindow, dialog, shell, session, Menu, screen } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { launchService } = require('./service.cjs');

// Stable across EXE paths. An explicit data root is for isolated acceptance/empty-library recovery.
const rootArg = process.argv.find(arg => arg.startsWith('--travel-user-dir='));
// LOCALAPPDATA may be redirected independently of Roaming AppData.
const root = rootArg ? path.resolve(rootArg.slice('--travel-user-dir='.length)) : path.join(process.env.LOCALAPPDATA || path.join(app.getPath('appData'), '..', 'Local'), 'TravelRecording');
fs.mkdirSync(root, { recursive: true });
const canonicalRoot = fs.realpathSync.native(root);
app.setPath('userData', canonicalRoot);
app.setPath('sessionData', path.join(canonicalRoot, 'browser'));
app.setAppUserModelId('local.travel.recording');
app.enableSandbox();

let win, service, origin, quitting = false, finished = false;
const focus = () => { if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); } };
if (!app.requestSingleInstanceLock()) { app.quit(); }
else {
  app.on('second-instance', focus);
  app.on('before-quit', event => { if (!finished) { event.preventDefault(); shutdown(); } });
  app.whenReady().then(start).catch(failure);
}

function readBounds() {
  try {
    const saved = JSON.parse(fs.readFileSync(path.join(canonicalRoot, 'window.json'), 'utf8'));
    const bounds = { width: Math.max(1024, Math.min(3840, saved.width)), height: Math.max(720, Math.min(2160, saved.height)) };
    if (!Number.isFinite(bounds.width) || !Number.isFinite(bounds.height)) return {};
    if (Number.isFinite(saved.x) && Number.isFinite(saved.y) && screen.getAllDisplays().some(d =>
      saved.x < d.workArea.x+d.workArea.width-100 && saved.x+bounds.width > d.workArea.x+100 &&
      saved.y >= d.workArea.y && saved.y < d.workArea.y+d.workArea.height-100)) Object.assign(bounds, { x: saved.x, y: saved.y });
    return bounds;
  } catch { return {}; }
}

async function start() {
  Menu.setApplicationMenu(null);
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  win = new BrowserWindow({ width: 1440, height: 960, minWidth: 1024, minHeight: 720, ...readBounds(),
    title: '旅迹', backgroundColor: '#f4f2ed', autoHideMenuBar: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, spellcheck: false } });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event, url) => { if (!origin || new URL(url).origin !== origin) event.preventDefault(); });
  win.webContents.on('will-attach-webview', event => event.preventDefault());
  win.webContents.on('render-process-gone', () => failure(new Error('页面进程异常结束，请退出后重开。')));
  // Downloads are handled by Chromium with an ordinary native Save As dialog.
  session.defaultSession.on('will-download', (_event, item) => item.setSaveDialogOptions({ title: '保存旅迹备份' }));
  win.on('close', event => {
    if (!finished) {
      event.preventDefault();
      try { fs.writeFileSync(path.join(canonicalRoot, 'window.json'), JSON.stringify(win.getNormalBounds())); } catch {}
      shutdown();
    }
  });
  await win.loadFile(path.join(__dirname, 'waiting.html'));
  if (quitting) return;
  const dataDir = path.join(canonicalRoot, 'data');
  const configDir = path.join(canonicalRoot, 'config');
  fs.mkdirSync(configDir, { recursive: true });
  const config = path.join(configDir, 'application-local.properties');
  if (!fs.existsSync(config)) fs.writeFileSync(config, '# Optional Tianditu server key; restart after editing.\napp.geography.tianditu-key=\n', { flag: 'wx' });
  const resources = app.isPackaged ? process.resourcesPath : path.join(__dirname, 'runtime');
  service = launchService({ java: path.join(resources, 'java', 'bin', 'java.exe'), jar: path.join(resources, 'server', 'travel-recording.jar'), dataDir, config,
    onExit: info => { if (!info.stopping && !quitting) failure(new Error(`服务意外退出（${info.code}），请查看日志后重新打开。`)); } });
  origin = await service.ready;
  if (!quitting) await win.loadURL(origin);
}

async function shutdown() {
  if (quitting) return;
  quitting = true;
  if (win && !win.isDestroyed()) { win.setTitle('旅迹 · 正在安全退出'); win.webContents.setIgnoreMenuShortcuts(true); }
  const reminder = setTimeout(() => {
    dialog.showMessageBox(win, { type: 'info', title: '正在安全退出', message: '正在结束当前照片处理或请求，请稍候。', detail: '数据保存完成后会自动关闭。无需再次点击退出。', buttons: ['继续等待'] }).catch(() => {});
  }, 15000);
  try { if (service) await service.stop(); }
  finally { clearTimeout(reminder); finished = true; app.quit(); }
}

let reporting = false;
async function failure(error) {
  if (quitting || reporting) return;
  reporting = true;
  const result = await dialog.showMessageBox(win, { type: 'error', title: '旅迹无法继续运行',
    message: error.message || String(error), detail: `未连接其他端口或关闭其他 Java。日志：${path.join(canonicalRoot, 'data', 'logs')}`,
    buttons: ['退出', '打开日志文件夹'], defaultId: 0, noLink: true });
  if (result.response === 1) await shell.openPath(path.join(canonicalRoot, 'data', 'logs'));
  await shutdown();
}
