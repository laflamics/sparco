# Sparco Labs – Congeal Prediction Console

A futuristic Electron + React lab console buat ngitung dan ngelog prediksi congeal oil berbasis profil **SARA**. Semua data, history, sama cache disimpen lokal di mesin lo – cocok buat operasi offline di lab produksi.

## Fitur Cepet

- **Electron + React** UI lab masa depan
- **SARA-based prediction engine** dengan insight stability, crystallization time, sama pour point
*-**Local storage** via `electron-store` (histori prediksi max 50 entri per device)
- **Node-cache** buat nge-cache hasil per kombinasi input di mesin masing-masing
- **IPC bridge** aman via preload buat komunikasi renderer ↔ main process

## Cara Jalanin

```bash
npm install
npm run dev
```

- `npm run dev` bakal ngejalanin:
  - `tsc --watch` buat compile main process ke `dist/main`
  - `vite` dev server di `http://localhost:5173`
  - Electron yang otomatis nunggu renderer siap

## Build Produksi

### Build untuk Development
```bash
npm run build          # build main + renderer
npm start              # jalanin Electron pake build hasil compile
```

Output renderer bakal ada di `dist/renderer`, sedangkan main process ketulis di `dist/main`.

### Build Aplikasi Executable (Windows)

```bash
npm run build:win      # build aplikasi jadi .exe installer + portable
```

Output bakal ada di folder `release/`:
- **Installer**: `Sparco Labs-1.0.0-x64.exe` - Installer dengan NSIS
- **Portable**: `Sparco Labs-1.0.0-portable.exe` - Aplikasi portable (tidak perlu install)

**Catatan:**
- Semua assets (logo, icon, dll) otomatis ter-copy ke build
- Icon aplikasi menggunakan `assets/sparcologo.png`
- Build menghasilkan installer dan portable version

## Struktur Penting

```
src/
  main/        # Electron main process + backend
    backend/   # Prediction service, storage, cache
    preload.ts # IPC bridge expose ke renderer
    main.ts    # Bootstrap BrowserWindow & backend handler
  renderer/    # React frontend (Vite)
    styles/    # Styling futuristik sparco
  common/      # Shared TypeScript types
```

## Catatan Tambahan

- History prediksi & state lain disimpen di `~/.config/sparco-labs` (Windows: `%APPDATA%\sparco-labs`)
- Cache otomatis bersih setelah 30 menit, tapi bisa manual clear dari sidebar tombol "Bersihin Cache Mesin"
- Konsol didesain buat offline-first, jadi gaada call keluar jaringan sama sekali.

