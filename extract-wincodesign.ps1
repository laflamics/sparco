# Disable winCodeSign completely to avoid symbolic link errors
# The darwin folder in winCodeSign archive causes symlink errors on Windows
$cachePath = "$env:LOCALAPPDATA\electron-builder\Cache\winCodeSign"

# Clear cache before build
if (Test-Path $cachePath) {
    Remove-Item -Recurse -Force $cachePath -ErrorAction SilentlyContinue
    Write-Host "winCodeSign cache cleared"
}

# Also clear any extracted folders that might have darwin symlinks
$cacheBase = "$env:LOCALAPPDATA\electron-builder\Cache"
if (Test-Path $cacheBase) {
    $extractedFolders = Get-ChildItem -Path $cacheBase -Filter "*winCodeSign*" -Directory -ErrorAction SilentlyContinue
    foreach ($folder in $extractedFolders) {
        $darwinPath = Join-Path $folder.FullName "darwin"
        if (Test-Path $darwinPath) {
            Remove-Item -Recurse -Force $darwinPath -ErrorAction SilentlyContinue
            Write-Host "Removed darwin folder from $($folder.Name)"
        }
    }
}

Write-Host "winCodeSign cache prepared - build will use Windows signtool directly"
