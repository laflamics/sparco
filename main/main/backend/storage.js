"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadHistory = exports.persistResult = void 0;
const electron_store_1 = __importDefault(require("electron-store"));
const store = new electron_store_1.default({
    name: 'sparco-labs',
    defaults: {
        history: []
    }
});
const persistResult = (result) => {
    const existing = store.get('history');
    const next = [result, ...existing].slice(0, 50);
    store.set('history', next);
};
exports.persistResult = persistResult;
const loadHistory = () => {
    return store.get('history');
};
exports.loadHistory = loadHistory;
