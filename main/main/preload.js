"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
console.log('[Preload] Loading Sparco preload script...');
const sparcoAPI = {
    runPrediction: (payload) => electron_1.ipcRenderer.invoke('prediction:run', payload),
    getHistory: () => electron_1.ipcRenderer.invoke('prediction:history'),
    clearCache: () => electron_1.ipcRenderer.invoke('prediction:clear-cache'),
    calculateScale: (payload) => electron_1.ipcRenderer.invoke('scale:calculate', payload),
    calculatePitzerScale: (payload) => electron_1.ipcRenderer.invoke('pitzer:calculate', payload),
    saveReportPDF: (htmlContent) => electron_1.ipcRenderer.invoke('report:save-pdf', htmlContent)
};
console.log('[Preload] Exposing Sparco API to main world...');
electron_1.contextBridge.exposeInMainWorld('sparco', sparcoAPI);
console.log('[Preload] Sparco API exposed successfully');
