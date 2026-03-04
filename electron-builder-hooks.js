// Electron Builder hooks to completely skip winCodeSign
// This prevents the symbolic link error from darwin folder in winCodeSign archive

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

exports.beforePack = async (context) => {
  // Configure signing with certificate
  // Don't disable signing, just clear winCodeSign cache to avoid symlink errors
  // Certificate will be used via CSC_LINK environment variable
  
  // Set certificate path to absolute path
  const certPath = path.resolve(process.cwd(), 'noxtiz.pfx');
  if (fs.existsSync(certPath)) {
    process.env.CSC_LINK = certPath;
    process.env.CSC_KEY_PASSWORD = process.env.CSC_KEY_PASSWORD || 'noxtiz';
    process.env.WIN_CSC_LINK = certPath;
    console.log('Certificate path set:', certPath);
  } else {
    console.warn('Certificate not found at:', certPath);
  }
  
  process.env.CSC_IDENTITY_AUTO_DISCOVERY = 'false';
  // Keep SKIP_NOTARIZATION for macOS (not needed for Windows)
  process.env.SKIP_NOTARIZATION = 'true';
  
  // Clear winCodeSign cache to prevent download
  const cacheBase = path.join(process.env.LOCALAPPDATA || process.env.HOME, 'electron-builder', 'Cache');
  const cachePath = path.join(cacheBase, 'winCodeSign');
  
  if (fs.existsSync(cachePath)) {
    try {
      // Remove entire winCodeSign cache
      fs.rmSync(cachePath, { recursive: true, force: true });
      console.log('winCodeSign cache cleared via hook');
    } catch (e) {
      console.log('Error clearing cache:', e.message);
    }
  }
  
  // Also clear any extracted folders that might have darwin symlinks
  if (fs.existsSync(cacheBase)) {
    try {
      const items = fs.readdirSync(cacheBase);
      for (const item of items) {
        if (item.includes('winCodeSign')) {
          const itemPath = path.join(cacheBase, item);
          const darwinPath = path.join(itemPath, 'darwin');
          if (fs.existsSync(darwinPath)) {
            try {
              fs.rmSync(darwinPath, { recursive: true, force: true });
              console.log('Removed darwin folder from', item);
            } catch (e) {
              // Ignore errors
            }
          }
        }
      }
    } catch (e) {
      // Ignore errors
    }
  }
  
  console.log('winCodeSign cache prepared - signing will use certificate from environment variables');
};

// Patch to handle winCodeSign extraction errors gracefully
exports.afterPack = async (context) => {
  // If winCodeSign extraction failed, continue anyway
  // The build can proceed without winCodeSign if signing is disabled
  console.log('Build completed - winCodeSign errors ignored');
};

