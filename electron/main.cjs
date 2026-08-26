const { app, BrowserWindow, ipcMain, shell } = require("electron");
const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const path = require("node:path");
const { fileURLToPath, pathToFileURL } = require("node:url");

const APP_NAME = "Scarlet Reel";
const DIST_INDEX = path.join(__dirname, "..", "dist", "index.html");
const DIST_INDEX_URL = pathToFileURL(DIST_INDEX).toString();
const DEV_SERVER_URL = process.env.ELECTRON_START_URL || process.env.VITE_DEV_SERVER_URL || "";
const PRELOAD = path.join(__dirname, "preload.cjs");

const windowState = new Set();
const CONFIGURED = Symbol("scarletReelConfigured");

function shouldOpenFullscreen() {
  const argv = process.argv.map((arg) => arg.toLowerCase());
  if (argv.includes("--windowed") || process.env.SCARLET_REEL_FULLSCREEN === "0") return false;
  return (
    argv.includes("--fullscreen") ||
    argv.includes("--full-screen") ||
    /^(1|true|yes)$/i.test(process.env.SCARLET_REEL_FULLSCREEN || "")
  );
}

function isInternalUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);

    if (DEV_SERVER_URL) {
      const dev = new URL(DEV_SERVER_URL);
      return url.origin === dev.origin;
    }

    if (url.protocol !== "file:") return false;
    return path.normalize(fileURLToPath(url)) === path.normalize(DIST_INDEX);
  } catch {
    return false;
  }
}

function webPreferences() {
  return {
    preload: PRELOAD,
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webSecurity: true,
  };
}

function slugPart(value, fallback = "asset") {
  return String(value || fallback)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || fallback;
}

function extensionFor(name, mimeType) {
  const ext = path.extname(String(name || "")).toLowerCase();
  if (ext && ext.length <= 12) return ext;
  if (/png/i.test(mimeType)) return ".png";
  if (/jpe?g/i.test(mimeType)) return ".jpg";
  if (/webp/i.test(mimeType)) return ".webp";
  if (/gif/i.test(mimeType)) return ".gif";
  if (/mpeg|mp3/i.test(mimeType)) return ".mp3";
  if (/wav/i.test(mimeType)) return ".wav";
  if (/ogg|opus/i.test(mimeType)) return ".ogg";
  if (/mp4/i.test(mimeType)) return ".mp4";
  if (/webm/i.test(mimeType)) return ".webm";
  return "";
}

function desktopUploadTargets(relativePath) {
  const roots = [];
  const appRoot = app.getAppPath();

  if (!app.isPackaged) {
    const publicRoot = path.join(appRoot, "public");
    if (fsSync.existsSync(publicRoot)) roots.push(publicRoot);
    const distRoot = path.join(appRoot, "dist");
    if (fsSync.existsSync(distRoot)) roots.push(distRoot);
  }

  if (!roots.length) roots.push(path.join(app.getPath("userData"), "game-media"));
  return roots.map((root) => path.join(root, relativePath));
}

function windowFromEvent(event) {
  return BrowserWindow.fromWebContents(event.sender);
}

function registerDesktopMediaIpc() {
  ipcMain.handle("scarlet-media:save-upload", async (_event, payload) => {
    const storyId = slugPart(payload?.storyId, "story");
    const assetId = slugPart(payload?.assetId, `${Date.now()}`);
    const originalName = slugPart(payload?.name, "upload");
    const ext = extensionFor(payload?.name, payload?.mimeType);
    const base = slugPart(originalName.replace(/\.[^.]+$/, ""), "upload");
    const relativePath = path.join("uploads", storyId, `${assetId}-${base}${ext}`);
    const bytes = payload?.bytes;
    const buffer = Buffer.from(bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes);
    if (!buffer.length) throw new Error("Upload was empty.");

    const targets = desktopUploadTargets(relativePath);
    await Promise.all(targets.map(async (target) => {
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, buffer);
    }));

    // In desktop preview, copying into public/ and dist/ means the same stable
    // /uploads/... path works immediately and will be included by the next Vite
    // build. In a packaged app, userData is the writable game-media folder, so
    // return a file:// URL instead.
    const publicTarget = targets.find((target) => target.includes(`${path.sep}public${path.sep}`));
    if (publicTarget) return { url: `/${relativePath.split(path.sep).join("/")}`, path: publicTarget };
    const target = targets[0];
    return { url: pathToFileURL(target).toString(), path: target };
  });
}

/** ElevenLabs voice files: strictly voices/<person>/<scene>/<line>.mp3 so the
 *  renderer can never write outside the committed voice tree. */
const VOICE_REL_PATH_RE = /^voices\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+\.mp3$/;

