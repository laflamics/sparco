import { ipcMain, dialog, BrowserWindow } from 'electron';
import { PredictionInput, PredictionResult } from '../../common/types';
import { PredictionService } from './predictionService';
import { ScaleInput, ScaleService } from './scaleService';
import {
  calculateScalePrediction,
  type ScaleCalculationInput,
  type ScaleCalculationResult
} from './pitzerScaleService';

const predictionService = new PredictionService();
const scaleService = new ScaleService();

export const registerBackendHandlers = () => {
  console.log('Registering backend handlers...');
  
  ipcMain.handle('prediction:run', async (_event, payload: PredictionInput) => {
    return predictionService.runPrediction(payload);
  });

  ipcMain.handle('prediction:history', async () => {
    return predictionService.getHistory();
  });

  ipcMain.handle('prediction:clear-cache', async () => {
    predictionService.clearCache();
    return { ok: true };
  });

  ipcMain.handle('scale:calculate', async (_event, payload: ScaleInput) => {
    return scaleService.calculate(payload);
  });

  ipcMain.handle('pitzer:calculate', async (_event, payload: ScaleCalculationInput) => {
    try {
      console.log('pitzer:calculate called with payload:', JSON.stringify(payload, null, 2));
      const result = calculateScalePrediction(payload);
      console.log('pitzer:calculate result:', JSON.stringify(result, null, 2));
      return result;
    } catch (error) {
      console.error('Error in pitzer:calculate:', error);
      throw error;
    }
  });

  ipcMain.handle('report:save-pdf', async (_event, htmlContent: string) => {
    const window = BrowserWindow.getFocusedWindow();
    if (!window) {
      throw new Error('No active window');
    }

    const { canceled, filePath } = await dialog.showSaveDialog(window, {
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

    const pdfWindow = new BrowserWindow({
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
      if (typeof message === 'string' && (
        message.includes('Autofill') || 
        message.includes('Protocol') || 
        message.includes("wasn't found")
      )) {
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
      await new Promise<void>((resolve) => {
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
      
      const fs = await import('fs/promises');
      await fs.writeFile(filePath, pdfBuffer);
      
      console.log('PDF file saved successfully');
      
      // Close window immediately after saving
      if (!pdfWindow.isDestroyed()) {
        pdfWindow.close();
      }
      
      return { success: true, filePath };
    } catch (error) {
      console.error('PDF generation error:', error);
      console.error('Error stack:', (error as Error).stack);
      // Make sure window is closed even on error
      if (!pdfWindow.isDestroyed()) {
        pdfWindow.close();
      }
      return { success: false, message: (error as Error).message };
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

