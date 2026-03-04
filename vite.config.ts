import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  root: resolve(__dirname, 'src', 'renderer'),
  base: './', // Use relative paths for Electron production builds
  plugins: [react()],
  server: {
    port: 5173,
    host: 'localhost'
  },
  build: {
    outDir: resolve(__dirname, 'dist', 'renderer'),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        assetFileNames: (assetInfo) => {
          // Preserve assets folder structure
          if (assetInfo.name && assetInfo.name.endsWith('.png')) {
            return 'assets/[name][extname]';
          }
          if (assetInfo.name && assetInfo.name.endsWith('.gif')) {
            return '[name][extname]';
          }
          return 'assets/[name]-[hash][extname]';
        }
      }
    }
  },
  resolve: {
    alias: {
      '@renderer': resolve(__dirname, 'src', 'renderer'),
      '@common': resolve(__dirname, 'src', 'common')
    }
  }
});

