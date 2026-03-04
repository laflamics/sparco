import type { PredictionInput, PredictionResult } from '@common/types';

declare global {
  interface Window {
    sparco: {
      runPrediction(payload: PredictionInput): Promise<PredictionResult>;
      getHistory(): Promise<PredictionResult[]>;
      clearCache(): Promise<{ ok: boolean }>;
      calculateScale(
        payload: import('../../main/backend/scaleService').ScaleInput
      ): Promise<import('../../main/backend/scaleService').ScaleResult>;
    };
  }
}

export {};

