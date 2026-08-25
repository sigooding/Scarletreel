const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("scarletReelDesktop", {
  /**
   * Copy an uploaded Studio file into the desktop game-media folder.
   * Returns a URL the renderer can store in the media library and load later.
   */
  saveUpload(payload) {
    return ipcRenderer.invoke("scarlet-media:save-upload", payload);
  },
  setFullscreen(enabled) {
    return ipcRenderer.invoke("scarlet-window:set-fullscreen", !!enabled);
  },
  isFullscreen() {
    return ipcRenderer.invoke("scarlet-window:is-fullscreen");
  },
  setWindowSize(width, height) {
    return ipcRenderer.invoke("scarlet-window:set-size", { width, height });
  },
  quit() {
    return ipcRenderer.invoke("scarlet-app:quit");
  },
});
