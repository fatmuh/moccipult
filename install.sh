#!/usr/bin/env bash
#
#  ██████╗  ██████╗ ███╗   ██╗██╗███████╗██╗███████╗ ██████╗ ██╗   ██╗███╗   ██╗████████╗
# ██║ ╚████║████╔══╝ ████╗  ██║██║██╔════╝██║██╔════╝██╔═══██╗██║   ██║████╗  ██║╚══██╔══╝
# ██║  ╚███║███████╗██╔██╗ ██║██║███████╗██║███████╗██║   ██║██║   ██║██╔██╗ ██║   ██║   
# ██║  ██╔══╝╚════██║██║╚██╗██║██║╚════██║██║╚════██║██║   ██║██║   ██║██║╚██╗██║   ██║   
# ╚█████╔╝███████╔╝██║ ╚████║██║███████╔╝██║███████║╚██████╔╝╚██████╔╝██║ ╚████║   ██║   
#  ╚════╝ ╚══════╝ ╚═╝  ╚═══╝╚═╝╚══════╝ ╚═╝╚══════╝ ╚═════╝  ╚═════╝ ╚═╝  ╚═══╝   ╚═╝   
#
# Moccipult All-in-One Installer
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/fatmuh/moccipult/master/install.sh | bash -s https://patches.yourdomain.com
#
#   Or:
#   chmod +x install.sh
#   ./install.sh https://patches.yourdomain.com
#

set -e

SERVER_URL="${1:-}"
INTERACTIVE=true

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
DIM='\033[2m'
BOLD='\033[1m'
NC='\033[0m'

print_banner() {
  echo ""
  echo -e "${CYAN}  ███╗   ███╗ ██████╗ ██████╗███████╗███╗   ██╗██████╗ ███████╗██████╗ ${NC}"
  echo -e "${CYAN}  ████╗ ████║██╔═══██╗██╔════╝██╔════╝████╗  ██║██╔══██╗██╔════╝██╔══██╗${NC}"
  echo -e "${CYAN}  ██╔████╔██║██║   ██║██║     ███████╗██╔██╗ ██║██║  ██║█████╗  ██║  ██║${NC}"
  echo -e "${CYAN}  ██║╚██╔╝██║██║   ██║██║     ╚════██║██║╚██╗██║██║  ██║██╔══╝  ██║  ██║${NC}"
  echo -e "${CYAN}  ██║ ╚═╝ ██║╚██████╔╝╚██████╗███████║██║ ╚████║██████╔╝███████╗██████╔╝${NC}"
  echo -e "${CYAN}  ╚═╝     ╚═╝ ╚═════╝  ╚═════╝╚══════╝╚═╝  ╚═══╝╚═════╝ ╚══════╝╚═════╝${NC}"
  echo ""
  echo -e "  ${BOLD}All-in-One Installer${NC} ${DIM}v1.0${NC}"
  echo ""
}

print_step() {
  echo ""
  echo -e "  ${BOLD}${CYAN}━━━ $1 ━━━${NC}"
  echo ""
}

ok()   { echo -e "  ${GREEN}✅ $1${NC}"; }
fail() { echo -e "  ${RED}❌ $1${NC}"; }
info() { echo -e "  ${CYAN}ℹ️  $1${NC}"; }
warn() { echo -e "  ${YELLOW}⚠️  $1${NC}"; }
dim()  { echo -e "  ${DIM}$1${NC}"; }

# ─── Detect OS ────────────────────────────────────────────────────────────
detect_os() {
  OS="$(uname -s)"
  case "$OS" in
    Linux*)  PLATFORM=linux; SHELL_RC="$HOME/.bashrc" ;;
    Darwin*) PLATFORM=macos;  SHELL_RC="$HOME/.zshrc" ;;
    MINGW*|MSYS*|CYGWIN*) PLATFORM=windows; SHELL_RC="" ;;
    *)       PLATFORM=unknown; SHELL_RC="$HOME/.bashrc" ;;
  esac

  if [ "$PLATFORM" = "macos" ] && [ ! -f "$HOME/.zshrc" ]; then
    SHELL_RC="$HOME/.bashrc"
  fi

  info "OS: $OS ($PLATFORM)"
  info "Shell RC: $SHELL_RC"
}

# ─── Ask server URL if not provided ───────────────────────────────────────
ask_server_url() {
  if [ -z "$SERVER_URL" ]; then
    echo ""
    echo -ne "  ${BOLD}Masukkan URL Moccipult server kamu:${NC} "
    read -r SERVER_URL
  fi

  # Remove trailing slash
  SERVER_URL="${SERVER_URL%/}"

  if [ -z "$SERVER_URL" ]; then
    fail "URL server tidak boleh kosong!"
    exit 1
  fi

  ok "Server URL: $SERVER_URL"
}

