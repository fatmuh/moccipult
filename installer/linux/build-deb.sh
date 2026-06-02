#!/bin/bash
# Build .deb package for Moccipult
#
# Usage: ./build-deb.sh [version] [binary-path]
#
VERSION="${1:-1.0.0}"
BINARY_PATH="${2:-moccipult-linux}"
ARCH="amd64"
PKG_NAME="moccipult_${VERSION}_${ARCH}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "🔧 Building .deb package: $PKG_NAME"

# Create package structure
rm -rf "/tmp/$PKG_NAME"
mkdir -p "/tmp/$PKG_NAME/DEBIAN"
mkdir -p "/tmp/$PKG_NAME/usr/local/bin"
mkdir -p "/tmp/$PKG_NAME/usr/share/doc/moccipult"
mkdir -p "/tmp/$PKG_NAME/etc/profile.d"

# Copy binary
cp "$BINARY_PATH" "/tmp/$PKG_NAME/usr/local/bin/moccipult"
chmod +x "/tmp/$PKG_NAME/usr/local/bin/moccipult"

# Control file
cat > "/tmp/$PKG_NAME/DEBIAN/control" << EOF
Package: moccipult
Version: ${VERSION}
Section: devel
Priority: optional
Architecture: ${ARCH}
Depends: libc6 (>= 2.31)
Maintainer: Moccipult <noreply@moccipult.dev>
Description: Moccipult — Self-hosted code push for Flutter
 Self-hosted alternative to Shorebird. Push Flutter code updates
 directly to user devices without going through app stores.
Homepage: https://github.com/fatmuh/moccipult
EOF

# Post-install: set permissions
cat > "/tmp/$PKG_NAME/DEBIAN/postinst" << 'EOF'
#!/bin/bash
chmod +x /usr/local/bin/moccipult
echo ""
echo "  ✅ Moccipult installed!"
echo "  Run: moccipult status"
echo ""
EOF
chmod 755 "/tmp/$PKG_NAME/DEBIAN/postinst"

# Pre-remove
cat > "/tmp/$PKG_NAME/DEBIAN/prerm" << 'EOF'
#!/bin/bash
# Nothing special needed
EOF
chmod 755 "/tmp/$PKG_NAME/DEBIAN/prerm"

# README
cat > "/tmp/$PKG_NAME/usr/share/doc/moccipult/README" << EOF
Moccipult ${VERSION}
==================

Self-hosted code push for Flutter apps.

Usage:
  moccipult config server https://your-server.com
  moccipult init
  moccipult status

Full docs: https://github.com/fatmuh/moccipult
EOF

# Build .deb
cd /tmp
dpkg-deb --build "$PKG_NAME"
mkdir -p "$SCRIPT_DIR/output"
mv "/tmp/$PKG_NAME.deb" "$SCRIPT_DIR/output/$PKG_NAME.deb"
rm -rf "/tmp/$PKG_NAME"

echo "✅ Built: $SCRIPT_DIR/output/$PKG_NAME.deb"
