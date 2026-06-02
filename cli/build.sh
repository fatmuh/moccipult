#!/bin/bash
#
# build.sh — Build cross-platform moccipult CLI binaries
#
# Output:
#   dist/moccipult-windows.exe   (Windows x64)
#   dist/moccipult-linux         (Linux x64)
#   dist/moccipult-macos         (macOS x64)
#

set -e

echo "╔══════════════════════════════════════════════════╗"
echo "║    🔨 Building moccipult CLI binaries           ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

cd "$(dirname "$0")"

if [ ! -d "node_modules" ]; then
  echo "📦 Installing dependencies..."
  npm install
fi

mkdir -p dist

echo ""
echo "🏗️  Building for Windows x64..."
npx pkg . --targets node18-win-x64 --output dist/moccipult-windows.exe --compress GZip 2>&1 | tail -1
echo "   ✅ dist/moccipult-windows.exe"

echo ""
echo "🏗️  Building for Linux x64..."
npx pkg . --targets node18-linux-x64 --output dist/moccipult-linux --compress GZip 2>&1 | tail -1
echo "   ✅ dist/moccipult-linux"

echo ""
echo "🏗️  Building for macOS x64..."
npx pkg . --targets node18-macos-x64 --output dist/moccipult-macos --compress GZip 2>&1 | tail -1
echo "   ✅ dist/moccipult-macos"

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║    ✅ Build complete!                            ║"
echo "║                                                  ║"
echo "║    Windows:  dist/moccipult-windows.exe          ║"
echo "║    Linux:    dist/moccipult-linux                ║"
echo "║    macOS:    dist/moccipult-macos                ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
echo "Usage:"
echo "  ./dist/moccipult-macos config server http://your-server.com"
echo "  ./dist/moccipult-macos init"
echo ""