# ─── Install directory ───────────────────────────────────────────────────
MOCCIPULT_HOME="$HOME/.moccipult"
MOCCIPULT_BIN="$MOCCIPULT_HOME/bin"
SHOREBIRD_WS="$MOCCIPULT_HOME/shorebird-workspace"

# ─── Step 1: Create directories ──────────────────────────────────────────
setup_dirs() {
  print_step "Step 1/8: Setup direktori"
  mkdir -p "$MOCCIPULT_HOME"
  mkdir -p "$MOCCIPULT_BIN"
  mkdir -p "$SHOREBIRD_WS"
  ok "Direktori dibuat di $MOCCIPULT_HOME"
}

# ─── Step 2: Install Homebrew (macOS) ────────────────────────────────────
install_homebrew() {
  if [ "$PLATFORM" = "macos" ] && ! command -v brew &> /dev/null; then
    print_step "Step 2/8: Install Homebrew"
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    ok "Homebrew installed"
  fi
}

# ─── Step 3: Install prerequisites ──────────────────────────────────────
install_prerequisites() {
  print_step "Step 2/8: Install prerequisites"

  # Git
  if command -v git &> /dev/null; then
    ok "Git sudah ada ($(git --version 2>&1))"
  else
    info "Installing Git..."
    if [ "$PLATFORM" = "macos" ]; then
      xcode-select --install 2>/dev/null || true
    elif [ "$PLATFORM" = "linux" ]; then
      sudo apt-get update -qq && sudo apt-get install -y -qq git || sudo yum install -y git
    fi
    ok "Git installed"
  fi

  # Rust
  if command -v cargo &> /dev/null; then
    ok "Rust sudah ada ($(rustc --version 2>&1))"
  else
    info "Installing Rust..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source "$HOME/.cargo/env" 2>/dev/null || true
    ok "Rust installed ($(rustc --version 2>&1))"
  fi

  # Protobuf
  if command -v protoc &> /dev/null; then
    ok "Protobuf sudah ada ($(protoc --version 2>&1))"
  else
    info "Installing Protobuf..."
    if [ "$PLATFORM" = "macos" ]; then
      brew install protobuf
    elif [ "$PLATFORM" = "linux" ]; then
      sudo apt-get install -y -qq protobuf-compiler || sudo yum install -y protobuf-compiler
    fi
    ok "Protobuf installed"
  fi

  # Python 3
  if command -v python3 &> /dev/null; then
    ok "Python3 sudah ada ($(python3 --version 2>&1))"
  elif command -v python &> /dev/null; then
    ok "Python sudah ada ($(python --version 2>&1))"
  else
    info "Installing Python3..."
    if [ "$PLATFORM" = "macos" ]; then
      brew install python3
    elif [ "$PLATFORM" = "linux" ]; then
      sudo apt-get install -y -qq python3 || sudo yum install -y python3
    fi
    ok "Python3 installed"
  fi

  # Flutter
  if command -v flutter &> /dev/null; then
    ok "Flutter sudah ada ($(flutter --version 2>&1 | head -1))"
  else
    info "Installing Flutter..."
    if [ "$PLATFORM" = "macos" ]; then
      brew install --cask flutter
    elif [ "$PLATFORM" = "linux" ]; then
      git clone https://github.com/flutter/flutter.git -b stable "$HOME/flutter" --depth 1
      echo 'export PATH="$HOME/flutter/bin:$PATH"' >> "$SHELL_RC"
      export PATH="$HOME/flutter/bin:$PATH"
    fi
    ok "Flutter installed"
  fi
}

# ─── Step 4: Clone Moccipult ─────────────────────────────────────────────
clone_moccipult() {
  print_step "Step 3/8: Download Moccipult"

  if [ -d "$MOCCIPULT_HOME/repo" ]; then
    ok "Repo sudah ada, pulling latest..."
    cd "$MOCCIPULT_HOME/repo"
    git pull --ff-only 2>/dev/null || warn "Ga bisa pull, pakai versi yang ada"
  else
    info "Cloning Moccipult repo..."
    git clone --depth 1 https://github.com/fatmuh/moccipult.git "$MOCCIPULT_HOME/repo"
  fi
  ok "Moccipult repo ready"
}

