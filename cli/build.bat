@echo off
REM build.bat — Build cross-platform moccipult CLI binaries (Windows)

echo ══════════════════════════════════════════════════
echo    Building moccipult CLI binaries
echo ══════════════════════════════════════════════════
echo.

cd /d "%~dp0"

if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
)

if not exist "dist" mkdir dist

echo.
echo Building for Windows x64...
call npx pkg . --targets node18-win-x64 --output dist\moccipult-windows.exe --compress GZip
echo    Done: dist\moccipult-windows.exe

echo.
echo Building for Linux x64...
call npx pkg . --targets node18-linux-x64 --output dist\moccipult-linux --compress GZip
echo    Done: dist\moccipult-linux

echo.
echo Building for macOS x64...
call npx pkg . --targets node18-macos-x64 --output dist\moccipult-macos --compress GZip
echo    Done: dist\moccipult-macos

echo.
echo ══════════════════════════════════════════════════
echo    Build complete!
echo    Windows:  dist\moccipult-windows.exe
echo    Linux:    dist\moccipult-linux
echo    macOS:    dist\moccipult-macos
echo ══════════════════════════════════════════════════
pause
