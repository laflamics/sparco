"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const backend_1 = require("./backend");
const fs_1 = require("fs");
const isDev = !!process.env.VITE_DEV_SERVER_URL;
// Get icon path - handle both dev and production
const getIconPath = () => {
    let iconPath;
    if (isDev) {
        // In dev, __dirname is dist/main/main, so go up to project root
        iconPath = path_1.default.resolve(__dirname, '../../assets/sparcologo.png');
    }
    else {
        // In production, __dirname is dist/main/main, assets should be in dist/assets
        iconPath = path_1.default.resolve(__dirname, '../assets/sparcologo.png');
    }
    // Fallback: try to find in project root
    if (!(0, fs_1.existsSync)(iconPath)) {
        const fallbackPath = path_1.default.resolve(process.cwd(), 'assets/sparcologo.png');
        if ((0, fs_1.existsSync)(fallbackPath)) {
            iconPath = fallbackPath;
        }
    }
    return iconPath;
};
const createWindow = async () => {
    // In dev mode, __dirname is dist/main/main
    // In production, __dirname is also dist/main/main (inside app.asar)
    const preloadPath = path_1.default.join(__dirname, 'preload.js');
    console.log('Preload path:', preloadPath);
    console.log('Preload exists:', require('fs').existsSync(preloadPath));
    const iconPath = getIconPath();
    console.log('Icon path:', iconPath);
    const mainWindow = new electron_1.BrowserWindow({
        width: 1280,
        height: 840,
        minWidth: 1100,
        minHeight: 720,
        backgroundColor: '#05070f',
        title: 'Sparco Labs • Congeal Prediction',
        icon: iconPath,
        webPreferences: {
            preload: preloadPath,
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false,
            webSecurity: true // Enable web security for proper resource loading
        }
    });
    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
        console.error('Failed to load:', errorCode, errorDescription);
    });
    // Suppress non-critical DevTools warnings (like Autofill)
    // Note: console-message is deprecated, but we keep it for compatibility
    // These are just warnings from DevTools, not critical errors
    mainWindow.webContents.on('console-message', (event, level, message) => {
        if (typeof message === 'string' && (message.includes('Autofill') ||
            message.includes('Protocol') ||
            message.includes("wasn't found"))) {
            // Suppress non-critical DevTools warnings
            return;
        }
    });
    if (isDev && process.env.VITE_DEV_SERVER_URL) {
        console.log('Loading dev server:', process.env.VITE_DEV_SERVER_URL);
        await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
    else {
        // In production, files are packed in app.asar
        // app.getAppPath() returns the path to app.asar (or app folder if unpacked)
        // From there, we can access dist/renderer/index.html
        const appPath = electron_1.app.getAppPath();
        console.log('App path:', appPath);
        console.log('__dirname:', __dirname);
        console.log('process.resourcesPath:', process.resourcesPath);
        // Try multiple paths - loadFile handles asar archives automatically
        const possiblePaths = [
            path_1.default.join(appPath, 'dist', 'renderer', 'index.html'), // Standard path from app root
            path_1.default.join(__dirname, '../renderer/index.html'), // Relative from main.js location
        ];
        let loaded = false;
        for (const htmlPath of possiblePaths) {
            console.log('Trying to load HTML from:', htmlPath);
            try {
                // loadFile automatically handles asar archives and sets correct base path
                // It resolves relative paths in HTML relative to the HTML file location
                await mainWindow.loadFile(htmlPath);
                console.log('Successfully loaded HTML from:', htmlPath);
                loaded = true;
                break;
            }
            catch (error) {
                console.log('Failed to load from:', htmlPath, error);
                continue;
            }
        }
        // If all paths failed, try with loadURL
        if (!loaded) {
            console.error('All loadFile attempts failed, trying loadURL...');
            const htmlPath = path_1.default.join(appPath, 'dist', 'renderer', 'index.html');
            // For asar archives, we need to use the asar:// protocol
            let fileUrl;
            if (htmlPath.includes('.asar')) {
                // Extract path inside asar
                const asarMatch = htmlPath.match(/app\.asar[\\/](.+)$/);
                if (asarMatch) {
                    fileUrl = `asar://${appPath.replace(/\\/g, '/')}/${asarMatch[1].replace(/\\/g, '/')}`;
                }
                else {
                    fileUrl = `file:///${htmlPath.replace(/\\/g, '/')}`;
                }
            }
            else {
                fileUrl = process.platform === 'win32'
                    ? `file:///${htmlPath.replace(/\\/g, '/')}`
                    : `file://${htmlPath}`;
            }
            console.log('Trying URL:', fileUrl);
            try {
                await mainWindow.loadURL(fileUrl);
                console.log('Successfully loaded HTML via URL');
            }
            catch (error) {
                console.error('Failed to load HTML via URL:', error);
                // Show error message in window
                await mainWindow.loadURL('data:text/html,<h1>Failed to load application</h1><p>Please check console logs.</p>');
            }
        }
    }
};
// Set app icon - Windows needs it before app ready
const iconPath = getIconPath();
console.log('Icon path resolved:', iconPath);
console.log('Icon file exists:', (0, fs_1.existsSync)(iconPath));
if (process.platform === 'win32') {
    electron_1.app.setAppUserModelId('com.sparcolabs.app');
}
electron_1.app.whenReady().then(() => {
    electron_1.nativeTheme.themeSource = 'dark';
    try {
        console.log('Starting Sparco Labs app...');
        (0, backend_1.registerBackendHandlers)();
        console.log('Backend handlers registered, creating window...');
        createWindow();
        console.log('Window created successfully');
    }
    catch (error) {
        console.error('Error during startup:', error);
        electron_1.app.quit();
    }
    electron_1.app.on('activate', () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        electron_1.app.quit();
    }
});
electron_1.app.on('ready', () => {
    console.log('Sparco Labs Electron app ready');
});
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
electron_1.ipcMain.on('app:quit', () => {
    electron_1.app.quit();
});
