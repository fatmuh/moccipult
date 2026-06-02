@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul 2>&1

echo.
echo   ███╗   ███╗ ██████╗ ██████╗███████╗███╗   ██╗██████╗ ███████╗██████╗
echo   ████╗ ████║██╔═══██╗██╔════╝██╔════╝████╗  ██║██╔══██╗██╔════╝██╔══██╗
echo   ██╔████╔██║██║   ██║██║     ███████╗██╔██╗ ██║██║  ██║█████╗  ██║  ██║
echo   ██║╚██╔╝██║██║   ██║██║     ╚════██║██║╚██╗██║██║  ██║██╔══╝  ██║  ██║
echo   ██║ ╚═╝ ██║╚██████╔╝╚██████╗███████║██║ ╚████║██████╔╝███████╗██████╔╝
echo   ╚═╝     ╚═╝ ╚═════╝  ╚═════╝╚══════╝╚═╝  ╚═══╝╚═════╝ ╚══════╝╚═════╝
echo.
echo   All-in-One Installer v1.0
echo.

set "SERVER_URL=%~1"
set "MOCCIPULT_HOME=%USERPROFILE%\.moccipult"
set "MOCCIPULT_BIN=%MOCCIPULT_HOME%\bin"
set "SHOREBIRD_WS=%MOCCIPULT_HOME%\shorebird-workspace"

REM ─── Ask server URL ───
if "%SERVER_URL%"=="" (
    set /p "SERVER_URL=  Masukkan URL Moccipult server kamu: "
)
if "%SERVER_URL%"=="" (
    echo   URL server tidak boleh kosong!
    pause
    exit /b 1
)
echo   ✅ Server URL: %SERVER_URL%
echo.

REM ─── Step 1: Create directories ───
echo   ━━━ Step 1/8: Setup direktori ━━━
if not exist "%MOCCIPULT_HOME%" mkdir "%MOCCIPULT_HOME%"
if not exist "%MOCCIPULT_BIN%" mkdir "%MOCCIPULT_BIN%"
if not exist "%SHOREBIRD_WS%" mkdir "%SHOREBIRD_WS%"
echo   ✅ Direktori: %MOCCIPULT_HOME%
echo.

REM ─── Step 2: Check & install prerequisites ───
echo   ━━━ Step 2/8: Cek prerequisites ━━━

REM Git
where git >nul 2>&1 && (
    echo   ✅ Git sudah ada
) || (
    echo   ❌ Git belum ada — download dari https://git-scm.com
    echo   Install dulu, lalu jalankan ulang installer ini.
    pause
    exit /b 1
)

REM Rust
where cargo >nul 2>&1 && (
    echo   ✅ Rust sudah ada
) || (
    echo   📥 Installing Rust...
    echo   Download dari https://rustup.rs dalam 5 detik...
    timeout /t 5 /nobreak >nul
    start https://rustup.rs
    echo.
    echo   Install Rust, RESTART terminal, lalu jalankan ulang installer ini.
    pause
    exit /b 1
)

REM Flutter
where flutter >nul 2>&1 && (
    echo   ✅ Flutter sudah ada
) || (
    echo   📥 Installing Flutter...
    echo   Download dari https://flutter.dev dalam 5 detik...
    timeout /t 5 /nobreak >nul
    start https://flutter.dev/docs/get-started/install/windows
    echo.
    echo   Install Flutter, tambah ke PATH, lalu jalankan ulang installer ini.
    pause
    exit /b 1
)

REM Protobuf
where protoc >nul 2>&1 && (
    echo   ✅ Protobuf sudah ada
) || (
    echo   ⚠️  Protobuf belum ada — install via: choco install protobuf atau download dari github
    echo   Continuing anyway, might fail at Shorebird build...
)

REM Node.js
where node >nul 2>&1 && (
    echo   ✅ Node.js sudah ada
) || (
    echo   ❌ Node.js belum ada — download dari https://nodejs.org
    echo   Install dulu, lalu jalankan ulang installer ini.
    pause
    exit /b 1
)

echo.

REM ─── Step 3: Clone Moccipult ───
echo   ━━━ Step 3/8: Download Moccipult ━━━
if exist "%MOCCIPULT_HOME%\repo" (
    echo   ✅ Repo sudah ada, pulling latest...
    cd /d "%MOCCIPULT_HOME%\repo"
    git pull --ff-only 2>nul || echo   ⚠️  Ga bisa pull, pakai versi yang ada
) else (
    echo   📥 Cloning Moccipult repo...
    git clone --depth 1 https://github.com/fatmuh/moccipult.git "%MOCCIPULT_HOME%\repo"
)
echo   ✅ Done
echo.

REM ─── Step 4: Build Moccipult CLI ───
echo   ━━━ Step 4/8: Build Moccipult CLI ━━━
cd /d "%MOCCIPULT_HOME%\repo\cli"
call npm install --silent 2>nul
echo   📦 Building binary...
call npx pkg . --targets node18-win-x64 --output "%MOCCIPULT_BIN%\moccipult.exe" --compress GZip 2>nul
if not exist "%MOCCIPULT_BIN%\moccipult.exe" (
    echo   ⚠️  pkg build gagal, membuat wrapper .bat...
    echo @echo off > "%MOCCIPULT_BIN%\moccipult.bat"
    echo node "%MOCCIPULT_HOME%\repo\cli\bin\moccipult.js" %%* >> "%MOCCIPULT_BIN%\moccipult.bat"
)
echo   ✅ Moccipult CLI → %MOCCIPULT_BIN%\moccipult.exe
echo.

