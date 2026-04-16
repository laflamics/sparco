"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerBackendHandlers = void 0;
const electron_1 = require("electron");
const predictionService_1 = require("./predictionService");
const scaleService_1 = require("./scaleService");
const pitzerScaleService_1 = require("./pitzerScaleService");
const predictionService = new predictionService_1.PredictionService();
const scaleService = new scaleService_1.ScaleService();
const registerBackendHandlers = () => {
    console.log('Registering backend handlers...');
    electron_1.ipcMain.handle('prediction:run', async (_event, payload) => {
        return predictionService.runPrediction(payload);
    });
    electron_1.ipcMain.handle('prediction:history', async () => {
        return predictionService.getHistory();
    });
    electron_1.ipcMain.handle('prediction:clear-cache', async () => {
        predictionService.clearCache();
        return { ok: true };
    });
    electron_1.ipcMain.handle('scale:calculate', async (_event, payload) => {
        return scaleService.calculate(payload);
    });
    electron_1.ipcMain.handle('pitzer:calculate', async (_event, payload) => {
        try {
            console.log('pitzer:calculate called with payload:', JSON.stringify(payload, null, 2));
            const result = (0, pitzerScaleService_1.calculateScalePrediction)(payload);
            console.log('pitzer:calculate result:', JSON.stringify(result, null, 2));
            return result;
        }
        catch (error) {
            console.error('Error in pitzer:calculate:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('report:save-pdf', async (_event, htmlContent) => {
        const window = electron_1.BrowserWindow.getFocusedWindow();
        if (!window) {
            throw new Error('No active window');
        }
        const { canceled, filePath } = await electron_1.dialog.showSaveDialog(window, {
            title: 'Save Report as PDF',
            defaultPath: `Sparco-Report-${new Date().toISOString().split('T')[0]}.pdf`,
            filters: [
                { name: 'PDF Files', extensions: ['pdf'] },
                { name: 'All Files', extensions: ['*'] }
            ]
        });
        if (canceled || !filePath) {
            return { success: false, message: 'Save cancelled' };
        }
        const pdfWindow = new electron_1.BrowserWindow({
            show: false,
            width: 1200,
            height: 1600,
            webPreferences: {
                sandbox: true,
                nodeIntegration: false,
                contextIsolation: true
            }
        });
        // Suppress console errors (like Autofill warnings)
        // Note: console-message is deprecated, but we keep it for compatibility
        pdfWindow.webContents.on('console-message', (event, level, message) => {
            if (typeof message === 'string' && (message.includes('Autofill') ||
                message.includes('Protocol') ||
                message.includes("wasn't found"))) {
                // Suppress non-critical DevTools warnings
                return;
            }
        });
        try {
            console.log('Starting PDF generation...');
            console.log('HTML content length:', htmlContent.length);
            // Load HTML content using data URL
            const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`;
            console.log('Data URL length:', dataUrl.length);
            // Simple approach: load and wait with fixed delay
            console.log('Loading URL into PDF window...');
            await pdfWindow.loadURL(dataUrl);
            console.log('URL loaded, waiting for DOM ready...');
            // Wait for page to be ready - use simple timeout approach
            // This is more reliable than event listeners
            await new Promise((resolve) => {
                let resolved = false;
                // Try to resolve when dom-ready
                pdfWindow.webContents.once('dom-ready', () => {
                    console.log('DOM ready event received');
                    if (!resolved) {
                        resolved = true;
                        setTimeout(() => {
                            console.log('DOM ready delay complete, proceeding...');
                            resolve();
                        }, 1000); // Wait 1 second for rendering
                    }
                });
                // Fallback: resolve after max 3 seconds regardless
                setTimeout(() => {
                    if (!resolved) {
                        console.log('Timeout reached, proceeding anyway...');
                        resolved = true;
                        resolve();
                    }
                }, 3000);
            });
            console.log('Generating PDF buffer...');
            // Generate PDF immediately
            const pdfBuffer = await pdfWindow.webContents.printToPDF({
                margins: {
                    top: 0.5,
                    bottom: 0.5,
                    left: 0.5,
                    right: 0.5
                },
                printBackground: true,
                pageSize: 'A4',
                displayHeaderFooter: false,
                preferCSSPageSize: false,
                landscape: false
            });
            console.log('PDF buffer generated, size:', pdfBuffer.length, 'bytes');
            console.log('Writing PDF to file:', filePath);
            const fs = await Promise.resolve().then(() => __importStar(require('fs/promises')));
            await fs.writeFile(filePath, pdfBuffer);
            console.log('PDF file saved successfully');
            // Close window immediately after saving
            if (!pdfWindow.isDestroyed()) {
                pdfWindow.close();
            }
            return { success: true, filePath };
        }
        catch (error) {
            console.error('PDF generation error:', error);
            console.error('Error stack:', error.stack);
            // Make sure window is closed even on error
            if (!pdfWindow.isDestroyed()) {
                pdfWindow.close();
            }
            return { success: false, message: error.message };
        }
    });
    console.log('All backend handlers registered successfully');
    console.log('Registered handlers:', [
        'prediction:run',
        'prediction:history',
        'prediction:clear-cache',
        'scale:calculate',
        'pitzer:calculate',
        'report:save-pdf'
    ]);
};
exports.registerBackendHandlers = registerBackendHandlers;
