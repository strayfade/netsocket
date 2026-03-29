const { app, BrowserWindow, screen, nativeTheme, Tray, Menu, nativeImage, ipcMain, clipboard, globalShortcut } = require('electron')
const path = require('node:path')
const sendkeys = require('sendkeys-js')

let tray;

const devMode = false;
let mainWindow
const createWindow = () => {
    mainWindow = new BrowserWindow({
        width: screen.getPrimaryDisplay().workAreaSize.width,
        height: screen.getPrimaryDisplay().workAreaSize.height,
        frame: devMode,
        transparent: !devMode,
        alwaysOnTop: !devMode,
        skipTaskbar: true,
        roundedCorners: false,
        thickFrame: false,
        hasShadow: false,
        webPreferences: {
            preload: path.join(__dirname, "preload.js")
        }
    })
    if (!devMode) {
        mainWindow.setIgnoreMouseEvents(true)
    }
    nativeTheme.themeSource = 'system'

    if (process.platform === 'darwin') {
        mainWindow.setVisibleOnAllWorkspaces(true);
        app.dock.hide();
    }

    mainWindow.loadFile('index.html')

    if (devMode)
        mainWindow.webContents.openDevTools();
}

let wsStatus = 'disconnected';
let wsAddress = 'unknown';

let lastNotificationText = ""
let currentNotificationText = ""
function buildTrayMenu() {
    const statusLabel = `Status: ${wsStatus}`;
    const serverLabel = `Server: ${wsAddress}`;
    return Menu.buildFromTemplate([
        {
            label: 'netsocket',
            enabled: false
        },
        {
            label: statusLabel,
            enabled: false
        },
        {
            label: serverLabel,
            enabled: false
        },
        { type: 'separator' },
        {
            'label': "Copy last notification",
            click: async () => {
                clipboard.writeText(lastNotificationText)
            }
        },
        {
            'label': "Type last notification",
            click: async () => {
                await new Promise(resolve => setTimeout(resolve, 500));
                if (process.platform === "darwin")
                    sendkeys.send(`"${lastNotificationText}"`)
                else {
                    sendkeys.send(lastNotificationText)
                }
            }
        },
        { type: 'separator' },
        {
            label: "Toggle Server",
            click: async () => {
                mainWindow.webContents.executeJavaScript("attemptReconnect()")
            }
        },
        {
            label: 'Quit',
            click: async () => {
                app.quit();
            },
        },
    ]);
}

function createTray() {
    const trayIcon = nativeImage.createFromPath(path.join(__dirname, 'tray-icon-20px.png'));
    tray = new Tray(trayIcon);

    tray.setContextMenu(buildTrayMenu());
    tray.setToolTip(`netsocket — ${wsStatus}`);
}

ipcMain.on('ws-status', (event, payload) => {
    wsStatus = payload && payload.connected ? 'connected' : 'disconnected';
    wsAddress = payload && payload.wsUrl ? payload.wsUrl : 'unknown';
    if (tray) {
        tray.setContextMenu(buildTrayMenu());
        tray.setToolTip(`netsocket — ${wsStatus}`);
    }
});

ipcMain.handle('log', async (event, text) => {
    console.log(text)
});
ipcMain.handle('set-ignore-mouse', async (event, shouldIgnore) => {
    mainWindow.setIgnoreMouseEvents(shouldIgnore)
})
ipcMain.handle('set-notification-text', async (event, text) => {
    currentNotificationText = text
    if (text.length > 0) {
        lastNotificationText = text
    }
    console.log('Notification text: ' + text)
});
let inputAreaShown = false;
app.whenReady().then(() => {
    createWindow();
    createTray();
    globalShortcut.register('CommandOrControl+Shift+1', async () => {
        console.log(`Copying ${currentNotificationText}`)
        clipboard.writeText(currentNotificationText)
    })
    globalShortcut.register('CommandOrControl+Shift+2', async () => {
        await new Promise(resolve => setTimeout(resolve, 500));
        if (process.platform === "darwin")
            sendkeys.send(`"${lastNotificationText}"`)
        else {
            sendkeys.send(lastNotificationText)
        }
    })
    globalShortcut.register('CommandOrControl+Shift+Space', async () => {
        mainWindow.webContents.executeJavaScript("toggleInputArea()")
        inputAreaShown = !inputAreaShown
        if (inputAreaShown)
            mainWindow.focus();
    })
})

app.setLoginItemSettings({
    openAtLogin: true
});