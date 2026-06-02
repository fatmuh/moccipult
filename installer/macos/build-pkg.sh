#!/bin/bash
# Build .pkg installer for macOS
#
# Usage: ./build-pkg.sh [version] [binary-path] [arch]
#
VERSION="${1:-1.0.0}"
BINARY_PATH="${2:-moccipult-macos}"
ARCH="${3:-x86_64}"
PKG_NAME="moccipult-${VERSION}-macos-${ARCH}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "🔧 Building .pkg: $PKG_NAME"

STAGING="/tmp/$PKG_NAME-staging"
rm -rf "$STAGING"
mkdir -p "$STAGING/usr/local/bin"

# Copy binary
cp "$BINARY_PATH" "$STAGING/usr/local/bin/moccipult"
chmod +x "$STAGING/usr/local/bin/moccipult"

OUTPUT_DIR="$SCRIPT_DIR/output"
mkdir -p "$OUTPUT_DIR"

# Build .pkg
pkgbuild \
  --root "$STAGING" \
  --identifier com.moccipult.cli \
  --version "$VERSION" \
  --install-location / \
  --scripts "$SCRIPT_DIR/scripts" \
  "$OUTPUT_DIR/$PKG_NAME.pkg"

# Cleanup
rm -rf "$STAGING"

echo "✅ Built: $OUTPUT_DIR/$PKG_NAME.pkg"