function registerVoiceIpc() {
  ipcMain.handle("scarlet-voice:save", async (_event, payload) => {
    const relativePath = String(payload?.relativePath ?? "");
    if (!VOICE_REL_PATH_RE.test(relativePath)) {
      throw new Error(`Invalid voice path "${relativePath}" — expected voices/<person>/<scene>/<line>.mp3`);
    }
    const bytes = payload?.bytes;
    const buffer = Buffer.from(bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes);
    if (!buffer.length) throw new Error("Voice file was empty.");

    const targets = desktopUploadTargets(relativePath);
    await Promise.all(targets.map(async (target) => {
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, buffer);
    }));

    // Same two-mode behaviour as uploads: dev checkout gets the real repo
    // files (public/ and dist/), a packaged app gets the userData folder.
    const publicTarget = targets.find((target) => target.includes(`${path.sep}public${path.sep}`));
    if (publicTarget) return { url: `/${relativePath.split(path.sep).join("/")}`, path: publicTarget };
    const target = targets[0];
    return { url: pathToFileURL(target).toString(), path: target };
  });
}

function registerWindowIpc() {
  ipcMain.handle("scarlet-window:set-fullscreen", (event, enabled) => {
    const win = windowFromEvent(event);
    if (!win) return false;
    win.setFullScreen(!!enabled);
    return win.isFullScreen();
  });

  ipcMain.handle("scarlet-window:is-fullscreen", (event) => {
    const win = windowFromEvent(event);
    return !!win?.isFullScreen();
  });

  ipcMain.handle("scarlet-window:set-size", (event, size) => {
    const win = windowFromEvent(event);
    if (!win) return { width: 0, height: 0 };
    const width = Math.max(800, Math.min(7680, Math.round(Number(size?.width) || 1280)));
    const height = Math.max(600, Math.min(4320, Math.round(Number(size?.height) || 720)));
    if (win.isFullScreen()) win.setFullScreen(false);
    win.setSize(width, height, true);
    win.center();
    const [actualWidth, actualHeight] = win.getSize();
    return { width: actualWidth, height: actualHeight };
  });

  ipcMain.handle("scarlet-app:quit", () => {
    app.quit();
  });
}

function configureWindow(win) {
  if (win[CONFIGURED]) return;
  win[CONFIGURED] = true;

  win.webContents.on("before-input-event", (event, input) => {
    const key = String(input.key || "").toLowerCase();
    const toggleFullscreen =
      input.type === "keyDown" &&
      (key === "f11" || (process.platform === "darwin" && input.control && input.meta && key === "f"));
    if (!toggleFullscreen) return;
    event.preventDefault();
    win.setFullScreen(!win.isFullScreen());
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isInternalUrl(url)) {
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          title: APP_NAME,
          backgroundColor: "#05050a",
          autoHideMenuBar: true,
          width: 1440,
          height: 900,
          minWidth: 1024,
          minHeight: 700,
          fullscreen: shouldOpenFullscreen(),
          show: false,
          webPreferences: webPreferences(),
        },
      };
    }

    if (/^https?:/i.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });

  win.webContents.on("will-navigate", (event, url) => {
    if (isInternalUrl(url)) return;
    event.preventDefault();
    if (/^https?:/i.test(url)) void shell.openExternal(url);
  });

  win.once("ready-to-show", () => win.show());
  win.on("closed", () => windowState.delete(win));
  windowState.add(win);
}

function createWindow(url = "") {
  const win = new BrowserWindow({
    title: APP_NAME,
    backgroundColor: "#05050a",
    autoHideMenuBar: true,
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    fullscreen: shouldOpenFullscreen(),
    show: false,
    webPreferences: webPreferences(),
  });

  configureWindow(win);

  if (DEV_SERVER_URL) {
    void win.loadURL(url || DEV_SERVER_URL);
  } else if (url) {
    void win.loadURL(url);
  } else {
    void win.loadFile(DIST_INDEX);
  }

  return win;
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  registerDesktopMediaIpc();
  registerVoiceIpc();
  registerWindowIpc();

  // Windows opened by the web app (Studio playtests use window.open) are
  // created by Electron, not by createWindow(), so apply the same security,
  // external-link and ready-to-show handling to every BrowserWindow.
  app.on("browser-window-created", (_event, win) => configureWindow(win));

  app.on("second-instance", (_event, argv) => {
    const existing = [...windowState][0];
    if (existing) {
      if (existing.isMinimized()) existing.restore();
      existing.focus();
      return;
    }

    const deepLink = argv.find((arg) => arg.startsWith(DIST_INDEX_URL) || arg.startsWith("scarlet-reel://"));
    createWindow(deepLink && deepLink.startsWith(DIST_INDEX_URL) ? deepLink : undefined);
  });

  app.whenReady().then(() => {
    app.setName(APP_NAME);
    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
