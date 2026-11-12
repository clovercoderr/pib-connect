#!/bin/bash
# Build script for PIB Digital Clone
# Erstellt Builds für alle Plattformen

set -e

VERSION=$(node -p "require('./package.json').version")
echo "🚀 Building PIB Digital Clone v$VERSION"

# Farben für Output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Funktion für farbigen Output
log_info() {
    echo -e "${GREEN}✓${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

log_error() {
    echo -e "${RED}✗${NC} $1"
}

# Check ob pnpm installiert ist
if ! command -v pnpm &> /dev/null; then
    log_error "pnpm ist nicht installiert. Bitte installiere pnpm erst."
    exit 1
fi

# Dependencies installieren
log_info "Installing dependencies..."
pnpm install

# TypeScript Check
log_info "Type checking..."
pnpm run build || {
    log_error "Build failed!"
    exit 1
}

# Platform detection
PLATFORM=$(uname)

if [[ "$PLATFORM" == "Darwin" ]]; then
    log_info "Building for macOS..."

    # Universal Binary (Apple Silicon + Intel)
    log_info "Creating universal binary..."
    pnpm tauri build --target universal-apple-darwin

    # Kopiere DMG in releases Ordner
    DMG_PATH=$(find src-tauri/target/universal-apple-darwin/release/bundle/dmg -name "*.dmg" | head -1)
    if [[ -f "$DMG_PATH" ]]; then
        cp "$DMG_PATH" "releases/macos/PIB-Digital-Clone-${VERSION}-macos-universal.dmg"
        log_info "macOS universal DMG erstellt!"
    else
        log_warn "DMG nicht gefunden"
    fi

elif [[ "$PLATFORM" == "Linux" ]]; then
    log_info "Building for Linux..."

    # DEB Package
    log_info "Creating .deb package..."
    pnpm tauri build --target x86_64-unknown-linux-gnu

    # Kopiere DEB in releases Ordner
    DEB_PATH=$(find src-tauri/target/release/bundle/deb -name "*.deb" | head -1)
    if [[ -f "$DEB_PATH" ]]; then
        cp "$DEB_PATH" "releases/linux/PIB-Digital-Clone-${VERSION}-linux-x64.deb"
        log_info "Linux .deb erstellt!"
    fi

    # AppImage
    APPIMAGE_PATH=$(find src-tauri/target/release/bundle/appimage -name "*.AppImage" | head -1)
    if [[ -f "$APPIMAGE_PATH" ]]; then
        cp "$APPIMAGE_PATH" "releases/linux/PIB-Digital-Clone-${VERSION}-linux-x64.AppImage"
        log_info "Linux AppImage erstellt!"
    fi

elif [[ "$PLATFORM" == "MINGW"* ]] || [[ "$PLATFORM" == "MSYS"* ]]; then
    log_info "Building for Windows..."

    # EXE und MSI
    pnpm tauri build --target x86_64-pc-windows-msvc

    # Kopiere Installer in releases Ordner
    EXE_PATH=$(find src-tauri/target/release/bundle/nsis -name "*.exe" | head -1)
    if [[ -f "$EXE_PATH" ]]; then
        cp "$EXE_PATH" "releases/windows/PIB-Digital-Clone-${VERSION}-windows-x64-setup.exe"
        log_info "Windows .exe erstellt!"
    fi

    MSI_PATH=$(find src-tauri/target/release/bundle/msi -name "*.msi" | head -1)
    if [[ -f "$MSI_PATH" ]]; then
        cp "$MSI_PATH" "releases/windows/PIB-Digital-Clone-${VERSION}-windows-x64.msi"
        log_info "Windows .msi erstellt!"
    fi
else
    log_error "Unbekannte Plattform: $PLATFORM"
    exit 1
fi

# Checksums generieren
log_info "Generating checksums..."
cd releases

if [[ "$PLATFORM" == "Darwin" ]]; then
    shasum -a 256 macos/* > macos/checksums.txt 2>/dev/null || true
elif [[ "$PLATFORM" == "Linux" ]]; then
    shasum -a 256 linux/* > linux/checksums.txt 2>/dev/null || true
fi

cd ..

echo ""
log_info "Build complete! 🎉"
log_info "Version: $VERSION"
log_info "Releases in: ./releases/"
echo ""
log_warn "Vergiss nicht:"
echo "  1. Git tag erstellen: git tag v$VERSION"
echo "  2. GitHub Release erstellen"
echo "  3. CHANGELOG.md aktualisieren"
