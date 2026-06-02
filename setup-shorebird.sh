#!/bin/bash
#
# setup-shorebird.sh — Setup Shorebird CLI yang ngomong ke Moccipult server
#
# Prerequisites:
#   - Git
#   - Rust (curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh)
#   - Flutter SDK
#   - Android NDK
#   - Protobuf compiler (apt install protobuf-compiler / brew install protobuf)
#
# Usage:
#   chmod +x setup-shorebird.sh
#   ./setup-shorebird.sh https://patches.yourdomain.com
#

set -e

SERVER_URL="${1:-http://localhost:3000}"
WORKSPACE="$(pwd)/shorebird-workspace"

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║    🔧 Shorebird + Moccipult Setup               ║"
echo "║                                                  ║"
echo "║    Server: $SERVER_URL"
echo "║    Workspace: $WORKSPACE"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# ─── Step 1: Check prerequisites ──────────────────
echo "━━━ Step 1/7: Cek prerequisites ━━━"

check_cmd() {
  if command -v "$1" &> /dev/null; then
    echo "  ✅ $1 ($(command -v "$1"))"
  else
    echo "  ❌ $1 NOT FOUND — install dulu!"
    echo "     $2"
    MISSING=1
  fi
}

check_cmd git       "https://git-scm.com"
check_cmd rustc     "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
check_cmd cargo     "Part of Rust toolchain"
check_cmd flutter   "https://flutter.dev/docs/get-started/install"
check_cmd protoc    "apt install protobuf-compiler OR brew install protobuf"
check_cmd dart      "Part of Flutter SDK"

if [ -n "$MISSING" ]; then
  echo ""
  echo "❌ Ada prerequisites yang belum terinstall. Install dulu lalu jalankan ulang."
  exit 1
fi

echo ""

# ─── Step 2: Create workspace ─────────────────────
echo "━━━ Step 2/7: Buat workspace ━━━"
mkdir -p "$WORKSPACE"
cd "$WORKSPACE"
echo "  ✅ Workspace: $WORKSPACE"
echo ""

# ─── Step 3: Clone repos ──────────────────────────
echo "━━━ Step 3/7: Clone Shorebird repos ━━━"
echo "  (Ini bisa lama, sabar ya...)"

if [ ! -d "shorebird" ]; then
  echo "  📥 Cloning shorebird CLI..."
  git clone --depth 1 https://github.com/shorebirdtech/shorebird.git
else
  echo "  ✅ shorebird/ sudah ada, skip clone"
fi

if [ ! -d "updater" ]; then
  echo "  📥 Cloning updater..."
  git clone --depth 1 https://github.com/shorebirdtech/updater.git
else
  echo "  ✅ updater/ sudah ada, skip clone"
fi

echo ""

# ─── Step 4: Patch URLs ───────────────────────────
echo "━━━ Step 4/7: Patch URL ke Moccipult server ━━━"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PATCH_SCRIPT="$SCRIPT_DIR/patch_repos.py"

if [ ! -f "$PATCH_SCRIPT" ]; then
  echo "  ❌ patch_repos.py tidak ditemukan di $SCRIPT_DIR"
  echo "     Pastikan script ini ada di root project Moccipult."
  exit 1
fi

python3 "$PATCH_SCRIPT" \
  --shorebird-path "$WORKSPACE/shorebird" \
  --updater-path "$WORKSPACE/updater" \
  --target-url "$SERVER_URL"

echo ""

# ─── Step 5: Build updater (Rust) ─────────────────
echo "━━━ Step 5/7: Build updater (Rust) ━━━"

cd "$WORKSPACE/updater"
echo "  🔨 Building updater..."
cargo build --release 2>&1 | tail -5
echo "  ✅ Updater built"
echo ""

# ─── Step 6: Build Shorebird CLI (Dart) ───────────
echo "━━━ Step 6/7: Build Shorebird CLI ━━━"

cd "$WORKSPACE/shorebird"

# Shorebird CLI adalah Dart package
echo "  📦 Getting dependencies..."
dart pub get 2>&1 | tail -3

echo "  🔨 Compiling shorebird CLI..."
dart compile exe bin/shorebird.dart -o shorebird 2>&1 | tail -3
echo "  ✅ shorebird CLI built: $WORKSPACE/shorebird/shorebird"
echo ""

# ─── Step 7: Test ─────────────────────────────────
echo "━━━ Step 7/7: Test koneksi ke server ━━━"

cd "$WORKSPACE/shorebird"
./shorebird --version 2>&1 || echo "  (version check skipped)"

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║    ✅ SETUP SELESAI!                             ║"
echo "║                                                  ║"
echo "║    CLI location: $WORKSPACE/shorebird/shorebird"
echo "║    Server: $SERVER_URL"
echo "║                                                  ║"
echo "║    Langkah selanjutnya:                          ║"
echo "║                                                  ║"
echo "║    1. cd $WORKSPACE/shorebird"
echo "║    2. ./shorebird login                         ║"
echo "║    3. cd /path/to/flutter/app                   ║"
echo "║    4. shorebird release android                 ║"
echo "║    5. Fix bug                                   ║"
echo "║    6. shorebird patch android                   ║"
echo "╚══════════════════════════════════════════════════╝"
