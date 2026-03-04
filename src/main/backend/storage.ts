import Store from 'electron-store';
import { PredictionResult } from '../../common/types';

type SparcoStoreSchema = {
  history: PredictionResult[];
};

const store = new Store<SparcoStoreSchema>({
  name: 'sparco-labs',
  defaults: {
    history: []
  }
});

export const persistResult = (result: PredictionResult) => {
  const existing = store.get('history');
  const next = [result, ...existing].slice(0, 50);
  store.set('history', next);
};

export const loadHistory = (): PredictionResult[] => {
  return store.get('history');
};

