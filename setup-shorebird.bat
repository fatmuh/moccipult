@echo off
REM setup-shorebird.bat — Setup Shorebird CLI yang ngomong ke Moccipult server (Windows)
REM
REM Prerequisites:
REM   - Git (https://git-scm.com)
REM   - Rust (https://rustup.rs)
REM   - Flutter SDK (https://flutter.dev)
REM   - Protobuf (https://github.com/protocolbuffers/protobuf/releases)
REM   - Python 3
REM
REM Usage:
REM   setup-shorebird.bat https://patches.yourdomain.com

setlocal enabledelayedexpansion

set "SERVER_URL=%~1"
if "%SERVER_URL%"=="" set "SERVER_URL=http://localhost:3000"
set "WORKSPACE=%cd%\shorebird-workspace"

echo.
echo ══════════════════════════════════════════════════
echo    Shorebird + Moccipult Setup (Windows)
echo    Server: %SERVER_URL%
echo    Workspace: %WORKSPACE%
echo ══════════════════════════════════════════════════
echo.

REM ─── Check prerequisites ───
echo --- Step 1/7: Cek prerequisites ---

where git >nul 2>&1 && (echo   OK git) || (echo   MISSING git & set MISSING=1)
where rustc >nul 2>&1 && (echo   OK rustc) || (echo   MISSING rustc - install dari https://rustup.rs & set MISSING=1)
where cargo >nul 2>&1 && (echo   OK cargo) || (echo   MISSING cargo & set MISSING=1)
where flutter >nul 2>&1 && (echo   OK flutter) || (echo   MISSING flutter & set MISSING=1)
where dart >nul 2>&1 && (echo   OK dart) || (echo   MISSING dart & set MISSING=1)
where protoc >nul 2>&1 && (echo   OK protoc) || (echo   MISSING protoc & set MISSING=1)
where python >nul 2>&1 && (echo   OK python) || (where python3 >nul 2>&1 && (echo   OK python3) || (echo   MISSING python & set MISSING=1))

if defined MISSING (
    echo.
    echo Ada prerequisites yang belum terinstall. Install dulu lalu jalankan ulang.
    pause
    exit /b 1
)
echo.

REM ─── Create workspace ───
echo --- Step 2/7: Buat workspace ---
if not exist "%WORKSPACE%" mkdir "%WORKSPACE%"
echo   Workspace: %WORKSPACE%
echo.

REM ─── Clone repos ───
echo --- Step 3/7: Clone Shorebird repos ---

if not exist "%WORKSPACE%\shorebird" (
    echo   Cloning shorebird CLI...
    git clone --depth 1 https://github.com/shorebirdtech/shorebird.git "%WORKSPACE%\shorebird"
) else (
    echo   shorebird/ sudah ada, skip clone
)

if not exist "%WORKSPACE%\updater" (
    echo   Cloning updater...
    git clone --depth 1 https://github.com/shorebirdtech/updater.git "%WORKSPACE%\updater"
) else (
    echo   updater/ sudah ada, skip clone
)
echo.

REM ─── Patch URLs ───
echo --- Step 4/7: Patch URL ke Moccipult server ---

python patch_repos.py --shorebird-path "%WORKSPACE%\shorebird" --updater-path "%WORKSPACE%\updater" --target-url "%SERVER_URL%"
if errorlevel 1 (
    echo   Patch gagal! Cek error di atas.
    pause
    exit /b 1
)
echo.

REM ─── Build updater ───
echo --- Step 5/7: Build updater (Rust) ---
cd /d "%WORKSPACE%\updater"
echo   Building updater...
cargo build --release
if errorlevel 1 (
    echo   Build updater gagal! Cek Rust toolchain.
    pause
    exit /b 1
)
echo   OK updater built
echo.

REM ─── Build CLI ───
echo --- Step 6/7: Build Shorebird CLI ---
cd /d "%WORKSPACE%\shorebird"
echo   Getting dependencies...
call dart pub get
echo   Compiling shorebird CLI...
dart compile exe bin/shorebird.dart -o shorebird.exe
if errorlevel 1 (
    echo   Build CLI gagal! Cek Dart/Flutter setup.
    pause
    exit /b 1
)
echo   OK shorebird.exe built
echo.

REM ─── Done ───
echo ══════════════════════════════════════════════════
echo    SETUP SELESAI!
echo
echo    CLI: %WORKSPACE%\shorebird\shorebird.exe
echo    Server: %SERVER_URL%
echo
echo    Langkah selanjutnya:
echo    1. cd %WORKSPACE%\shorebird
echo    2. shorebird.exe login
echo    3. cd \path\to\flutter\app
echo    4. shorebird.exe release android
echo    5. Fix bug
echo    6. shorebird.exe patch android
echo ══════════════════════════════════════════════════
pause