REM ─── Step 5: Clone Shorebird ───
echo   ━━━ Step 5/8: Clone Shorebird ━━━
if not exist "%SHOREBIRD_WS%\shorebird" (
    echo   📥 Cloning Shorebird CLI (ini bisa lama)...
    git clone --depth 1 https://github.com/shorebirdtech/shorebird.git "%SHOREBIRD_WS%\shorebird"
) else (
    echo   ✅ Shorebird CLI sudah ada
)
if not exist "%SHOREBIRD_WS%\updater" (
    echo   📥 Cloning Shorebird updater...
    git clone --depth 1 https://github.com/shorebirdtech/updater.git "%SHOREBIRD_WS%\updater"
) else (
    echo   ✅ Shorebird updater sudah ada
)

echo   🔧 Patching URLs ke %SERVER_URL% ...
cd /d "%MOCCIPULT_HOME%\repo"
python patch_repos.py --shorebird-path "%SHOREBIRD_WS%\shorebird" --updater-path "%SHOREBIRD_WS%\updater" --target-url "%SERVER_URL%" 2>nul || python3 patch_repos.py --shorebird-path "%SHOREBIRD_WS%\shorebird" --updater-path "%SHOREBIRD_WS%\updater" --target-url "%SERVER_URL%"
echo   ✅ URLs patched
echo.

REM ─── Step 6: Build Shorebird ───
echo   ━━━ Step 6/8: Build Shorebird ━━━
echo   🔨 Building updater (Rust)...
cd /d "%SHOREBIRD_WS%\updater"
cargo build --release 2>&1 | findstr /C:"Compiling" /C:"Finished" /C:"error"
echo   ✅ Updater built

echo   🔨 Building Shorebird CLI...
cd /d "%SHOREBIRD_WS%\shorebird"
call dart pub get 2>nul
dart compile exe bin/shorebird.dart -o "%MOCCIPULT_BIN%\shorebird.exe" 2>&1 | findstr /C:"Generated" /C:"Error" /C:"error"
if exist "%MOCCIPULT_BIN%\shorebird.exe" (
    echo   ✅ Shorebird CLI → %MOCCIPULT_BIN%\shorebird.exe
) else (
    echo   ⚠️  Shorebird build gagal — cek Dart/Flutter setup
)
echo.

REM ─── Step 7: Add to PATH ───
echo   ━━━ Step 7/8: Tambah ke PATH ━━━

REM Add to user PATH permanently (Windows)
set "CURRENT_PATH="
for /f "tokens=2*" %%a in ('reg query "HKCU\Environment" /v Path 2^>nul') do set "CURRENT_PATH=%%b"

if defined CURRENT_PATH (
    echo %CURRENT_PATH% | findstr /i /c:"%MOCCIPULT_BIN%" >nul 2>&1 || (
        setx PATH "%CURRENT_PATH%;%MOCCIPULT_BIN%" >nul 2>&1
        echo   ✅ Ditambahkan ke user PATH
    )
) else (
    setx PATH "%MOCCIPULT_BIN%" >nul 2>&1
    echo   ✅ PATH dibuat
)

REM Current session
set "PATH=%MOCCIPULT_BIN%;%PATH%"
echo   ✅ PATH updated untuk session ini
echo.

REM ─── Step 8: Configure & Test ───
echo   ━━━ Step 8/8: Konfigurasi ━━━
"%MOCCIPULT_BIN%\moccipult.exe" config server %SERVER_URL% 2>nul || echo   (config set skipped)
echo   ✅ Server URL configured: %SERVER_URL%
echo.

REM ─── Summary ───
echo.
echo   ╔══════════════════════════════════════════════════╗
echo   ║    ✅ INSTALL SELESAI!                          ║
echo   ╚══════════════════════════════════════════════════╝
echo.
echo   Installed:
echo     moccipult  → %MOCCIPULT_BIN%\moccipult.exe
echo     shorebird  → %MOCCIPULT_BIN%\shorebird.exe
echo.
echo   Server:  %SERVER_URL%
echo.
echo   Langkah selanjutnya:
echo.
echo     1. TUTUP dan BUKA ULANG terminal/CMD
echo.
echo     2. Cek instalasi:
echo        moccipult status
echo.
echo     3. Pergi ke folder Flutter app kamu:
echo        cd C:\path\to\my-flutter-app
echo.
echo     4. Login Shorebird (sekali saja):
echo        shorebird login
echo.
echo     5. Build release pertama:
echo        shorebird release android
echo.
echo     6. Setiap ada bug fix:
echo        shorebird patch android
echo.
echo   Uninstall: hapus folder %MOCCIPULT_HOME%
echo              hapus %MOCCIPULT_BIN% dari PATH di System Environment Variables
echo.
pause
