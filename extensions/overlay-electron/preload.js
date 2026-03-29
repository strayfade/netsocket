const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('preload', {
    node: () => process.versions.node,
    chrome: () => process.versions.chrome,
    electron: () => process.versions.electron,
    log: (data) => ipcRenderer.invoke('log', data),
    sendStatus: (status) => ipcRenderer.send('ws-status', status),
    getPlatform: () => process.platform,
    setNotificationText: (text) => ipcRenderer.invoke('set-notification-text', text),
    setIgnoreMouse: (shouldIgnore) => ipcRenderer.invoke('set-ignore-mouse', shouldIgnore),
})