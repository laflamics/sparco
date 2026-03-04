import { contextBridge, ipcRenderer } from 'electron';
import { PredictionInput, PredictionResult } from '../common/types';

console.log('[Preload] Loading Sparco preload script...');

const sparcoAPI = {
  runPrediction: (payload: PredictionInput): Promise<PredictionResult> =>
    ipcRenderer.invoke('prediction:run', payload),
  getHistory: (): Promise<PredictionResult[]> => ipcRenderer.invoke('prediction:history'),
  clearCache: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('prediction:clear-cache'),
  calculateScale: (
    payload: import('./backend/scaleService').ScaleInput
  ): Promise<import('./backend/scaleService').ScaleResult> => ipcRenderer.invoke('scale:calculate', payload),
  calculatePitzerScale: (
    payload: import('./backend/pitzerScaleService').ScaleCalculationInput
  ): Promise<import('./backend/pitzerScaleService').ScaleCalculationResult> =>
    ipcRenderer.invoke('pitzer:calculate', payload),
  saveReportPDF: (htmlContent: string): Promise<{ success: boolean; filePath?: string; message?: string }> =>
    ipcRenderer.invoke('report:save-pdf', htmlContent)
};

console.log('[Preload] Exposing Sparco API to main world...');
contextBridge.exposeInMainWorld('sparco', sparcoAPI);
console.log('[Preload] Sparco API exposed successfully');

declare global {
  interface Window {
    sparco: typeof sparcoAPI;
  }
}