# ─── Step 5: Build Moccipult CLI ────────────────────────────────────────
build_moccipult_cli() {
  print_step "Step 4/8: Build Moccipult CLI"

  cd "$MOCCIPULT_HOME/repo/cli"
  npm install --silent 2>/dev/null
  ok "Dependencies installed"

  info "Building binary..."
  npx pkg . --targets "node18-$(uname -m)-$(uname -s | tr '[:upper:]' '[:lower:]')" --output "$MOCCIPULT_BIN/moccipult" --compress GZip 2>/dev/null

  # Fallback: just use the .js directly with a wrapper
  if [ ! -f "$MOCCIPULT_BIN/moccipult" ]; then
    warn "pkg build gagal, membuat wrapper script..."
    cat > "$MOCCIPULT_BIN/moccipult" << 'WRAPPER'
#!/bin/bash
exec node "$(dirname "$0")/../repo/cli/bin/moccipult.js" "$@"
WRAPPER
    chmod +x "$MOCCIPULT_BIN/moccipult"
  fi

  chmod +x "$MOCCIPULT_BIN/moccipult"
  ok "Moccipult CLI → $MOCCIPULT_BIN/moccipult"
}

# ─── Step 6: Clone & Patch Shorebird ────────────────────────────────────
setup_shorebird() {
  print_step "Step 5/8: Clone & Patch Shorebird"

  # Clone
  if [ ! -d "$SHOREBIRD_WS/shorebird" ]; then
    info "Cloning Shorebird CLI (ini bisa lama)..."
    git clone --depth 1 https://github.com/shorebirdtech/shorebird.git "$SHOREBIRD_WS/shorebird"
  else
    ok "Shorebird CLI sudah ada"
  fi

  if [ ! -d "$SHOREBIRD_WS/updater" ]; then
    info "Cloning Shorebird updater..."
    git clone --depth 1 https://github.com/shorebirdtech/updater.git "$SHOREBIRD_WS/updater"
  else
    ok "Shorebird updater sudah ada"
  fi

  # Patch
  info "Patching URLs ke $SERVER_URL ..."
  cd "$MOCCIPULT_HOME/repo"

  PYTHON_CMD="python3"
  command -v python3 &> /dev/null || PYTHON_CMD="python"

  $PYTHON_CMD patch_repos.py \
    --shorebird-path "$SHOREBIRD_WS/shorebird" \
    --updater-path "$SHOREBIRD_WS/updater" \
    --target-url "$SERVER_URL" 2>&1 | tail -5

  ok "URLs patched ke $SERVER_URL"
}

# ─── Step 7: Build Shorebird ────────────────────────────────────────────
build_shorebird() {
  print_step "Step 6/8: Build Shorebird"

  # Build updater
  info "Building updater (Rust)..."
  cd "$SHOREBIRD_WS/updater"
  cargo build --release 2>&1 | tail -3
  ok "Updater built"

  # Build CLI
  info "Building Shorebird CLI (Dart)..."
  cd "$SHOREBIRD_WS/shorebird"
  dart pub get 2>&1 | tail -2
  dart compile exe bin/shorebird.dart -o "$MOCCIPULT_BIN/shorebird" 2>&1 | tail -2
  chmod +x "$MOCCIPULT_BIN/shorebird"
  ok "Shorebird CLI → $MOCCIPULT_BIN/shorebird"
}

# ─── Step 8: Add to PATH ────────────────────────────────────────────────
add_to_path() {
  print_step "Step 7/8: Tambah ke PATH"

  if [ -z "$SHELL_RC" ]; then
    warn "Windows detected — add $MOCCIPULT_BIN to PATH manually"
    return
  fi

  # Check if already in PATH
  if grep -q "MOCCIPULT_HOME" "$SHELL_RC" 2>/dev/null; then
    ok "Sudah ada di $SHELL_RC"
  else
    echo "" >> "$SHELL_RC"
    echo "# ── Moccipult ──" >> "$SHELL_RC"
    echo "export MOCCIPULT_HOME=\"$MOCCIPULT_HOME\"" >> "$SHELL_RC"
    echo "export PATH=\"\$MOCCIPULT_HOME/bin:\$PATH\"" >> "$SHELL_RC"
    # Also load cargo env in case
    echo "[ -f \"\$HOME/.cargo/env\" ] && . \"\$HOME/.cargo/env\"" >> "$SHELL_RC"
    ok "Ditambahkan ke $SHELL_RC"
  fi

  # Current session
  export PATH="$MOCCIPULT_BIN:$PATH"
  ok "PATH updated untuk session ini"
}

# ─── Step 9: Configure & Test ──────────────────────────────────────────
configure_and_test() {
  print_step "Step 8/8: Konfigurasi & Test"

  # Configure server
  "$MOCCIPULT_BIN/moccipult" config server "$SERVER_URL" 2>/dev/null || true
  ok "Server URL configured: $SERVER_URL"

  # Test shorebird
  if "$MOCCIPULT_BIN/shorebird" --version &> /dev/null; then
    ok "Shorebird CLI OK ($("$MOCCIPULT_BIN/shorebird" --version 2>&1))"
  else
    warn "Shorebird CLI belum bisa dijalankan — cek dependencies"
  fi

  # Test moccipult
  if "$MOCCIPULT_BIN/moccipult" status &> /dev/null; then
    ok "Moccipult CLI → server connected!"
  else
    warn "Moccipult CLI — pastikan server jalan di $SERVER_URL"
  fi
}

# ─── Final summary ─────────────────────────────────────────────────────
print_summary() {
  echo ""
  echo -e "  ${GREEN}${BOLD}╔══════════════════════════════════════════════════╗${NC}"
  echo -e "  ${GREEN}${BOLD}║    ✅ INSTALL SELESAI!                          ║${NC}"
  echo -e "  ${GREEN}${BOLD}╚══════════════════════════════════════════════════╝${NC}"
  echo ""
  echo -e "  ${BOLD}Installed:${NC}"
  echo -e "    moccipult  → ${CYAN}$MOCCIPULT_BIN/moccipult${NC}"
  echo -e "    shorebird  → ${CYAN}$MOCCIPULT_BIN/shorebird${NC}"
  echo -e "    config     → ${CYAN}$MOCCIPULT_HOME/repo${NC}"
  echo ""
  echo -e "  ${BOLD}Server:${NC}    $SERVER_URL"
  echo -e "  ${BOLD}Shell RC:${NC}  $SHELL_RC"
  echo ""
  echo -e "  ${YELLOW}${BOLD}Langkah selanjutnya:${NC}"
  echo ""
  echo -e "    ${DIM}# 1. Reload shell${NC}"
  echo -e "    source $SHELL_RC"
  echo ""
  echo -e "    ${DIM}# 2. Cek instalasi${NC}"
  echo -e "    moccipult status"
  echo ""
  echo -e "    ${DIM}# 3. Pergi ke folder Flutter app kamu${NC}"
  echo -e "    cd /path/to/my-flutter-app"
  echo ""
  echo -e "    ${DIM}# 4. Login Shorebird (sekali saja)${NC}"
  echo -e "    shorebird login"
  echo ""
  echo -e "    ${DIM}# 5. Build release pertama${NC}"
  echo -e "    ${BOLD}shorebird release android${NC}"
  echo ""
  echo -e "    ${DIM}# 6. Upload ke Play Store, terus setiap ada bug:${NC}"
  echo -e "    ${BOLD}shorebird patch android${NC}  ${DIM}← otomatis upload ke server kamu!${NC}"
  echo ""
  echo -e "  ${DIM}Monitoring: moccipult apps list | moccipult patches list -r ID${NC}"
  echo ""
}

# ─── Uninstaller ────────────────────────────────────────────────────────
uninstall() {
  echo ""
  warn "Ini akan menghapus Moccipult dan Shorebird CLI dari sistem kamu."
  echo -ne "  ${BOLD}Yakin? (y/N):${NC} "
  read -r CONFIRM
  if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
    echo "  Dibatalkan."
    exit 0
  fi

  rm -rf "$MOCCIPULT_HOME"

  # Remove from shell RC
  if [ -n "$SHELL_RC" ] && [ -f "$SHELL_RC" ]; then
    sed -i.bak '/# ── Moccipult ──/,+3d' "$SHELL_RC" 2>/dev/null || true
    sed -i '' '/# ── Moccipult ──/,+3d' "$SHELL_RC" 2>/dev/null || true
    rm -f "$SHELL_RC.bak"
  fi

  echo ""
  ok "Moccipult berhasil di-uninstall!"
  echo "  Jalankan: source $SHELL_RC"
  exit 0
}

# ─── Main ────────────────────────────────────────────────────────────────
main() {
  print_banner

  # Handle flags
  case "${1:-}" in
    --uninstall|-u) detect_os; uninstall ;;
    --help|-h)
      echo "Usage: ./install.sh [SERVER_URL] [--uninstall]"
      echo ""
      echo "  SERVER_URL    Moccipult server URL (e.g. https://patches.yourdomain.com)"
      echo "  --uninstall   Remove Moccipult from system"
      echo ""
      echo "Examples:"
      echo "  ./install.sh https://patches.yourdomain.com"
      echo "  ./install.sh --uninstall"
      exit 0
      ;;
  esac

  detect_os
  ask_server_url
  setup_dirs
  install_homebrew
  install_prerequisites
  clone_moccipult
  build_moccipult_cli
  setup_shorebird
  build_shorebird
  add_to_path
  configure_and_test
  print_summary
}

main "$@"
